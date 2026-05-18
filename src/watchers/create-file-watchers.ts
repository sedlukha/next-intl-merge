import { watch } from "node:fs"
import path from "node:path"

import { isGroupFileInScope, type Logger, mergeJsonTree } from "json-tree-merge"

import { MIN_INTERVAL_MS, sharedState } from "../shared-state.js"

const isShuttingDown = () => sharedState.isShuttingDown

// Recursive `fs.watch` for Turbopack support, where Webpack hooks are not
// invoked. The same `sharedState` is consulted as the Webpack hook so the two
// paths cannot race on writes.
export const createFileWatchers = ({
  excludePathSegments,
  groupNames,
  inputPaths,
  logger,
  outputDir,
}: {
  excludePathSegments?: string[]
  groupNames: readonly string[]
  inputPaths: string[]
  logger: Logger
  outputDir: string
}) => {
  logger("Setting up file watchers...")

  for (const watcher of sharedState.watchers) {
    watcher.close()
  }
  sharedState.watchers = []

  for (const inputPath of inputPaths) {
    try {
      const watcher = watch(
        inputPath,
        { recursive: true },
        (_eventType, filename) => {
          if (!filename || sharedState.isShuttingDown) {
            return
          }

          const fullPath = path.join(inputPath, filename.toString())

          const isRelevant = isGroupFileInScope({
            filePath: fullPath,
            groupNames,
            inputPaths,
            outputDir,
          })

          if (!isRelevant) {
            return
          }

          const now = Date.now()
          const isTooSoon =
            now - sharedState.lastRun < MIN_INTERVAL_MS &&
            sharedState.hasRunOnce

          if (sharedState.isRunning || isTooSoon) {
            return
          }

          logger(`File changed: ${filename}`)

          sharedState.isRunning = true
          sharedState.lastRun = now

          const startedAt = Date.now()

          try {
            const { sourceFiles, written } = mergeJsonTree({
              excludePathSegments,
              groupNames,
              inputPaths,
              isShuttingDown,
              logger,
              outputDir,
              relevantChanges: [fullPath],
            })

            const durationMs = Date.now() - startedAt
            const writtenList = written.length > 0 ? written.join(", ") : "none"

            console.info(
              `[NextIntlMerge] Re-merged on change to ${filename}: ${sourceFiles} source file(s) → [${writtenList}] in ${durationMs}ms`
            )
          } catch (err) {
            console.error("[NextIntlMerge] Merge failed:", err)
          } finally {
            sharedState.isRunning = false
          }
        }
      )

      sharedState.watchers.push(watcher)
      logger(`Watching: ${inputPath}`)
    } catch (err) {
      console.error(`[NextIntlMerge] Failed to watch ${inputPath}:`, err)
    }
  }

  logger("File watchers setup complete")
}
