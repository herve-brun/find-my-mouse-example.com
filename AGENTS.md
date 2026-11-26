# AGENTS.md - Find My Mouse GNOME Extension

## Quick Facts
- GNOME Shell extension for GNOME 46-50 (Wayland)
- Replicates Microsoft PowerToys Find My Mouse spotlight feature
- Uses St.DrawingArea with Cairo for spotlight rendering
- TypeScript source in `src/*.ts`, compiled to `dist/*.js`
- GSettings schema at `schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml`
- Activation is show-only: the keyboard shortcut and the mouse gesture both call `activate()`; a repeat activation refreshes the spotlight instead of toggling it off
- Default mode is "Shortcut + Mouse Gesture" (internal GSettings value `'shake'`); `<Super>f` remains active in this mode. `'always'` is opt-in.

## Developer Commands
```bash
# TypeScript type check (no emit)
npm run check

# Lint TypeScript source files
npm run lint

# Build extension, then run unit tests (build + node:test)
npm test

# Build extension (clean + compile TypeScript to dist/)
npm run build

# Build full distribution ZIP for EGO upload
npm run build:dist

# Compile GSettings schema (required after schema changes)
npm run build:schemas

# Regenerate gettext template and merge into en/fr/es PO files (requires gettext)
npm run i18n:update

# Or manually:
glib-compile-schemas schemas/

# Test in nested Wayland session (no shell restart needed)
# GNOME 49+ needs the mutter-devkit helper to draw the host window:
#   Ubuntu/Debian: sudo apt install mutter-dev-bin
#   Other distros: install the package providing /usr/libexec/mutter-devkit
# Without it, --devkit starts headless and no window appears.
# For GNOME Shell 49+, use the devkit mode for better debugging
# For older versions, use the nested mode with backtrace warnings
if [ "$(gnome-shell --version | awk '{print int($3)}')" -ge 49 ]; then
    dbus-run-session gnome-shell --devkit --wayland
else
    SHELL_DEBUG=backtrace-warnings dbus-run-session gnome-shell --nested --wayland
fi

# Test in nested X11 session (requires Xephyr)
# Install Xephyr first:
#   Ubuntu/Debian: sudo apt install xserver-xephyr
#   Fedora/RHEL:   sudo dnf install xorg-x11-server-Xephyr
#   Arch:          sudo pacman -S xorg-server-xephyr
Xephyr :1 -screen 1920x1080 &
DISPLAY=:1 dbus-run-session gnome-shell

# View extension logs
journalctl --user -f | grep "Find My Mouse"
```

## Commit Message Convention
Commits must adhere to [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) rules.

### commitlint (Local Validation)
A local commit message hook is configured via `commitlint.config.cjs`:
- Uses `@commitlint/cli` and `@commitlint/config-conventional` (devDependencies)
- Enforces allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

## About Dialog Rules
- **Release Notes**: Whenever a new version is created, the About dialog's release notes MUST be updated before release.
- **Year**: If the current year does not match the year in the About dialog, update the latter.

## Architecture
```
src/*.ts               →  dist/*.js        (TypeScript → compiled output)
  extension.ts         →  extension.js      (Lifecycle, wiring, pointer/gesture event handlers)
  prefs.ts             →  prefs.js          (Adwaita/GTK4 preferences UI)
  settings.ts          →  settings.js       (GSettings wrapper and schema access)
  activationController.ts → activationController.js (Activation policy + idle timeout)
  gestureDetector.ts   →  gestureDetector.js (Pure "wave then stop" state machine, no imports)
  gestureFeedback.ts   →  gestureFeedback.js (Pointer-local progress ring + optional sound)
  spotlight.ts         →  spotlight.js      (Spotlight rendering with Cairo + zoom animation)
  mouseTracking.ts     →  mouseTracking.js  (pointerWatcher adapter feeding GestureDetector)
  gamemodeClient.ts    →  gamemodeClient.js (Game mode integration)
  practiceService.ts   →  practiceService.js (Shell-side practice session; owns D-Bus name + 10 s watchdog)
  practiceClient.ts    →  practiceClient.js (Preferences-side D-Bus proxy, signals and retry)
  utils.ts             →  utils.js          (Shared utilities)
```
- `metadata.json` - Extension metadata (uuid, supported GNOME versions)
- `schemas/` - GSettings schema (XML + compiled)
- `tsconfig.json` - TypeScript config (development)
- `tsconfig.prod.json` - TypeScript config (production build to `dist/`)
- `ambient.d.ts` - TypeScript ambient type declarations
- `gnome-shell-extensions.d.ts` - GNOME Shell extension type declarations
- `dist/` - Compiled output (gitignored)

## CI/CD Pipelines

### `test.yml` — Test Extension
Runs on every push and pull request:
- **Validate Metadata and Schema**: Compiles GSettings schema, validates `metadata.json`
- **TypeScript Type Check**: Runs `tsc --noEmit` to check for type errors
- **Validate GSettings Schema**: XML validation via `xmllint`
- **Check Commit Messages**: Validates recent commits follow Conventional Commits

### `release.yml` — Release Extension
Triggers on tag `v*`:
- Runs `tsc --noEmit` type check
- Builds extension ZIP via `npm run build:dist`
- Validates ZIP contents (`metadata.json`, `schemas/gschemas.compiled`, `extension.js`, `prefs.js`)
- Creates GitHub Release with generated release notes

### `lint-pr.yml` — Lint PR
Runs on PR events (opened, edited, synchronize, reopened):
- Validates PR title follows Conventional Commits
- Uses `amannn/action-semantic-pull-request` action
- Supports bypass via `ignore-semantic-pull-request` label

## Critical Gotchas
- **Always compile schema** after modifying `schemas/*.xml`: `glib-compile-schemas schemas/` or `npm run build:schemas`
- **Translations**: mark Preferences strings with `_()` in `src/prefs.ts`. `metadata.json` already sets `gettext-domain`, so GNOME Shell initializes catalogs automatically. After string changes, run `npm run i18n:update`, translate changed PO entries, and commit `po/*.pot`/`po/*.po`. Builds require `msgfmt` and emit compiled catalogs under `dist/locale/<lang>/LC_MESSAGES/`.
- **Cairo context** obtained via `area.get_context()` in `repaint` signal handler
- **Use `queue_repaint()`** not `queue_redraw()` for St.DrawingArea
- **Extension runs in Wayland** — Ctrl double-press is unreliable; use the `<Super>f` shortcut or the mouse gesture. The mouse gesture is a deliberate horizontal wave followed by stopping: it arms at ≥400 px/s with ≥2:1 horizontal dominance, counts 3 reversals of ≥90 px each within 900 ms (speed must dip below 20% of the sweep peak), then requires the pointer to settle below 150 px/s within 180 ms. Cooldown is 1500 ms. Tuning keys are `gesture-reversals` (3), `gesture-sweep` (90 px), `gesture-window` (900 ms), `gesture-settle` (180 ms), `gesture-cooldown` (1500 ms), `gesture-ignore-buttons` (true), `gesture-ignore-fullscreen` (true), `gesture-sound` (false). `shake-interval` and `shake-sensitivity` are deprecated compatibility keys and are not read by the detector.
- **No shell restart** - user tests via nested session (GNOME 49+ requires `mutter-dev-bin` on Ubuntu; without it `--devkit` runs headless with no visible window)
- **Debugging**: Use `journalctl --user --no-pager | grep "Find My Mouse"` for logs
- **Spotlight visibility**: `SpotlightManager.isVisible`; the idle timeout lives in `ActivationController`, not in `SpotlightManager`
- **Zoom animation**: Uses `Clutter.Timeline` with `easeOutQuad` easing. Start zoom and animation duration are configurable in preferences.
- **Gesture detector isolation**: `gestureDetector.ts` has no imports and takes injected monotonic millisecond timestamps; keep it that way so `node:test` can exercise it without GNOME Shell. The 16 ms settling clock belongs to `MouseTracker` and only exists while an attempt is in progress. `npm test` also covers slow, small pointer steps (three ~30 px steps 1500 ms apart) as a no-activation regression.
- **Practice mode must never call the real activation path**: while a session is active, `activated` is reported as `Result(success=true, …)` through `PracticeService`; do not call `ActivationController.activate('gesture')`. The progress ring is hidden when the terminal gesture event is handled, at the same time the session ends. The service owns the bus name and a 10 s watchdog; every terminal path (Result, Cancel, dialog destroy, prefs close, extension disable, bus-name loss, watchdog) must end the session so a second prefs window or an extension reload cannot leave a stale dialog waiting. The dialog has no auto-close timer, its accessible name matches the visible `Practice` label, status announcements are live, and a text-only fallback is available when D-Bus is unavailable.
- **TypeScript source**: Edit `src/*.ts`; the Shell loads compiled `dist/*.js`. All development is in TypeScript.

## Default Values
- Background: `#00000080` (black 50% opacity)
- Spotlight: `#FFFFFFCC` (white 80% opacity; raised from PowerToys' 50% to keep a 3:1 contrast ratio)
- Radius: 100px, Zoom: 9.0x, Animation: 500ms
- Idle timeout: 1000ms (hide after mouse stops)
- Mouse gesture: 3 reversals of ≥90 px within 900 ms, settle <150 px/s within 180 ms, cooldown 1500 ms; amplitude floor scales with sweep × reversals (minimum 120 px). Buttons/fullscreen ignored by default; confirmation sound off by default.
- Activation: "Shortcut + Mouse Gesture" (`activation-method = 'shake'`, `<Super>f`); "Always Visible" (`'always'`) is opt-in.

## Repository Map

A full codemap is available at `codemap.md` in the project root.

Before working on any task, read `codemap.md` to understand:
- Project architecture and entry points
- Directory responsibilities and design patterns
- Data flow and integration points between modules

For deep work on a specific folder, also read that folder's `codemap.md`.
