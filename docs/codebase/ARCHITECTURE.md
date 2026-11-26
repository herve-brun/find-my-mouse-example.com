# Find My Mouse — Architecture

## Layers

### 1. Extension Core (`src/extension.ts` → `dist/extension.js`)
- **Responsibility**: lifecycle, wiring, and translation of pointer/gesture events into feedback and activation.
- **Key functions**:
  - `enable()`: creates managers (including `PracticeService`), registers the `<Super>f` shortcut, connects settings/GameMode signals, starts the pointer watch.
  - `disable()`: removes the shortcut and pointer watch, disconnects signals, destroys managers and ends any practice session.
  - `_handleMouseMovement()`: forwards absolute position to the spotlight and feedback; notifies activity.
  - `_handleGestureEvent()`: drives `GestureFeedback`; on `activated` calls `ActivationController.activate('gesture')` **unless** a practice session is active, in which case it reports success through `PracticeService`.

### 2. Managers and pure logic

| Component | Source | Responsibility |
|---|---|---|
| `SettingsManager` | `settings.ts` | Caches and normalizes GSettings values. |
| `SpotlightManager` | `spotlight.ts` | Rendering and zoom animation only; no idle timer. Exposes `isVisible` and delegates rectangle math to the import-free `spotlightLayout.ts`. |
| `spotlightLayout.ts` | `spotlightLayout.ts` | Pure mask/dim rectangle computation, unit-tested without GNOME Shell. |
| `MouseTracker` | `mouseTracking.ts` | pointerWatcher adapter; authoritative last pointer position, guards, 16 ms settle clock. |
| `GestureDetector` | `gestureDetector.ts` | Pure "wave then stop" state machine with injected ms timestamps; no imports. |
| `ActivationController` | `activationController.ts` | Show-only activation policy, GameMode suppression, idle timeout. |
| `GestureFeedback` | `gestureFeedback.ts` | ~40×40 pointer-local progress ring; optional confirmation sound. |
| `GameModeClient` | `gamemodeClient.ts` | D-Bus client for `com.feralinteractive.GameMode`. |
| `PracticeService` | `practiceService.ts` | Shell-side practice session: owns the D-Bus name, handles `Start()`/`Cancel()`, emits `Progress`/`Result`, 10 s watchdog. |
| `PracticeClient` | `practiceClient.ts` | Prefs-side `Gio.DBusProxy` for practice; retries, dispatches signals, tolerates extension reload. |

The extension core registers `find-my-mouse-activation` in `extension.ts` with `Main.wm.addKeybinding()` in every activation mode; the callback calls `activate('shortcut')`. Preferences disables the shortcut row in **Always visible** mode.

### 3. Preferences UI (`src/prefs.ts`)
GTK4/Adwaita pages: General, Appearance, Timing, **Mouse Gesture**, About. The Mouse Gesture page has Light/Standard/Firm presets, a "Fine-tune gesture" expander, a live **Practice** row (**Try the Gesture** dialog), and the sound toggle. Practice uses `PracticeClient` to start/cancel a shell-side session and display progress/results; instructions come from current GSettings values, there is no auto-close timer, and a text-only fallback is shown when D-Bus is unavailable. The shortcut row is available in **Shortcut and gesture** mode.

## Patterns

- **State machine**: `GestureDetector` moves `idle → tracking → ready → cooldown`, emitting `none`, `armed`, `progress`, `ready`, `activated`, `aborted`.
- **Adapter**: `MouseTracker` converts absolute pointer samples to deltas with monotonic timestamps; the detector never imports GNOME APIs.
- **Policy/rendering split**: `ActivationController` owns activation and idle timing; `SpotlightManager` renders; `GestureFeedback` shows attempt progress.
- **Singleton managers**: each manager is instantiated once in `extension.ts`'s `enable()`.
- **Event-driven**: pointerWatcher callbacks, GSettings `changed` signals, GameMode state changes, keybinding callback.
- **Caching**: `SettingsManager` caches normalized values; gesture keys are rebuilt into `GestureConfig` on change.
- **Session over D-Bus**: `PracticeService` is the single owner of practice state; `PracticeClient` mirrors it in prefs. Both sides converge on `Result` / session teardown.

## Data Flow

### Activation Flow
1. Trigger: `<Super>f` shortcut, gesture `activated`, or always-visible mode.
2. Both shortcut and gesture call `ActivationController.activate(source)`; activation is show-only.
3. In **Shortcut and gesture** mode, GameMode suppression is checked; a repeat activation refreshes the visible spotlight with `queueRepaint()` and resets the idle timeout.
4. Otherwise `SpotlightManager.show(show-on-all-monitors)` renders via `St.DrawingArea` and Cairo, with a `Clutter.Timeline` zoom. **Always visible** mode shows once and skips the idle timeout.
5. For the gesture/shortcut modes, the idle timeout lives in `ActivationController` and calls `hide()` after `idle-timeout` ms.

### Gesture Flow
1. `pointerWatcher` supplies absolute positions; `MouseTracker` keeps the authoritative last position and computes deltas.
2. `MouseTracker` rejects attempts while a button is held (`gesture-ignore-buttons`), while Ctrl or Alt is held, and in fullscreen (`gesture-ignore-fullscreen`); it also aborts on pointer jumps >250 px per sample or pauses >400 ms. `extension.ts` blocks detection while the spotlight is visible and outside gesture mode (practice sessions are the exception); GameMode suppression is enforced at activation time in `ActivationController`.
3. `GestureDetector.feed()` arms on ≥400 px/s with ≥2:1 horizontal dominance, counts ≥90 px reversals with a speed-dip hysteresis (<20% of peak), requires 3 within 900 ms, then a settle <150 px/s within 180 ms. Cooldown is 1500 ms.
4. The 16 ms clock in `MouseTracker` feeds zero-delta ticks while `tracking`/`ready` so a stationary pointer can settle.

### Settings Flow
1. `prefs.ts` writes GSettings; `changed` signals refresh `SettingsManager`.
2. `MouseTracker.updateConfig()` rebuilds detector config; `ActivationController.refreshIdleTimeout()` and `SpotlightManager.queueRepaint()` apply timing/visual changes.

### Practice Flow
1. The "Try the Gesture" dialog builds instructions from current gesture keys and calls `PracticeClient.Start()`; the client retries proxy creation and can fall back to text-only instructions.
2. `PracticeService.start()` hides any visible spotlight, resets `MouseTracker` and arms a 10 s watchdog.
3. Gesture events still drive the real detector and progress ring; while practice is active the extension calls `practiceService.reportEvent(info)` instead of `ActivationController.activate('gesture')`, so no spotlight appears.
4. `Progress(event, progress, total)` updates the dialog's live status; `activated` produces `Result(true, 'gesture-completed')`.
5. Every terminal path — Result, `Cancel()`, dialog destroy, prefs close, extension disable, bus-name loss, watchdog — ends the session and clears the watchdog; two prefs windows cannot keep a stale session alive.

## Evidence
- `src/extension.ts` (lifecycle, keybinding, event wiring)
- `src/gestureDetector.ts` (pure state machine and thresholds)
- `src/mouseTracking.ts` (adapter, guards, settle clock)
- `src/activationController.ts` (show-only activation and idle timer)
- `src/gestureFeedback.ts` (progress ring, optional sound)
- `src/spotlight.ts`, `src/spotlightLayout.ts`, `test/spotlightLayout.test.mjs` (rendering, pure layout math, tiling tests)
- `src/practiceService.ts`, `src/practiceClient.ts` (practice session and D-Bus proxy)
- `src/prefs.ts` (Mouse Gesture page and practice dialog)
- `schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml` (20 keys)
