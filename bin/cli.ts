#!/usr/bin/env node
import fs from "node:fs"
import { parseArgs } from "node:util"

import { createLogger, mergeJsonTree } from "json-tree-merge"

import { loadConfig } from "../src/utils/load-config.js"

const LOG_PREFIX = "[NextIntlMerge]"

const HELP_TEXT = `Usage: next-intl-merge [options]

Options:
  -c, --config <path>   Path to next-intl-merge.config.json (default: ./next-intl-merge.config.json)
  -h, --help            Show this help.
  -v, --version         Print package version.

Config file format (JSON):
  {
    "inputPath": ["./app", "../packages"],
    "outputPath": "../packages/messages/src/",
    "locales": ["en", "ru"],
    "excludeKeys": ["messages", "src", "packages"],
    "debug": false
  }

Examples:
  next-intl-merge
  next-intl-merge --config ./next-intl-merge.config.json
  npx next-intl-merge -c ./i18n.config.json
`

const readVersion = (): string => {
  // dist/bin/cli.js → climb two levels to package root
  const url = new URL("../../package.json", import.meta.url)
  const raw = fs.readFileSync(url, "utf-8")

  return (JSON.parse(raw) as { version: string }).version
}

const main = (): number => {
  let values: { config?: string; help?: boolean; version?: boolean }

  try {
    ;({ values } = parseArgs({
      options: {
        config: { short: "c", type: "string" },
        help: { short: "h", type: "boolean" },
        version: { short: "v", type: "boolean" },
      },
      strict: true,
    }))
  } catch (error) {
    console.error(`${LOG_PREFIX} ${(error as Error).message}`)

    return 2
  }

  if (values.help) {
    process.stdout.write(HELP_TEXT)

    return 0
  }

  if (values.version) {
    try {
      process.stdout.write(`${readVersion()}\n`)
    } catch {
      process.stdout.write("0.0.0\n")
    }

    return 0
  }

  const configPath = values.config ?? "./next-intl-merge.config.json"

  let config: ReturnType<typeof loadConfig>
  try {
    config = loadConfig(configPath)
  } catch (error) {
    console.error(`${LOG_PREFIX} ${(error as Error).message}`)

    return 2
  }

  const baseLogger = createLogger(config.debug)
  const logger = (...args: unknown[]) => baseLogger(LOG_PREFIX, ...args)

  console.info(`${LOG_PREFIX} Running merge from ${configPath}`)

  const startedAt = Date.now()

  try {
    const { sourceFiles, written } = mergeJsonTree({
      excludePathSegments: config.excludeKeys,
      groupNames: config.locales,
      inputPaths: config.inputPath,
      logger,
      outputDir: config.outputPath,
    })

    const durationMs = Date.now() - startedAt
    const writtenList = written.length > 0 ? written.join(", ") : "none"

    console.info(
      `${LOG_PREFIX} Merged ${sourceFiles} source file(s) → [${writtenList}] in ${durationMs}ms`
    )

    return 0
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed:`, error)

    return 1
  }
}

process.exit(main())
