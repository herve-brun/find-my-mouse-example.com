# src/ — Find My Mouse Extension Source

> **Module count**: 13 TypeScript modules → compiled to `dist/*.js`
> **Runtime**: GNOME Shell 46–50 (Wayland)
> **Language**: TypeScript → JavaScript (NodeNext module resolution)
> **Updated**: 2026-11-26
> **Rendering**: four `St.Widget` dim actors + small pointer-local Cairo `St.DrawingArea` mask, `Clutter.Timeline` zoom, high-contrast-aware colors
> **Inspiration**: Microsoft PowerToys "Find My Mouse" spotlight

---

## 1. Core Responsibilities

### 1.1 Spotlight Rendering
`spotlight.ts` renders and animates the overlay; activation policy and the idle timeout belong to `ActivationController`.
- `SpotlightManager.show()` creates a clipping `Clutter.Actor` group with four dim `St.Widget` actors and a small `St.DrawingArea` mask, and connects `repaint`. It anchors the mask to `global.get_pointer()` before the first repaint so a stale position from a previous display is never reused.
- `_onMaskRepaint` paints the mask's dark corners with `Cairo.Operator.SOURCE`, punches the transparent hole with `Cairo.Operator.CLEAR`, and strokes the ring with `Cairo.Operator.OVER`; only the mask is rasterised by Cairo, and the context is disposed with `cr.$dispose()`.
- `spotlightLayout.ts` computes the mask/dim rectangles as pure math (no GNOME imports). `computeSpotlightLayout(monitor, pointerX, pointerY, radius, ringWidth)` returns actor-local rectangles: a small square mask with half-size `max(1, ceil(radius + |ringWidth|/2 + 1))` px plus four solid dim rectangles tiling the rest of the monitor; both mask and dims are clipped to monitor bounds.
- `_startZoomAnimation()` uses `Clutter.Timeline` with manual `easeOutQuad` to shrink from `spotlight-zoom` to the configured radius over `animation-duration`; `hide()` fades the group with `actor.ease()` and destroys actors on completion. `org.gnome.desktop.interface enable-animations = false` skips both zoom and fade.
- High contrast is read from `org.gnome.desktop.a11y.interface high-contrast`; fallback opaque black dim and white ring colors apply only while the schema defaults are untouched, so explicit user colors always win. A live `changed::high-contrast` handler restyles the dim actors via CSS and repaints the mask.
- Geometry is the current monitor or the bounding box of all monitors (`show-on-all-monitors`); `isVisible` is the visibility source of truth, and `queueRepaint()` cancels an in-progress fade to re-show the spotlight.

### 1.2 Mouse Tracking (Adapter)
`mouseTracking.ts` is a thin GNOME Shell adapter, not a detector:
- Dynamically imports `pointerWatcher` and requests 16 ms polling (`addWatch(16, callback)`); callbacks carry absolute positions and arrive only when the pointer changes.
- Owns the single authoritative last pointer position (`_lastX/_lastY`, starting at `null`, so negative monitor X is preserved). The first sample emits a pointer-move callback with zero deltas and no gesture feed.
- Computes deltas and feeds `GestureDetector` with injected monotonic millisecond timestamps from `GLib.get_monotonic_time() / 1000`.
- Applies adapter guards: configurable mouse-button bits and fullscreen focus-window checks, plus unconditional Ctrl/Alt rejection. The extension-level `_canDetect()` gate requires the extension to be enabled, the `'shake'` method (or an active practice session), and no visible spotlight; Game Mode suppression is enforced separately in `ActivationController`.
- Starts a 16 ms `GLib.timeout_add` clock only while a gesture is in `tracking` or `ready`, so a stationary pointer can settle with zero-delta ticks. The clock also re-checks `_canDetect()` on each tick.
- Emits `GestureEventInfo {event, progress, total}` to the extension, with `total` read from `cachedGestureReversals`.

### 1.3 Gesture Detection (Pure)
`gestureDetector.ts` has no imports and no GNOME dependencies. It accepts `GestureSample {dx, dy, tMs}` and moves through `idle → tracking → ready → cooldown`, emitting `GestureEvent` values. Its config is injected as `GestureConfig`; `DEFAULT_GESTURE_CONFIG` holds the fixed thresholds, and the constructor spreads an injected config over those defaults. Unit tests drive it with synthesized timestamps.

**Algorithm**: arm when the retained 900 ms window meets the injected amplitude floor, has `absDx ≥ 2 × absDy`, and shows speed ≥400 px/s (maximum of the trailing 80 ms speed and whole-window speed). Each reversal needs ≥`sweepPx` (90 px by default) of horizontal travel plus a speed dip below 20 % of the sweep peak; 3 reversals switch to `ready`, and the next sample with speed <150 px/s within `settleMs` (180 ms) activates and enters `cooldown` (1500 ms). A silence >400 ms, loss of horizontal dominance in the retained window, or a step >250 px aborts. Non-finite values and backwards timestamps are ignored. `DEFAULT_GESTURE_CONFIG.minTravelPx` is 300 px; `MouseTracker` injects `max(120 px, sweepPx × reversals)` from GSettings (270 px with the Standard preset).

### 1.4 Activation Policy
`activationController.ts` owns activation intent and the idle timeout; `SpotlightManager` only renders.
- `activate(source)` is show-only for `'shortcut'`, `'gesture'` and `'always'`; in non-always modes a repeat activation calls `queueRepaint()` and refreshes the idle timeout (cancelling any fade-out), never toggles the spotlight off.
- Game Mode suppression is checked here via `do-not-activate-gamemode` + `GameModeClient.isActive`, after the early `'always'` branch.
- In `'always'` mode `show(false)` is called once on the current monitor and no idle timeout is scheduled; a repeat activation merely repaints.
- `notifyActivity()` repaints and resets the idle timeout for pointer activity of ≥5 px on either axis; `hide()` clears the timer and hides feedback/spotlight.
- The `<Super>f` keybinding is registered in `extension.ts` for every activation method, with `Meta.KeyBindingFlags.IGNORE_AUTOREPEAT` in `NORMAL | OVERVIEW` action modes.

### 1.5 Gesture Feedback
`gestureFeedback.ts` creates a 40×40 pointer-local `St.DrawingArea` (60 % actor opacity) only while a gesture attempt is in progress:
- `armed` shows a hollow outline ring; `progress` fills one arc per reversal with 0.28 rad gaps; `ready` fills all arcs, brightens and thickens the outline, and switches to the "stop now" color.
- Colors come from a five-entry `RingPalette`; the high-contrast palette uses opaque cyan for progress and yellow for `ready` so the state stays distinguishable without CSS theme variables. The palette is read at each repaint from `org.gnome.desktop.a11y.interface high-contrast`; missing schema/key falls back to standard contrast.
- `setPosition()` follows the pointer; `activated`/`aborted` hide and destroy the actor (transitions removed first); no full-screen dimming is ever created.
- `playConfirmation()` spawns `canberra-gtk-play -i message-new-instant` on gesture activation only when `gesture-sound` is true; a missing helper is a no-op.

### 1.6 Game Mode Integration
`gamemodeClient.ts` wraps `Gio.DBusProxy` for `com.feralinteractive.GameMode` at `/com/feralinteractive/GameMode`, tracking the read-only `ClientCount` property (`active = ClientCount > 0`). Proxy creation starts once and retries after 5 s and 10 s, stopping at a retry count of 3 (the 20 s cap in the backoff formula is never reached). Initial state is emitted on proxy success, later `g-properties-changed` updates are delivered to the extension, which hides the spotlight on suppression or restores `'always'` mode when Game Mode ends. `destroy()` cancels retries, disconnects the property signal and drops handlers.

### 1.7 Preferences UI
`prefs.ts` builds a 700×645 GTK4/Adwaita `Adw.PreferencesWindow` with General, Appearance, Timing, **Mouse Gesture** and About pages, using HIG-aligned `Adw.PreferencesGroup`, `ActionRow`, `SwitchRow`, `SpinRow`, `ComboRow` and `ExpanderRow` widgets with explicit accessible labels on suffix buttons.
- General has activation radio rows ("Shortcut and gesture" / "Always visible"), an "Activation Shortcut" row with a live `Gtk.ShortcutLabel` and `Change…` button, Game Mode and multi-monitor switches. The shortcut row is active in the default shortcut + gesture mode and becomes insensitive with an explanatory subtitle only in "Always visible" mode.
- GTK4 has no public shortcut entry, so a modal `Adw.AlertDialog` captures accelerators through `Gtk.EventControllerKey`: modifiers preview live, lock keys are ignored, at least one modifier is required, Escape cancels, BackSpace clears, and Set writes `find-my-mouse-activation` as a single-element string array (or an empty array when cleared).
- Each settings page has a reset action: typed GVariant values are snapshotted, defaults applied, and an `Adw.Toast` offers Undo; libadwaita without `add_toast()` gets an `Adw.AlertDialog` confirmation instead. Mouse Gesture also resets to the Standard preset.
- The Mouse Gesture page has Light (`2/60/1200/260/1000`), Standard (`3/90/900/180/1500`), Firm (`4/140/700/120/2000`) presets for reversals/sweep/window/settle/cooldown plus a display-only "Custom" state derived from the five keys, a "Fine-tune gesture" expander, button/fullscreen/sound switches, and a live "Practice" row.
- User-facing strings use `gettext` (`_()`) and are catalogued in `po/`; English is the source language with identity `en.po`, plus French and Spanish catalogs.
- Practice instructions are generated from current GSettings values; the dialog has no auto-close timer, announces status changes with `Gtk.AccessibleAnnouncementPriority.MEDIUM`, gives suffix buttons explicit accessible labels ("Change Activation Shortcut" for "Change…"; "Practice gesture…" matching its visible label on the row titled "Practice"), and offers text-only steps when D-Bus is unavailable or the session stops.
- About shows the metadata `version-name` (1.0.0), website, and a credits/license dialog whose icon comes from `assets/find-my-mouse.svg` via `this.dir`; release notes use the same `version-name` and cover the wave-and-stop gesture, always-available shortcut, progress ring, presets, practice and text-only fallback.

### 1.8 Settings Caching & Normalization
`settings.ts` wraps `Gio.Settings`, caches gesture, activation, timing and appearance values, and normalizes hex colors to `[0,1]` floats via `utils.parseColor()`. It connects `changed::do-not-activate-gamemode` to refresh its own cached flag. Gesture configuration is built from `cachedGesture*` values.

### 1.9 Logging & Diagnostics
`utils.ts`: module-level `currentLogLevel` defaulting to `LogLevel.INFO` (2), filtered `console.log` with `[ERROR]`/`[WARN]`/`[INFO]`/`[DEBUG]` prefix, `isLogLevelEnabled()` guard for hot paths, runtime configuration via `log-level`, and hex color parsing with `defaultAlpha = 255`.

### 1.10 Practice Service (Shell Side)
`practiceService.ts` owns the session-bus name `org.gnome.shell.extensions.find_my_mouse.Practice` at `/org/gnome/shell/extensions/find_my_mouse/Practice`. It registers `Start()` and `Cancel()`, emits `Progress(event: s, progress: i, total: i)` for every gesture event and `Result(success: b, detail: s)` on termination, and runs a 10 s watchdog so a forgotten session cannot linger. `start()` calls the extension's `onStart` callback (hide spotlight, reset `MouseTracker`, hide feedback) and arms the watchdog; a repeated `Start()` restarts the watchdog without re-running `onStart` for an already-active session. `reportEvent(info)` emits `Progress` and routes `activated`/`aborted` to a terminal result with detail `gesture-completed` / `gesture-aborted`. `_finish()` is idempotent, emits `Result` and calls `onEnd`, which resets the tracker/feedback and restores `'always'` mode if applicable. Bus-name loss, `Cancel()`, watchdog timeout (detail `timeout`), `destroy()` (detail `service-destroyed`) and extension disable all end the session; `destroy()` unregisters the object and unowns the bus name.

### 1.11 Practice Client (Preferences Side)
`practiceClient.ts` wraps `Gio.DBusProxy` with `DO_NOT_AUTO_START`, retrying proxy creation up to 10 times at 500 ms intervals. `setup()` resolves `false` on failure and never rejects; `start()`/`cancel()` are best-effort and swallow D-Bus errors; `g-signal` handlers dispatch `Progress`/`Result` with per-handler exception isolation. `destroy()` removes the retry timer, disconnects the signal and clears handlers. The client never crashes if the extension reloads (bus name lost): the session ends and the text-only fallback remains available in preferences.

---

## 2. Design Patterns

### 2.1 State Machine — Gesture Detection
`GestureDetector` exposes `phase` and `progress` getters and a `feed(sample)` method returning one of `none`, `armed`, `progress`, `ready`, `activated`, `aborted`. `setConfig()` rebuilds parameters (spreading over defaults) and resets; `ready` is emitted once and settling is checked on the following sample; cooldown is measured with injected timestamps.

### 2.2 Adapter — Pointer Samples to Deltas
`MouseTracker` converts GNOME's absolute, irregular samples into `{dx, dy, tMs}` records. It keeps the authoritative position so negative monitor coordinates remain correct, and supplies zero-delta ticks while a gesture needs a settle decision.

### 2.3 Policy/Rendering Split
`ActivationController` decides when to show/hide and manages the idle timer; `SpotlightManager` renders and animates; `GestureFeedback` draws attempt progress only. This prevents a gesture from hiding a spotlight shown by another source.

### 2.4 Observer — GSettings and GameMode
The extension connects `changed`, `changed::log-level`, and `changed::activation-method` signals. `SettingsManager` connects `changed::do-not-activate-gamemode`. `GameModeClient` implements `onStateChanged` / `offStateChanged` / `clearStateChangedHandlers`. `SpotlightManager` listens for `changed::high-contrast`; `PracticeClient` listens for `g-signal` on its D-Bus proxy.

### 2.5 Facade — FindMyMouseExtension
The `Extension` subclass creates, configures and tears down all subsystems and translates detector events into feedback/activation or practice-result calls.

### 2.6 Proxy — GameMode D-Bus
`GameModeClient` hides asynchronous proxy creation, retries (5 s/10 s) and property monitoring behind `isActive`, `setup()` and state-change handlers.

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
        │              └──► spotlight.ts (show/hide/isVisible/queueRepaint)
        │                   gestureFeedback.ts (hide via feedback)       │
        │                   spotlightLayout.ts (pure layout math)       │
        │                                                                │
        │                         gestureDetector.ts ◄────────────────────┘
        │                         (no imports; pure)
        ▼
   gestureFeedback.ts (activation policy calls playConfirmation/hide)

 prefs.ts → utils.ts, practiceClient.ts
 utils.ts ← settings.ts, spotlight.ts, mouseTracking.ts, activationController.ts,
            gestureFeedback.ts, gamemodeClient.ts, practiceService.ts

 Practice session (separate process boundary, no direct imports):
   extension.ts → practiceService.ts ⇄ [session bus] ⇄ practiceClient.ts ← prefs.ts
   Start()/Cancel(): client → service; Progress/Result signals: service → client
```

Import directions:
- `extension.ts` imports every manager (including `practiceService.ts`) plus `utils.ts`.
- `activationController.ts` imports types from `settings.ts` and `spotlight.ts`, plus `utils.ts`.
- `spotlight.ts` imports the pure `spotlightLayout.ts` helper.
- `mouseTracking.ts` imports `gestureDetector.ts` and `utils.ts`, plus a type from `settings.ts`.
- `gestureDetector.ts` and `spotlightLayout.ts` import nothing.
- `prefs.ts` imports `utils.ts` and `practiceClient.ts`.
- `practiceService.ts` imports `mouseTracking.ts` types and `utils.ts`; `practiceClient.ts` imports `Gio`/`GLib` only — they never import each other.
- No circular dependencies.

### 3.2 Class Hierarchy

```
GNOME Shell
  └── Extension → FindMyMouseExtension            [extension.ts]
        Fields: _settingsManager, _spotlightManager, _mouseTracker,
                _gameModeClient, _activationController, _gestureFeedback,
                _practiceService, signal IDs, _gameModeAvailable, _enabled

GNOME Shell
  └── ExtensionPreferences → FindMyMousePreferences [prefs.ts]

Plain TypeScript classes:
  ├── SettingsManager        [settings.ts]        — GSettings cache
  ├── SpotlightManager       [spotlight.ts]       — Cairo + zoom; isVisible
  ├── MouseTracker           [mouseTracking.ts]   — pointer adapter + guards + settle clock
  ├── GestureDetector        [gestureDetector.ts] — pure state machine
  ├── GestureFeedback        [gestureFeedback.ts] — pointer-local progress ring + sound
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
  ├── new ActivationController(...); setEnabled(true)
  ├── new PracticeService(onStart, onEnd)  // owns D-Bus name + 10 s watchdog
  │     onStart: activationController.hide(); mouseTracker.reset(); feedback.hide()
  │     onEnd:   mouseTracker.reset(); feedback.hide(); restore 'always' if hidden
  ├── Main.wm.addKeybinding('find-my-mouse-activation', ... → activate('shortcut'))
  ├── re-check GameMode state at startup
  ├── new MouseTracker(...); connect changed → cacheSettings + updateConfig +
  │     refreshIdleTimeout + queueRepaint
  ├── await mouseTracker.setup()
  └── _setupAlwaysVisible()  // activate now if 'always'; connect changed::activation-method

disable()
  ├── _enabled = false; removeKeybinding; mouseTracker.remove()
  ├── disconnect settings/log-level signals; remove always-visible handler
  ├── activationController.setEnabled(false)  // before ending practice
  ├── practiceService.destroy()  // ends any active session, clears watchdog
  ├── activationController.destroy(); spotlightManager.destroyImmediately()
  ├── settingsManager.destroy(); gestureFeedback.destroy(); gameModeClient.destroy()
  └── null all manager references
```

`changed::activation-method` cancels any practice session, resets the tracker, hides feedback, then shows the spotlight in `'always'` mode or hides it when leaving that mode.

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
        ├── 'activated'  → practice active? practiceService.reportEvent(info)
        │                   → Result(success=true, 'gesture-completed')
        │                 else activationController.activate('gesture')
        └── 'aborted'    → practice active? practiceService.reportEvent(info)
                             → Result(success=false, 'gesture-aborted')
 terminal events call feedback.hide() in the extension; the service's onEnd
 also hides it. No spotlight is shown while practice is active.
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
  ├── if method === 'always' → show(false) once if hidden, else queueRepaint(); no idle timeout
  ├── if suppressGameMode && GameMode active → log and return
  ├── if spotlight visible → queueRepaint() + resetIdleTimeout()  (show-only, never toggle)
  ├── spotlightManager.show(show-on-all-monitors)
  │     ├── geometry + 4 dim actors + small Cairo mask (SOURCE corners/CLEAR hole/OVER ring)
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
   │ 3 reversals → ready (bright "stop now" ring)
   ▼
ready ── next sample with speed <150 px/s within gesture-settle → activated → cooldown
   │ timeout, pause >400 ms, loss of dominance, jump >250 px → aborted → idle
   ▼
cooldown ── ignore all gestures for gesture-cooldown ms → idle
```

The 900 ms `gesture-window` is the sliding sample window used for arming and dominance checks; the 400 ms pause guard bounds gaps between samples. Guards are applied by `MouseTracker` before `feed()`: buttons (configurable), Ctrl/Alt, fullscreen (configurable), plus the extension-level enabled/practice/method/visibility gate. Detector-level guards handle jumps, pauses and loss of horizontal dominance; Game Mode suppression is enforced by `ActivationController`.

### 4.5 Settings Change Flow

```
prefs.ts writes GSettings
        ▼
changed signal
  ├── changed::log-level             → setLogLevel()
  ├── changed::activation-method     → practiceService.cancel(); mouseTracker.reset();
  │                                     feedback.hide(); show in always mode or hide if leaving it
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
prefs.ts "Practice" (instructions from current GSettings; no auto-close timer)
   └── PracticeClient.setup() retry → proxy (DO_NOT_AUTO_START)
          ├── Start() → bus → PracticeService.start()
          │     ├── extension onStart: hide spotlight; reset tracker; hide feedback
          │     └── 10 s watchdog armed
          ├── Progress(event, progress, total) ← reportEvent(info) for each gesture event
          │     └── dialog announces status; ring is hidden with the terminal event
          ├── Result(true, 'gesture-completed') ← 'activated' (never activate('gesture'))
          └── Result(false, detail) ← Cancel ('cancelled') / aborted ('gesture-aborted') /
                timeout / bus-name-lost / service-destroyed / dialog destroy /
                prefs close / extension disable
Both sides converge on ending the session and clearing the watchdog; PracticeClient
never throws if the extension reloads, and prefs can show a text-only fallback.
```

---

## 5. Integration Points

| API | Module | Usage |
|---|---|---|
| `Extension` / `ExtensionPreferences` | extension.ts, prefs.ts | Lifecycle and preferences |
| `Main.wm.addKeybinding()` / `Main.uiGroup` | extension.ts, spotlight.ts, gestureFeedback.ts | Shortcut and overlay actors |
| `pointerWatcher` (dynamic import) | mouseTracking.ts | Absolute pointer samples |
| `Gtk`, `Adw`, `Gdk` | prefs.ts | HIG-aligned preferences widgets, shortcut capture, reset/undo toast, practice dialogs |
| `St.DrawingArea`, `Cairo`, `Clutter.Timeline`, `Clutter.Actor.ease` | spotlight.ts, gestureFeedback.ts | Spotlight mask, progress ring, zoom and fade |
| `GLib.timeout_add`, `GLib.get_monotonic_time`, `GLib.spawn_command_line_async`, `GLib.source_remove` | activationController.ts, mouseTracking.ts, gestureFeedback.ts, practiceService.ts | Idle timer, settle clock/timestamps, optional sound, watchdog |
| `Gio.Settings` | settings.ts, spotlight.ts, gestureFeedback.ts, prefs.ts | Configuration, high contrast and reduced animation |
| `Gio.DBusProxy` | gamemodeClient.ts | GameMode `ClientCount` property monitoring with retry |
| `Gio.DBus.session.register_object/own_name`, `emit_signal` | practiceService.ts | Practice bus name, methods `Start()`/`Cancel()`, signals `Progress(event: s, progress: i, total: i)` and `Result(success: b, detail: s)` |
| `Gio.DBusProxy` (practice interface) | practiceClient.ts | Prefs-side Start/Cancel calls and `g-signal` dispatch with 10×500 ms retry |
| `global.get_pointer()`, `global.display` | extension.ts, mouseTracking.ts, spotlight.ts, activationController.ts, gestureFeedback.ts | Position, modifier mask, fullscreen and monitor geometry |
| `this.dir.get_child('assets')` + `assets/*.svg` | prefs.ts, package.json `postbuild` | About-dialog icon copied into `dist/assets/` |
| `node:test` | test/*.test.mjs | Unit tests for the pure detector and layout math |

---

## 6. Key Data Structures

```typescript
// gestureDetector.ts — input sample with injected time
interface GestureSample { dx: number; dy: number; tMs: number; }

// gestureDetector.ts — thresholds; DEFAULT_GESTURE_CONFIG.minTravelPx = 300,
// MouseTracker injects max(120, sweepPx * reversals) from GSettings
interface GestureConfig {
    reversals: number;             // 3 (2–6 in schema)
    sweepPx: number;               // 90 (40–300)
    windowMs: number;              // 900 (400–1500)
    settleMs: number;              // 180 (80–400)
    cooldownMs: number;            // 1500 (500–4000)
    minTravelPx: number;           // 300 default / 270 with Standard preset
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

// spotlightLayout.ts / spotlight.ts — actor-local rectangles
interface LayoutRect { x: number; y: number; width: number; height: number; }
interface MonitorBox { x: number; y: number; width: number; height: number; }
interface SpotlightLayout { mask: LayoutRect; dims: [LayoutRect, LayoutRect, LayoutRect, LayoutRect]; }

// gestureFeedback.ts — five-entry palette, standard and high-contrast variants
interface RingPalette {
    outline: RingColor; readyOutline: RingColor; progress: RingColor;
    ready: RingColor; empty: RingColor;
}

// practiceService.ts / practiceClient.ts — D-Bus contract
// name + interface: org.gnome.shell.extensions.find_my_mouse.Practice
// path: /org/gnome/shell/extensions/find_my_mouse/Practice
// methods: Start(), Cancel()
// signals: Progress(event: s, progress: i, total: i), Result(success: b, detail: s)
type PracticeProgress = { event: string; progress: number; total: number };
type PracticeResult = { success: boolean; detail: string };

// settings.ts
type NormalizedColor = [number, number, number, number]; // 0–1 floats for Cairo
```

`GestureDetector` retains only `GestureSample` records inside `windowMs`, with per-sweep `sweepSign`, `sweepDistance`, `sweepPeakSpeed` and `sweepSawDip` scalars for hysteresis.

---

## 7. Settings Schema Overview

20 keys in `org.gnome.shell.extensions.find-my-mouse`:

| Key | Type | Default | Page / status |
|---|---|---|---|
| `activation-method` | string | `'shake'` | General — "Shortcut + Mouse Gesture" |
| `find-my-mouse-activation` | string[] | `['<Super>f']` | General — active in gesture mode, unavailable in "Always visible" |
| `gesture-reversals` | int | `3` | Mouse Gesture |
| `gesture-sweep` | int | `90` px | Mouse Gesture |
| `gesture-window` | int | `900` ms | Mouse Gesture |
| `gesture-settle` | int | `180` ms | Mouse Gesture |
| `gesture-cooldown` | int | `1500` ms | Mouse Gesture |
| `gesture-ignore-buttons` | bool | `true` | Mouse Gesture |
| `gesture-ignore-fullscreen` | bool | `true` | Mouse Gesture |
| `gesture-sound` | bool | `false` | Mouse Gesture |
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
| GameMode D-Bus unavailable | Proxy retries after 5 s and 10 s, then stops at retry count 3; `isActive` stays false |
| Missing/invalid colors | `parseColor()` fallback `[0, 0, 0, defaultAlpha]` before normalization |
| Null Cairo context | Guard `if (!cr) return;` in both repaint handlers |
| Stale zoom/fade callbacks | Stop/clear `Clutter.Timeline` before show and on hide; `queueRepaint()` cancels a fade ease; `hide()` removes transitions |
| Pointer jump / monitor switch | Detector aborts on step >250 px; fullscreen focus changes abort via adapter guards |
| Gesture pause mid-attempt | No sample for >400 ms aborts; 16 ms clock provides settle ticks while active |
| Settings change during attempt | `updateConfig()` rebuilds detector config and stops the settle clock; mode change cancels practice |
| `disable()` while pointerWatcher import is pending | Re-check `_enabled` after `await setup()` and remove the watch |
| Practice D-Bus service unavailable | Client retries proxy creation 10× at 500 ms and falls back to text-only instructions; no crash |
| Extension reloads during practice | Bus name is lost, service ends the session; client tolerates the signal and can retry |
| Two prefs windows open | `PracticeService` is the single session owner; terminal events end the session for all clients |
| Practice watchdog fires (10 s) | `_finish(false, 'timeout')` clears the timer, emits `Result`, restores normal activation |
| Cancel / dialog destroy / prefs close | Client calls `Cancel()` (or bus loss is detected); service emits `Result(false, …)` and resets |
| High contrast toggled | `SpotlightManager` restyles dim actors and repaints the mask; `GestureFeedback` reads its palette on each repaint |
| Reduced animation requested | `_animationsEnabled()` skips zoom and fade; actors are destroyed synchronously on hide |

---

## 9. Performance Considerations

1. `GestureDetector` retains only samples within `gesture-window`; no unbounded history.
2. The 16 ms settle clock exists only while a gesture is `tracking` or `ready`.
3. Cairo contexts are disposed in every `repaint` handler.
4. Idle-timeout refreshes are skipped for pointer deltas below 5 px; duplicate coordinates are skipped in `SpotlightManager.updateMousePosition()`.
5. `ActivationController` clears the idle timeout on every reset/hide.
6. `GestureFeedback` creates a 40×40 actor only during an attempt and destroys it immediately afterward.
7. The spotlight dim area is four `St.Widget` actors; only the pointer-local mask is rasterised by Cairo, and it is clipped to the monitor so zoom never rasterises off-screen pixels. `_pointerPosition()` uses cached coordinates to avoid a GI round-trip per repaint, and `_updateDimColor()` skips CSS restyling when the computed string is unchanged.
8. `SettingsManager.cacheSettings()` avoids repeated GI reads on hot paths; `isLogLevelEnabled()` guards expensive debug string formatting.

---

## 10. Testing & Validation Points

| Concern | Validation Method | Relevant File |
|---|---|---|
| Gesture state machine | `npm test` → `node --test test/*.test.mjs`; synthesized pointer streams cover a 3 Hz wave + stop (activation), jitter, circular motion, monotonic drags, large jumps, cooldown, pause >400 ms, `setConfig()` reset, slow small pointer steps (three ~30 px steps 1500 ms apart, no activation) and a 900 ms/180 ms gesture (activation) | `test/gestureDetector.test.mjs`, `src/gestureDetector.ts` |
| Spotlight layout | `npm test` → mask/dim tiling, negative monitor origins, corner clipping, zoom larger than monitor, fractional radius and zero ring width | `test/spotlightLayout.test.mjs`, `src/spotlightLayout.ts` |
| Type correctness | `npm run check` (`tsc --noEmit`) | `tsconfig.json` |
| Lint | `npm run lint` | `eslint.config.js` |
| Schema syntax | `xmllint` + `glib-compile-schemas` | `schemas/*.xml` |
| Metadata validity | CI Python validator | `metadata.json` |
| Runtime behavior | Nested Wayland session (`--devkit` on GNOME 49+) and `journalctl` | `AGENTS.md`, `docs/codebase/TESTING.md` |
