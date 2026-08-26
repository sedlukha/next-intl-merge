import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, it } from "node:test"

import { checkMergeOutput } from "../src/utils/check-merge-output.js"

const makeTempDir = (): string =>
  fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "next-intl-merge-test-"))
  )

const writeFile = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, "utf-8")
}

/** Every file in a folder, as a path relative to that folder. */
const listFiles = (dir: string): string[] =>
  fs
    .readdirSync(dir, { recursive: true })
    .map((entry) => String(entry))
    .filter((name) => fs.statSync(path.join(dir, name)).isFile())
    .sort()

describe("checkMergeOutput", () => {
  let tmpRoot: string
  let outputPath: string

  beforeEach(() => {
    tmpRoot = makeTempDir()
    outputPath = path.join(tmpRoot, "out")
    fs.mkdirSync(outputPath, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { force: true, recursive: true })
  })

  it("finds nothing stale when the committed copy matches", () => {
    writeFile(path.join(outputPath, "en.json"), '{"a":1}')

    const result = checkMergeOutput({
      merge: (dir) => writeFile(path.join(dir, "en.json"), '{"a":1}'),
      outputPath,
    })

    assert.equal(result.built, 1)
    assert.deepEqual(result.stale, [])
  })

  it("names a file whose bytes differ", () => {
    writeFile(path.join(outputPath, "en.json"), '{"a":1}')

    const result = checkMergeOutput({
      merge: (dir) => writeFile(path.join(dir, "en.json"), '{"a":2}'),
      outputPath,
    })

    assert.deepEqual(result.stale, [path.join(outputPath, "en.json")])
  })

  it("names a file the committed folder lacks", () => {
    const result = checkMergeOutput({
      merge: (dir) => writeFile(path.join(dir, "en.json"), '{"a":1}'),
      outputPath,
    })

    assert.equal(result.built, 1)
    assert.deepEqual(result.stale, [path.join(outputPath, "en.json")])
  })

  it("ignores a file the merge does not build", () => {
    // Another tool owns these two. The merge never writes them, so a check
    // must leave them alone and never report them.
    writeFile(path.join(outputPath, "en.json"), '{"a":1}')
    writeFile(path.join(outputPath, "ru.json"), '{"a":"translated"}')
    writeFile(path.join(outputPath, "en.d.json.ts"), "declare const x: 1")

    const result = checkMergeOutput({
      merge: (dir) => writeFile(path.join(dir, "en.json"), '{"a":1}'),
      outputPath,
    })

    assert.equal(result.built, 1)
    assert.deepEqual(result.stale, [])
  })

  it("reports a built count of zero when the merge writes nothing", () => {
    writeFile(path.join(outputPath, "en.json"), '{"a":1}')

    const result = checkMergeOutput({
      merge: () => undefined,
      outputPath,
    })

    assert.equal(result.built, 0)
    assert.deepEqual(result.stale, [])
  })

  it("writes nothing into the committed folder", () => {
    writeFile(path.join(outputPath, "en.json"), '{"a":1}')

    const before = listFiles(outputPath).map((name) => [
      name,
      fs.readFileSync(path.join(outputPath, name), "utf-8"),
    ])

    checkMergeOutput({
      merge: (dir) => {
        writeFile(path.join(dir, "en.json"), '{"a":2}')
        writeFile(path.join(dir, "de.json"), '{"a":3}')
      },
      outputPath,
    })

    const after = listFiles(outputPath).map((name) => [
      name,
      fs.readFileSync(path.join(outputPath, name), "utf-8"),
    ])

    assert.deepEqual(after, before)
  })

  it("hands the merge a folder of its own and removes it after", () => {
    let given = ""

    checkMergeOutput({
      merge: (dir) => {
        given = dir
        writeFile(path.join(dir, "en.json"), '{"a":1}')
      },
      outputPath,
    })

    assert.notEqual(given, "")
    assert.notEqual(given, outputPath)
    assert.equal(fs.existsSync(given), false)
  })

  it("removes the temporary folder when the merge throws", () => {
    let given = ""

    assert.throws(
      () =>
        checkMergeOutput({
          merge: (dir) => {
            given = dir
            throw new Error("merge failed")
          },
          outputPath,
        }),
      /merge failed/
    )

    assert.notEqual(given, "")
    assert.equal(fs.existsSync(given), false)
  })

  it("compares a file in a subfolder too", () => {
    writeFile(path.join(outputPath, "nested", "en.json"), '{"a":1}')

    const result = checkMergeOutput({
      merge: (dir) => writeFile(path.join(dir, "nested", "en.json"), '{"a":2}'),
      outputPath,
    })

    assert.deepEqual(result.stale, [path.join(outputPath, "nested", "en.json")])
  })
})
