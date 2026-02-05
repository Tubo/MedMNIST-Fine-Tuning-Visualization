# AGENTS

This repo is a Parcel-powered frontend app for interactive tables and charts.
It uses `tabulator-tables` for tables, `danfojs` for CSV parsing and
transformations, and `vega-embed` + `vega-lite` for charts (if enabled). The
environment is managed with `devenv` + `direnv` and packages are managed with
`pnpm`.

If you are an agent, follow the guidance below so your changes align with the
current setup and tooling.

## Environment and Package Manager
- Use `devenv shell` (or `direnv`) so `pnpm` is on PATH.
- Package manager is `pnpm` (`packageManager` in `package.json`).
- Node version is not pinned in repo; align with `devenv` if needed.

## Build / Lint / Test Commands

### Dev server (Parcel)
- `devenv shell -- pnpm dev`
- Starts Parcel with `src/index.html`.

### Production build (Parcel)
- `devenv shell -- pnpm build`
- Outputs to `dist/`.

### Linting
- No lint config is present.
- If you add linting, update this file and `package.json` scripts.

### Tests
- No test runner is configured.
- `pnpm test` intentionally fails with a placeholder message.
- If you add tests, document both full-suite and single-test invocations.

### Single test (current state)
- Not applicable (no test runner).

## Debugging (MCP)
- When debugging in a browser, use MCP at `http://localhost:1234`.

## Parcel + Vega Resolution Notes
- `package.json` uses `alias` to point to ESM build entries:
  - `vega-lite`: `vega-lite/build/index.js`
  - `vega-themes`: `vega-themes/build/index.js`
  - `vega-tooltip`: `vega-tooltip/build/index.js`
  - `canvas`: `false` (prevents Node-only dependency in browser builds)
  - `danfojs`: `danfojs/dist/danfojs-browser/src`
- If you change Vega packages, keep these aliases in sync.

## Project Structure
- `src/index.html`: minimal layout and DOM mount points.
- `src/index.js`: app wiring (charts + tables).
- `src/styles.css`: design system and layout styles.
- `data/`: local datasets (CSV). `data/all_datasets_summary.csv` is loaded in
  the browser.

## Code Style Guidelines

### Language and module system
- Use plain JavaScript (no TypeScript in repo).
- Use ES modules (`import`/`export`).
- Prefer `const` and `let`; avoid `var`.

### Imports
- Keep imports grouped and ordered:
  1. Third-party CSS (e.g., Tabulator CSS)
  2. Third-party JS modules
  3. Local CSS
  4. Local JS modules
- Import Vega via `vega-embed/build/embed.js` to match Parcel resolution.
- Import Danfo as a module (`import * as dfd from "danfojs"`).

### Formatting
- Consistent 2-space indentation in JS and CSS.
- One statement per line in JS.
- Prefer trailing commas in multi-line object/array literals.
- Keep lines reasonable (avoid >120 chars when possible).

### Naming conventions
- `camelCase` for variables and functions.
- `PascalCase` for classes and constructor functions.
- `kebab-case` for CSS class names.
- Use descriptive names for chart specs and table configs.

### Types and data handling
- Data is loosely typed; keep schema clear in comments or constants.
- When adding data parsing (e.g., CSV), normalize field types early.
- Prefer DataFrame ops for filters/aggregations (Danfo) rather than manual
  loops once the dataset is loaded; use `iloc` with row indices when filtering
  to avoid Danfo `query` pitfalls.
- Avoid mutating dataset arrays in-place; create derived arrays.
- Keep numeric columns as `number` and use `null` for missing values.

### Error handling
- Guard DOM queries before using them (e.g., check for null).
- Wrap async data loading in `try/catch` and surface readable errors.
- Fail softly in UI (e.g., show empty state) rather than throwing.
- Use user-facing placeholders like "Loading data..." and "No data available."

### Chart and table behavior
- Keep chart specs immutable when possible; clone for updates.
- When updating charts based on table filters, use new data arrays.
- Avoid re-instantiating heavy components in tight loops.
- Destroy existing Tabulator instances before re-creating (`destroy()`).
- Use column groups for dataset-specific metric bundles (Acc/AUC/F1).

### Table conventions
- Keep the first column frozen for the primary identifier (e.g., `strategy`).
- Format numeric columns with a custom formatter (Tabulator v6 does not ship a
  built-in `number` formatter by default).
- Keep table height fixed to avoid layout jump when filtering/paging.
- Prefer local pagination over virtual DOM for small datasets.
- Use `headerFilter: "input"` only on columns with meaningful free-text search.

### UI state and caching
- Cache computed table rows per backbone tab to avoid repeated groupby work.
- Keep tab UI state in the DOM (active class) rather than global flags.
- Avoid storing large raw arrays on `window` except for Tabulator instances.

### CSS and UI
- Keep all global styles in `src/styles.css`.
- Use CSS variables defined in `:root` for colors and spacing.
- Maintain responsive layout rules for <980px and <640px.
- Tabs and pills use `border-radius: 999px` and match accent colors.

## Data + CSV Usage (if adding)
- Prefer `danfojs` for CSV parsing and transformations in the browser.
- Use `dfd.readCSV()` and then coerce numeric columns explicitly.
- Cache transformed data for reuse across UI tabs/filters.
- Validate numeric fields before charting or table formatting.
- Treat empty strings as missing values and render as `null`.
- Keep metric column naming consistent (`test_acc`, `test_auc`, `test_f1_macro`).
- Resolve CSV URLs via `import.meta.url` and Parcel import maps to avoid
  fetching HTML instead of CSV in dev.

## Danfo + Parcel Notes
- Danfo is bundled via ESM import (`danfojs`) and increases bundle size.
- Consider lazy-loading Danfo if bundle size or load time becomes an issue.

## Parcel Asset Rules
- Entry is `src/index.html`.
- Use relative paths for assets referenced in HTML/CSS.
- Avoid Node-only dependencies in browser code.

## Cursor / Copilot Rules
- No Cursor rules found (`.cursor/rules/` or `.cursorrules` missing).
- No Copilot rules found (`.github/copilot-instructions.md` missing).
- If you add rules, update this section with a summary.

## Updating This File
- Keep this document around ~150 lines.
- Update commands and conventions whenever tooling changes.
- If new scripts or packages are added, reflect them here.
