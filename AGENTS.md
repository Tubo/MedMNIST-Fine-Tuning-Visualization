# AGENTS

This repo is a Parcel-powered frontend app for interactive tables and charts.
It uses `tabulator-tables` for tables, `danfojs` for CSV parsing and
transformations, and `vega-embed` + `vega-lite` for charts. The environment is
managed with `devenv` + `direnv` and packages are managed with `pnpm`.

If you are an agent, follow the guidance below so your changes align with the
current setup and tooling.

## Environment and Package Manager
- Use `devenv shell` (or `direnv`) so `pnpm` is on PATH.
- Package manager is `pnpm` (`packageManager` in `package.json`).
- Node version is not pinned in repo; align with `devenv` if needed.

## Build / Lint / Test Commands

### Dev server (Parcel)
- `pnpm dev` (or `devenv shell -- pnpm dev` if not using direnv)
- Starts Parcel with `src/index.html`.
- Default URL: `http://localhost:1234`
- Uses hot module reload; changes rebuild automatically.

### Production build (Parcel)
- `pnpm build` (or `devenv shell -- pnpm build`)
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

## Debugging
- The app runs a persistent dev server (user keeps `pnpm dev` running).
- Connect via Chrome DevTools MCP server to inspect/debug the live browser.
- Do NOT start/stop the dev server during tasks; it's already running.
- Check browser console for runtime errors (vega-embed, danfojs, tabulator).
- Use browser DevTools to inspect chart rendering and table DOM structure.

## Vega + Parcel Setup (IMPORTANT)
- **Vega packages are loaded via CDN** in `src/index.html`:
  ```html
  <script src="https://cdn.jsdelivr.net/npm/vega@5"></script>
  <script src="https://cdn.jsdelivr.net/npm/vega-lite@5"></script>
  <script src="https://cdn.jsdelivr.net/npm/vega-embed@6"></script>
  ```
- Access via `window.vegaEmbed` in JS (not ES module import).
- Do NOT import vega-embed directly; it causes Parcel resolution issues.
- `package.json` aliases are for other Vega packages (themes, tooltip) but
  vega-embed uses CDN to avoid bundler conflicts.

## Project Structure
- `src/index.html`: minimal layout and DOM mount points.
- `src/index.js`: app wiring (charts + tables).
- `src/styles.css`: design system and layout styles.
- `data/`: local datasets (CSV). `data/all_datasets_summary.csv` is loaded in
  the browser.

## Code Style Guidelines

### Language and module system
- Use plain JavaScript (no TypeScript in repo).
- Use ES modules (`import`/`export`) for bundled code.
- Prefer `const` and `let`; avoid `var`.

### Imports
- Keep imports grouped and ordered:
  1. Third-party CSS (e.g., Tabulator CSS)
  2. Third-party JS modules
  3. Local CSS
  4. Local JS modules (if any)
- Import Danfo as a module (`import * as dfd from "danfojs"`).
- For Vega, use `const embed = window.vegaEmbed` after CDN loads.

### Formatting
- Consistent 2-space indentation in JS and CSS.
- One statement per line in JS.
- Prefer trailing commas in multi-line object/array literals.
- Keep lines reasonable (avoid >120 chars when possible).

### Naming conventions
- `camelCase` for variables and functions.
- `PascalCase` for classes and constructor functions.
- `kebab-case` for CSS class names.
- SCREAMING_SNAKE_CASE for constants (e.g., `DATA_URL`, `METRICS`).
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
- Keep chart specs immutable when possible; rebuild for updates.
- When updating charts based on table filters, use new data arrays.
- Avoid re-instantiating heavy components in tight loops.
- Reuse existing Tabulator instances (`setColumns`, `replaceData`) instead of
  destroying and recreating.
- Use column groups for dataset-specific metric bundles (Acc/AUC/F1).

### Vega-Lite chart specs
- Use fixed width (e.g., `width: 800`) with `autosize: { type: "fit" }`.
- Avoid `width: "container"` as it can cause 0-width rendering bugs.
- Include tooltips with proper formatting (e.g., `.4f` for metrics).
- Use semantic color schemes (`blues`, `greens`, etc.) for heatmaps.

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
- Store Tabulator instances on `window` for reuse (e.g., `window.__tabulatorTable`).

### CSS and UI
- Keep all global styles in `src/styles.css`.
- Use CSS variables defined in `:root` for colors and spacing.
- Maintain responsive layout rules for <980px and <640px.
- Tabs use `border-radius: 999px` and match accent colors.
- Card class provides consistent padding, border, and shadow.
- Avoid inline styles; extract to CSS classes for maintainability.

## Data + CSV Usage
- Prefer `danfojs` for CSV parsing and transformations in the browser.
- Use `dfd.readCSV()` and then coerce numeric columns explicitly.
- Cache transformed data for reuse across UI tabs/filters (use Map).
- Validate numeric fields before charting or table formatting.
- Treat empty strings as missing values and render as `null`.
- Keep metric column naming consistent (`test_acc`, `test_auc`, `test_f1_macro`).
- Resolve CSV URLs via `new URL(path, import.meta.url)` for Parcel compatibility.

## Parcel Asset Rules
- Entry is `src/index.html`.
- Use relative paths for assets referenced in HTML/CSS.
- Avoid Node-only dependencies in browser code.
- Clear `.parcel-cache` and `dist/` if build issues occur.

## Cursor / Copilot Rules
- No Cursor rules found (`.cursor/rules/` or `.cursorrules` missing).
- No Copilot rules found (`.github/copilot-instructions.md` missing).
- If you add rules, update this section with a summary.

## Updating This File
- Keep this document around ~150 lines.
- Update commands and conventions whenever tooling changes.
- If new scripts or packages are added, reflect them here.

## Agent Workflow and Cleanup
- **IMPORTANT:** Clean up after each feature implementation.
- Remove unused code, CSS classes, and HTML elements.
- Verify no dead code remains after refactoring.
- Keep codebase lean and maintainable.
- Only commit files tracked by git; ignore build artifacts.
- Use `git ls-files` to verify what's tracked before cleanup.
