# AGENTS.md - Find My Mouse GNOME Extension

## Quick Facts
- GNOME Shell extension for GNOME 46-50 (Wayland)
- Replicates Microsoft PowerToys Find My Mouse spotlight feature
- Uses St.DrawingArea with Cairo for spotlight rendering
- TypeScript source in `src/*.ts`, compiled to `dist/*.js`
- GSettings schema at `schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml`

## Developer Commands
```bash
# TypeScript type check (no emit)
npm run check

# Lint TypeScript source files
npm run lint

# Build extension (clean + compile TypeScript to dist/)
npm run build

# Build full distribution ZIP for EGO upload
npm run build:dist

# Compile GSettings schema (required after schema changes)
npm run build:schemas

# Or manually:
glib-compile-schemas schemas/

# Test in nested Wayland session (no shell restart needed)
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
  extension.ts         →  extension.js      (Core logic: spotlight rendering, mouse tracking, Cairo painting)
  prefs.ts             →  prefs.js          (Adwaita/GTK4 preferences UI)
  settings.ts          →  settings.js       (GSettings wrapper and schema access)
  spotlight.ts         →  spotlight.js      (Spotlight rendering with Cairo + zoom animation)
  mouseTracking.ts     →  mouseTracking.js  (Mouse movement and shake detection)
  gamemodeClient.ts    →  gamemodeClient.js (Game mode integration)
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
- **Cairo context** obtained via `area.get_context()` in `repaint` signal handler
- **Use `queue_repaint()`** not `queue_redraw()` for St.DrawingArea
- **Extension runs in Wayland** - modifier key (Ctrl) double-press unreliable; use shake or always-visible activation
- **No shell restart** - user tests via nested session
- **Debugging**: Use `journalctl --user --no-pager | grep "Find My Mouse"` for logs
- **Spotlight visibility**: Tracked via `_spotlightVisible` boolean
- **Zoom animation**: Uses `Clutter.Timeline` with `easeOutQuad` easing. Start zoom and animation duration are configurable in preferences.
- **TypeScript source**: Edit `src/*.ts`, compiled output goes to `dist/`. Root `.js` files have been removed — all development is in TypeScript.

## Default Values (PowerToys-matched)
- Background: `#00000080` (black 50% opacity)
- Spotlight: `#FFFFFF80` (white 50% opacity)
- Radius: 100px, Zoom: 9.0x, Animation: 500ms
- Idle timeout: 1000ms (hide after mouse stops)
- Shake: 1000px distance, 400% sensitivity, 1000ms interval

## Repository Map

A full codemap is available at `codemap.md` in the project root.

Before working on any task, read `codemap.md` to understand:
- Project architecture and entry points
- Directory responsibilities and design patterns
- Data flow and integration points between modules

For deep work on a specific folder, also read that folder's `codemap.md`.
