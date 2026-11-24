# src/ — Find My Mouse Extension Source

> **Module count**: 12 TypeScript modules → compiled to `dist/*.js`
> **Runtime**: GNOME Shell 46–50 (Wayland)
> **Language**: TypeScript → JavaScript (NodeNext module resolution)
> **Updated**: 2026-11-24
> **Rendering**: Cairo via `St.DrawingArea` with `Clutter.Timeline` zoom animation

---

## 1. Core Responsibilities

### 1.1 Spotlight Rendering
`spotlight.ts` renders and animates only; it no longer owns an idle timer.
- `SpotlightManager.show()` creates the `St.DrawingArea` and connects `repaint`.
- `_onRepaint` uses `Cairo.Operator.CLEAR` for the transparent hole and `Cairo.Operator.OVER` for the ring.
- `_startZoomAnimation()` uses `Clutter.Timeline` with `easeOutQuad` to shrink from `spotlight-zoom` to the configured radius.
- Geometry is the current monitor or the bounding box of all monitors (`show-on-all-monitors`); `isVisible` is the visibility source of truth.

### 1.2 Mouse Tracking (Adapter)
`mouseTracking.ts` is a thin GNOME Shell adapter, not a detector:
- Dynamically imports `pointerWatcher` and requests 16 ms polling; callbacks carry absolute positions and arrive only when the pointer changes.
- Owns the single authoritative last pointer position (`_lastX/_lastY`, starting at `null`, so negative monitor X is preserved).
- Computes deltas and feeds `GestureDetector` with injected monotonic millisecond timestamps.
- Applies guards: mouse buttons, Ctrl/Alt, fullscreen (configurable), plus the extension-level checks for Game Mode, visible spotlight, and activation method.
- Starts a 16 ms `GLib.timeout_add` clock only while a gesture is in `tracking` or `ready`, so a stationary pointer can settle (zero-delta ticks).
- Emits `GestureEventInfo {event, progress, total}` to the extension.

### 1.3 Gesture Detection (Pure)
`gestureDetector.ts` has no imports and no GNOME dependencies. It accepts `GestureSample {dx, dy, tMs}` and moves through `idle → tracking → ready → cooldown`, emitting `GestureEvent` values. Its config is injected as `GestureConfig`; `DEFAULT_GESTURE_CONFIG` holds the fixed thresholds. Unit tests drive it with synthesized timestamps.

**Algorithm**: arm at ≥400 px/s with ≥2:1 horizontal dominance; count horizontal direction reversals with speed-dip hysteresis (speed must fall below 20% of the sweep peak) and ≥90 px per sweep; require 3 reversals within 900 ms; then require speed <150 px/s within 180 ms; cooldown 1500 ms. A silence >400 ms, loss of horizontal dominance, or a jump >250 px per sample aborts the attempt. The amplitude floor is `max(120 px, sweep × reversals)`, so tiny jitter cannot qualify. The previous squared-ratio metric is removed.

### 1.4 Activation Policy
`activationController.ts` owns activation and the idle timeout (previously in `SpotlightManager`).
- `activate(source)` is show-only for `'shortcut'`, `'gesture'` and `'always'`; a repeat activation only refreshes the idle timeout, never toggles the spotlight off.
- Game Mode suppression is checked here (`do-not-activate-gamemode` + `GameModeClient.isActive`).
- `notifyActivity()` repaints and resets the idle timeout for pointer activity; `hide()` clears the timer and hides feedback/spotlight.
- In `'always'` mode the spotlight is shown once and no idle timeout is scheduled.
- The `<Super>f` keybinding is registered in `extension.ts` regardless of activation method, so it stays available in gesture mode.

### 1.5 Gesture Feedback
`gestureFeedback.ts` creates a ~40×40 pointer-local `St.DrawingArea` only while a gesture attempt is in progress:
- `armed` shows the ring; `progress` fills one arc per reversal; `ready` switches to a bright "stop now" state.
- `activated`/`aborted` hide and destroy the actor immediately; no full-screen dimming.
- `playConfirmation()` spawns `canberra-gtk-play -i message-new-instant` on gesture activation only when `gesture-sound` is true; a missing helper is a no-op.

### 1.6 Game Mode Integration
`gamemodeClient.ts` wraps `Gio.DBusProxy` for `com.feralinteractive.GameMode`, tracking `ClientCount` with exponential-backoff retries (3 attempts, 5s/10s/20s). State changes are delivered to the extension, which hides or restores the spotlight through `ActivationController`.

### 1.7 Preferences UI
`prefs.ts` builds GTK4/Adwaita pages: General, Appearance, Timing, **Mouse Gesture**, About. The Mouse Gesture page contains Light/Standard/Firm presets, a "Fine-tune gesture" expander for the seven tunable keys, a live "Try the Gesture" practice session, and the sound toggle. The shortcut row is no longer disabled in gesture mode. Legacy shake keys are hidden. User-facing strings use `gettext` (`_()`) and are catalogued in `po/`; English is the source language with identity `en.po`, plus French and Spanish catalogs. Practice instructions are generated from current GSettings values; the dialog has no auto-close timer, announces status changes, uses an accessible name matching the visible `Practice` label, and offers a text-only fallback. About release notes are updated for the 1.2.0 release by the designer lane.

### 1.8 Settings Caching & Normalization
`settings.ts` wraps `Gio.Settings`, caches gesture, activation, timing and appearance values, and normalizes hex colors to `[0,1]` floats. Legacy `cachedShakeInterval`/`cachedShakeSensitivity` getters exist but are marked deprecated and unused by the detector.

### 1.9 Logging & Diagnostics
`utils.ts`: module-level log level, filtered `console.log` with level prefix (`[ERROR]`, `[WARN]`, `[INFO]`, `[DEBUG]`), and hex color parsing. Level is runtime-configurable via `log-level`.

### 1.10 Practice Service (Shell Side)
`practiceService.ts` owns the session-bus name `org.gnome.shell.extensions.find_my_mouse.Practice` at `/org/gnome/shell/extensions/find_my_mouse/Practice`. It registers `Start()` and `Cancel()`, emits `Progress(event: s, progress: i, total: i)` for gesture events and `Result(success: b, detail: s)` on termination, and runs a 10 s watchdog so a forgotten session cannot linger. `start()` hides any visible spotlight and resets `MouseTracker`; `reportEvent(info)` routes `activated`/`aborted` to a terminal result. `destroy()` ends the session, unregisters the object and unowns the bus name.

### 1.11 Practice Client (Preferences Side)
`practiceClient.ts` wraps `Gio.DBusProxy`, retries proxy creation, calls `Start()`/`Cancel()`, and dispatches `Progress`/`Result` to the preferences dialog. It never crashes if the extension reloads (bus name lost): the session ends and the text-only fallback remains available. The dialog has no auto-close timer.

---

## 2. Design Patterns

### 2.1 State Machine — Gesture Detection
`GestureDetector` exposes `phase` and `progress` getters and a `feed(sample)` method returning one of `none`, `armed`, `progress`, `ready`, `activated`, `aborted`. `setConfig()` rebuilds parameters and resets; cooldown is measured with injected timestamps.

### 2.2 Adapter — Pointer Samples to Deltas
`MouseTracker` converts GNOME's absolute, irregular samples into `{dx, dy, tMs}` records. It keeps the authoritative position so negative monitor coordinates remain correct, and supplies zero-delta ticks while a gesture needs a settle decision.

### 2.3 Policy/Rendering Split
`ActivationController` decides when to show/hide and manages the idle timer; `SpotlightManager` only renders; `GestureFeedback` only draws attempt progress. This prevents a gesture from hiding a spotlight shown by another source.

### 2.4 Observer — GSettings and GameMode
The extension connects `changed`, `changed::log-level`, and `changed::activation-method` signals. `SettingsManager` connects `changed::do-not-activate-gamemode`. `GameModeClient` implements `onStateChanged` / `offStateChanged` / `clearStateChangedHandlers`.

### 2.5 Facade — FindMyMouseExtension
The `Extension` subclass creates, configures and tears down all subsystems and translates detector events into feedback/activation calls.

### 2.6 Proxy — GameMode D-Bus
`GameModeClient` hides asynchronous proxy creation, retries and property monitoring behind `isActive`, `setup()` and state-change handlers.

### 2.7 Module-Level Singleton — Logging State
`currentLogLevel` is a module-level variable in `utils.ts` shared by all importers.

### 2.8 Session Proxy — Practice over D-Bus
`PracticeService` is the single owner of practice state on the session bus; `PracticeClient` mirrors it in prefs. Only the service can emit `Result`, and every terminal path funnels through `_finish()` so the watchdog, extension and dialog stay in sync. The two modules share the bus contract as constants but do not import each other.

---

## 3. Architecture

### 3.1 Module Dependency Graph

```
                      FindMyMouseExtension (extension.ts)
       ┌──────────────┬────────────────┬────────────────┬───────────────┐
       ▼              ▼                ▼                ▼               ▼
 settings.ts   activationController.ts spotlight.ts  mouseTracking.ts  gamemodeClient.ts
       │              │                │                │               │
       │              └──► spotlight.ts (show/hide/isVisible)           │
       │                   gestureFeedback.ts (hide via feedback)       │
       │                                                                │
       │                         gestureDetector.ts ◄────────────────────┘
       │                         (no imports; pure)
       ▼
  gestureFeedback.ts (activation policy calls playConfirmation/hide)

prefs.ts → utils.ts
utils.ts ← settings.ts, spotlight.ts, mouseTracking.ts, activationController.ts,
           gestureFeedback.ts, gamemodeClient.ts, practiceService.ts

Practice session (separate process boundary, no direct imports):
  extension.ts → practiceService.ts ⇄ [session bus] ⇄ practiceClient.ts ← prefs.ts
  Start()/Cancel(): client → service; Progress/Result signals: service → client
```

Import directions:
- `extension.ts` imports every manager (including `practiceService.ts`) plus `utils.ts`.
- `activationController.ts` imports types from `settings.ts` and `spotlight.ts`, plus `utils.ts`.
- `mouseTracking.ts` imports `gestureDetector.ts` and `utils.ts`.
- `gestureDetector.ts` imports nothing.
- `prefs.ts` imports `utils.ts` and `practiceClient.ts`.
- `practiceService.ts` imports `mouseTracking.ts` types and `utils.ts`; `practiceClient.ts` imports `Gio`/`GLib` only — they never import each other.
- No circular dependencies.

### 3.2 Class Hierarchy

```
GNOME Shell
  └── Extension → FindMyMouseExtension            [extension.ts]
        Fields: _settingsManager, _spotlightManager, _mouseTracker,
                _gameModeClient, _activationController, _gestureFeedback,
                signal IDs, _gameModeAvailable, _enabled

GNOME Shell
  └── ExtensionPreferences → FindMyMousePreferences [prefs.ts]

Plain TypeScript classes:
  ├── SettingsManager        [settings.ts]        — GSettings cache
  ├── SpotlightManager       [spotlight.ts]       — Cairo + zoom; isVisible
  ├── MouseTracker           [mouseTracking.ts]   — pointer adapter + guards + settle clock
  ├── GestureDetector        [gestureDetector.ts] — pure state machine
  ├── GestureFeedback        [gestureFeedback.ts] — progress ring + sound
  ├── ActivationController   [activationController.ts] — show-only activation + idle timer
  ├── GameModeClient         [gamemodeClient.ts]  — D-Bus proxy
  ├── PracticeService        [practiceService.ts] — practice session bus owner + watchdog
  └── PracticeClient         [practiceClient.ts]  — prefs-side D-Bus proxy
```

---

## 4. Data & Control Flow

### 4.1 Extension Lifecycle

```
enable()
  ├── getSettings(); setLogLevel(); connect changed::log-level
  ├── new GameModeClient(); setup(); onStateChanged(...)
  ├── new SettingsManager(); new SpotlightManager()
  ├── new GestureFeedback()
  ├── new PracticeService(onStart, onEnd)  // owns D-Bus name + 10 s watchdog
  ├── new ActivationController(...); setEnabled(true)
  ├── Main.wm.addKeybinding('find-my-mouse-activation', ... → activate('shortcut'))
  ├── re-check GameMode state at startup
  ├── new MouseTracker(...); connect changed → cacheSettings + updateConfig +
  │     refreshIdleTimeout + queueRepaint
  ├── await mouseTracker.setup()
  └── _setupAlwaysVisible()

disable()
  ├── _enabled = false; removeKeybinding; mouseTracker.remove()
  ├── disconnect settings signals; remove always-visible handler
  ├── activationController.destroy(); spotlightManager.destroyImmediately()
  ├── practiceService.destroy()  // ends any active session, clears watchdog
  ├── settingsManager.destroy(); gestureFeedback.destroy(); gameModeClient.destroy()
  └── null all manager references
```

### 4.2 Pointer → Gesture → Feedback Flow

```
pointerWatcher callback(x, y)  [16 ms requested; on change]
        │
        ▼
MouseTracker._handleSample(x, y)
  ├── update _lastX/_lastY (null sentinel on first sample)
  ├── onPointerMove(x, y, dx, dy) → extension._handleMouseMovement
  │     ├── gestureFeedback.setPosition(x, y)
  │     ├── spotlightManager.updateMousePosition(x, y)  → queue_repaint
  │     └── if |dx|>=5 or |dy|>=5 → activationController.notifyActivity()
  ├── if !_canDetect() or guards block → abort active attempt; return
  └── detector.feed({dx, dy, tMs: monotonic ms})
        ├── 'armed'      → feedback.show()
        ├── 'progress'   → feedback.setProgress(progress, total)
        ├── 'ready'      → feedback.setReady()
        ├── 'activated'  → feedback.hide()
        │                   ├── practice active? practiceService.reportEvent(info)
        │                   │     → Result(success=true, 'gesture-completed')
        │                   └── else activationController.activate('gesture')
        └── 'aborted'    → feedback.hide()
                            └── practice active? practiceService.reportEvent(info)
                                  → Result(success=false, 'gesture-aborted')
while practice is active the real progress ring stays visible until the session ends;
no spotlight is shown.
while phase is tracking/ready: 16 ms clock feeds {dx:0, dy:0, tMs} zero-delta ticks
```

### 4.3 Activation Flow

```
keyboard shortcut ───► activationController.activate('shortcut')
gesture 'activated' ─► activationController.activate('gesture')   [not during practice]
always mode ─────────► activationController.activate('always')

During practice, 'activated' goes to PracticeService.reportEvent() → Result(true, …)
instead; ActivationController.activate('gesture') is never called and no spotlight shows.

activate(source)
  ├── if !enabled → return
  ├── if method === 'always' → show once if hidden; no idle timeout
  ├── if suppressGameMode && GameMode active → log and return
  ├── if spotlight visible → resetIdleTimeout(); return  (show-only, never toggle)
  ├── spotlightManager.show(show-on-all-monitors)
  │     ├── geometry, St.DrawingArea, 'repaint' → Cairo hole + ring
  │     └── Clutter.Timeline zoom (initialZoom → 1, easeOutQuad)
  ├── spotlightManager.updateMousePosition(global.get_pointer())
  ├── resetIdleTimeout()  (idle-timeout ms → activationController.hide())
  └── if source === 'gesture' && gesture-sound → feedback.playConfirmation()
```

### 4.4 Gesture State Machine

```
idle
  │ feed fast, horizontal sample (≥400 px/s, ≥2:1 dominance, amplitude floor met)
  ▼
tracking ── each valid reversal (≥sweepPx, speed dipped <20% of peak) emits progress
  │ N reversals reached within gesture-window → ready (bright "stop now" ring)
  ▼
ready ── pointer speed <150 px/s within gesture-settle → activated → cooldown
  │ timeout, pause >400 ms, loss of dominance, jump >250 px → aborted → idle
  ▼
cooldown ── ignore all gestures for gesture-cooldown ms → idle
```

Guards are applied by `MouseTracker` before `feed()`: buttons, Ctrl/Alt, fullscreen, plus extension-level Game Mode, visible spotlight and activation-method checks. Detector-level guards handle jumps, pauses and loss of horizontal dominance.

### 4.5 Settings Change Flow

```
prefs.ts writes GSettings
        ▼
changed signal
  ├── changed::log-level             → setLogLevel()
  ├── changed::activation-method     → mouseTracker.reset(); feedback.hide();
  │                                     show in always mode or hide if leaving it
  └── changed (generic)              → settingsManager.cacheSettings()
                                        mouseTracker.updateConfig() (rebuild detector config)
                                        activationController.refreshIdleTimeout()
                                        spotlightManager.queueRepaint()
```

### 4.6 GameMode State Change Flow

```
GameMode ClientCount changes → GameModeClient.onStateChanged(active)
  ├── mark GameMode available
  ├── if active && suppress && spotlight visible → activationController.hide()
  └── if !active && method === 'always' && spotlight hidden → activate('always')
```

### 4.7 Practice Session Flow

```
prefs.ts "Try the Gesture" (instructions from current GSettings; no auto-close timer)
   └── PracticeClient.setup() retry → proxy
         ├── Start() → bus → PracticeService.start()
         │     ├── hide visible spotlight; mouseTracker.reset()
         │     └── 10 s watchdog armed
         ├── Progress(event, progress, total) ← reportEvent(info) for each gesture event
         │     └── dialog announces status; real progress ring stays visible
         ├── Result(true, 'gesture-completed') ← 'activated' (never activate('gesture'))
         └── Result(false, detail) ← Cancel / aborted / timeout / bus-name-lost /
               service-destroyed / dialog destroy / prefs close / extension disable
Both sides converge on ending the session and clearing the watchdog; PracticeClient
never throws if the extension reloads, and prefs can show a text-only fallback.
```

---

## 5. Integration Points

| API | Module | Usage |
|---|---|---|
| `Extension` / `ExtensionPreferences` | extension.ts, prefs.ts | Lifecycle and preferences |
| `Main.wm.addKeybinding()` / `Main.uiGroup` | extension.ts, spotlight.ts, gestureFeedback.ts | Shortcut and actors |
| `pointerWatcher` (dynamic import) | mouseTracking.ts | Absolute pointer samples |
| `Gtk`, `Adw`, `Gdk` | prefs.ts | Preferences widgets |
| `St.DrawingArea`, `Cairo`, `Clutter.Timeline` | spotlight.ts, gestureFeedback.ts | Spotlight, progress ring, animations |
| `GLib.timeout_add`, `GLib.get_monotonic_time`, `GLib.spawn_command_line_async` | activationController.ts, mouseTracking.ts, gestureFeedback.ts | Idle timer, settle clock/timestamps, optional sound |
| `Gio.Settings`, `Gio.DBusProxy` | settings.ts, prefs.ts, gamemodeClient.ts | Configuration and GameMode |
| `Gio.DBus.session.register_object/own_name`, `emit_signal` | practiceService.ts | Practice bus name, methods `Start()`/`Cancel()`, signals `Progress(event: s, progress: i, total: i)` and `Result(success: b, detail: s)` |
| `Gio.DBusProxy` (practice interface) | practiceClient.ts | Prefs-side Start/Cancel calls and signal dispatch with retry |
| `GLib.timeout_add`, `GLib.source_remove` | practiceService.ts | 10 s practice watchdog and cleanup |
| `global.get_pointer()`, `global.display` | extension.ts, mouseTracking.ts, spotlight.ts, activationController.ts, gestureFeedback.ts | Position, modifier mask, fullscreen and monitor geometry |
| `node:test` | test/*.test.mjs | Unit tests for the pure detector |

---

## 6. Key Data Structures

```typescript
// gestureDetector.ts — input sample with injected time
interface GestureSample { dx: number; dy: number; tMs: number; }

// gestureDetector.ts — thresholds (defaults shown in comment)
interface GestureConfig {
    reversals: number;             // 3
    sweepPx: number;               // 90
    windowMs: number;              // 900
    settleMs: number;              // 180
    cooldownMs: number;            // 1500
    minTravelPx: number;           // max(120, sweepPx * reversals)
    maxJumpPx: number;             // 250
    armSpeedPxPerSec: number;      // 400
    settleSpeedPxPerSec: number;   // 150
    axisDominance: number;         // 2
    pauseMs: number;               // 400
}

type GestureEvent = 'none' | 'armed' | 'progress' | 'ready' | 'activated' | 'aborted';
type GesturePhase = 'idle' | 'tracking' | 'ready' | 'cooldown';

// mouseTracking.ts — output to extension.ts
interface GestureEventInfo { event: GestureEvent; progress: number; total: number; }

// practiceService.ts / practiceClient.ts — D-Bus contract
// name + interface: org.gnome.shell.extensions.find_my_mouse.Practice
// path: /org/gnome/shell/extensions/find_my_mouse/Practice
// methods: Start(), Cancel()
// signals: Progress(event: s, progress: i, total: i), Result(success: b, detail: s)

// spotlight.ts
interface MonitorGeometry { x: number; y: number; width: number; height: number; }
// x/y can be negative for monitors left of or above the primary monitor.

// settings.ts
type NormalizedColor = [number, number, number, number]; // 0–1 floats for Cairo
```

The former `MovementRecord {dx, dy, tick}` structure and the 100-entry movement history no longer exist; `GestureDetector` keeps only samples inside `windowMs`.

---

## 7. Settings Schema Overview

22 keys in `org.gnome.shell.extensions.find-my-mouse`:

| Key | Type | Default | Page / status |
|---|---|---|---|
| `activation-method` | string | `'shake'` | General — "Shortcut + Mouse Gesture" |
| `find-my-mouse-activation` | string[] | `['<Super>f']` | General — always active |
| `gesture-reversals` | int | `3` | Mouse Gesture |
| `gesture-sweep` | int | `90` px | Mouse Gesture |
| `gesture-window` | int | `900` ms | Mouse Gesture |
| `gesture-settle` | int | `180` ms | Mouse Gesture |
| `gesture-cooldown` | int | `1500` ms | Mouse Gesture |
| `gesture-ignore-buttons` | bool | `true` | Mouse Gesture |
| `gesture-ignore-fullscreen` | bool | `true` | Mouse Gesture |
| `gesture-sound` | bool | `false` | Mouse Gesture |
| `shake-interval` | int | `1000` | Deprecated/legacy, hidden |
| `shake-sensitivity` | int | `400` | Deprecated/legacy, hidden |
| `do-not-activate-gamemode` | bool | `true` | General |
| `show-on-all-monitors` | bool | `false` | General |
| `background-color` | string | `'#00000080'` | Appearance |
| `spotlight-color` | string | `'#FFFFFFCC'` | Appearance |
| `spotlight-radius` | int | `100` | Appearance |
| `spotlight-zoom` | double | `9.0` | Appearance |
| `spotlight-ring-width` | int | `2` | Appearance |
| `idle-timeout` | int | `1000` | Timing |
| `animation-duration` | int | `500` | Timing |
| `log-level` | int | `2` | About |

---

## 8. Error Handling & Edge Cases

| Scenario | Handling |
|---|---|
| GameMode D-Bus unavailable | Retry with backoff (3 attempts, 5s/10s/20s), then mark unavailable locally |
| Missing/invalid colors | `parseColor()` fallback before normalization |
| Null Cairo context | Guard `if (!cr) return;` |
| Stale zoom callbacks | Cancel/clear `Clutter.Timeline` before show and on hide |
| Pointer jump / monitor switch | Detector aborts on step >250 px; monitor/focus changes abort via adapter |
| Gesture pause mid-attempt | No sample for >400 ms aborts; 16 ms clock provides settle ticks while active |
| Settings change during attempt | `updateConfig()` rebuilds detector config and stops the settle clock |
| `disable()` while pointerWatcher import is pending | Re-check `_enabled` after `await setup()` and remove the watch |
| Practice D-Bus service unavailable | Client retries proxy creation and falls back to text-only instructions; no crash |
| Extension reloads during practice | Bus name is lost, service ends the session; client tolerates the signal and can retry |
| Two prefs windows open | `PracticeService` is the single session owner; terminal events end the session for all clients |
| Practice watchdog fires (10 s) | `_finish(false, 'timeout')` clears the timer, emits `Result`, restores normal activation |
| Cancel / dialog destroy / prefs close | Client calls `Cancel()` (or bus loss is detected); service emits `Result(false, …)` and resets |

---

## 9. Performance Considerations

1. `GestureDetector` retains only samples within `gesture-window`; no unbounded history.
2. The 16 ms settle clock exists only while a gesture is `tracking` or `ready`.
3. Cairo contexts are disposed in every `repaint` handler.
4. Repaints are skipped for pointer deltas below 5 px.
5. `ActivationController` clears the idle timeout on every reset/hide.
6. `GestureFeedback` creates a small actor only during an attempt and destroys it immediately afterward.

---

## 10. Testing & Validation Points

| Concern | Validation Method | Relevant File |
|---|---|---|
| Gesture state machine | `npm test` → `node --test test/*.test.mjs`; synthesized pointer streams, including the retired 1500 ms/30 px tutorial cadence (no activation) and a normal 900 ms/180 ms gesture (activation) | `test/gestureDetector.test.mjs`, `src/gestureDetector.ts` |
| Type correctness | `npm run check` (`tsc --noEmit`) | `tsconfig.json` |
| Lint | `npm run lint` | `eslint.config.js` |
| Schema syntax | `xmllint` + `glib-compile-schemas` | `schemas/*.xml` |
| Metadata validity | CI Python validator | `metadata.json` |
| Runtime behavior | Nested Wayland session (`--devkit` on GNOME 49+) and `journalctl` | `AGENTS.md`, `docs/codebase/TESTING.md` |
