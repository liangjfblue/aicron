# Desktop App Progress

Plan: `docs/superpowers/plans/2026-06-12-desktop-app.md`
Branch: `codex/desktop-app`

## Status

- [x] Plan written with `writing-plans`.
- [x] `master` startup proxy fix committed and pushed.
- [x] Desktop branch fast-forwarded to latest `master`.
- [x] Task 1: Add desktop dependencies and scripts.
- [x] Task 2: Refactor server startup for reuse.
- [x] Task 3: Add Electron main process with tray, menu, single instance, and notifications.
- [x] Task 4: Make frontend API calls desktop-aware.
- [x] Task 5: Add desktop startup controls to settings.
- [x] Task 6: Connect desktop notifications to run completion.
- [x] Task 7: Add renderer navigation bridge.
- [x] Task 8: Document desktop development and acceptance.
- [x] Task 9: Full verification.

## Log

### 2026-06-12

- Created this progress document.
- Confirmed active branch is `codex/desktop-app`.
- Confirmed plan file exists and requires subagent-driven execution.
- Read `subagent-driven-development` and `using-git-worktrees` skills.
- Dispatched Task 1 implementer for `package.json` and `package-lock.json`.
- Completed Task 1 by confirming Electron tooling dependencies, adding desktop scripts/build metadata, and verifying script keys.
- Started Task 2 by adding an import smoke test and refactoring `server/index.js` into `createApp()` / `startServer()`.
- Addressed Task 2 review findings by isolating desktop run-complete hook failures and fixing segmented scheduler timer cleanup.
- Verified Task 2 with `npm test -- server/test/routes/health.test.js server/test/services/scheduler.test.js` and `npm test` (14 files, 88 tests passing).
- Implemented Tasks 3-7: Electron main/preload/tray icon, desktop API base bridge, settings startup toggle, run-completion desktop notification hook, and renderer navigation bridge.
- Addressed Tasks 3-7 review findings: packaged entry now points to `desktop/main.cjs`, packaged paths use `app.getAppPath()`, dev Electron uses the external dev server, startup failures show an error dialog, app menu quit uses the same cleanup path, and static UI uses `HashRouter`.
- `npm run desktop:pack` found Electron 42 / `better-sqlite3` rebuild incompatibility; downgraded Electron to 39.8.10 and added an Electron dist preparation wrapper because electron-builder's default unzip path hung in this environment.
- Added `scripts/run-electron-builder.cjs` so pack/dist use the prepared Electron dist and always rebuild `better-sqlite3` back to the local Node ABI afterward.
- First packaged app launch exposed the inverse ABI issue: rebuilding local `better-sqlite3` after pack also changed the unpacked native file inside `desktop-dist`. Updated the builder wrapper to explicitly rebuild `better-sqlite3` for Electron, copy that native file into the packaged app, then rebuild local `node_modules` back to the Node ABI for tests/dev.
- Packaged app then launched but rendered a blank window because Vite emitted absolute `/assets/...` paths for a `file://` renderer. Set `web/vite.config.js` `base: './'` so packaged static assets load via relative paths.
- Packaged app rendered correctly; the empty task list is expected for external users because desktop mode uses its own clean app data directory.
- Completed Task 8 by adding README desktop development, packaging, and acceptance notes.
- Completed Task 9 verification: `node -c` checks passed for desktop/build scripts, `npm --prefix web run build` passed, `npm test` passed (14 files, 88 tests), `npm run desktop:pack` produced `desktop-dist/mac-arm64/AICron.app`, packaged app started with `/api/health` responding on `127.0.0.1:3218`, UI rendered, and quitting the app stopped the 3218 backend with no AICron processes left.
- Updated the packaged desktop data root to use `AICRON_HOME` or the user's home directory `.aicron` by default, so macOS uses `~/.aicron` and Windows uses `C:\Users\<用户名>\.aicron`.
- Re-verified the desktop data-root change: `node -c desktop/main.cjs`, `npm --prefix web run build`, and `npm test` all passed; `npm run desktop:pack` produced the packaged app; launching the packaged binary with `AICRON_HOME=~/.aicron-test-desktop-path` created `~/.aicron-test-desktop-path/data/aicron.db` with 0 tasks and the initial admin user; quitting the app stopped the `3218` backend.
- Fixed desktop CLI discovery after a real run failed with `spawn claude ENOENT`. Added shared CLI PATH helpers for server-side spawns and desktop startup PATH enrichment, including Homebrew, nvm, fnm, Volta, Bun, user local bin, and Windows npm global directories. Verified the helper resolves the local nvm `claude` from a minimal `/usr/bin` PATH.
- Re-verified the packaged app from a minimal `PATH=/usr/bin:/bin`: health check passed, a manual Claude smoke task completed with `status=succeeded`, `exit_code=0`, and stdout `好的`, proving the original `spawn claude ENOENT` path is fixed.
