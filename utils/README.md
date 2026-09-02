# 🛠️ Utils — EDH 32 Deck Challenge CLI Tool

This directory holds the original standalone command-line tool that this project
started as, relocated here during the repository restructure that promoted the
web application to the repository root. The web app now lives in the root
[`src/`](../src) and is documented in the [root README](../README.md); this tool
is preserved as a self-contained CLI utility.

> **Node version:** this repo pins Node.js via [`.nvmrc`](../.nvmrc). Run
> `nvm use` (or `nvm use 26`) from the repository root before running any of the
> commands below.

---

## What the tool does

The CLI takes a Moxfield username and reports that user's progress through the
**32 Deck Challenge** — filling all 32 color-identity slots (colorless, mono,
two-, three-, four-, and five-color) with Commander decks. It:

1. Validates the username argument.
2. Fetches the user's public Commander decks from Moxfield (via a headless
   Puppeteer browser that clears Cloudflare).
3. Extracts each deck's commander(s) and resolves their WUBRG color identity.
4. Organizes the decks into the 32 color-combination slots.
5. Prints an **ASCII** progress diagram to stdout.
6. Writes an **HTML** report to `utils/build/` and prints its path.

---

## Layout

```
utils/
├── README.md              # this file
├── src/
│   ├── index.ts           # CLI entry point (the tool)
│   ├── validator.ts       # username validation
│   ├── types.ts           # shared TypeScript interfaces
│   ├── api/
│   │   ├── moxfield-client.ts   # Moxfield API client + typed errors
│   │   └── browser-client.ts    # Puppeteer-backed client (Cloudflare bypass)
│   ├── domain/            # pure logic (no I/O)
│   │   ├── color-combinations.ts
│   │   ├── color-identity.ts
│   │   ├── commander-extractor.ts
│   │   └── deck-organizer.ts
│   └── renderers/
│       ├── ascii-renderer.ts    # stdout diagram
│       └── html-renderer.ts     # HTML report writer
└── tests/                 # the tool's unit + property tests
```

---

## Running from the repository root

All commands are run from the **repository root** (the parent of this `utils/`
directory), using the consolidated root `package.json`.

> **Note:** the exact `utils` npm-script names are finalized when the root
> `package.json` is consolidated. Until then you can always invoke the tool
> directly through the `utils/src` entry point with `tsx`, as shown below. Both
> forms run the same tool.

### Run the CLI checker

Pass a Moxfield username as the only argument:

```bash
# Direct (works today, via the utils/src entry point)
nvm use 26 && npx tsx utils/src/index.ts <moxfield-username>

# Via the consolidated npm script (once wired up in the root package.json)
nvm use 26 && npm run utils -- <moxfield-username>
```

Example:

```bash
nvm use 26 && npx tsx utils/src/index.ts rach0022
```

Output:

- The ASCII 32-slot progress diagram is printed to **stdout**.
- An HTML report is written to **`utils/build/`** and its path is printed.
- Progress/status messages and errors are printed to **stderr**.

Exit codes: the tool exits non-zero on invalid input, when the Moxfield user is
not found, when Moxfield cannot be reached, or on other unexpected errors.

### Build (type-check + compile)

The tool is TypeScript; compile it to JavaScript with the project's TypeScript
compiler:

```bash
# Direct
nvm use 26 && npx tsc

# Via the consolidated npm script (once wired up)
nvm use 26 && npm run utils:build
```

### Run the tool's tests

The tool's unit and property tests live in `utils/tests/` and run under the
shared vitest configuration from the root:

```bash
# Run the whole consolidated test suite (includes utils/tests)
nvm use 26 && npm test

# Run only the tool's tests
nvm use 26 && npx vitest run utils/tests
```

Test coverage includes: `validator`, `color-identity`, `commander-extractor`,
`deck-organizer`, `ascii-renderer`, `html-renderer`, `moxfield-client`, plus an
end-to-end `integration` test.

---

## Requirements

- **Node.js** as pinned in [`.nvmrc`](../.nvmrc) — run `nvm use` first.
- **Chrome/Chromium** — Puppeteer downloads its own copy on `npm install` from
  the repository root.
