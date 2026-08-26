#!/usr/bin/env node
import fs from "node:fs"
import { parseArgs } from "node:util"

import { createLogger, mergeJsonTree } from "json-tree-merge"

import { checkMergeOutput } from "../utils/check-merge-output.js"
import { loadConfig } from "../utils/load-config.js"

const LOG_PREFIX = "[NextIntlMerge]"

const HELP_TEXT = `Usage: next-intl-merge [options]

Options:
  -c, --config <path>   Path to next-intl-merge.config.json (default: ./next-intl-merge.config.json)
      --check           Compare the committed merge output with a fresh merge.
                        Writes nothing. Exit code 1 when a file is stale.
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
  next-intl-merge --check
  npx next-intl-merge -c ./i18n.config.json
`

const readVersion = (): string => {
  const url = new URL("../../package.json", import.meta.url)
  const raw = fs.readFileSync(url, "utf-8")

  return (JSON.parse(raw) as { version: string }).version
}

const main = (): number => {
  let values: {
    check?: boolean
    config?: string
    help?: boolean
    version?: boolean
  }

  try {
    ;({ values } = parseArgs({
      options: {
        check: { type: "boolean" },
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

  const runMerge = (outputDir: string) =>
    mergeJsonTree({
      excludePathSegments: config.excludeKeys,
      groupNames: config.locales,
      inputPaths: config.inputPath,
      logger,
      outputDir,
    })

  if (values.check) {
    console.info(`${LOG_PREFIX} Checking merge output from ${configPath}`)

    let result: ReturnType<typeof checkMergeOutput>

    try {
      result = checkMergeOutput({
        merge: (outputDir) => {
          runMerge(outputDir)
        },
        outputPath: config.outputPath,
      })
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed:`, error)

      return 1
    }

    // Two empty folders compare equal, so an empty merge would read as a pass.
    if (result.built === 0) {
      console.error(`${LOG_PREFIX} The merge built no file, so nothing was compared.`)

      return 1
    }

    if (result.stale.length > 0) {
      console.error(`${LOG_PREFIX} Stale merged files:`)

      for (const file of result.stale) {
        console.error(`  ${file}`)
      }

      console.error(`${LOG_PREFIX} Run \`next-intl-merge\` and commit them.`)

      return 1
    }

    console.info(
      `${LOG_PREFIX} ${result.built} merged file(s) match the source files`
    )

    return 0
  }

  console.info(`${LOG_PREFIX} Running merge from ${configPath}`)

  const startedAt = Date.now()

  try {
    const { sourceFiles, written } = runMerge(config.outputPath)

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
