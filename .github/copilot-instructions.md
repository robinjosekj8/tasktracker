# Copilot Instructions for Maintenance Dashboard

## 1) Big picture architecture
- Backend: `server.js` Express app (CJS). Serves static `public/` + API under `/api/*`.
- Frontend: static SPA in `public/` (`index.html`, `efficiency.html`, `app.js`, `efficiency.js`, `style.css`).
- Data sources (priority):
  1. Odoo via XML-RPC (`project.task` + `project.tags` + `mail.message`)
  2. Google Sheet XLSX URL (hardcoded in `server.js`) as fallback
  3. Local Excel file `Maintenance Team schedule log report Tracking.xlsx` as local offline fallback.

## 2) Key entrypoints and data flows
- `GET /api/tasks` -> `fetchFromOdoo()` (cached 2 min). Transforms Odoo fields into dashboard shape.
- `GET /api/odoo-status` -> minimal auth check via Odoo XML-RPC authenticate.
- `GET /api/task-logs/:id` -> `mail.message` chatter lookup by task id.
- Frontend uses `/api/tasks` in both `app.js` and `efficiency.js` to compute dashboards and filters.

## 3) Env/config and run workflow
- .env variables: `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_PASS`.
- Missing Odoo credentials causes `/api/tasks` to 500 with explicit message.
- Run locally:
  - `npm install`
  - `node server.js`
  - Open `http://localhost:3000`.
- Test stub: `npm test` currently is placeholder (no tests yet).

## 4) Patterns and conventions to keep
- Data key normalization: `cleanKeys(data)` trims Excel column keys.
- Task records always map to literal dashboard text keys: `Task Description`, `Assigned Tech`, `Status`, `Date`, `Site`, etc.
- Status values are compared case-insensitively in UI (`done`, `warranty`, `waiting spare parts`); maintain these exact match groups when adding logic.
- UI uses DOM-driven render loop, no framework.
- Cache behavior: `cachedData` + `lastFetchTime` with `CACHE_DURATION_MS = 2m`; short-lived cache for live-ish dashboard.

## 5) What to edit for features
- New Odoo fields in task cards: update map in `fetchFromOdoo()` and both front end render functions (`createTaskCard`, `calculateEfficiencies`).
- New API route: add to `server.js` with similar error and auth strategy.
- Added `app.get('/api/task-logs/:id', ...)` for modal detail view.

## 6) Integration notes
- Odoo RPC is direct XML-RPC (`xmlrpc` package); `odooCall(host,path,method,params)` wraps callback API in Promise.
- `SHEET_URL` is hardcoded; to switch sheet, edit constant in root `server.js`.
- The front-end `task card clickable` detail modal relies on `data-id` being Odoo numeric ID.

## 7) Agent behavior guidance
- Prefer minimal edits in `server.js` to preserve existing fallback sequence.
- Avoid introducing async/await in front-end until same style is shown (all existing is async/await, no promises chain).
- Hardcoded UI status classes appear in `style.css` and `app.js` status switch (done, in progress etc.), preserve mapping there.
- If adding tests, note no tests exist now; keep scope to functional drift (existing script is placeholder).

---

> Feedback request: please confirm if this doc has enough detail for a new AI contributor to safely modify both backend and frontend, and let me know if you want an additional section for a missing pattern (e.g., error handling strategy for XML-RPC).