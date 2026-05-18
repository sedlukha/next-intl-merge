import type { watch } from "node:fs"

// Singleton state shared between the Webpack hook and the Turbopack file
// watcher. Both can fire concurrently; without this lock they would race on
// `writeFileSync` and produce truncated locale files.
export const sharedState = {
  hasRunOnce: false,
  isRunning: false,
  isShuttingDown: false,
  lastRun: 0,
  watchers: [] as ReturnType<typeof watch>[],
}

export const MIN_INTERVAL_MS = 1000

const closeWatchers = () => {
  sharedState.isShuttingDown = true

  for (const watcher of sharedState.watchers) {
    try {
      watcher.close()
    } catch {
      // Ignore — process is exiting.
    }
  }

  sharedState.watchers = []
}

let shutdownHooksRegistered = false

// Block new merges once the dev server starts shutting down. Without this,
// a final `fs.watch` event fired during teardown can launch a write that the
// process kills mid-flush.
export const registerShutdownHooks = () => {
  if (shutdownHooksRegistered) {
    return
  }

  shutdownHooksRegistered = true
  process.once("SIGTERM", closeWatchers)
  process.once("SIGINT", closeWatchers)
  process.once("beforeExit", closeWatchers)
}
