import { isGroupFileInScope, type Logger, mergeJsonTree } from "json-tree-merge"
import type { Compiler, WebpackPluginInstance } from "webpack"

import { MIN_INTERVAL_MS, sharedState } from "../shared-state.js"

const isShuttingDown = () => sharedState.isShuttingDown

export const createWebpackPlugin = ({
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
}): WebpackPluginInstance => {
  const compilationIds = new Set<string>()

  const apply = (compiler: Compiler): void => {
    logger("Webpack plugin applied to compiler")

    compiler.hooks.watchRun.tapAsync(
      "NextIntlMergePlugin",
      (currentCompiler: Compiler, callback: () => void) => {
        logger("watchRun hook triggered")

        const compilationId =
          currentCompiler.name ?? Math.random().toString(36).slice(7)

        if (compilationIds.has(compilationId)) {
          logger("Skipping - compilation already processed")
          callback()

          return
        }

        compilationIds.add(compilationId)

        const changedFiles = Array.from(
          currentCompiler.modifiedFiles ?? new Set<string>()
        )

        logger("Changed files count:", changedFiles.length)

        const relevantChanges = changedFiles.filter((file) =>
          isGroupFileInScope({
            filePath: file,
            groupNames,
            inputPaths,
            outputDir,
          })
        )
        const hasRelevantChanges = relevantChanges.length > 0

        logger("Relevant changes count:", relevantChanges.length)

        const now = Date.now()
        const isTooSoon =
          now - sharedState.lastRun < MIN_INTERVAL_MS && sharedState.hasRunOnce

        if (
          sharedState.isShuttingDown ||
          sharedState.isRunning ||
          (isTooSoon && !hasRelevantChanges)
        ) {
          logger("Skipping - busy/too-soon/shutting-down")
          callback()

          return
        }

        if (!sharedState.hasRunOnce || hasRelevantChanges) {
          logger("Starting merge process...")
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
              relevantChanges,
            })
            sharedState.hasRunOnce = true

            if (hasRelevantChanges) {
              const durationMs = Date.now() - startedAt
              const writtenList =
                written.length > 0 ? written.join(", ") : "none"
              const trigger = relevantChanges
                .slice(0, 3)
                .map((p) => p.split("/").pop())
                .join(", ")

              console.info(
                `[NextIntlMerge] Re-merged on webpack change (${trigger}): ${sourceFiles} source file(s) → [${writtenList}] in ${durationMs}ms`
              )
            }
          } catch (err) {
            console.error("[NextIntlMerge] Error in NextIntlMergePlugin:", err)
          } finally {
            sharedState.isRunning = false
          }
        }

        callback()
      }
    )

    compiler.hooks.done.tap("NextIntlMergePlugin", () => {
      logger("Compilation done, clearing compilation IDs")
      compilationIds.clear()
    })
  }

  return { apply }
}
