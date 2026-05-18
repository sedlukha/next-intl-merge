import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, it } from "node:test"

import { loadConfig } from "../src/utils/load-config.js"

const makeTempDir = (): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), "next-intl-merge-test-"))

const writeFile = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, "utf-8")
}

describe("loadConfig", () => {
  let tmpRoot: string
  let originalCwd: string

  beforeEach(() => {
    tmpRoot = makeTempDir()
    originalCwd = process.cwd()
    process.chdir(tmpRoot)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it("resolves relative paths against the config file's directory", () => {
    const configPath = path.join(tmpRoot, "nested", "config.json")
    writeFile(
      configPath,
      JSON.stringify({
        inputPath: ["./packages"],
        outputPath: "./out",
        locales: ["en"],
      })
    )

    const config = loadConfig("./nested/config.json")

    assert.deepEqual(config.inputPath, [
      path.resolve(tmpRoot, "nested/packages"),
    ])
    assert.equal(config.outputPath, path.resolve(tmpRoot, "nested/out"))
    assert.deepEqual(config.locales, ["en"])
  })

  it("applies defaults for excludeKeys and debug", () => {
    const configPath = path.join(tmpRoot, "c.json")
    writeFile(
      configPath,
      JSON.stringify({
        inputPath: "./a",
        outputPath: "./b",
        locales: ["en"],
      })
    )

    const config = loadConfig("./c.json")

    assert.deepEqual(config.excludeKeys, [])
    assert.equal(config.debug, false)
  })

  it("accepts a single string for inputPath", () => {
    writeFile(
      path.join(tmpRoot, "c.json"),
      JSON.stringify({
        inputPath: "./solo",
        outputPath: "./out",
        locales: ["en"],
      })
    )

    const config = loadConfig("./c.json")

    assert.deepEqual(config.inputPath, [path.resolve(tmpRoot, "solo")])
  })

  it("throws when the file does not exist", () => {
    assert.throws(() => loadConfig("./missing.json"), /Config not found/)
  })

  it("throws when JSON is invalid", () => {
    writeFile(path.join(tmpRoot, "bad.json"), "{ not json")

    assert.throws(() => loadConfig("./bad.json"), /Failed to parse/)
  })

  it("throws when required fields are missing", () => {
    writeFile(
      path.join(tmpRoot, "c.json"),
      JSON.stringify({ inputPath: "./a", outputPath: "./b" })
    )

    assert.throws(() => loadConfig("./c.json"), /"locales"/)
  })

  it("throws when locales is not an array of strings", () => {
    writeFile(
      path.join(tmpRoot, "c.json"),
      JSON.stringify({
        inputPath: "./a",
        outputPath: "./b",
        locales: [1, 2],
      })
    )

    assert.throws(() => loadConfig("./c.json"), /"locales"/)
  })
})
