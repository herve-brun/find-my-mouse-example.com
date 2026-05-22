# Repository Atlas — find-my-mouse-example.com

> **Revision**: 1.0
> **Maintainer**: Hervé Brun
> **License**: MIT (with non-endorsement clause)
> **Generated**: 2026-05-22

---

## 1. Project Responsibility

### 1.1 Mission Statement
**Find My Mouse** is a GNOME Shell extension (GNOME 46–50, Wayland) that replicates the Microsoft PowerToys "Find My Mouse" spotlight feature. Its purpose is to help users who frequently lose their cursor on screen — especially on high-resolution, multi-monitor, or presentation setups — by rendering a highly customizable circular spotlight that highlights the mouse cursor position.

### 1.2 What This Repository Owns
- **Spotlight Rendering** — Cairo-based (fallback) and GLSL shader-based (primary) rendering of the spotlight overlay on top of the GNOME Shell desktop via `St.DrawingArea` and `Shell.GLSLEffect`.
- **Mouse Tracking** — Real-time cursor position monitoring via GNOME Shell's `PointerWatcher` API, with shake-gesture detection for activation.
- **Multi-modal Activation** — Two activation methods: mouse shake and always-visible mode.
- **Preferences UI** — Full Adwaita/GTK4 settings dialog with per-page sections (General, Appearance, Glass, Timing, Shake Detection, About).
- **Game Mode Integration** — D-Bus integration with `com.feralinteractive.GameMode` to suppress spotlight during gaming sessions.
- **GSettings Persistence** — All user preferences are persisted through a GSettings schema (`org.gnome.shell.extensions.find-my-mouse`).

### 1.3 What This Repository Does NOT Own
- The `PointerWatcher` implementation — this is consumed from GNOME Shell's internal module `resource:///org/gnome/shell/ui/pointerWatcher.js`.
- The actual desktop compositing or window management — the extension sits as a transparent overlay injected into `Main.uiGroup`.
- Game Mode D-Bus service (`com.feralinteractive.GameMode`) — this is an external system daemon.

---

## 2. System Entry Points

### 2.1 Extension Lifecycle Entry
```
src/extension.ts  →  dist/extension.js
```
The class `FindMyMouseExtension` extends `Extension` from `resource:///org/gnome/shell/extensions/extension.js`.

| Method       | Called When             | Key Actions                                                                |
|-------------|-------------------------|---------------------------------------------------------------------------|
| `enable()`  | Extension is activated  | Creates `SettingsManager`, `SpotlightManager`, `MouseTracker`, `KeybindingManager`, `GameModeClient`. Sets up signal handlers for settings changes, mouse events, and keyboard shortcuts. Initializes Game Mode D-Bus connection. |
| `disable()` | Extension is deactivated| Disconnects all signal handlers, destroys managers, removes keybinding, removes pointer watch, hides spotlight, disposes GameMode proxy. |

### 2.2 Preferences UI Entry
```
src/prefs.ts  →  dist/prefs.js
```
The class `FindMyMousePreferences` extends `ExtensionPreferences`. The method `fillPreferencesWindow(window: Adw.PreferencesWindow)` is the sole entry point and builds the entire multi-page settings dialog.

### 2.3 Spotlight Rendering Entry
```
src/spotlight.ts  →  dist/spotlight.js   (Cairo fallback)
src/spotlightEffect.ts  →  dist/spotlightEffect.js  (GLSL primary)
```
- `SpotlightManager.show()` creates the `St.DrawingArea`, attempts to attach a `SpotlightGLSLEffect` (GLSL shader), and falls back to Cairo `repaint` signal if GLSL fails.
- `SpotlightGLSLEffect` (`vfunc_build_pipeline`, `vfunc_paint_target`) generates a full-screen GLSL fragment shader that renders the spotlight circle with glass-morphism effects (blur, tint, glow, ring).

---

## 3. Architecture Overview

### 3.1 Layered Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    GNOME Shell                            │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Main.uiGroup (overlay)                  │ │
│  │  ┌─────────────────────────────────────────────────┐│ │
│  │  │  St.DrawingArea (full-screen transparent)        ││ │
│  │  │  ┌────────────────────────────────────────────┐ ││ │
│  │  │  │  Shell.GLSLEffect (GLSL fragment shader)    ││ │ │
│  │  │  │  - Cairo fallback (repaint signal)           ││ │ │
│  │  │  └────────────────────────────────────────────┘ ││ │
│  │  └─────────────────────────────────────────────────┘│ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│             Extension Manager Layer                      │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ Settings   │  │  Spotlight   │  │    MouseTracker   │ │
│  │ Manager    │  │  Manager     │  │  (pointerWatcher) │ │
│  └────────────┘  └──────────────┘  └──────────────────┘ │
│  ┌──────────────┐  ┌──────────────────┐                  │
│  │ Keybinding   │  │  GameModeClient   │                  │
│  │ Manager      │  │  (D-Bus proxy)    │                  │
│  └──────────────┘  └──────────────────┘                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              GSettings Schema Layer                      │
│  schemas/org.gnome.shell.extensions.find-my-mouse.xml   │
│  19 keys: activation, colors, timing, glass morphism    │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Module Relationships

```
extension.ts
  ├── settings.ts         (SettingsManager — GSettings cache)
  ├── spotlight.ts        (SpotlightManager — renders spotlight)
  │   └── spotlightEffect.ts  (SpotlightGLSLEffect — GLSL shader)
  ├── mouseTracking.ts    (MouseTracker — pointer watch + shake)
  ├── gamemodeClient.ts   (GameModeClient — D-Bus GameMode)
  └── utils.ts            (debugLog, parseColor, LogLevel)
```

### 3.3 Design Patterns

| Pattern              | Implementation                                                      |
|----------------------|----------------------------------------------------------------------|
| **Singleton Manager** | Each manager is instantiated once in `extension.ts`'s `enable()`.  |
| **Event-Driven**     | GSettings `changed::` signals, `pointerWatcher` callbacks, stage `button-press-event`. |
| **Strategy**         | Activation methods (shake/always) act as strategies dispatching to `_toggleSpotlight()`. |
| **Fallback**         | GLSL effect is primary; Cairo repaint is fallback if GLSL init fails. |
| **Observer**         | `GameModeClient` emits state change to multiple handlers; `_onPropertiesChanged` dispatches. |
| **Caching**          | `SettingsManager.cacheSettings()` normalizes and caches all GSettings values to avoid repeated GI calls. |
| **Command**          | `_showSpotlight()` / `hide()` commands encapsulate visibility state. |

### 3.4 Data Flow: Activation → Rendering

```
User Action (shake/always)
       │
       ▼
extension.ts:_toggleSpotlight()
       │
       ├── GameMode check (if active + suppress enabled → abort)
       │
       ▼
extension.ts:_showSpotlight()
       │
       ├── spotlightManager.show(showOnAllMonitors)
       │       │
       │       ├── Creates St.DrawingArea (geometry = monitor|all)
       │       │
       │       ├── Attemps SpotlightGLSLEffect (Shell.GLSLEffect)
       │       │   └── vfunc_build_pipeline() → GLSL shader source
       │       │   └── vfunc_paint_target() → set uniforms
       │       │
       │       └── If GLSL fails: connect('repaint', _onRepaint)
       │           └── Cairo: draw bg overlay + clear spotlight hole + ring
       │
       ├── global.get_pointer() → updateMousePosition(x, y)
       │
       └── _resetIdleTimeout() → GLib.timeout_add(idleTimeout)
                 │
                 ▼ (if timeout fires)
            spotlightManager.hide()
```

---

## 4. Build & Development

### 4.1 Prerequisites

| Requirement     | Minimum  | Notes                                    |
|----------------|----------|------------------------------------------|
| GNOME Shell    | 46       | Tested up to 50                          |
| Node.js        | 22       | For TypeScript compilation & tooling     |
| npm            | 10+      | Bundled with Node.js                     |
| glib-compile-schemas | System | From `libglib2.0-bin` (Ubuntu) |

### 4.2 NPM Scripts Reference

| Script              | Command                           | Description                                       |
|---------------------|-----------------------------------|---------------------------------------------------|
| `npm run check`     | `tsc --noEmit`                    | TypeScript type-check without emitting output     |
| `npm run lint`      | `eslint src/`                     | Lint TypeScript source files                      |
| `npm run build`     | `clean && tsc -p tsconfig.prod.json` | Clean dist/ and compile TypeScript to dist/   |
| `npm run build:schemas` | `glib-compile-schemas schemas/` | Compile GSettings XML → binary `gschemas.compiled` |
| `postbuild`         | `build:schemas && cp metadata.json && cp -r schemas` | Auto-runs after build |
| `npm run build:dist`| `build && cd dist && zip -qr ../find-my-mouse@herve-brun.github.io.zip .` | Full distribution ZIP for EGO upload |

### 4.3 TypeScript Configurations

| File                 | Purpose                        | Key Options                         |
|----------------------|--------------------------------|-------------------------------------|
| `tsconfig.json`      | Development (dev)              | `target: ES2023`, `module: NodeNext`, `sourceMap: true` |
| `tsconfig.prod.json` | Production (build)             | Extends dev, `rootDir: ./src`, `outDir: ./dist`, `sourceMap: false` |

### 4.4 Development Workflow

```bash
# 1. Install
npm install
glib-compile-schemas schemas/

# 2. Symlink for live testing
ln -s $(pwd) ~/.local/share/gnome-shell/extensions/find-my-mouse@herve-brun.github.io

# 3. Edit TypeScript in src/

# 4. Compile
npm run build

# 5. Restart shell (Alt+F2, r) or test in nested session

# 6. Test in nested session
# GNOME 49+:
dbus-run-session gnome-shell --devkit --wayland
# GNOME < 49:
SHELL_DEBUG=backtrace-warnings dbus-run-session gnome-shell --nested --wayland

# 7. View logs
journalctl --user -f | grep "Find My Mouse"
```

---

## 5. Directory Map

```
find-my-mouse-example.com/
│
├── src/                              # TypeScript source (edit here!)
│   ├── extension.ts                  # EXTENSION ENTRY: lifecycle, managers, activation logic
│   ├── prefs.ts                      # PREFERENCES ENTRY: Adwaita/GTK4 settings UI (≈610 lines)
│   ├── settings.ts                   # GSettings wrapper + cached values
│   ├── spotlight.ts                  # SpotlightManager: St.DrawingArea + Cairo repaint
│   ├── spotlightEffect.ts            # SpotlightGLSLEffect: GLSL fragment shader + uniforms
│   ├── mouseTracking.ts              # MouseTracker: pointerWatcher + shake detection
│   ├── gamemodeClient.ts             # GameModeClient: D-Bus GameMode integration
│   ├── utils.ts                      # Shared: debugLog, parseColor, LogLevel enum
│   └── codemap.md                    # Source directory atlas
│
├── schemas/                          # GSettings schema
│   ├── org.gnome.shell.extensions.find-my-mouse.gschema.xml  # 30+ keys
│   ├── gschemas.compiled            # Binary compiled schema (gitignored)
│   └── codemap.md                    # Schema directory atlas
│
├── dist/                             # Compiled JS output (gitignored, auto-generated)
│   ├── extension.js
│   ├── prefs.js
│   ├── settings.js
│   ├── spotlight.js
│   ├── spotlightEffect.js
│   ├── mouseTracking.js
│   ├── gamemodeClient.js
│   └── utils.js
│
├── .github/                          # CI/CD
│   ├── workflows/
│   │   ├── test.yml                  # Push/PR: lint, typecheck, schema validate, commit check
│   │   ├── release.yml               # Tag v*: build ZIP, validate contents, create release
│   │   ├── lint-pr.yml               # PR title: conventional commits validation
│   │   └── close-linear-issues.yml   # Push: parse "Fixes FIN-xxx" → Linear API (placeholder)
│   └── scripts/
│       └── validate_metadata.py      # CI helper: validate metadata.json structure
│
├── .husky/                           # Git hooks
│   ├── commit-msg                    # commitlint hook: validates commit messages
│   └── _/                            # husky internal
│
├── docs/codebase/                    # Codebase analysis docs (generated)
│   ├── ARCHITECTURE.md
│   ├── CONCERNS.md
│   ├── CONVENTIONS.md
│   ├── INTEGRATIONS.md
│   ├── STACK.md
│   ├── STRUCTURE.md
│   ├── TESTING.md
│   └── .codebase-scan.txt
│
├── screenshots/                      # README screenshots
├── node_modules/                     # Dependencies (gitignored)
│
├── metadata.json                     # Extension metadata
│   ├── uuid: find-my-mouse@herve-brun.github.io
│   ├── shell-version: ["46", "47", "48", "49", "50"]
│   └── version: 1.0.0
│
├── ambient.d.ts                      # GJS/GIR ambient type imports
├── gnome-shell-extensions.d.ts       # Custom type declarations for Shell modules
├── tsconfig.json                     # Dev TypeScript config
├── tsconfig.prod.json                # Production TypeScript config
├── eslint.config.js                  # ESLint flat config (typescript-eslint)
├── commitlint.config.cjs             # Conventional commit enforcement config
├── package.json                      # Dependencies + scripts
├── package-lock.json
├── AGENTS.md                         # AI agent instructions
├── README.md                         # Project README
├── LICENSE.md                        # MIT license with non-endorsement
└── codemap.md                        # THIS FILE — Repository Atlas
```

---

## 6. Key Dependencies

### 6.1 Runtime Dependencies (GNOME Shell / GJS)

| Module                     | Import Path                                   | Used In               | Purpose                                 |
|----------------------------|-----------------------------------------------|------------------------|-----------------------------------------|
| `Extension`                | `resource:///org/gnome/shell/extensions/extension.js` | extension.ts   | Base class for extension lifecycle      |
| `ExtensionPreferences`     | `resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js` | prefs.ts | Base class for preferences UI           |
| `*Main`                    | `resource:///org/gnome/shell/ui/main.js`       | spotlight.ts, keybindings.ts | `Main.uiGroup`, `Main.wm`        |
| `getPointerWatcher`        | `resource:///org/gnome/shell/ui/pointerWatcher.js` | mouseTracking.ts | Cursor position tracking                |
| `St.DrawingArea`           | `gi://St`                                     | spotlight.ts          | Clutter actor for Cairo rendering       |
| `Shell.GLSLEffect`         | `gi://Shell`                                  | spotlightEffect.ts   | GLSL shader effect pipeline             |
| `Shell.ActionMode` / `Shell.SnippetHook` | `gi://Shell` | keybindings.ts, spotlightEffect.ts | Keybinding modes, shader hooks |
| `Meta.KeyBindingFlags` / `Meta.MonitorManager` | `gi://Meta` | keybindings.ts, spotlightEffect.ts | Keybinding flags, monitor API |
| `Clutter.Actor` / `Clutter.Event` / `Clutter` | `gi://Clutter` | extension.ts, spotlightEffect.ts | Stage events, actors        |
| `Cairo`                    | `gi://cairo`                                  | spotlight.ts          | `Cairo.Operator.CLEAR`, `setSourceRGBA`, etc. |
| `Gio.Settings`             | `gi://Gio`                                    | settings.ts, gamemodeClient.ts, prefs.ts | GSettings + D-Bus proxy      |
| `GLib`                     | `gi://GLib`                                   | spotlight.ts, mouseTracking.ts | `timeout_add`, `get_monotonic_time` |
| `GObject`                  | `gi://GObject`                                | spotlightEffect.ts   | `GObject.registerClass`                 |
| `Gtk` / `Adw` / `Gdk`      | `gi://Gtk?version=4.0`, `gi://Adw`, `gi://Gdk?version=4.0` | prefs.ts | Preferences UI widgets |

### 6.2 NPM Dependencies

| Package                        | Type   | Purpose                                       |
|--------------------------------|--------|-----------------------------------------------|
| `@girs/gjs`                   | runtime| TypeScript type definitions for GJS runtime   |
| `@girs/gnome-shell`           | runtime| TypeScript type definitions for GNOME Shell   |
| `@girs/cairo-1.0`             | runtime| TypeScript type definitions for Cairo         |
| `typescript`                  | dev    | TypeScript compiler (≥5.7)                    |
| `eslint`                      | dev    | Linter (≥10.3)                                |
| `@eslint/js`                  | dev    | ESLint recommended config                     |
| `typescript-eslint`           | dev    | TypeScript ESLint rules                       |
| `@commitlint/cli`             | dev    | Conventional commit validation                |
| `@commitlint/config-conventional` | dev | Conventional commit rules                   |
| `husky`                       | dev    | Git hooks manager                             |

---

## 7. CI/CD

### 7.1 `test.yml` — Test Extension (every push + PR)

| Job              | What it does                                                    |
|------------------|----------------------------------------------------------------|
| `validate`       | Compiles GSettings schema, validates `metadata.json` via Python script |
| `lint`           | `npm run lint` (ESLint) + `npx tsc --noEmit` (type check)      |
| `test-schema`    | `xmllint` validation of GSettings XML schema                   |
| `check-commits`  | Checks last 5 commits follow Conventional Commits (basic regex) |

### 7.2 `release.yml` — Release Extension (tag `v*`)

| Step                            | Description                                                   |
|---------------------------------|---------------------------------------------------------------|
| ESLint                          | Lint sources                                                  |
| TypeScript type check           | `npx tsc --noEmit`                                            |
| Build extension ZIP             | `npm run build:dist` → `find-my-mouse@herve-brun.github.io.zip` |
| Validate ZIP contents           | Checks for `metadata.json`, `schemas/gschemas.compiled`, `extension.js`, `prefs.js` |
| Create GitHub Release           | Uses `softprops/action-gh-release@v2` with auto release notes |

### 7.3 `lint-pr.yml` — Lint PR Title

| Trigger                         | Action                                                       |
|---------------------------------|--------------------------------------------------------------|
| `pull_request_target` (opened/edited/synchronize/reopened) | Validates PR title matches Conventional Commits types using `amannn/action-semantic-pull-request@v6.1.1` |
| Bypass label                    | `ignore-semantic-pull-request`                               |

### 7.4 `close-linear-issues.yml` — Linear Integration

| Trigger        | Action                                                       |
|----------------|--------------------------------------------------------------|
| Push to main   | Scans commits for `Fixes FIN-<digits>` pattern, logs placeholder for Linear API |

---

## 8. Testing

### 8.1 Current Testing Status

| Type                  | Status        | Details                                                       |
|-----------------------|---------------|---------------------------------------------------------------|
| Unit tests            | ❌ None        | No test framework configured; no test files exist             |
| Integration tests     | ❌ None        | No automated GNOME Shell testing                              |
| Type checking         | ✅ `npm run check` | `tsc --noEmit` validates all TypeScript types              |
| Linting               | ✅ `npm run lint`  | ESLint with TypeScript rules                                 |
| Schema validation     | ✅ CI job      | `xmllint` validates XML; `glib-compile-schemas` validates compilation |
| Metadata validation   | ✅ CI job      | Python script validates `metadata.json` structure             |
| Manual testing        | ✅ Documented  | Nested Wayland/Xephyr sessions (see AGENTS.md)                |
| Commit message validation | ✅ CI + Husky | commitlint in pre-commit hook; CI checks last 5 commits     |

### 8.2 Manual Testing Commands

```bash
# Nested Wayland (GNOME 49+)
dbus-run-session gnome-shell --devkit --wayland

# Nested Wayland (GNOME < 49)
SHELL_DEBUG=backtrace-warnings dbus-run-session gnome-shell --nested --wayland

# X11 via Xephyr
Xephyr :1 -screen 1920x1080 &
DISPLAY=:1 dbus-run-session gnome-shell

# View logs
journalctl --user -f | grep "Find My Mouse"

# List enabled extensions
gnome-extensions list
```

### 8.3 Log Level Reference

| Level | Value | Console Prefix     | Usage                               |
|-------|-------|--------------------|--------------------------------------|
| ERROR | 0     | `[ERROR]`          | Critical failures, exceptions        |
| WARN  | 1     | `[WARN]`           | Non-critical issues, fallback events |
| INFO  | 2     | `[INFO]`           | Lifecycle events, activations (default) |
| DEBUG | 3     | `[DEBUG]`          | Coordinates, settings, detailed trace |

---

## 9. Conventional Commits

### 9.1 Commit Format
```
<type>(<scope>): <subject>
```
Allowed types are enforced by both `commitlint.config.cjs` (pre-commit hook) and `lint-pr.yml` (CI):
```
feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
```

### 9.2 Validation Points

| Validation Point           | Tool                         | Trigger              |
|----------------------------|------------------------------|----------------------|
| Pre-commit hook            | `@commitlint/cli` via husky  | `git commit`         |
| PR title (CI)              | `amannn/action-semantic-pull-request` | PR opened/edited |
| Recent commits (CI)        | Custom regex in `test.yml`   | Push/PR              |

### 9.3 Examples
```
feat: add custom ring width option
fix: correct idle timeout reset on multi-monitor
refactor: extract GLSL uniform setting into helper
ci: add schema validation to test workflow
```

---

## 10. Default Values (PowerToys-Matched)

The extension defaults are carefully chosen to match Microsoft PowerToys "Find My Mouse" behavior, with additional GNOME-specific additions.

### 10.1 General

| Setting                    | Key                          | GSettings Type | Default          | PowerToys Match |
|----------------------------|------------------------------|----------------|------------------|-----------------|
| Activation Method          | `activation-method`          | string         | `"shake"`        | ✅ shake        |
| Disable During Game Mode   | `do-not-activate-gamemode`   | boolean        | `true`           | ✅ yes          |
| Show on All Monitors       | `show-on-all-monitors`       | boolean        | `false`          | N/A             |
| Log Level                  | `log-level`                  | int            | `2` (INFO)       | N/A             |

### 10.2 Appearance

| Setting                    | Key                          | GSettings Type | Default          | PowerToys Match |
|----------------------------|------------------------------|----------------|------------------|-----------------|
| Background Color           | `background-color`           | string (hex)   | `#00000080`      | ✅ black 50%    |
| Ring Color                 | `spotlight-color`            | string (hex)   | `#FFFFFF80`      | ✅ white 50%    |
| Spotlight Radius           | `spotlight-radius`           | int            | `100` px         | ✅ 100px        |
| Initial Zoom               | `spotlight-zoom`             | double         | `9.0`            | ✅ 9x           |
| Ring Width                 | `spotlight-ring-width`       | int            | `2` px           | N/A (GNOME-specific) |

### 10.3 Timing

| Setting                    | Key                          | GSettings Type | Default          | PowerToys Match |
|----------------------------|------------------------------|----------------|------------------|-----------------|
| Idle Timeout               | `idle-timeout`               | int            | `1000` ms        | ✅ 1000ms       |
| Animation Duration         | `animation-duration`         | int            | `500` ms         | ✅ 500ms        |

### 10.4 Shake Detection

| Setting                    | Key                          | GSettings Type | Default          | PowerToys Match |
|----------------------------|------------------------------|----------------|------------------|-----------------|
| Shake Interval             | `shake-interval`             | int            | `1000` ms        | ✅ 1000ms       |
| Shake Sensitivity          | `shake-sensitivity`          | int            | `400` %          | ✅ 400%         |

### 10.5 Glass Morphism Effects

| Setting                    | Key                          | GSettings Type | Default          | Notes                    |
|----------------------------|------------------------------|----------------|------------------|--------------------------|
| Enable Glass Morphism      | `enable-glass-morphism`      | boolean        | `false`          | Requires OpenGL ES 3.0  |
| Blur Radius                | `blur-radius`                | double         | `5.0`            | Range 0–50              |
| Glass Opacity              | `glass-opacity`              | int            | `30`              | Range 0–100%            |
| Glow Color                 | `glow-color`                 | string         | `rgba(255,255,255,0.1)` | White at 10% opacity |
| Glass Tint                 | `glass-tint`                 | string (hex)   | `#FFFFFF1A`      | White at 10% opacity    |

### 10.6 Additional Schema Keys

| Key                          | Type      | Default | Description                                     |
|------------------------------|-----------|---------|-------------------------------------------------|
| `excluded-apps`              | string[]  | `[]`    | Placeholder — not fully implemented in logic     |

---

## 11. Critical Gotchas

### 11.1 Build & Schema
- **Always compile schema** after modifying `schemas/*.xml`: `glib-compile-schemas schemas/` or `npm run build:schemas`. The binary `gschemas.compiled` must be present in the distribution ZIP.
- **Always rebuild** after editing `src/*.ts`: The `dist/` directory is gitignored. Run `npm run build` before testing.
- **ZIP validation** in CI checks for exactly: `metadata.json`, `schemas/gschemas.compiled`, `extension.js`, `prefs.js`. Missing any of these will fail the release.

### 11.2 Rendering
- **Cairo context** must be obtained via `area.get_context()` inside the `repaint` signal handler. The context must be manually disposed with `cr.$dispose()`.
- **Use `queue_repaint()`** (not `queue_redraw()`) for `St.DrawingArea` — `queue_redraw()` may not trigger repaint on all GNOME Shell versions.
- **GLSL fallback mechanism**: If `SpotlightGLSLEffect` constructor throws, `SpotlightManager` falls back to Cairo rendering. Always check logs for "Failed to initialize GLSL effect" warnings.
- **Aspect ratio correction** is critical in the GLSL shader: the spotlight must appear circular, not elliptical. The shader scales `coord.y` by `aspectRatio = h / w` and applies the inverse to center.
- **Monitor geometry** must be recalculated when `showOnAllMonitors` changes. The SpotlightManager calculates combined geometry across all monitors.

### 11.3 Wayland & Input
- **Extension runs in Wayland** — modifier key (Ctrl) double-press is unreliable in Wayland. The custom keybinding (`<Super>f` default) is the recommended activation method.
- **No shell restart** for testing — use a nested session via `dbus-run-session gnome-shell --devkit --wayland` (GNOME 49+) or `--nested` (older).
- **PointerWatcher** is imported dynamically (`await import(...)`) in `MouseTracker.setup()` because GNOME Shell < 48 may not expose it as a static resource.

### 11.4 GameMode Integration
- **D-Bus race condition**: GameMode state change handler may fire before managers are initialized. The extension handles this by re-checking GameMode state right after manager creation (see `extension.ts:enable()` line ~143).
- **Retry mechanism**: `GameModeClient.setup()` retries D-Bus proxy creation up to 3 times with exponential backoff (5s, 10s, 20s). If all retries fail, `globalThis.FindMyMouseGameModeAvailable` is set to `false`.
- **`do-not-activate-gamemode`** caching: The `SettingsManager` connects to `changed::do-not-activate-gamemode` in its constructor to keep the cached value in sync.

### 11.5 TypeScript & ES Modules
- **All development is in TypeScript** (`src/*.ts`). Root `.js` files have been removed. Edit `.ts` files only; the `dist/` directory is auto-generated.
- **Import `.js` extensions** in TypeScript even when importing local modules: `import { X } from './utils.js'` — this is required for NodeNext module resolution.
- **GI imports** use the `gi://` prefix with optional version: `gi://Gtk?version=4.0`.
- **Resource imports** use `resource:///org/gnome/shell/...` paths. Custom type declarations are in `gnome-shell-extensions.d.ts`.
- **Ambient types** are imported in `ambient.d.ts` using `@girs/*` packages. These enable type checking for GNOME Shell/GJS APIs.

### 11.6 Preferences UI
- **Gtk.ShortcutLabel** is used for the keyboard shortcut display, but the actual capture is implemented via a custom `Gtk.Dialog` with `Gtk.EventControllerKey` because GNOME Shell's built-in shortcut capture widget has limitations.
- **Modifier-only shortcuts** are prevented: the key controller filters out `MODIFIER_KEYS` (Shift, Ctrl, Alt, Super, Meta, Caps, NumLock) to avoid setting invalid shortcuts.
- **Color format conversion**: `_rgbaToHex()` converts `Gdk.RGBA` to `#AARRGGBB` hex format. `_parseColor()` converts hex back. The alpha channel is critical for the spotlight rendering.
- **Settings binding**: GSettings `bind()` is used for glass morphism settings (`enable-glass-morphism`, `blur-radius`, `glass-opacity`) and most other settings. Glass-opacity stores int percentage (0–100), divided by 100 at runtime for GLSL uniform consumption.

### 11.7 Shake Detection
- **Shake algorithm**: The `detectShake()` method computes `totalDistanceSquared / diagonalSquared > (sensitivity/100)²`. This detects rapid back-and-forth movement rather than straight-line movement.
- **Movement history** is capped at 100 entries and slices old entries based on `shakeInterval`. The cut-off uses `GLib.get_monotonic_time()` in milliseconds.
- **First movement**: `_lastX < 0` initial state means the first movement is always consumed without detection.

### 11.8 Multi-Monitor
- **Monitor index** for refresh-rate detection uses `global.display.get_monitor_index_for_rect()` (GNOME 46+) with a manual geometry-search fallback for older versions.
- **Refresh rate detection** tries three methods: `global.display.get_monitor(index).get_current_mode().refresh_rate`, `global.backend.get_monitor_manager().get_monitors()[i].get_current_mode()`, and `Meta.MonitorManager.get()`. If none succeed, defaults to 60 Hz.

### 11.9 Zoom Animation
- The zoom animation (`spotlight-zoom`) starts large (9× radius) and shrinks to the configured radius. This creates a "spotlight sweeping in" effect. The current implementation does NOT animate smoothly — the zoom only applies on the initial show. The `animation-duration` setting controls fade-out timing, not zoom animation timing. (Noted as a gap vs. PowerToys.)

### 11.10 Debugging
- **Log filtering**: Use `journalctl --user --no-pager | grep "Find My Mouse"` for full log history, or `journalctl --user -f | grep "Find My Mouse"` for live tail.
- **Log level** can be changed at runtime via Preferences → About → Logging → Log Level. Changes take effect immediately without restart.
- **`globalThis.FindMyMouseGameModeAvailable`**: This global flag is set on the `globalThis` object to communicate GameMode availability from the extension process to the preferences UI process.

---

## Appendix A: GSettings Schema Key Map

```
org.gnome.shell.extensions.find-my-mouse
├── activation-method          (s)  → "shake" | "always"
├── shake-interval             (i)  → 100–5000 ms
├── shake-sensitivity          (i)  → 100–10000 %
├── do-not-activate-gamemode   (b)  → true | false
├── background-color           (s)  → "#AARRGGBB" hex
├── spotlight-color            (s)  → "#AARRGGBB" hex
├── spotlight-radius           (i)  → 50–500 px
├── spotlight-zoom             (d)  → 1.0–20.0
├── spotlight-ring-width       (i)  → 0–20 px
├── idle-timeout               (i)  → 100–10000 ms
├── animation-duration         (i)  → 100–5000 ms
├── show-on-all-monitors       (b)  → true | false
├── enable-glass-morphism      (b)  → true | false
├── blur-radius                (d)  → 0.0–50.0
├── glass-opacity              (i)  → 0–100%
├── glow-color                 (s)  → "rgba(r,g,b,a)" or "#AARRGGBB"
├── glass-tint                 (s)  → "#AARRGGBB" hex
├── excluded-apps              (as) → string list (placeholder)
└── log-level                  (i)  → 0 (ERROR) | 1 (WARN) | 2 (INFO) | 3 (DEBUG)
```



---

## Appendix B: Class Hierarchy

```
GObject.Object
  └── Extension             (GNOME Shell base)
       └── FindMyMouseExtension    (extension.ts)

GObject.Object
  └── ExtensionPreferences  (GNOME Shell base)
       └── FindMyMousePreferences  (prefs.ts)

Shell.GLSLEffect
  └── SpotlightGLSLEffect          (spotlightEffect.ts, registered via GObject.registerClass)

Plain classes (no GObject inheritance):
  ├── SettingsManager       (settings.ts)
  ├── SpotlightManager      (spotlight.ts)
  ├── MouseTracker          (mouseTracking.ts)
  ├── KeybindingManager     (keybindings.ts)
  └── GameModeClient        (gamemodeClient.ts)
```

---

## Appendix C: File Size Reference

| File              | Lines | Purpose                                    |
|-------------------|-------|--------------------------------------------|
| `src/prefs.ts`    | 612   | Largest file — the entire preferences UI   |
| `src/extension.ts`| 379   | Core extension lifecycle + coordination    |
| `src/spotlightEffect.ts` | 387 | GLSL shader implementation                |
| `src/spotlight.ts` | 172  | Spotlight rendering manager                |
| `src/settings.ts` | 135   | GSettings wrapper                          |
| `src/gamemodeClient.ts` | 99 | GameMode D-Bus client                     |
| `src/utils.ts`    | 37    | Shared utilities                           |
| `schema XML`      | 115   | GSettings schema definitions               |
| `README.md`       | 288   | User-facing documentation                  |
| **Total**         | **~2460** | Source + config (excluding node_modules/dist) |

---

*End of Repository Atlas — Keep this file updated as the codebase evolves.*
