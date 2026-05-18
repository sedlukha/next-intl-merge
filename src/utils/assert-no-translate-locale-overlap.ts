import fs from "node:fs"
import path from "node:path"

const SIBLING_CONFIG_NAME = "next-intl-translate.config.json"

interface SiblingShape {
  inputFile?: unknown
  locales?: unknown
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

const readSiblingTargetLocales = (
  siblingPath: string
): { mainLocale: string; targetLocales: string[] } | null => {
  let raw: string

  try {
    raw = fs.readFileSync(siblingPath, "utf-8")
  } catch {
    return null
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null
  }

  const sibling = parsed as SiblingShape

  if (
    typeof sibling.inputFile !== "string" ||
    !isStringArray(sibling.locales)
  ) {
    return null
  }

  const mainLocale = path.basename(
    sibling.inputFile,
    path.extname(sibling.inputFile)
  )

  return {
    mainLocale,
    targetLocales: sibling.locales.filter((locale) => locale !== mainLocale),
  }
}

// If a sibling `next-intl-translate.config.json` exists, this plugin's `locales`
// must not overlap with the translated outputs it produces — otherwise both
// plugins race on the same `<locale>.json` and the merge plugin silently
// clobbers the translated output during dev shutdown.
export const assertNoTranslateLocaleOverlap = ({
  configPath,
  locales,
}: {
  configPath: string
  locales: readonly string[]
}): void => {
  const configDir = path.dirname(configPath)
  const siblingPath = path.join(configDir, SIBLING_CONFIG_NAME)

  if (!fs.existsSync(siblingPath)) {
    return
  }

  const sibling = readSiblingTargetLocales(siblingPath)

  if (!sibling) {
    return
  }

  const conflicts = locales.filter((locale) =>
    sibling.targetLocales.includes(locale)
  )

  if (conflicts.length === 0) {
    return
  }

  throw new Error(
    `[next-intl-merge] Config at ${configPath} lists locale(s) ${conflicts
      .map((locale) => `"${locale}"`)
      .join(", ")} that are owned by ${siblingPath}.\n\n` +
      `next-intl-merge must only list the main locale ("${sibling.mainLocale}"). ` +
      "Translated locales are produced by next-intl-translate from vocabulary.json — " +
      "if both plugins write the same <locale>.json file, the merge plugin races with " +
      "and clobbers the translated output during dev shutdown.\n\n" +
      `Fix: remove ${conflicts
        .map((locale) => `"${locale}"`)
        .join(", ")} from "locales" in ${configPath}.`
  )
}
