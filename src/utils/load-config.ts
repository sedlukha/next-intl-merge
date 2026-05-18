import fs from "node:fs"
import path from "node:path"

import { assertNoTranslateLocaleOverlap } from "./assert-no-translate-locale-overlap.js"

interface NextIntlMergeConfig {
  debug?: boolean
  excludeKeys?: string[]
  inputPath: string | string[]
  locales: readonly string[]
  outputPath: string
}

interface ResolvedNextIntlMergeConfig {
  debug: boolean
  excludeKeys: string[]
  inputPath: string[]
  locales: readonly string[]
  outputPath: string
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

const validate = (raw: unknown, configPath: string): NextIntlMergeConfig => {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Config at ${configPath} must be a JSON object.`)
  }

  const config = raw as Record<string, unknown>

  if (
    typeof config.inputPath !== "string" &&
    !isStringArray(config.inputPath)
  ) {
    throw new Error(
      `Config at ${configPath}: "inputPath" must be a string or array of strings.`
    )
  }

  if (typeof config.outputPath !== "string") {
    throw new Error(`Config at ${configPath}: "outputPath" must be a string.`)
  }

  if (!isStringArray(config.locales as unknown[])) {
    throw new Error(
      `Config at ${configPath}: "locales" must be an array of strings.`
    )
  }

  if (config.excludeKeys !== undefined && !isStringArray(config.excludeKeys)) {
    throw new Error(
      `Config at ${configPath}: "excludeKeys" must be an array of strings.`
    )
  }

  if (config.debug !== undefined && typeof config.debug !== "boolean") {
    throw new Error(`Config at ${configPath}: "debug" must be a boolean.`)
  }

  return config as unknown as NextIntlMergeConfig
}

// Relative paths in the config file resolve from the config's own directory,
// not from `process.cwd()`. This way the same config works from any cwd
// (CLI from monorepo root, Webpack from app folder, etc.).
const resolveRelativeToConfig = (
  configDir: string,
  value: string | string[]
): string[] => {
  const inputs = Array.isArray(value) ? value : [value]

  return inputs.map((p) => path.resolve(configDir, p))
}

export const loadConfig = (configPath: string): ResolvedNextIntlMergeConfig => {
  const absoluteConfigPath = path.resolve(process.cwd(), configPath)

  if (!fs.existsSync(absoluteConfigPath)) {
    throw new Error(`Config not found at ${absoluteConfigPath}`)
  }

  let raw: string

  try {
    raw = fs.readFileSync(absoluteConfigPath, "utf-8")
  } catch (error) {
    throw new Error(`Failed to read config at ${absoluteConfigPath}`, {
      cause: error,
    })
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Failed to parse config at ${absoluteConfigPath}`, {
      cause: error,
    })
  }

  const config = validate(parsed, absoluteConfigPath)
  const configDir = path.dirname(absoluteConfigPath)

  assertNoTranslateLocaleOverlap({
    configPath: absoluteConfigPath,
    locales: config.locales,
  })

  return {
    debug: config.debug ?? false,
    excludeKeys: config.excludeKeys ?? [],
    inputPath: resolveRelativeToConfig(configDir, config.inputPath),
    locales: config.locales,
    outputPath: path.resolve(configDir, config.outputPath),
  }
}
