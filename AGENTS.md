# AGENTS

This repository is a Parcel-powered frontend for exploring fine-tuning results.
It combines an interactive Tabulator table with Vega-Lite charts and includes a
paper-style header plus a model-weights links table.

Use this file as the operating guide for coding agents working in this repo.

## Stack and Environment
- Runtime: browser JavaScript (no Node runtime code in `src/`).
- Bundler: Parcel (`src/index.html` entry point).
- Package manager: `pnpm` (locked via `packageManager` in `package.json`).
- Data/analytics libs: `danfojs`, `tabulator-tables`.
- Charting: Vega/Vega-Lite/Vega-Embed loaded from CDN in HTML.
- Local environment: `devenv` + `direnv` (preferred for consistent PATH/tooling).

## Build / Lint / Test Commands

### Install dependencies
- `pnpm install`
- If `pnpm` is unavailable: `devenv shell -- pnpm install`

### Development server
- `pnpm dev`
- Starts Parcel for `src/index.html` (default `http://localhost:1234`).
- Uses HMR; edits are reflected without full restart.

### Production build
- `pnpm build`
- Outputs production assets to `dist/`.

### Linting (current state)
- No linter is configured in `package.json` scripts.
- There is no `pnpm lint` command today.
- If you add linting, add scripts and update this document.

### Tests (current state)
- No real test runner is configured.
- `pnpm test` intentionally exits with error (`"no test specified"`).

### Running a single test
- Not available in current state (no test framework configured).
- If you introduce tests, document both:
  - full suite command, and
  - single-test command (for example by file path/test name).

## Debugging Workflow
- Assume the user may already have `pnpm dev` running.
- Do not restart the dev server unless explicitly requested.
- Use browser DevTools for runtime checks (console/network/rendering).
- Prioritize checking chart embed failures and table rendering regressions.

## Critical Vega + Parcel Rules
- Keep these CDN scripts in `src/index.html`:
  - `https://cdn.jsdelivr.net/npm/vega@5`
  - `https://cdn.jsdelivr.net/npm/vega-lite@5`
  - `https://cdn.jsdelivr.net/npm/vega-embed@6`
- In JS, use `const embed = window.vegaEmbed`.
- Do **not** import `vega-embed` directly from ESM; this repo relies on CDN load.

## Project Structure (key files)
- `src/index.html`: page structure (paper header, weights table, app containers).
- `src/index.js`: data loading, table/chart rendering, interaction state.
- `src/styles.css`: all global and component styles.
- `data/all_datasets_summary.csv`: primary in-browser dataset.

## Code Style Guidelines

### Language and modules
- Use plain JavaScript (no TypeScript).
- Use ES module syntax (`import`/`export`) where applicable.
- Prefer `const`; use `let` only for reassignment; avoid `var`.

### Imports
- Keep import order consistent:
  1. third-party CSS,
  2. third-party JS,
  3. local CSS,
  4. local JS.
- Keep imports grouped at top-of-file.
- Preserve existing Danfo import pattern: `import * as dfd from "danfojs"`.

### Formatting
- Use 2-space indentation in JS/CSS/HTML.
- Keep one statement per line in JS.
- Prefer trailing commas in multiline arrays/objects.
- Keep line length readable (target <= 120 chars).

### Naming conventions
- `camelCase`: variables/functions.
- `PascalCase`: class-like constructors/components.
- `SCREAMING_SNAKE_CASE`: constants.
- `kebab-case`: CSS class names.
- Use descriptive names for chart specs, column configs, and state fields.

### Types and data handling
- Normalize numeric fields early after CSV load.
- Treat missing numeric values as `null` in UI-facing records.
- Prefer Danfo operations for grouping/aggregation.
- Use `iloc` with row indices for filtering (avoid brittle query strings).
- Avoid in-place mutation of shared arrays where possible.

### Error handling
- Guard DOM lookups before use.
- Wrap async load paths in `try/catch`.
- Log technical details to console; present readable user-facing fallbacks.
- Prefer soft failure UI states (`Loading...`, `No data available`, etc.).

### Table/chart behavior
- Reuse `window.__tabulatorTable` when updating data/columns.
- Avoid destroy/recreate cycles unless necessary.
- Keep chart spec creation functional/immutable where practical.
- Re-render chart from derived data when visibility/filter state changes.
- Keep interaction state centralized (current metric, visible datasets, highlights).

### Vega-Lite conventions
- Use fixed numeric width + `autosize: { type: "fit", contains: "padding" }`.
- Avoid `width: "container"` to prevent zero-width render bugs.
- Keep tooltip fields explicit and formatted (e.g., `.4f`).
- Keep dataset color mapping stable across rerenders.

### CSS and UI conventions
- Keep styles in `src/styles.css` (no inline styles unless unavoidable).
- Reuse CSS variables from `:root` for color/spacing.
- Maintain responsive behavior at existing breakpoints (`980px`, `640px`).
- Preserve card visual language (radius, border, shadow) across new sections.

## Data and Asset Rules
- Resolve local CSV paths via `new URL(path, import.meta.url)`.
- Keep metric keys consistent: `test_acc`, `test_auc`, `test_f1_macro`.
- Avoid Node-only dependencies in browser bundle code.
- If Parcel cache/build state is broken, clear `.parcel-cache` and `dist/`.

## Cursor / Copilot Rules Status
- No Cursor rules found in `.cursor/rules/`.
- No `.cursorrules` file found.
- No Copilot instructions found at `.github/copilot-instructions.md`.

## Agent Hygiene
- Clean up dead code after changes.
- Remove unused selectors, handlers, and DOM fragments introduced by refactors.
- Do not commit generated artifacts unless explicitly requested.
- Before big cleanup, verify tracked files with `git ls-files`.

## Maintaining This Document
- Keep this file near ~150 lines.
- Update commands and conventions when tooling/scripts change.
- If lint/tests are added, update command sections including single-test usage.
