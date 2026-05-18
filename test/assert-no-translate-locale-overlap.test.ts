import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, it } from "node:test"

import { assertNoTranslateLocaleOverlap } from "../src/utils/assert-no-translate-locale-overlap.js"

const makeTempDir = (): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), "next-intl-merge-overlap-test-"))

describe("assertNoTranslateLocaleOverlap", () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it("is a no-op when no sibling translate config exists", () => {
    const configPath = path.join(tmpRoot, "next-intl-merge.config.json")
    fs.writeFileSync(configPath, "{}")

    assert.doesNotThrow(() =>
      assertNoTranslateLocaleOverlap({
        configPath,
        locales: ["en", "ru", "de"],
      })
    )
  })

  it("throws when locales overlap with sibling translate targets", () => {
    const configPath = path.join(tmpRoot, "next-intl-merge.config.json")
    const siblingPath = path.join(tmpRoot, "next-intl-translate.config.json")
    fs.writeFileSync(configPath, "{}")
    fs.writeFileSync(
      siblingPath,
      JSON.stringify({ inputFile: "en.json", locales: ["en", "ru", "de"] })
    )

    assert.throws(
      () =>
        assertNoTranslateLocaleOverlap({
          configPath,
          locales: ["en", "ru"],
        }),
      /"ru"/
    )
  })

  it("allows the main locale (inputFile basename) to be listed", () => {
    const configPath = path.join(tmpRoot, "next-intl-merge.config.json")
    fs.writeFileSync(configPath, "{}")
    fs.writeFileSync(
      path.join(tmpRoot, "next-intl-translate.config.json"),
      JSON.stringify({ inputFile: "en.json", locales: ["en", "ru", "de"] })
    )

    assert.doesNotThrow(() =>
      assertNoTranslateLocaleOverlap({
        configPath,
        locales: ["en"],
      })
    )
  })

  it("is a no-op when sibling JSON is malformed", () => {
    const configPath = path.join(tmpRoot, "next-intl-merge.config.json")
    fs.writeFileSync(configPath, "{}")
    fs.writeFileSync(
      path.join(tmpRoot, "next-intl-translate.config.json"),
      "{ not json"
    )

    assert.doesNotThrow(() =>
      assertNoTranslateLocaleOverlap({
        configPath,
        locales: ["en", "ru"],
      })
    )
  })
})
