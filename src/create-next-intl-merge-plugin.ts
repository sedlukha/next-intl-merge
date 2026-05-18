import { createLogger, type Logger, mergeJsonTree } from "json-tree-merge"
import type { NextConfig } from "next"
import type { Configuration } from "webpack"

import { registerShutdownHooks, sharedState } from "./shared-state.js"
import { loadConfig } from "./utils/load-config.js"
import { validateAndResolvePaths } from "./utils/validate-and-resolve-paths.js"
import { createFileWatchers } from "./watchers/create-file-watchers.js"
import { createWebpackPlugin } from "./webpack/create-webpack-plugin.js"

const LOG_PREFIX = "[NextIntlMerge]"

const isShuttingDown = () => sharedState.isShuttingDown

interface InlineOptions<T extends readonly string[]> {
  configPath?: never
  debug?: boolean
  excludeKeys?: string[]
  inputPath: string | string[]
  locales: T
  outputPath?: string
}

interface ConfigPathOptions {
  configPath: string
  debug?: never
  excludeKeys?: never
  inputPath?: never
  locales?: never
  outputPath?: never
}

interface ResolvedOptions {
  debug: boolean
  excludeKeys: string[]
  inputPaths: string[]
  locales: readonly string[]
  outputDir: string
}

const isConfigPathOptions = (
  options: InlineOptions<readonly string[]> | ConfigPathOptions
): options is ConfigPathOptions =>
  "configPath" in options && Boolean(options.configPath)

const resolveOptions = <T extends readonly string[]>(
  options: InlineOptions<T> | ConfigPathOptions
): ResolvedOptions => {
  if (isConfigPathOptions(options)) {
    const config = loadConfig(options.configPath)

    return {
      debug: config.debug,
      excludeKeys: config.excludeKeys,
      inputPaths: config.inputPath,
      locales: config.locales,
      outputDir: config.outputPath,
    }
  }

  const { inputPaths, outputDir } = validateAndResolvePaths(
    options.inputPath,
    options.outputPath ?? "./messages",
    options.locales
  )

  return {
    debug: options.debug ?? false,
    excludeKeys: options.excludeKeys ?? [],
    inputPaths,
    locales: options.locales,
    outputDir,
  }
}

// A Next.js plugin that merges per-package locale JSON files into a single
// `<locale>.json` per language. Works with both Webpack and Turbopack — the
// Webpack hook covers builds, the recursive `fs.watch` covers dev under
// Turbopack where Webpack hooks never fire.
export const createNextIntlMergePlugin = <T extends readonly string[]>(
  options: InlineOptions<T> | ConfigPathOptions
) => {
  const { debug, excludeKeys, inputPaths, locales, outputDir } =
    resolveOptions(options)

  const baseLogger = createLogger(debug)
  const logger: Logger = (...args) => baseLogger(LOG_PREFIX, ...args)

  logger("Resolved config:", { excludeKeys, inputPaths, locales, outputDir })

  registerShutdownHooks()

  const plugin = createWebpackPlugin({
    excludePathSegments: excludeKeys,
    groupNames: locales,
    inputPaths,
    logger,
    outputDir,
  })

  logger("Webpack plugin created")

  // Initial merge so dev-server boot has fresh `<locale>.json` files even
  // before any compilation hook fires.
  logger("Running initial merge...")

  const startedAt = Date.now()

  try {
    sharedState.isRunning = true
    const { sourceFiles, written } = mergeJsonTree({
      excludePathSegments: excludeKeys,
      groupNames: locales,
      inputPaths,
      isShuttingDown,
      logger,
      outputDir,
    })
    sharedState.hasRunOnce = true

    const durationMs = Date.now() - startedAt
    const writtenList = written.length > 0 ? written.join(", ") : "none"

    console.info(
      `${LOG_PREFIX} Merged ${sourceFiles} source file(s) → [${writtenList}] in ${durationMs}ms`
    )
  } catch (err) {
    console.error(`${LOG_PREFIX} Initial merge failed:`, err)
  } finally {
    sharedState.isRunning = false
  }

  createFileWatchers({
    excludePathSegments: excludeKeys,
    groupNames: locales,
    inputPaths,
    logger,
    outputDir,
  })

  return (nextConfig: NextConfig): NextConfig => {
    logger("Wrapping Next.js config")

    const originalWebpack = nextConfig.webpack

    return {
      ...nextConfig,
      webpack(
        config: Configuration,
        webpackOptions: Parameters<NonNullable<NextConfig["webpack"]>>[1]
      ) {
        logger("Webpack config called, isServer:", webpackOptions.isServer)

        config.plugins ??= []
        config.plugins.push(plugin)

        logger("Plugin added to webpack config")

        if (typeof originalWebpack === "function") {
          return originalWebpack(config, webpackOptions)
        }

        return config
      },
    }
  }
}
