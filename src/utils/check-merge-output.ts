import fs from "node:fs"
import os from "node:os"
import path from "node:path"

interface CheckMergeOutputOptions {
  /** Runs a merge and writes its files into the folder it is given. */
  merge: (outputDir: string) => void
  /** The folder that holds the committed copy of the merged files. */
  outputPath: string
}

interface CheckMergeOutputResult {
  /** How many files the merge built. Zero means nothing was compared. */
  built: number
  /** Built files whose committed copy differs. Paths under `outputPath`. */
  stale: string[]
}

/** Every file in a folder, as a path relative to that folder. */
const listFiles = (dir: string): string[] => {
  if (!fs.existsSync(dir)) {
    return []
  }

  return fs
    .readdirSync(dir, { recursive: true })
    .map((entry) => String(entry))
    .filter((name) => fs.statSync(path.join(dir, name)).isFile())
    .sort()
}

/** The text of a file, or null when there is no such file. */
const readOrNull = (filePath: string): string | null => {
  try {
    return fs.readFileSync(filePath, "utf-8")
  } catch {
    return null
  }
}

/**
 * Compares a fresh merge with the committed copy of it.
 *
 * The merge runs into a temporary folder, so `outputPath` is never written.
 * Only the files the merge builds are compared. A folder like this often holds
 * files another tool owns, such as a translated locale, a vocabulary file, or a
 * type declaration. Those are left alone and never reported.
 *
 * A file the merge built and `outputPath` lacks counts as stale. The caller
 * must also handle a `built` count of zero: two empty folders compare equal, so
 * that case would otherwise read as a pass.
 */
export const checkMergeOutput = ({
  merge,
  outputPath,
}: CheckMergeOutputOptions): CheckMergeOutputResult => {
  const temp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "next-intl-merge-check-"))
  )

  try {
    merge(temp)

    const built = listFiles(temp)
    const stale = built.filter(
      (name) =>
        readOrNull(path.join(temp, name)) !==
        readOrNull(path.join(outputPath, name))
    )

    return {
      built: built.length,
      stale: stale.map((name) => path.join(outputPath, name)),
    }
  } finally {
    fs.rmSync(temp, { force: true, recursive: true })
  }
}
