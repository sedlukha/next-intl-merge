# next-intl-merge

[![CI](https://github.com/sedlukha/next-intl-merge/actions/workflows/ci.yml/badge.svg)](https://github.com/sedlukha/next-intl-merge/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/next-intl-merge.svg)](https://www.npmjs.com/package/next-intl-merge)
[![npm downloads](https://img.shields.io/npm/dm/next-intl-merge.svg)](https://www.npmjs.com/package/next-intl-merge)
[![license](https://img.shields.io/npm/l/next-intl-merge.svg)](LICENSE)

Next.js plugin that merges per-package locale JSON files scattered across your project (or monorepo) into a single `<locale>.json` per language — ready for [next-intl](https://next-intl.dev) to consume. **Works under both Webpack and Turbopack**, ships with a CLI for one-shot runs, atomic writes, and concurrency-safe shared lock between the Webpack hook and the file watcher.

## Why?

`next-intl` expects one `<locale>.json` per language. In a monorepo or feature-sliced app the strings live next to their owners (`packages/auth/messages/en.json`, `app/home/en.json`, …), so you need a step that folds them into one file per locale — without races during `next dev`, without truncated output on SIGTERM, and working under both Webpack and Turbopack.

The merge engine itself lives in [`json-tree-merge`](https://www.npmjs.com/package/json-tree-merge); this package is the Next.js integration on top of it.

## Installation

```bash
npm install -D next-intl-merge
```

Requires Node.js ≥ 18, Next.js ≥ 14 as a peer dependency, and Webpack ≥ 5 as an optional peer (only needed if you build under Webpack — Turbopack-only setups don't need it installed).

## Usage

### 1. Create a config file

```jsonc
// next-intl-merge.config.json (in your app root)
{
  "inputPath": ["./app", "../packages"],
  "outputPath": "../packages/messages/src/",
  "locales": ["en", "ru"],
  "excludeKeys": ["messages", "src", "packages"],
  "debug": false
}
```

In the config file, relative paths resolve from the config file's own directory (not from `process.cwd()`), so the same file works whether invoked from the app folder, the monorepo root, or via the CLI.

### 2. Wire the Next.js plugin

```ts
// next.config.ts
import { createNextIntlMergePlugin } from "next-intl-merge"

const withNextIntlMerge = createNextIntlMergePlugin({
  configPath: "./next-intl-merge.config.json",
})

const nextConfig = {
  /* your config */
}

export default withNextIntlMerge(nextConfig)
```

### 3. (Optional) Run one-shot merges from CI / scripts

```bash
# from the app folder
npx next-intl-merge --config ./next-intl-merge.config.json

# or as a package script
{
  "scripts": {
    "i18n:merge": "next-intl-merge"
  }
}
```

### How merging works

Given an input file at `packages/auth/messages/en.json`, with config `inputPath: "./packages"` and `excludeKeys: ["messages"]`, the plugin emits this slice into `<outputPath>/en.json`:

```jsonc
{
  "auth": {
    /* contents of en.json */
  }
}
```

Every directory segment between the input path and the file becomes a nested key — minus anything listed in `excludeKeys`.

Full example. Given this tree:

```
my-app/
├── app/
│   └── home/
│       ├── en.json   {"title": "Welcome"}
│       └── ru.json   {"title": "Добро пожаловать"}
└── packages/
    ├── auth/
    │   └── messages/
    │       ├── en.json   {"login": "Log in"}
    │       └── ru.json   {"login": "Войти"}
    └── messages/src/     ← outputPath
```

After running `next-intl-merge` with the config above:

```jsonc
// packages/messages/src/en.json
{
  "home": { "title": "Welcome" },
  "auth": { "login": "Log in" }
}

// packages/messages/src/ru.json
{
  "home": { "title": "Добро пожаловать" },
  "auth": { "login": "Войти" }
}
```

The `messages` segment is stripped because it was listed in `excludeKeys`.

## API

### `createNextIntlMergePlugin(options)`

The plugin can be configured in one of two ways.

#### Option A — config-file mode

```ts
createNextIntlMergePlugin({
  configPath: "./next-intl-merge.config.json",
})
```

The file content matches the [config schema](#config-file-schema) below.

#### Option B — inline options

```ts
createNextIntlMergePlugin({
  inputPath: ["./app", "../packages"],
  outputPath: "../packages/messages/src/",
  locales: ["en", "ru"] as const,
  excludeKeys: ["messages", "src", "packages"],
  debug: false,
})
```

| Option        | Type                 | Required | Default        | Description                                                                                             |
| ------------- | -------------------- | -------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| `inputPath`   | `string \| string[]` | **yes**  | —              | One or more directories to scan recursively for `<locale>.json` files. Relative paths resolve from cwd. |
| `outputPath`  | `string`             | no       | `"./messages"` | Directory where merged `<locale>.json` files are written.                                               |
| `locales`     | `readonly string[]`  | **yes**  | —              | Allowed locale codes. Files like `de.json` are ignored unless `"de"` is listed.                         |
| `excludeKeys` | `string[]`           | no       | `[]`           | Path segments stripped when computing the nested key path (e.g. `"src"`, `"messages"`).                 |
| `debug`       | `boolean`            | no       | `false`        | Enables verbose `console.info` logs.                                                                    |

Annotate `locales` with `as const` to get a precise literal-union type at call sites.

### `loadConfig(configPath)`

Read, validate, and resolve a `next-intl-merge.config.json` without instantiating the plugin. Useful for custom scripts.

```ts
import { loadConfig } from "next-intl-merge"

const config = loadConfig("./next-intl-merge.config.json")
// → { inputPath: string[]; outputPath: string; locales: readonly string[]; ... }
```

Throws on validation errors with a message pointing to the offending field.

### Config file schema

```jsonc
{
  "inputPath": string | string[],        // required
  "outputPath": string,                  // required
  "locales": string[],                   // required, non-empty
  "excludeKeys": string[],               // optional, default []
  "debug": boolean                       // optional, default false
}
```

## CLI

```
next-intl-merge [options]
```

| Flag              | Alias | Required | Default                          | Description                            |
| ----------------- | ----- | -------- | -------------------------------- | -------------------------------------- |
| `--config <path>` | `-c`  | no       | `./next-intl-merge.config.json`  | Path to the config file.               |
| `--help`          | `-h`  | no       | —                                | Show usage.                            |
| `--version`       | `-v`  | no       | —                                | Print version.                         |

Use cases for the CLI:

- CI builds where messages must be ready before `next build`.
- One-shot regeneration after a manual `git pull`.
- Scripts that run outside the dev server.

### Exit codes

| Code | Meaning                                             |
| ---- | --------------------------------------------------- |
| `0`  | Success.                                            |
| `1`  | Runtime error (I/O, invalid JSON in a locale file). |
| `2`  | Invalid CLI usage or missing/invalid configuration. |

## Atomic writes

Locale files are written via the `tmp + rename` pattern, so a SIGTERM during the write (e.g. stopping `next dev`) cannot leave `<locale>.json` truncated. `rename` is atomic on POSIX within the same filesystem.

## Concurrency

A single shared lock prevents the Webpack hook and the file watcher from racing on the same write. New merges are also blocked once the process starts shutting down (`SIGTERM` / `SIGINT` / `beforeExit`).

## Webpack vs Turbopack

- **Webpack**: `watchRun` hook fires on every recompile; merges only run when one of your `<locale>.json` source files has actually changed.
- **Turbopack**: a recursive `fs.watch` on each `inputPath` detects changes directly, since Webpack hooks are not invoked under Turbopack.

Both paths consult the same `sharedState` so they never run concurrently.

## Interaction with `next-intl-translate`

If a sibling `next-intl-translate.config.json` exists in the same directory as your `next-intl-merge.config.json`, the plugin refuses to start if `locales` overlaps with the locales produced by `next-intl-translate`. This catches a class of races where both plugins write the same `<locale>.json` and the merge plugin silently clobbers translated output during dev shutdown. Fix by removing the translated locales from `locales` in `next-intl-merge.config.json`.

## See also

- [`json-tree-merge`](https://www.npmjs.com/package/json-tree-merge) — the framework-agnostic engine this plugin is built on

## License

MIT
