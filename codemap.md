# Repository Atlas — find-my-mouse-example.com

> **Revision**: 1.3
> **Maintainer**: Hervé Brun
> **License**: GPL-3.0-or-later
> **Updated**: 2026-11-24

---

## 1. Project Responsibility

### 1.1 Mission Statement
**Find My Mouse** is a GNOME Shell extension (GNOME 46–50, Wayland) that replicates the Microsoft PowerToys "Find My Mouse" spotlight feature. Its purpose is to help users who frequently lose their cursor on screen — especially on high-resolution, multi-monitor, or presentation setups — by rendering a customizable circular spotlight that highlights the mouse cursor position.

### 1.2 What This Repository Owns
- **Spotlight Rendering** — Hybrid overlay: four solid `St.Widget` dim actors plus a small pointer-local Cairo `St.DrawingArea` mask for the hole and ring, with zoom animation via `Clutter.Timeline`.
- **Mouse Tracking** — GNOME Shell `PointerWatcher` adapter that owns the authoritative last pointer position and feeds absolute positions and per-sample deltas into a gesture detector.
- **Gesture Detection** — A pure, import-free "wave then stop" state machine with injected monotonic millisecond timestamps.
- **Activation Policy** — Show-only activation from the keyboard shortcut or the gesture; idle timeout and Game Mode suppression live in `ActivationController`.
- **Gesture Feedback** — A small pointer-local progress ring shown only during a gesture attempt, with an optional confirmation sound.
- **Preferences UI** — Adwaita/GTK4 settings dialog with General, Appearance, Timing, Mouse Gesture, and About pages.
- **Game Mode Integration** — D-Bus integration with `com.feralinteractive.GameMode` to suppress spotlight during gaming sessions.
- **Practice Mode** — A shell-side D-Bus service runs the real gesture pipeline in a time-limited session and reports progress/results to the preferences client without showing the real spotlight.
- **GSettings Persistence** — All user preferences are persisted through `org.gnome.shell.extensions.find-my-mouse`.

### 1.3 What This Repository Does NOT Own
- The `PointerWatcher` implementation — consumed from `resource:///org/gnome/shell/ui/pointerWatcher.js`.
- Desktop compositing or window management — the extension injects transparent actors into `Main.uiGroup`.
- The Game Mode D-Bus service (`com.feralinteractive.GameMode`) — an external system daemon.
- The optional `canberra-gtk-play` sound helper — best-effort only; activation works when it is absent.

---

## 2. System Entry Points

### 2.1 Extension Lifecycle Entry
```
src/extension.ts  →  dist/extension.js
```
`FindMyMouseExtension` extends `Extension` from `resource:///org/gnome/shell/extensions/extension.js`.

| Method | Called When | Key Actions |
|---|---|---|
| `enable()` | Extension is activated | Creates `SettingsManager`, `SpotlightManager`, `GestureFeedback`, `ActivationController`, `MouseTracker`, `GameModeClient` and `PracticeService`; registers the `<Super>f` keybinding, settings signals and pointer watch. |
| `disable()` | Extension is deactivated | Removes the keybinding and pointer watch, disconnects signals, destroys controller/feedback/spotlight/settings, disposes the GameMode proxy and ends any practice session. |

### 2.2 Preferences UI Entry
```
src/prefs.ts  →  dist/prefs.js
```
`FindMyMousePreferences` extends `ExtensionPreferences`. `fillPreferencesWindow(window: Adw.PreferencesWindow)` builds the whole dialog, including the Mouse Gesture page with presets, fine-tuning, the live "Try the Gesture" practice session, and About release notes (updated for the 1.0.0 release by the designer lane). User-facing strings are marked with `gettext` (`_()`); translations are initialized automatically from the `gettext-domain` in `metadata.json`. Practice instructions are derived from current GSettings values; the dialog has no auto-close timer and falls back to text-only instructions when the D-Bus service is unavailable.

### 2.3 Spotlight Rendering Entry
```
src/spotlight.ts  →  dist/spotlight.js
```
- `SpotlightManager.show()` creates a clipping group with four dim widgets and a small `St.DrawingArea` mask, and connects `repaint` for Cairo rendering of the hole and ring.
- `Cairo.Operator.CLEAR` punches the transparent hole; `Cairo.Operator.OVER` draws the ring border.
- `Clutter.Timeline` shrinks the spotlight from `spotlight-zoom` to the configured radius with `easeOutQuad`.

### 2.4 Gesture Entry
```
src/mouseTracking.ts + src/gestureDetector.ts → dist/*.js
```
`MouseTracker` receives absolute pointer positions from `pointerWatcher`, converts them to deltas with monotonic timestamps, applies guards, and feeds `GestureDetector`. Detector events are translated into `GestureEventInfo {event, progress, total}` for the extension to drive `GestureFeedback` and, outside practice, `ActivationController`.

### 2.5 Practice Entry
```
src/practiceService.ts + src/practiceClient.ts → dist/*.js
```
`PracticeService` owns the session-bus name `org.gnome.shell.extensions.find_my_mouse.Practice` (object path `/org/gnome/shell/extensions/find_my_mouse/Practice`), handles `Start()`/`Cancel()`, emits `Progress(event: s, progress: i, total: i)` and `Result(success: b, detail: s)`, and runs a 10 s watchdog. `PracticeClient` is the preferences-side `Gio.DBusProxy`; it retries proxy creation, dispatches signals and never crashes if the extension reloads. Both are compiled from `src/` like the other modules.

---

## 3. Architecture Overview

### 3.1 Layered Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    GNOME Shell                            │
│  Main.uiGroup                                             │
│   ├── Group: 4 dim actors + small Cairo mask (spotlight)  │
│   └── St.DrawingArea (~40x40 pointer-local progress ring) │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│             Extension Manager Layer                      │
│  ┌──────────────┐ ┌──────────────────────┐               │
│  │ Settings     │ │ ActivationController │               │
│  │ Manager      │ │ (show-only policy,   │               │
│  └──────────────┘ │  idle timeout)       │               │
│                   └──────────────────────┘               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │ Spotlight    │ │ MouseTracker │ │ GameModeClient   │  │
│  │ Manager      │ │ (adapter)    │ │ (D-Bus proxy)    │  │
│  └──────────────┘ └──────┬───────┘ └──────────────────┘  │
│                         │                                 │
│             ┌───────────▼────────────┐                    │
│             │ GestureDetector (pure) │                    │
│             └────────────────────────┘                    │
│  ┌──────────────────┐ ┌────────────────────────────────┐ │
│  │ GestureFeedback  │ │ PracticeService (D-Bus owner,  │ │
│  │ (progress ring)  │ │ 10 s watchdog; no real show)   │ │
│  └──────────────────┘ └────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              GSettings Schema Layer                      │
│  schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml
│  22 keys: activation, colors, timing, gesture tuning     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              Preferences Process                         │
│  prefs.ts → PracticeClient (Gio.DBusProxy)               │
│  Start/Cancel → PracticeService; Progress/Result → UI    │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Module Relationships

```
extension.ts
  ├── settings.ts             (SettingsManager — GSettings cache)
  ├── activationController.ts (ActivationController — activation policy + idle timeout)
  ├── spotlight.ts            (SpotlightManager — hybrid spotlight + zoom animation)
  │     └── spotlightLayout.ts (pure mask/dim rectangle layout, no imports)
  ├── mouseTracking.ts        (MouseTracker — pointerWatcher adapter; GestureEventInfo)
  │     └── gestureDetector.ts (GestureDetector — pure state machine, no imports)
  ├── gestureFeedback.ts      (GestureFeedback — progress ring + optional sound)
  ├── gamemodeClient.ts       (GameModeClient — D-Bus GameMode)
  ├── practiceService.ts      (PracticeService — D-Bus session owner + watchdog)
  └── utils.ts                (debugLog, parseColor, LogLevel)
prefs.ts
  ├── practiceClient.ts       (PracticeClient — D-Bus proxy + signal dispatch)
  └── utils.ts
settings.ts, spotlight.ts, mouseTracking.ts, gamemodeClient.ts, gestureFeedback.ts,
practiceService.ts
  └── utils.ts (via settings.ts where applicable)
```
`gestureDetector.ts` and `spotlightLayout.ts` have no imports at all: both are testable with `node:test` without GNOME Shell or GJS. `practiceClient.ts` and `practiceService.ts` communicate only over the session bus; neither imports the other.

### 3.3 Design Patterns

| Pattern | Implementation |
|---|---|
| **Singleton Manager** | Each manager is instantiated once in `extension.ts`'s `enable()`. |
| **Event-Driven** | GSettings `changed::` signals, `pointerWatcher` callbacks, gesture events, GameMode state changes. |
| **State Machine** | `GestureDetector` moves through `idle → tracking → ready → cooldown` and emits `none`/`armed`/`progress`/`ready`/`activated`/`aborted`. |
| **Adapter** | `MouseTracker` adapts GNOME's absolute, irregular pointer samples to `GestureSample {dx, dy, tMs}`. |
| **Policy/rendering split** | `ActivationController` owns activation and idle timing; `SpotlightManager` only renders and animates. |
| **Observer** | `GameModeClient` emits state changes; the extension suppresses or restores the spotlight. |
| **Session over D-Bus** | `PracticeService` owns a session-bus name and emits `Progress`/`Result`; `PracticeClient` proxies it from prefs and survives extension reloads. |
| **Caching** | `SettingsManager.cacheSettings()` normalizes and caches GSettings values to avoid repeated GI calls. |

### 3.4 Data Flow: Pointer → Gesture → Activation → Rendering

```
pointerWatcher (16 ms requested, callbacks on change)
        │
        ▼
MouseTracker._handleSample(x, y)
        │
        ├── authoritative last position (null sentinel until first sample)
        ├── guards: buttons, Ctrl/Alt, fullscreen, GameMode, visible spotlight
        ├── feed GestureDetector.feed({dx, dy, tMs}) using monotonic ms
        │     └── idle → tracking → ready → cooldown
        │           emits armed/progress/ready/activated/aborted
        │     └── while tracking/ready: 16 ms clock feeds zero-delta ticks
        │           so a stationary pointer can settle and activate
        ▼
extension._handleGestureEvent(info)
        ├── armed/progress/ready → GestureFeedback (show, arcs, bright stop state)
        ├── activated → feedback.hide()
        │              ├── practice active? PracticeService.reportEvent(info) → Result(true, …)
        │              └── else ActivationController.activate('gesture')
        └── aborted → feedback.hide()
                      └── practice active? PracticeService.reportEvent(info) → Result(false, …)
    Practice mode never calls ActivationController.activate('gesture'); the real
    progress ring stays visible until the session ends.

shortcut (<Super>f) ────────────────► ActivationController.activate('shortcut')
        │
        ▼
ActivationController.activate()
        ├── 'always': show once if not visible; no idle timeout
        ├── GameMode suppression check (cachedDoNotActivateInGameMode)
        ├── if visible: queueRepaint() + reset idle timeout (never toggle off)
        └── SpotlightManager.show(showOnAllMonitors)
                  ├── St.DrawingArea geometry (monitor or all)
                  ├── small Cairo mask + 4 dim actors (clear hole + ring)
                  └── Clutter.Timeline zoom (easeOutQuad)
idle timeout (idle-timeout ms) ─────► ActivationController.hide()
```

### 3.5 Data Flow: Practice Session (D-Bus)

```
prefs.ts "Try the Gesture"
        │  (instructions derived from current GSettings; no auto-close timer)
        ▼
PracticeClient (Gio.DBusProxy, retry on failure)
        │  Start() / Cancel()                    session bus
        ▼
PracticeService (shell side)
        ├── on Start: hide any visible spotlight, reset MouseTracker, arm 10 s watchdog
        ├── reportEvent(info) for every gesture event
        │     ├── Progress(event, progress, total) → PracticeClient → live status UI
        │     ├── activated → Result(true, 'gesture-completed') → session ends
        │     └── aborted   → Result(false, 'gesture-aborted')  → session ends
        └── on Result / Cancel / dialog destroy / prefs close / extension disable /
            bus-name loss / watchdog → _finish(): clear watchdog, notify extension
```

A practice run uses the real detector, `MouseTracker` guards and `GestureFeedback`
ring, but never `ActivationController.activate('gesture')` and never shows the real
spotlight. A second prefs window or an extension reload cannot keep a stale session
alive: the service owns the bus name and each terminal path ends the session. The
prefs client degrades to a text-only fallback if the proxy cannot be created.

---

## 4. Build & Development

### 4.1 Prerequisites

| Requirement | Minimum | Notes |
|---|---|---|
| GNOME Shell | 46 | Tested up to 50 |
| Node.js | 22 | TypeScript tooling and `node:test` |
| npm | 10+ | Bundled with Node.js |
| glib-compile-schemas | System | From `libglib2.0-bin` (Ubuntu) |
| mutter-devkit | GNOME 49+ | Needed by `gnome-shell --devkit` to draw the host window; Ubuntu: `sudo apt install mutter-dev-bin`. Without it, the nested shell runs headless. |

### 4.2 NPM Scripts Reference

| Script | Command | Description |
|---|---|---|
| `npm run check` | `tsc --noEmit` | Type-check without emitting output |
| `npm run lint` | `eslint src/` | Lint TypeScript sources |
| `npm test` | `npm run build && node --test test/*.test.mjs` | Build, then run unit tests with `node:test` |
| `npm run build` | `clean && tsc -p tsconfig.prod.json` | Clean `dist/` and compile TypeScript |
| `npm run build:schemas` | `glib-compile-schemas schemas/` | Compile GSettings XML |
| `npm run i18n:pot` | `xgettext` on `dist/*.js` | Regenerate the gettext POT from compiled sources |
| `npm run i18n:update` | `i18n:pot` + `msgmerge` | Refresh template and merge into `en`/`fr`/`es` PO files |
| `npm run i18n:build` | `msgfmt --check` | Validate PO files and compile `.mo` files into `dist/locale/` |
| `postbuild` | `build:schemas && i18n:build && cp metadata.json && cp schemas` | Auto-runs after build |
| `npm run build:dist` | `build && cd dist && zip -qr ../find-my-mouse@herve-brun.github.io.zip .` | Distribution ZIP for EGO |

### 4.3 TypeScript Configurations

| File | Purpose | Key Options |
|---|---|---|
| `tsconfig.json` | Development | `target: ES2023`, `module: NodeNext`, `sourceMap: true` |
| `tsconfig.prod.json` | Production build | Extends dev, `rootDir: ./src`, `outDir: ./dist`, `sourceMap: false` |

### 4.4 Development Workflow

```bash
npm install
glib-compile-schemas schemas/
ln -s $(pwd) ~/.local/share/gnome-shell/extensions/find-my-mouse@herve-brun.github.io

# edit src/*.ts, then:
npm test          # build + unit tests
npm run lint

# nested session (GNOME 49+ needs mutter-devkit)
dbus-run-session gnome-shell --devkit --wayland
# GNOME < 49:
SHELL_DEBUG=backtrace-warnings dbus-run-session gnome-shell --nested --wayland

journalctl --user -f | grep "Find My Mouse"
```

---

## 5. Directory Map

```
find-my-mouse-example.com/
│
├── src/                              # TypeScript source (edit here!)
│   ├── extension.ts                  # Lifecycle, wiring, pointer/gesture handlers
│   ├── prefs.ts                      # Adwaita/GTK4 preferences UI
│   ├── settings.ts                   # GSettings wrapper + cached values
│   ├── activationController.ts       # Activation policy + idle timeout
│   ├── gestureDetector.ts            # Pure "wave then stop" state machine
│   ├── gestureFeedback.ts            # Pointer-local progress ring + optional sound
│   ├── spotlight.ts                  # Hybrid spotlight rendering + zoom animation
│   ├── spotlightLayout.ts            # Pure mask/dim rectangle layout math
│   ├── mouseTracking.ts              # pointerWatcher → GestureSample adapter
│   ├── gamemodeClient.ts             # GameMode D-Bus client
│   ├── practiceService.ts            # Shell-side practice D-Bus service + watchdog
│   ├── practiceClient.ts             # Preferences-side practice D-Bus proxy
│   ├── utils.ts                      # debugLog, parseColor, LogLevel
│   └── codemap.md                    # Source directory atlas
│
├── schemas/                          # GSettings schema
│   ├── org.gnome.shell.extensions.find-my-mouse.gschema.xml  # 22 keys
│   ├── gschemas.compiled            # Binary compiled schema (gitignored)
│   └── codemap.md                    # Schema directory atlas
│
├── test/                             # node:test unit tests (pure modules)
│   ├── gestureDetector.test.mjs
│   └── spotlightLayout.test.mjs
│
├── po/                               # gettext catalogs
│   ├── find-my-mouse@herve-brun.github.io.pot  # Translation template
│   ├── en.po, fr.po, es.po            # English (source), French, Spanish
│   └── (compiled .mo files live under dist/locale/)
│
├── dist/                             # Compiled JS output (gitignored, auto-generated)
│   ├── extension.js, prefs.js, settings.js, spotlight.js
│   ├── activationController.js, gestureDetector.js, gestureFeedback.js
│   ├── mouseTracking.js, gamemodeClient.js, practiceService.js,
│   │   practiceClient.js, utils.js
│   ├── schemas/                      # gschemas.compiled + XML
│   └── locale/<lang>/LC_MESSAGES/    # Compiled gettext catalogs
│
├── .github/                          # CI/CD
│   ├── workflows/
│   │   ├── test.yml                  # Push/PR: lint, typecheck, schema validate, commit check
│   │   ├── release.yml               # Tag v*: build ZIP, validate contents, create release
│   │   ├── lint-pr.yml               # PR title: conventional commits validation
│   │   └── close-linear-issues.yml   # Push: parse "Fixes FIN-xxx" → Linear API (placeholder)
│   └── scripts/validate_metadata.py  # CI helper: validate metadata.json
│
├── docs/codebase/                    # Codebase analysis docs
│   ├── ARCHITECTURE.md, CONCERNS.md, CONVENTIONS.md
│   ├── INTEGRATIONS.md, STACK.md, STRUCTURE.md, TESTING.md
│   └── .codebase-scan.txt
│
├── screenshots/                      # README screenshots
├── node_modules/                     # Dependencies (gitignored)
│
├── metadata.json                     # version-name 1.0.0; shell 46–50
├── ambient.d.ts
├── gnome-shell-extensions.d.ts
├── tsconfig.json
├── tsconfig.prod.json
├── eslint.config.js
├── commitlint.config.cjs
├── package.json                      # Scripts incl. `test`: build + node:test
├── AGENTS.md
├── README.md
├── LICENSE.md
└── codemap.md                        # THIS FILE
```

---

## 6. Key Dependencies

### 6.1 Runtime Dependencies (GNOME Shell / GJS)

| Module | Import Path | Used In | Purpose |
|---|---|---|---|
| `Extension` | `resource:///org/gnome/shell/extensions/extension.js` | extension.ts | Extension lifecycle |
| `ExtensionPreferences` | `resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js` | prefs.ts | Preferences base class |
| `Main` | `resource:///org/gnome/shell/ui/main.js` | extension.ts, gestureFeedback.ts, spotlight.ts | `uiGroup`, keybindings |
| `getPointerWatcher` | `resource:///org/gnome/shell/ui/pointerWatcher.js` | mouseTracking.ts | Absolute pointer samples |
| `St.DrawingArea` | `gi://St` | spotlight.ts, gestureFeedback.ts | Cairo-rendered actors |
| `Shell.ActionMode`, `Meta.KeyBindingFlags` | `gi://Shell`, `gi://Meta` | extension.ts | Keybinding registration |
| `Clutter` / `Clutter.Timeline` | `gi://Clutter` | spotlight.ts, gestureFeedback.ts | Zoom animation, transition cleanup |
| `Cairo` | `gi://cairo` | spotlight.ts, gestureFeedback.ts | Hole/ring and progress arcs |
| `Gio.Settings` | `gi://Gio` | settings.ts, gamemodeClient.ts, prefs.ts | Settings + D-Bus proxy |
| `GLib` | `gi://GLib` | activationController.ts, mouseTracking.ts, gestureFeedback.ts, spotlight.ts | Timers, monotonic time, optional sound spawn |
| `Gtk` / `Adw` / `Gdk` | `gi://Gtk?version=4.0`, `gi://Adw`, `gi://Gdk?version=4.0` | prefs.ts | Preferences UI |

### 6.2 NPM Dependencies and Built-ins

| Package | Type | Purpose |
|---|---|---|
| `@girs/gjs`, `@girs/gnome-shell`, `@girs/cairo-1.0` | runtime | GJS/GNOME/Cairo type definitions |
| `typescript` | dev | Compiler (≥5.7) |
| `eslint`, `@eslint/js`, `typescript-eslint` | dev | Linting |
| `@commitlint/cli`, `@commitlint/config-conventional`, `husky` | dev | Commit message enforcement |
| `node:test` | Node.js built-in | Unit test runner used by `npm test` (no package dependency) |

---

## 7. CI/CD

| Workflow | Trigger | Jobs |
|---|---|---|
| `test.yml` | Every push + PR | Validate metadata/schema; lint + `tsc --noEmit`; `xmllint` schema validation; `npm test` (build + `node:test`); commit message check. |
| `release.yml` | Tag `v*` | Type check, build ZIP, validate ZIP contents, create GitHub Release |
| `lint-pr.yml` | PR events | PR title must follow Conventional Commits; bypass label `ignore-semantic-pull-request` |
| `close-linear-issues.yml` | Push to main | Placeholder for `Fixes FIN-xxx` parsing |

---

## 8. Testing

| Type | Status | Details |
|---|---|---|
| Unit tests | ✅ `npm test` | `npm run build && node --test test/*.test.mjs`; synthesized pointer streams cover deliberate wave, jitter, circles, drags, warps, cooldown, pause/gap behavior, the retired 1500 ms/30 px tutorial cadence (no activation) and a normal 900 ms/180 ms gesture (activation); layout tests cover mask/dim tiling, negative monitor origins, edge clipping and zoom larger than the monitor |
| Type checking | ✅ `npm run check` | `tsc --noEmit` |
| Linting | ✅ `npm run lint` | ESLint with TypeScript rules |
| Schema validation | ✅ CI job | `xmllint` + `glib-compile-schemas` |
| Translation validation | ✅ `npm test` | `msgfmt --check --check-format` compiles `en`/`fr`/`es` catalogs during `postbuild` |
| Metadata validation | ✅ CI job | Python script |
| Manual testing | ✅ Documented | Nested Wayland/Xephyr; concrete gesture scenarios in `docs/codebase/TESTING.md` |

```bash
npm test                                     # unit tests
dbus-run-session gnome-shell --devkit --wayland  # GNOME 49+
SHELL_DEBUG=backtrace-warnings dbus-run-session gnome-shell --nested --wayland  # older
journalctl --user -f | grep "Find My Mouse"
```

Log levels: ERROR (0), WARN (1), INFO (2, default), DEBUG (3).

---

## 9. Conventional Commits

Format: `<type>(<scope>): <subject>`. Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Enforced by `commitlint.config.cjs` (husky hook) and validated for PR titles / recent commits in CI.

---

## 10. Default Values

The PowerToys-matched settings are the spotlight colors, radius, zoom, idle timeout and animation duration. GNOME-specific additions include the keyboard shortcut and the gesture tuning keys below.

### 10.1 General

| Setting | Key | Type | Default |
|---|---|---|---|
| Activation Method | `activation-method` | string | `"shake"` (Shortcut + Mouse Gesture) |
| Activation Shortcut | `find-my-mouse-activation` | string[] | `['<Super>f']` (always active in gesture mode) |
| Disable During Game Mode | `do-not-activate-gamemode` | boolean | `true` |
| Show on All Monitors | `show-on-all-monitors` | boolean | `false` |
| Log Level | `log-level` | int | `2` (INFO) |

### 10.2 Appearance

| Setting | Key | Type | Default |
|---|---|---|---|
| Background Color | `background-color` | string (hex) | `#00000080` (black 50%) |
| Ring Color | `spotlight-color` | string (hex) | `#FFFFFFCC` (white 80%, 3:1 contrast) |
| Spotlight Radius | `spotlight-radius` | int | `100` px |
| Initial Zoom | `spotlight-zoom` | double | `9.0` |
| Ring Width | `spotlight-ring-width` | int | `2` px |

### 10.3 Timing

| Setting | Key | Type | Default |
|---|---|---|---|
| Idle Timeout | `idle-timeout` | int | `1000` ms |
| Animation Duration | `animation-duration` | int | `500` ms |

### 10.4 Mouse Gesture

| Setting | Key | Type | Default | Range |
|---|---|---|---|---|
| Reversals | `gesture-reversals` | int | `3` | 2–6 |
| Sweep length | `gesture-sweep` | int | `90` px | 40–300 |
| Attempt window | `gesture-window` | int | `900` ms | 400–1500 |
| Settle window | `gesture-settle` | int | `180` ms | 80–400 |
| Cooldown | `gesture-cooldown` | int | `1500` ms | 500–4000 |
| Ignore buttons | `gesture-ignore-buttons` | boolean | `true` | — |
| Ignore fullscreen | `gesture-ignore-fullscreen` | boolean | `true` | — |
| Confirmation sound | `gesture-sound` | boolean | `false` | — |

Fixed detector thresholds: arm speed ≥400 px/s, horizontal dominance ≥2:1, reversal hysteresis <20% of sweep peak speed, settle speed <150 px/s, jump guard >250 px/sample, pause guard >400 ms. The amplitude floor is `max(120 px, sweep × reversals)`, so tiny jitter cannot qualify. There is no "minimum distance" setting.

### 10.5 Deprecated Keys

`shake-interval` (1000 ms) and `shake-sensitivity` (400 %) remain in the schema with their original defaults so existing user settings stay valid. They are hidden in Preferences and no longer read by the detector.

---

## 11. Critical Gotchas

### 11.1 Build & Schema
- Compile the schema after any `schemas/*.xml` edit: `glib-compile-schemas schemas/` or `npm run build:schemas`. ZIP validation expects `schemas/gschemas.compiled`.
- After adding or changing `_()` strings in `src/prefs.ts`, run `npm run i18n:update`, translate the changed PO entries, and commit the POT/PO files. `gettext` (`msgfmt`) is now a build prerequisite.
- The `dist/` directory is gitignored; run `npm run build` (or `npm test`, which builds first) before testing.
- `npm test` builds and runs `node --test test/*.test.mjs`; keep `gestureDetector.ts` import-free so it remains unit-testable without GNOME Shell.

### 11.2 Rendering
- Get the Cairo context inside the `repaint` handler with `area.get_context()` and dispose it with `cr.$dispose()`.
- Use `queue_repaint()` (not `queue_redraw()`) for `St.DrawingArea`.
- Recalculate monitor geometry when `show-on-all-monitors` changes.
- Only the pointer-local mask is Cairo-rasterised; the four dim actors are `St.Widget` with inline CSS colour (no `Clutter.Color`, which changed across GNOME versions).
- `Clutter.Timeline` zoom uses manual `easeOutQuad`; cancel in-progress timelines before showing again.
- Tear down actors immediately on `disable()` to avoid stale animation callbacks.

### 11.3 Wayland & Input
- Ctrl double-press is unreliable in Wayland. The `<Super>f` shortcut and the mouse gesture are the supported activation paths; the shortcut is active in the default gesture mode.
- `pointerWatcher` provides absolute positions at irregular intervals; `MouseTracker` owns the single authoritative last position (starting at `null`, so negative monitor X works), computes deltas, and runs a 16 ms clock only while a gesture is in progress so a stationary pointer can settle.
- Gesture detection is disabled while the spotlight is visible, while a mouse button or Ctrl/Alt is held, in fullscreen apps (configurable), on jumps >250 px per sample, on monitor/focus changes, and during Game Mode suppression.
- No shell restart is needed for nested testing. GNOME 49+ `--devkit` requires `mutter-devkit` (`mutter-dev-bin` on Ubuntu); without it the shell starts headless.

### 11.4 GameMode Integration
- GameMode state can change before managers are initialized; the extension re-checks state at the end of `enable()`.
- `GameModeClient.setup()` retries the D-Bus proxy up to three times with exponential backoff (5s/10s/20s).
- `SettingsManager` keeps `do-not-activate-gamemode` in sync via `changed::do-not-activate-gamemode`; suppression is enforced in `ActivationController.activate()`.

### 11.5 TypeScript & ES Modules
- Edit `src/*.ts` only; root `.js` files have been removed.
- Use `.js` extensions in TypeScript imports for NodeNext resolution.
- GI imports use `gi://…`; GNOME Shell resource imports use `resource:///org/gnome/shell/...`; custom declarations live in `gnome-shell-extensions.d.ts` and `ambient.d.ts`.

### 11.6 Preferences UI
- The page named **Mouse Gesture** provides Light/Standard/Firm presets, a "Fine-tune gesture" expander, a live "Try the Gesture" practice session, and the `gesture-sound` toggle. Instructions come from current GSettings values, and there is no auto-close timer.
- The shortcut row is no longer disabled in gesture mode; GTK4 has no public shortcut entry, so Preferences captures accelerators with a modal dialog and live `Gtk.ShortcutLabel`.
- Legacy `shake-interval` and `shake-sensitivity` rows are hidden; the keys stay in the schema for compatibility.
- Accessible labels are set explicitly on suffix buttons; color conversion uses `#AARRGGBB` hex.

### 11.7 Gesture Algorithm
- The old squared-ratio shake metric (`Σ(dx²+dy²)/diagonal² > (sensitivity/100)²`) is gone. It rewarded one-pixel jitter and was not reliably triggerable by a deliberate shake.
- Current algorithm: arm on ≥400 px/s with ≥2:1 horizontal dominance; count direction reversals with speed-dip hysteresis (<20% of peak) and ≥90 px per sweep; require 3 reversals within 900 ms; then require speed <150 px/s within 180 ms; cooldown 1500 ms.
- This logic is isolated in `gestureDetector.ts` with injected timestamps and unit tests; `MouseTracker` supplies the ticks needed for a stationary pointer to commit.

### 11.8 Multi-Monitor
- Multi-monitor geometry is the bounding box of all monitors via `global.display.get_n_monitors()` / `get_monitor_geometry()`; otherwise the current monitor is used. Absolute pointer coordinates (including negative X) are preserved.

### 11.9 Debugging
- `journalctl --user --no-pager | grep "Find My Mouse"` for full history; add `-f` to tail.
- Change log level at runtime in Preferences → About → Logging → Log Level.

### 11.10 Practice Mode
- Practice is live: it reuses `MouseTracker`, `GestureDetector` and `GestureFeedback`, but an `activated` event is reported through `PracticeService.Result(success=true, …)` and must never call `ActivationController.activate('gesture')`; no real spotlight is shown and the progress ring stays visible.
- `Start()` hides any visible spotlight and resets `MouseTracker`; the service owns the bus name, so extension disable or a bus-name loss must end the session.
- Every terminal path — Result, Cancel, dialog destroy, prefs close, extension disable, bus-name loss and the 10 s watchdog — must call `_finish()` exactly once to clear the watchdog and notify the extension.
- The prefs client retries proxy creation, tolerates an extension reload, and never crashes; if D-Bus is unavailable it shows text-only instructions derived from GSettings. The dialog has no auto-close timer, its accessible name matches the visible `Practice` label, and status changes are live announcements.
- Two prefs windows must not leave a stale session: the service is the single owner of the session state.

---

## Appendix A: GSettings Schema Key Map

```
org.gnome.shell.extensions.find-my-mouse  (22 keys)
├── activation-method          (s)  → "shake" | "always"
├── find-my-mouse-activation   (as) → ['<Super>f']
├── shake-interval             (i)  → deprecated/legacy, default 1000
├── shake-sensitivity          (i)  → deprecated/legacy, default 400
├── gesture-reversals          (i)  → 2–6 (default 3)
├── gesture-sweep              (i)  → 40–300 px (default 90)
├── gesture-window             (i)  → 400–1500 ms (default 900)
├── gesture-settle             (i)  → 80–400 ms (default 180)
├── gesture-cooldown           (i)  → 500–4000 ms (default 1500)
├── gesture-ignore-buttons     (b)  → true | false (default true)
├── gesture-ignore-fullscreen  (b)  → true | false (default true)
├── gesture-sound              (b)  → true | false (default false)
├── do-not-activate-gamemode   (b)  → true | false (default true)
├── background-color           (s)  → "#AARRGGBB" hex
├── spotlight-color            (s)  → "#AARRGGBB" hex
├── spotlight-radius           (i)  → px (default 100)
├── spotlight-zoom             (d)  → default 9.0
├── idle-timeout               (i)  → ms (default 1000)
├── animation-duration         (i)  → ms (default 500)
├── log-level                  (i)  → 0 ERROR | 1 WARN | 2 INFO | 3 DEBUG
├── show-on-all-monitors       (b)  → true | false (default false)
└── spotlight-ring-width       (i)  → 0–20 px (default 2)
```

## Appendix B: Class Hierarchy

```
GObject.Object
  └── Extension → FindMyMouseExtension            (extension.ts)
  └── ExtensionPreferences → FindMyMousePreferences (prefs.ts)

Plain classes (no GObject inheritance):
  ├── SettingsManager        (settings.ts)
  ├── SpotlightManager       (spotlight.ts)
  ├── MouseTracker           (mouseTracking.ts)
  ├── GestureDetector        (gestureDetector.ts — imports nothing)
  ├── GestureFeedback        (gestureFeedback.ts)
  ├── ActivationController   (activationController.ts)
  ├── GameModeClient         (gamemodeClient.ts)
  ├── PracticeService        (practiceService.ts — session-bus owner, watchdog)
  └── PracticeClient         (practiceClient.ts — prefs-side D-Bus proxy)
```

## Appendix C: Module Responsibility Reference

| Module | Responsibility |
|---|---|
| `extension.ts` | Lifecycle, keybinding, wiring of pointer/gesture/settings/GameMode signals |
| `prefs.ts` | Adwaita/GTK4 pages including Mouse Gesture and About |
| `settings.ts` | GSettings read/cache/normalize; includes deprecated legacy getters |
| `activationController.ts` | Show-only activation and idle timeout |
| `gestureDetector.ts` | Pure "wave then stop" state machine |
| `gestureFeedback.ts` | Pointer-local progress ring; best-effort sound via `canberra-gtk-play` |
| `spotlight.ts` | Hybrid spotlight rendering (4 dim actors + small Cairo mask) and Clutter zoom animation only |
| `spotlightLayout.ts` | Pure mask/dim rectangle layout math; no GNOME imports |
| `mouseTracking.ts` | pointerWatcher adapter, guards, 16 ms settle clock |
| `gamemodeClient.ts` | GameMode D-Bus proxy with retry |
| `practiceService.ts` | Practice session owner: D-Bus methods/signals, 10 s watchdog, gesture-event routing without real activation |
| `practiceClient.ts` | Preferences-side D-Bus proxy: retry, signal dispatch, text-only fallback, no crash on extension reload |
| `utils.ts` | Logging and color parsing |

---

*End of Repository Atlas — keep this file updated as the codebase evolves.*
