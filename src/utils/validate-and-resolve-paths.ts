import fs from "node:fs"
import path from "node:path"

export const validateAndResolvePaths = (
  inputPath: string | string[],
  outputPath: string,
  locales: readonly string[]
): { inputPaths: string[]; outputDir: string } => {
  if (!outputPath) {
    throw new Error("Please provide the path to the output messages folder.")
  }
  if (!inputPath) {
    throw new Error("Please provide the path to the input messages folder.")
  }
  if (locales.length === 0) {
    throw new Error("Please provide an array of locales.")
  }

  const outputDir = path.resolve(process.cwd(), outputPath)
  const rawInputPaths = Array.isArray(inputPath) ? inputPath : [inputPath]
  const inputPaths = rawInputPaths.map((p) => path.resolve(process.cwd(), p))

  for (const resolved of inputPaths) {
    if (!fs.existsSync(resolved)) {
      throw new Error(
        `The provided path to the input messages does not exist! ${resolved}`
      )
    }
  }

  return {
    inputPaths,
    outputDir,
  }
}
