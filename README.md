# next-intl-merge

[![npm version](https://img.shields.io/npm/v/next-intl-merge.svg)](https://www.npmjs.com/package/next-intl-merge)
[![license](https://img.shields.io/npm/l/next-intl-merge.svg)](LICENSE)
[![node](https://img.shields.io/node/v/next-intl-merge.svg)](https://nodejs.org)

> Next.js plugin that merges per-package locale JSON files scattered across
> your project (or monorepo) into a single `<locale>.json` per language —
> ready for [next-intl](https://next-intl.dev) to consume.

- **Works under Webpack and Turbopack.** Webpack via the standard plugin hook,
  Turbopack via a recursive `fs.watch` on every input path.
- **CLI included** — run a one-shot merge from CI, scripts, or after `git pull`.
- **Atomic writes** — `tmp + rename` pattern, so a SIGTERM during `next dev`
  cannot leave `<locale>.json` truncated.
- **Concurrency-safe** — shared lock between Webpack hook and file watcher,
  so they never race on the same write.
- **Runs through `npx`** — no global install needed.
- **TypeScript types included.**

The merge engine itself lives in [json-tree-merge](https://www.npmjs.com/package/json-tree-merge);
this package is the Next.js integration on top of it.

---

## Quick start

### 1. Install

```bash
npm install --save-dev next-intl-merge
# or: pnpm add -D next-intl-merge / yarn add -D next-intl-merge
```

### 2. Create a config file

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

> **Path resolution:** in the config file, relative paths resolve from the
> config file's own directory (not from `process.cwd()`), so the same file
> works whether invoked from the app folder, the monorepo root, or via the
> CLI.

### 3. Wire the Next.js plugin

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

### 4. (Optional) Run one-shot merges from CI / scripts

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

---

## How merging works

Given an input file at `packages/auth/messages/en.json`, with config
`inputPath: "./packages"` and `excludeKeys: ["messages"]`, the plugin emits
this slice into `<outputPath>/en.json`:

```jsonc
{
  "auth": {
    /* contents of en.json */
  }
}
```

Every directory segment between the input path and the file becomes a nested
key — minus anything listed in `excludeKeys`.

### Full example

Given this tree:

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

---

## API

### `createNextIntlMergePlugin(options)`

The plugin can be configured in one of two ways:

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

| Option        | Type                       | Default        | Description                                                                                              |
| ------------- | -------------------------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| `inputPath`   | `string \| string[]`       | —              | One or more directories to scan recursively for `<locale>.json` files. Relative paths resolve from cwd.  |
| `outputPath`  | `string`                   | `"./messages"` | Directory where merged `<locale>.json` files are written.                                                |
| `locales`     | `readonly string[]`        | —              | Allowed locale codes. Files like `de.json` are ignored unless `"de"` is listed.                          |
| `excludeKeys` | `string[]`                 | `[]`           | Path segments stripped when computing the nested key path (e.g. `"src"`, `"messages"`).                  |
| `debug`       | `boolean`                  | `false`        | Enables verbose `console.info` logs.                                                                     |

> **Tip:** Annotate `locales` with `as const` to get a precise literal-union
> type at call sites.

### `loadConfig(configPath)`

Read, validate, and resolve a `next-intl-merge.config.json` without
instantiating the plugin. Useful for custom scripts.

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

---

## CLI

```
next-intl-merge [options]
```

| Flag                | Alias | Description                                                                          |
| ------------------- | ----- | ------------------------------------------------------------------------------------ |
| `--config <path>`   | `-c`  | Path to `next-intl-merge.config.json`. Defaults to `./next-intl-merge.config.json`.  |
| `--help`            | `-h`  | Show usage.                                                                          |
| `--version`         | `-v`  | Print version.                                                                       |

Use cases for the CLI:

- CI builds where you want messages built before `next build`.
- One-shot regeneration after a manual `git pull`.
- Scripts that run outside the dev server.

### Exit codes

| Code | Meaning                                              |
| ---- | ---------------------------------------------------- |
| `0`  | Success.                                             |
| `1`  | Runtime error (I/O, invalid JSON in a locale file).  |
| `2`  | Invalid CLI usage or missing/invalid configuration.  |

---

## Behavior details

### Atomic writes

Locale files are written via the `tmp + rename` pattern, so a SIGTERM during
the write (e.g. stopping `next dev`) cannot leave `<locale>.json` truncated.
`rename` is atomic on POSIX within the same filesystem.

### Concurrency

A single shared lock prevents the Webpack hook and the file watcher from
racing on the same write. New merges are also blocked once the process starts
shutting down (`SIGTERM` / `SIGINT` / `beforeExit`).

### Webpack vs Turbopack

- **Webpack**: `watchRun` hook fires on every recompile; merges only run when
  one of your `<locale>.json` source files has actually changed.
- **Turbopack**: a recursive `fs.watch` on each `inputPath` detects changes
  directly, since Webpack hooks are not invoked under Turbopack.

Both paths consult the same `sharedState` so they never run concurrently.

### Interaction with `next-intl-translate`

If a sibling `next-intl-translate.config.json` exists in the same directory
as your `next-intl-merge.config.json`, the plugin will refuse to start if
`locales` overlaps with the locales produced by `next-intl-translate`.
This catches a class of races where both plugins write the same
`<locale>.json` and the merge plugin silently clobbers translated output
during dev shutdown. Fix by removing the translated locales from `locales`
in `next-intl-merge.config.json`.

---

## Requirements

- Node.js **18** or newer.
- **Next.js 14+** as a peer dependency.
- **Webpack 5+** as an optional peer (only required if you build under
  Webpack; Turbopack-only setups don't need it installed).

---

## License

[MIT](LICENSE)
