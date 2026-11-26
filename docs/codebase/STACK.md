# Find My Mouse — Stack and Documentation Index

## Project Intent

The Find My Mouse GNOME Shell extension (GNOME 46–50, Wayland) highlights the pointer with a circular spotlight, modelled on PowerToys Find My Mouse. Activation is show-only from the `<Super>f` shortcut or a deliberate horizontal wave followed by stopping; "Always visible" is opt-in. The extension supports multi-monitor setups, GameMode suppression, live gesture practice over D-Bus, and runtime log level changes. Version: 1.0.0.

### Key Features
- Spotlight with configurable radius, colors, ring width, zoom and animation duration: four dim actors plus a small pointer-local Cairo mask.
- Pure "wave then stop" gesture detector with a pointer-local progress ring and optional confirmation sound.
- Keyboard shortcut active in the default gesture mode; repeat activation refreshes the spotlight instead of hiding it.
- Live "Try the Gesture" practice: shell-side D-Bus service and prefs client, progress feedback, retry/cancel, text-only fallback; no real spotlight during practice.
- GameMode suppression and multi-monitor bounding-box geometry.
- Unit tests for the detector and spotlight layout via `node:test`.

### Evidence
- `README.md`, `metadata.json`, `package.json`

---

## STACK.md

### Core Stack
- **Source language**: TypeScript (`src/*.ts`), compiled with `tsc` to JavaScript in `dist/` (gitignored).
- **Runtime**: GNOME Shell / GJS, using `resource://` extension APIs and `gi://` introspection.
- **Libraries/APIs**: Gtk 4, Adw, Gdk, Clutter, St, Cairo, GLib, Gio, Meta, Shell, GSettings.
- **Test runner**: `node:test` (Node.js built-in), invoked by `npm test` after `npm run build`. No external test framework.
- **Tooling**: TypeScript 5.7+, ESLint + typescript-eslint, commitlint + husky, `glib-compile-schemas`.

### Dependencies
- Runtime type definitions: `@girs/gjs`, `@girs/gnome-shell`, `@girs/cairo-1.0`.
- Development: `typescript`, `eslint`, `@eslint/js`, `typescript-eslint`, `@commitlint/cli`, `@commitlint/config-conventional`, `husky`.
- System/optional: `glib-compile-schemas`; `mutter-devkit` for visible nested Wayland on GNOME 49+; `canberra-gtk-play` for the optional gesture sound (no-op if absent).

### Evidence
- `package.json` (scripts and dependencies)
- `src/prefs.ts` (Gtk/Adw/Gdk imports)
- `src/spotlight.ts`, `src/gestureFeedback.ts` (Clutter/St/Cairo)
- `src/mouseTracking.ts` (GLib timers, pointerWatcher)

---

## STRUCTURE.md

### Directory Layout
```
src/
  extension.ts, prefs.ts, settings.ts, activationController.ts,
  gestureDetector.ts, gestureFeedback.ts, spotlight.ts, spotlightLayout.ts,
  mouseTracking.ts, gamemodeClient.ts, practiceService.ts,
  practiceClient.ts, utils.ts
schemas/            GSettings XML (20 keys) + compiled schema
test/               gestureDetector.test.mjs, spotlightLayout.test.mjs (node:test)
dist/               generated JavaScript (gitignored)
docs/codebase/      these documents
```

### Entry Points
- Extension: `src/extension.ts`
- Preferences: `src/prefs.ts`
- Unit tests: `test/*.test.mjs`

### Evidence
- `codemap.md`, `src/codemap.md`, `schemas/codemap.md`

---

## ARCHITECTURE.md

### Layers
1. `extension.ts`: lifecycle, wiring, pointer/gesture handlers, keybinding.
2. Logic: `MouseTracker` (pointer adapter), `GestureDetector` (pure state machine), `ActivationController` (show-only activation + idle timer), `SpotlightManager` (rendering/animation), `GestureFeedback` (progress ring), `GameModeClient` (D-Bus), `PracticeService` (practice session over D-Bus).
3. `prefs.ts`: GTK4/Adwaita UI with General, Appearance, Timing, Mouse Gesture and About pages; `PracticeClient` proxies practice over the session bus.

### Data Flow
Pointer samples → adapter/guards → detector events → feedback + `activate()` → spotlight rendering → idle timeout hides the spotlight.
During practice, detector events → `PracticeService` → `Progress`/`Result` → `PracticeClient` → dialog; `activate()` is bypassed and no spotlight is shown.

### Evidence
- `src/extension.ts`, `src/gestureDetector.ts`, `src/activationController.ts`

---

## CONVENTIONS.md

- PascalCase classes, camelCase methods, `_camelCase` private fields, UPPER_SNAKE_CASE constants.
- TypeScript local imports use `.js` extensions; `gestureDetector.ts` and `spotlightLayout.ts` are import-free so `node:test` can exercise them directly.
- 4-space indentation, semicolons, guard clauses, explicit signal/actor cleanup.
- Conventional Commits enforced by commitlint and CI.

### Evidence
- `src/utils.ts`, `src/extension.ts`, `commitlint.config.cjs`

---

## INTEGRATIONS.md

- GNOME Shell APIs: extension/prefs base classes, `Main.uiGroup`, keybindings, pointerWatcher.
- GJS: St, Cairo, Clutter, GLib, Gio, Gtk/Adw/Gdk, Meta/Shell.
- GSettings schema `org.gnome.shell.extensions.find-my-mouse` (20 keys); the `gesture-*` keys drive the detector.
- GameMode D-Bus service; practice D-Bus service `org.gnome.shell.extensions.find_my_mouse.Practice` (`Start`/`Cancel`, `Progress`/`Result`, 10 s watchdog) implemented by `practiceService.ts`/`practiceClient.ts` on the session bus; `canberra-gtk-play` is an optional best-effort sound helper (no-op if absent).
- `node:test` for unit tests.

### Evidence
- `schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml`, `src/gestureFeedback.ts`, `package.json`

---

## TESTING.md

- Unit tests: `npm test` → `npm run build && node --test test/*.test.mjs` (detector and spotlight layout suites).
- Manual: nested Wayland session (`--devkit` on GNOME 49+, `--nested` on earlier supported versions) or Xephyr for X11.
- Scenarios include deliberate wave, jitter, circular motion, button drag, fullscreen/GameMode, multi-monitor with negative X, settings extremes, cooldown re-trigger, practice success/failure/retry/cancel, extension reload during practice, two prefs windows and the watchdog. Run them from a nested session as described in `TESTING.md`; GNOME 49+ `--devkit` needs `mutter-devkit` for a visible host window.

### Evidence
- `package.json`, `test/gestureDetector.test.mjs`, `test/spotlightLayout.test.mjs`, `AGENTS.md`

---

## CONCERNS.md

- Wayland pointerWatcher sampling is absolute and irregular; the isolated, unit-tested detector consumes injected deltas and monotonic millisecond timestamps, with speed, reversal hysteresis and an amplitude floor.
- Practice lifecycle: every terminal path (Result, Cancel, dialog destroy, prefs close, extension disable, bus-name loss, watchdog) must end the session; practice must never call the real activation path.
- CI runs lint, type-check, schema/metadata validation and `npm test` (build + `node:test`).

### Evidence
- `src/gestureDetector.ts`, `src/settings.ts`, `.github/workflows/test.yml`

---

## Intent vs. Reality

- PowerToys parity covers the spotlight presentation. This extension uses show-only activation and a configurable wave-then-stop state machine (reversals, sweep, window, settle).
- The schema has no `excluded-apps` key and no user-facing minimum-distance key; per-app exclusions are not implemented. The detector applies a fixed amplitude floor of `max(120 px, gesture-sweep × gesture-reversals)`.
- GameMode detection is implemented through D-Bus and can suppress activation when configured.

### Evidence
- `schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml` (20 keys)
- `src/activationController.ts`, `src/gamemodeClient.ts`, `src/gestureDetector.ts`
