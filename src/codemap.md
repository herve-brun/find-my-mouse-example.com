# src/ — Find My Mouse Extension Source

> **Lines of code**: ~1,361 across 7 modules  
> **Runtime**: GNOME Shell 46–50 (Wayland)  
> **Language**: TypeScript → compiled to `dist/*.js`  
> **Rendering**: Cairo-only via `St.DrawingArea` with `Clutter.Timeline` zoom animation

---

## 1. Core Responsibilities

### 1.1 Spotlight Rendering
Render a circular spotlight that follows the mouse cursor. Single Cairo rendering path:
- **Cairo path** (`SpotlightManager._onRepaint`): Uses `St.DrawingArea` with Cairo operations (`Cairo.Operator.CLEAR` to punch a hole, `Cairo.Operator.OVER` to draw the ring). Combined with a `Clutter.Timeline`-based zoom animation (`_startZoomAnimation()`) that shrinks from initial zoom to final radius.

### 1.2 Activation Management
Two activation methods managed by `FindMyMouseExtension`:
- **Mouse shake** (`MouseTracker.detectShake`): Algorithm comparing total distance travelled vs. bounding rectangle diagonal over a time window.
- **Always visible** (`FindMyMouseExtension._setupAlwaysVisible`): Spotlight shown on enable, never hidden by idle timeout.

### 1.3 Idle Timeout & Auto-Hide
`SpotlightManager._resetIdleTimeout()`: When the mouse stops moving, a `GLib.timeout_add` callback hides the spotlight after `idle-timeout` ms. Disabled in "always visible" mode.

### 1.4 Game Mode Integration
`GameModeClient`: DBus proxy to `com.feralinteractive.GameMode`. Monitors `ClientCount` property. When Game Mode activates and `do-not-activate-gamemode` is enabled, the spotlight is suppressed. Includes exponential-backoff retry (3 attempts, up to 20s delay).

### 1.5 Preferences UI
`FindMyMousePreferences` (extends `ExtensionPreferences`): Full GTK4/Adwaita preferences with 5 pages (General, Appearance, Timing, Shake Detection, About). Includes color pickers, spin rows, combo rows, and per-page reset-to-defaults.

### 1.6 Settings Caching & Normalization
`SettingsManager`: Wraps `Gio.Settings`, caches all values on construction and on `changed` signals. Normalizes colors to `[0,1]` float range for Cairo consumption. Parses hex (`#RRGGBBAA`) color strings.

### 1.7 Logging & Diagnostics
`utils.ts`: Module-level log level (`currentLogLevel`), filtered `console.log` output with level prefix (`[ERROR]`, `[WARN]`, `[INFO]`, `[DEBUG]`). Log level changeable at runtime via GSettings `log-level` key.

### 1.8 Multi-Monitor Support
`SpotlightManager._getMonitorGeometry()`: When `show-on-all-monitors` is true, calculates the bounding box of all monitors via `global.display.get_n_monitors()` / `get_monitor_geometry()`. Otherwise uses `global.display.get_current_monitor()` geometry.

---

## 2. Design Patterns

### 2.1 Strategy Pattern — Activation Methods
Two activation strategies (shake, always) are selected via GSettings `activation-method`. The extension dispatches to the appropriate subsystem. When the method changes at runtime, all previous handlers are torn down and the new ones set up.

### 2.2 Observer Pattern — GSettings Change Signals
The extension connects ~5 GSettings `changed::*` signal handlers to react to preference changes. Each updates the relevant cached value and triggers `queueRepaint()` on the spotlight. The `GameModeClient` also implements observer-style `onStateChanged` / `offStateChanged` / `clearStateChangedHandlers`.

```typescript
// settings.ts — observes specific key changes
this._settings.connect('changed::do-not-activate-gamemode', () => {
    this._cachedDoNotActivateInGameMode = this._settings.get_boolean('do-not-activate-gamemode');
});
```

### 2.3 Facade Pattern — FindMyMouseExtension
The `Extension` subclass acts as a facade over the four subsystem managers (`SettingsManager`, `SpotlightManager`, `MouseTracker`, `GameModeClient`). The extension's `enable()`/`disable()` orchestrate creation and teardown. The `_toggleSpotlight()` and `_showSpotlight()` methods coordinate policy (GameMode check, method check) before delegating to `SpotlightManager`.

### 2.4 Proxy Pattern — GameMode DBus
`GameModeClient` wraps `Gio.DBusProxy` providing a simplified interface (`isActive`, `onStateChanged`, `setup`) and hiding asynchronous initialization, retry logic, and DBus property monitoring.

### 2.5 Module-Level Singleton — Logging State
The log level (`currentLogLevel`) is maintained as a module-level variable in `utils.ts`. Multiple modules import `setLogLevel`, `debugLog`, and `LogLevel`, all sharing the same mutable state. This avoids passing a logger instance through the dependency chain.

---

## 3. Architecture

### 3.1 Module Dependency Graph

```
┌────────────────────────────────────────────────────────────────────┐
│                       FindMyMouseExtension                         │
│                      (extension.ts — 246 lines)                    │
│  Facade: create, configure, teardown all subsystems                │
└────┬───────┬───────┬──────┬───────────────────────────────────────┘
     │       │       │      │
     ▼       ▼       ▼      ▼
┌────────┐ ┌────────────┐ ┌──────────┐ ┌──────────────┐
│Settings│ │Spotlight   │ │Mouse     │ │GameMode      │
│Manager │ │Manager     │ │Tracker   │ │Client        │
│settings│ │spotlight.ts│ │mouse     │ │gamemode      │
│.ts     │ │            │ │Tracking │ │Client.ts     │
└───┬────┘ └──┬─────────┘ │.ts       │ └──────┬───────┘
    │         │           └────┬─────┘        │
    │         │                │              │
    └─────────┼────────────────┼──────────────┘
              │                │
              ▼                ▼
        ┌──────────────────────────────┐
        │         utils.ts             │
        │  (log, color, utilities)     │
        └──────────────────────────────┘
```

**Dependency direction** (→ means "imports from"):
- `extension.ts` → `settings.ts`, `spotlight.ts`, `mouseTracking.ts`, `gamemodeClient.ts`, `utils.ts`
- `spotlight.ts` → `settings.ts`, `utils.ts`
- `mouseTracking.ts` → `settings.ts`, `utils.ts`
- `gamemodeClient.ts` → `utils.ts`
- `prefs.ts` → `utils.ts`
- `settings.ts` → `utils.ts`

**No circular dependencies.** The graph is a clean tree rooted at `extension.ts`, with `utils.ts` as the shared leaf.

### 3.2 Class Hierarchy

```
GNOME Shell
  └── Extension (resource:///org/gnome/shell/extensions/extension.js)
       └── FindMyMouseExtension           [extension.ts]
             Fields:
               - _settingsManager: SettingsManager
               - _spotlightManager: SpotlightManager
               - _mouseTracker: MouseTracker
               - _gameModeClient: GameModeClient
               - 5 GSettings signal handler IDs
               - _lastMoveX, _lastMoveY: number
               - _gameModeAvailable: boolean

Plain TypeScript Classes:
  ├── SettingsManager                     [settings.ts]
  │     Fields: _settings (Gio.Settings), 12 cached properties
  ├── SpotlightManager                    [spotlight.ts]
  │     Fields: _spotlight (St.DrawingArea), _spotlightVisible,
  │             _idleTimeoutId, _zoomTimeline, _currentZoom
  ├── MouseTracker                        [mouseTracking.ts]
  │     Fields: _pointerWatch, _lastX/Y, _movementHistory[]
  ├── GameModeClient                      [gamemodeClient.ts]
  │     Fields: _proxy (Gio.DBusProxy), _clientCount, 
  │             _stateChangedHandlers[]
  └── (prefs.ts)
        └── ExtensionPreferences
             └── FindMyMousePreferences
```

### 3.3 File Size Distribution

```
prefs.ts           499 lines (36.7%)  — Preferences UI (largest by far)
spotlight.ts       260 lines (19.1%)  — Spotlight manager (Cairo + zoom animation)
extension.ts       246 lines (18.1%)  — Extension lifecycle and orchestration
mouseTracking.ts   127 lines  (9.3%)  — Pointer tracking + shake detection
gamemodeClient.ts   99 lines  (7.3%)  — GameMode DBus integration
settings.ts         93 lines  (6.8%)  — Settings caching and parsing
utils.ts            37 lines  (2.7%)  — Shared utilities
                   ─────
         Total:  ~1,361 lines
```

---

## 4. Data & Control Flow

### 4.1 Extension Lifecycle Flow

```
GNOME Shell loads extension
         │
         ▼
constructor(metadata)
  - Initialize all managers to null
  - Set _gameModeAvailable = false
         │
         ▼
async enable()
  ├── getSettings() → Gio.Settings
  ├── setLogLevel() from settings
  ├── Connect 'changed::log-level' signal
  ├── new GameModeClient().setup()
  │     └── DBus async init → callback on connect/fail
  ├── new SettingsManager(settings)
  ├── new SpotlightManager(settingsManager)
  ├── Connect 'changed::spotlight-ring-width'
  ├── new MouseTracker(settings, callback)
  ├── Connect 'changed' (catch-all) and 'changed::activation-method'
  ├── await this._mouseTracker.setup()
  ├── this._setupAlwaysVisible()
         │
         ▼
disable()
  ├── this._mouseTracker.remove()
  ├── this._removeAlwaysVisible()
  ├── Disconnect all 5 GSettings signal IDs
  ├── this._spotlightManager.destroyImmediately()
  ├── Null all managers
  ├── GameModeClient cleanup: clear handlers, dispose proxy
```

### 4.2 Mouse Movement → Spotlight Update Flow

```
PointerWatcher (16ms polling)
         │
         ▼
MouseTracker._pointerWatch callback(x, y)
         │
         ▼
FindMyMouseExtension._handleMouseMovement(x, y)
         │
         ├──▶ SpotlightManager.updateMousePosition(x, y)
         │       └── [Cairo]: St.DrawingArea.queue_repaint()
         │             └── _onRepaint() signal
         │                   ├── cr = area.get_context()
         │                   ├── Cairo.Operator.SOURCE → dim background
         │                   ├── Cairo.Operator.CLEAR → punch spotlight hole
         │                   ├── Cairo.Operator.OVER → draw ring arc
         │                   └── cr.$dispose()
         │
         ├──▶ Check movement delta ≥ 5px → queueRepaint()
         │
         └──▶ [If method === 'shake']: MouseTracker.detectShake(x, y)
               ├── Push {dx, dy, tick} to _movementHistory
               ├── Slice history to shake-interval window
               ├── Compute totalDistanceSquared vs diagonalSquared
               └── If ratio > (sensitivity/100)² → _toggleSpotlight()
```

### 4.3 Activation Method Dispatch Flow

```
[method === 'shake']: MouseTracker detects shake → _toggleSpotlight()
[method === 'always']: _setupAlwaysVisible() or method change → _showSpotlight()

                  │
                  ▼
         FindMyMouseExtension._toggleSpotlight()
                  │
         ┌────────┴────────────┐
         ▼                     ▼
   [method === 'always']  [method === 'shake']
         │                     │
         ▼                     ▼
   _showSpotlight()      [toggle]:
   if not visible;       if visible → _spotlightManager.hide()
   return                if hidden  → _showSpotlight()
                                       │
                                       ▼
                              _showSpotlight()
                                ├── [GameMode check]:
                                │     doNotActivateInGameMode
                                │     && gameModeAvailable
                                │     && gameModeActive
                                │     → hide(); return
                                │
                                ├── _spotlightManager.show(showOnAllMonitors)
                                │     ├── _getMonitorGeometry()
                                │     ├── new St.DrawingArea(geometry)
                                │     ├── Connect 'repaint' → Cairo rendering
                                │     ├── _startZoomAnimation()
                                │     ├── Main.uiGroup.add_child()
                                │     ├── _resetIdleTimeout()
                                │     └── _spotlightVisible = true
                                │
                                └── global.get_pointer() → initial position
                                └── _spotlightManager.updateMousePosition()

Idle timeout fires:
  _resetIdleTimeout() → GLib.timeout_add(idleTimeout, hide)
```

### 4.4 Settings Change → Cache Update → Repaint Flow

```
User changes setting in Preferences UI
         │
         ▼
Gio.Settings key changed (D-Bus signal)
         │
         ▼
SettingsManager 'changed::*' handler
         │
         ├── [settings.ts handler] 
         │     └── _cachedDoNotActivateInGameMode = settings.get_boolean(...)
         │
         └── [extension.ts handler]
               ├── this._settingsManager.cacheSettings()
               └── this._spotlightManager.queueRepaint()
                     └── _spotlight.queue_repaint() // Cairo only

          [If 'changed::activation-method']
                ├── cacheSettings()
                ├── _mouseTracker.remove()
                ├── _mouseTracker.setup()
                ├── [if 'always']: _showSpotlight()
                └── [if not 'always' && visible]: hide()
```

### 4.5 GameMode State Change Flow

```
Game Mode starts/stops (e.g., game launches/exits)
         │
         ▼
DBus signal: com.feralinteractive.GameMode
  PropertiesChanged: ClientCount updated
         │
         ▼
GameModeClient._onPropertiesChanged()
  ├── Extract ClientCount from changed properties
  ├── Determine active = clientCount > 0
  └── _emitStateChanged(active)
         │
         ▼
FindMyMouseExtension GameMode handler (registered via onStateChanged)
  ├── Set globalThis.FindMyMouseGameModeAvailable = true
  │
  ├── [if active && doNotActivateInGameMode && spotlight visible]
  │     → _spotlightManager.hide()    // Suppress spotlight
  │
  └── [if !active && method === 'always' && spotlight hidden]
        → _showSpotlight()             // Restore always-visible
```

### 4.6 Shake Detection Algorithm Flow

```
MouseTracker.detectShake(x, y)
         │
         ├── First call → set _lastX/Y, return false
         │
         ├── Compute dx = x - _lastX, dy = y - _lastY
         │
         ├── Push {dx, dy, tick: monotonic_time_ms} → _movementHistory
         │
         ├── Trim history to max 100 entries
         │
         ├── Determine cutoff time = now - shakeInterval
         │     └── Slice off entries older than cutoff
         │
         ├── Compute metrics from movementHistory:
         │     ├── totalDistanceSquared = Σ(dx² + dy²)
         │     ├── track cumulative position (x, y)
         │     ├── minX, maxX, minY, maxY → rectWidth, rectHeight
         │     └── diagonalSquared = rectWidth² + rectHeight²
         │
         ├── Decision:
         │     shakeFactor = sensitivity / 100
         │     threshold = shakeFactor²
         │     if diagonalSquared > 0 
         │        AND totalDistanceSquared / diagonalSquared > threshold:
         │         → SHAKE DETECTED
         │           ├── Clear history
         │           ├── Reset _lastX/Y to -1
         │           └── return true
         │
         └── Update _lastX/Y → return false
```

### 4.7 Zoom Animation Flow

```
_startZoomAnimation() called during show()
         │
         ├── Read cachedAnimationDuration and cachedZoom from SettingsManager
         │
         ├── Cancel any in-progress zoom timeline
         │
         ├── Set _currentZoom = initialZoom (large value)
         │
         ├── Create Clutter.Timeline({ duration })
         │     └── set_actor(this._spotlight)
         │
         ├── Connect 'new-frame' callback:
         │     └── Compute linear progress → easeOutQuad(t) → _currentZoom
         │           _currentZoom = 1 + (initialZoom - 1) * (1 - eased)
         │           → queue_repaint() on each frame
         │
         ├── Connect 'stopped' callback:
         │     └── If finished: set _currentZoom = 1, queue_repaint()
         │
         └── timeline.start()
```

---

## 5. Integration Points (GNOME Shell & System APIs)

### 5.1 GNOME Shell Extension API (5 APIs)

| # | API | Module | Usage |
|---|-----|--------|-------|
| 1 | `Extension` class | `extension.ts:1` | Base class for `FindMyMouseExtension` |
| 2 | `Extension.getSettings()` | `extension.ts:40` | Obtains `Gio.Settings` for the extension's schema |
| 3 | `ExtensionPreferences` class | `prefs.ts:12` | Base class for `FindMyMousePreferences` |
| 4 | `Main.uiGroup.add_child()` | `spotlight.ts:83` | Adds `St.DrawingArea` to the UI stack |
| 5 | `pointerWatcher` (dynamic import) | `mouseTracking.ts:33` | `getPointerWatcher().addWatch(16ms, callback)` — high-frequency mouse tracking |

### 5.2 Clutter API (3 APIs)

| # | API | Module | Usage |
|---|-----|--------|-------|
| 6 | `Clutter.Timeline` | `spotlight.ts:128` | Zoom animation timeline for spotlight shrink effect |
| 7 | `Clutter.AnimationMode.EASE_OUT_QUAD` | `spotlight.ts:184` | Easing mode for spotlight fade-out |
| 8 | `global.get_pointer()` | `spotlight.ts:235`, `extension.ts:240` | Get current mouse coordinates (used in Cairo repaint and initial show) |

### 5.3 Meta/Mutter API (1 API)

| # | API | Module | Usage |
|---|-----|--------|-------|
| 9 | `global.display.get_monitor_geometry()` / `get_n_monitors()` / `get_current_monitor()` | `spotlight.ts:46-59` | Monitor geometry computation for multi-monitor |

### 5.4 St/Shell Toolkit API (2 APIs)

| # | API | Module | Usage |
|---|-----|--------|-------|
| 10 | `St.DrawingArea` | `spotlight.ts:72` | Cairo-rendered full-screen overlay widget |
| 11 | `St.DrawingArea.get_context()` | `spotlight.ts:232` | Obtain Cairo context for repaint |

### 5.5 GObject/GLib API (3 APIs)

| # | API | Module | Usage |
|---|-----|--------|-------|
| 12 | `GLib.timeout_add()` | `spotlight.ts:219` | Idle timeout callback for auto-hide |
| 13 | `GLib.get_monotonic_time()` | `mouseTracking.ts:63` | High-resolution timestamp for shake detection |
| 14 | `GLib.source_remove()` | `spotlight.ts:165`, `spotlight.ts:200` | Cancel idle timeout |

### 5.6 GIO/DBus API (3 APIs)

| # | API | Module | Usage |
|---|-----|--------|-------|
| 15 | `Gio.Settings.get_*` / `set_*` / `bind` | `settings.ts`, `prefs.ts` | Reading/writing all 14+ extension preferences |
| 16 | `Gio.Settings.connect('changed::*')` | `extension.ts`, `settings.ts` | Reacting to preference changes at runtime |
| 17 | `Gio.DBusProxy.new()` / `Gio.DBusNodeInfo` | `gamemodeClient.ts:19-38` | Asynchronous DBus connection to GameMode service |

### 5.7 GTK4/Adwaita API (9 APIs)

| # | API | Module | Usage |
|---|-----|--------|-------|
| 18 | `Adw.PreferencesWindow` | `prefs.ts:17` | The main preferences window |
| 19 | `Adw.PreferencesPage` | `prefs.ts:22` | Five preference pages |
| 20 | `Adw.PreferencesGroup` | `prefs.ts:28` | Grouping related preferences |
| 21 | `Adw.ComboRow` | `prefs.ts:34` | Dropdown for activation method, log level |
| 22 | `Adw.SpinRow` | `prefs.ts:133` | Numeric inputs for radius, zoom, timeout, etc. |
| 23 | `Adw.SwitchRow` | `prefs.ts:58` | Toggle for GameMode suppression, multi-monitor |
| 24 | `Adw.ActionRow` | `prefs.ts:86` | For color pickers, about button, reset rows |
| 25 | `Adw.AboutWindow` | `prefs.ts:442` | About dialog with release notes |
| 26 | `Gtk.ColorButton` | `prefs.ts:119` | Color pickers with alpha support |

### 5.8 Cairo API (5 APIs)

| # | API | Module | Usage |
|---|-----|--------|-------|
| 27 | `Cairo.Context` (`cr`) | `spotlight.ts:232` | Cairo rendering context from `St.DrawingArea` |
| 28 | `Cairo.Operator.SOURCE` | `spotlight.ts:241` | Dim background overlay |
| 29 | `Cairo.Operator.CLEAR` | `spotlight.ts:246` | Punch transparent hole for spotlight |
| 30 | `Cairo.Operator.OVER` | `spotlight.ts:251` | Draw spotlight ring arc |
| 31 | `cr.arc()` / `cr.fill()` / `cr.stroke()` | `spotlight.ts:247-256` | Circle geometry for spotlight hole and ring |

**Total distinct GNOME/System APIs documented: 31**

---

## 6. Key Data Structures

### 6.1 `MonitorGeometry` (interface)
```typescript
interface MonitorGeometry {
    x: number;      // Offset from origin (negative for left monitors)
    y: number;      // Offset from origin
    width: number;  // In physical pixels
    height: number; // In physical pixels
}
```
Used by: `SpotlightManager._getMonitorGeometry()`

### 6.2 `MovementRecord` (interface)
```typescript
interface MovementRecord {
    dx: number;     // X delta since last sample
    dy: number;     // Y delta since last sample
    tick: number;   // Monotonic time in milliseconds (GLib.get_monotonic_time() / 1000)
}
```
Used by: `MouseTracker._movementHistory[]` — up to 100 records for shake detection

### 6.3 `StateChangeHandler` (type alias)
```typescript
type StateChangeHandler = (active: boolean) => void;
```
Used by: `GameModeClient._stateChangedHandlers[]` for observer notification

### 6.4 Normalized Color Tuple
```typescript
type NormalizedColor = [number, number, number, number];
// Each component in range [0, 1] for Cairo consumption
// [red, green, blue, alpha]
```
Used by: `SettingsManager` cached colors, Cairo `setSourceRGBA`

---

## 7. Settings Schema Overview

The extension defines 14 GSettings keys in `org.gnome.shell.extensions.find-my-mouse`:

| Key | Type | Default | Page |
|-----|------|---------|------|
| `activation-method` | string | `'shake'` | General |
| `show-on-all-monitors` | bool | `false` | General |
| `do-not-activate-gamemode` | bool | `true` | General |
| `log-level` | int | `2` (INFO) | About |
| `background-color` | string | `'#00000080'` | Appearance |
| `spotlight-color` | string | `'#FFFFFF80'` | Appearance |
| `spotlight-radius` | int | `100` | Appearance |
| `spotlight-zoom` | double | `9.0` | Appearance |
| `spotlight-ring-width` | int | `2` | Appearance |
| `idle-timeout` | int | `1000` | Timing |
| `animation-duration` | int | `500` | Timing |
| `shake-interval` | int | `1000` | Shake Detection |
| `shake-sensitivity` | int | `400` | Shake Detection |
| `excluded-apps` | string[] | `[]` | (unused in code) |

---

## 8. Error Handling & Edge Cases

| Scenario | Handling | Location |
|----------|----------|----------|
| GameMode DBus service unavailable | Exponential backoff retry (3 attempts, 5s→10s→20s) | `gamemodeClient.ts:49-65` |
| Missing/invalid color strings | `parseColor` returns `[0,0,0,255]` default | `utils.ts:26-34`, `settings.ts:48-52` |
| `St.DrawingArea.get_context()` returns null | Guard clause: `if (!cr) return;` | `spotlight.ts:233` |
| Idle timeout fires after spotlight already hidden | `_idleTimeoutId` set to 0 after `hide()` — harmless `GLib.source_remove(0)` | `spotlight.ts:164-167` |
| Activation method changes at runtime | Full teardown and re-setup of mouse and always-visible handlers | `extension.ts:142-155` |
| Zoom timeline callback fires after teardown | Safety null check: `if (!this._zoomTimeline) return;` | `spotlight.ts:132` |

---

## 9. Performance Considerations

1. **Shake detection history capped at 100 entries** — prevents unbounded memory growth during prolonged shaking.

2. **Cairo context disposal** — each `_onRepaint` call explicitly disposes the Cairo context via `cr.$dispose()` to prevent resource leaks.

3. **Movement delta threshold (5px)** — `_handleMouseMovement` skips `queueRepaint()` for sub-5px movements, reducing GPU work.

4. **Zoom animation timeline safely cancelled** — `hide()` and `destroyImmediately()` stop the `Clutter.Timeline` to prevent frame callbacks on destroyed actors.

5. **GObject lifecycle** — `disable()` nulls all manager references and disconnects all signal handlers to allow garbage collection.

6. **GameMode DBus retry with backoff** — prevents flooding the bus with connection attempts when the service is unavailable.

---

## 10. Testing & Validation Points

| Concern | Validation Method | Relevant File |
|---------|-------------------|---------------|
| Type correctness | `tsc --noEmit` | `tsconfig.json` |
| Schema syntax | `xmllint` + `glib-compile-schemas` | `schemas/*.xml` |
| Metadata validity | JSON schema validation | `metadata.json` |
| Conventional commits | `commitlint` + CI | `commitlint.config.cjs` |
| ZIP distribution | CI validates contents (extension.js, prefs.js, gschemas.compiled, metadata.json) | `.github/workflows/release.yml` |
| Runtime logs | `journalctl --user -f | grep "Find My Mouse"` | All modules via `debugLog()` |
| Nested session testing | `dbus-run-session gnome-shell --nested --wayland` | Developer docs |
