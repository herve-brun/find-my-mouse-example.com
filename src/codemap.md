# src/ — Find My Mouse Extension Source

> **Lines of code**: ~2,100+ across 9 modules  
> **Runtime**: GNOME Shell 46–50 (Wayland)  
> **Language**: TypeScript → compiled to `dist/*.js`  
> **Rendering**: Dual-path — GLSL (Shell.GLSLEffect) or Cairo (St.DrawingArea fallback)

---

## 1. Core Responsibilities

### 1.1 Spotlight Rendering
Render a circular spotlight that follows the mouse cursor. Two implementations:
- **GLSL path** (`SpotlightGLSLEffect`): Full-screen fragment shader with 5×5 Gaussian blur, glass morphism, glow, and ring effects. Preferred path when `Shell.GLSLEffect` is available.
- **Cairo path** (`SpotlightManager._onRepaint`): Fallback using `St.DrawingArea` + Cairo operations (`Cairo.Operator.CLEAR` to punch a hole, `Cairo.Operator.OVER` to draw the ring).

### 1.2 Activation Management
Four activation methods managed by `FindMyMouseExtension`:
- **Keyboard shortcut** (`KeybindingManager`): `Main.wm.addKeybinding()` with `Shell.ActionMode.NORMAL`.
- **Mouse shake** (`MouseTracker.detectShake`): Algorithm comparing total distance travelled vs. bounding rectangle diagonal over a time window.
- **Mouse click** (`FindMyMouseExtension._setupClickActivation`): `global.stage` `button-press-event` handler, configurable button (left/middle/right).
- **Always visible** (`FindMyMouseExtension._setupAlwaysVisible`): Spotlight shown on enable, never hidden by idle timeout.

### 1.3 Idle Timeout & Auto-Hide
`SpotlightManager._resetIdleTimeout()`: When the mouse stops moving, a `GLib.timeout_add` callback hides the spotlight after `idle-timeout` ms. Disabled in "always visible" mode.

### 1.4 Game Mode Integration
`GameModeClient`: DBus proxy to `com.feralinteractive.GameMode`. Monitors `ClientCount` property. When Game Mode activates and `do-not-activate-gamemode` is enabled, the spotlight is suppressed. Includes exponential-backoff retry (3 attempts, up to 20s delay).

### 1.5 Preferences UI
`FindMyMousePreferences` (extends `ExtensionPreferences`): Full GTK4/Adwaita preferences with 6 pages (General, Appearance, Timing, Shake Detection, Glass Morphism Effects). Includes shortcut capture dialog, color pickers, spin rows, combo rows, and per-page reset-to-defaults.

### 1.6 Settings Caching & Normalization
`SettingsManager`: Wraps `Gio.Settings`, caches all values on construction and on `changed` signals. Normalizes colors to `[0,1]` float range for Cairo and GLSL uniform consumption. Parses both hex (`#RRGGBBAA`) and `rgba(r,g,b,a)` strings.

### 1.7 Logging & Diagnostics
`utils.ts`: Module-level log level (`currentLogLevel`), filtered `console.log` output with level prefix (`[ERROR]`, `[WARN]`, `[INFO]`, `[DEBUG]`). Log level changeable at runtime via GSettings `log-level` key.

### 1.8 Multi-Monitor Support
`SpotlightManager._getMonitorGeometry()`: When `show-on-all-monitors` is true, calculates the bounding box of all monitors via `global.display.get_n_monitors()` / `get_monitor_geometry()`. Otherwise uses `global.display.get_current_monitor()` geometry.

---

## 2. Design Patterns

### 2.1 Strategy Pattern — Activation Methods
Four activation strategies (shortcut, shake, click, always) are selected via GSettings `activation-method`. The extension dispatches to the appropriate subsystem. When the method changes at runtime, all previous handlers are torn down and the new ones set up.

```typescript
// extension.ts — method change handler reconfigures all subsystems
this._keybindingManager.remove();
this._mouseTracker.remove();
this._removeClickActivation();
this._keybindingManager.setup();
this._mouseTracker.setup();
this._setupClickActivation();
```

### 2.2 Observer Pattern — GSettings Change Signals
The extension connects ~12 GSettings `changed::*` signal handlers to react to preference changes. Each updates the relevant cached value and triggers `queueRepaint()` on the spotlight. The `GameModeClient` also implements observer-style `onStateChanged` / `offStateChanged` / `clearStateChangedHandlers`.

```typescript
// settings.ts — observes specific key changes
this._settings.connect('changed::do-not-activate-gamemode', () => {
    this._cachedDoNotActivateInGameMode = this._settings.get_boolean('do-not-activate-gamemode');
});
```

### 2.3 Facade Pattern — FindMyMouseExtension
The `Extension` subclass acts as a facade over the five subsystem managers (`SettingsManager`, `SpotlightManager`, `MouseTracker`, `KeybindingManager`, `GameModeClient`). The extension's `enable()`/`disable()` orchestrate creation and teardown. The `_toggleSpotlight()` and `_showSpotlight()` methods coordinate policy (GameMode check, method check) before delegating to `SpotlightManager`.

### 2.4 Strategy Pattern — Dual Rendering Pipeline
`SpotlightManager` tries `SpotlightGLSLEffect` first. On failure (e.g., missing OpenGL ES 3.0), it falls back to Cairo rendering. A boolean `_useGLSL` flag routes all operations (mouse position update, repaint, hide) to the active implementation.

```typescript
// spotlight.ts — dual rendering dispatch
updateMousePosition(x, y) {
    if (this._useGLSL && this._glslEffect) {
        this._glslEffect.setMousePosition(x, y);  // GLSL path
    }
    if (!this._useGLSL && this._spotlight) {
        this._spotlight.queue_repaint();  // Cairo path
    }
}
```

### 2.5 Proxy Pattern — GameMode DBus
`GameModeClient` wraps `Gio.DBusProxy` providing a simplified interface (`isActive`, `onStateChanged`, `setup`) and hiding asynchronous initialization, retry logic, and DBus property monitoring.

### 2.6 Module-Level Singleton — Logging State
The log level (`currentLogLevel`) is maintained as a module-level variable in `utils.ts`. Multiple modules import `setLogLevel`, `debugLog`, and `LogLevel`, all sharing the same mutable state. This avoids passing a logger instance through the dependency chain.

### 2.7 Command Pattern — Keybinding Callback
`KeybindingManager` wraps `Main.wm.addKeybinding()` with a stored callback reference (`_toggleSpotlight`). The callback is invoked by the GNOME Shell WM when the shortcut is pressed. The `remove()` / `updateKeybinding()` methods manage the binding lifecycle.

### 2.8 Template Method — GObject Class Registration
`SpotlightGLSLEffect` uses `GObject.registerClass` to define a GObject subclass extending `Shell.GLSLEffect`. It overrides `vfunc_build_pipeline()` to inject the GLSL fragment shader, and `vfunc_paint_target()` to set uniforms before the default painting logic runs.

```typescript
// spotlightEffect.ts — GObject class registration
export const SpotlightGLSLEffect = GObject.registerClass(
    { GTypeName: "RWCSpotlightGLSLEffect" },
    class SpotlightGLSLEffect extends Shell.GLSLEffect {
        vfunc_build_pipeline() { /* injects shader snippet */ }
        vfunc_paint_target(node, paintContext) { /* sets uniforms */ }
    }
);
```

---

## 3. Architecture

### 3.1 Module Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FindMyMouseExtension                         │
│                       (extension.ts — 379 lines)                    │
│  Facade: create, configure, teardown all subsystems                 │
└────┬───────┬───────┬──────┬──────┬─────────────────────────────────┘
     │       │       │      │      │
     ▼       ▼       ▼      ▼      ▼
┌────────┐ ┌────────────┐ ┌──────────┐ ┌────────────────┐ ┌──────────────┐
│Settings│ │Spotlight   │ │Mouse     │ │Keybinding      │ │GameMode      │
│Manager │ │Manager     │ │Tracker   │ │Manager         │ │Client        │
│settings│ │spotlight.ts│ │mouse     │ │keybindings.ts  │ │gamemode      │
│.ts     │ │            │ │Tracking │ │                │ │Client.ts     │
└───┬────┘ └──┬─────────┘ │.ts       │ └───────┬────────┘ └──────┬───────┘
    │         │           └────┬─────┘         │                 │
    │         │                │               │                 │
    │         ▼                │               │                 │
    │  ┌──────────────┐       │               │                 │
    │  │SpotlightGLSL │       │               │                 │
    │  │Effect        │       │               │                 │
    │  │spotlight     │       │               │                 │
    │  │Effect.ts     │       │               │                 │
    │  └──────────────┘       │               │                 │
    │         │               │               │                 │
    └─────────┼───────────────┼───────────────┼─────────────────┘
              │               │               │
              ▼               ▼               ▼
        ┌──────────────────────────────────────────┐
        │            utils.ts (log, color)         │
        │  Shared: LogLevel, debugLog, parseColor  │
        └──────────────────────────────────────────┘
```

**Dependency direction** (→ means "imports from"):
- `extension.ts` → `settings.ts`, `spotlight.ts`, `mouseTracking.ts`, `keybindings.ts`, `gamemodeClient.ts`, `utils.ts`
- `spotlight.ts` → `settings.ts`, `utils.ts`, `spotlightEffect.ts`
- `spotlightEffect.ts` → `settings.ts`, `utils.ts`
- `mouseTracking.ts` → `settings.ts`, `utils.ts`
- `keybindings.ts` → `settings.ts`, `utils.ts`
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
              - _keybindingManager: KeybindingManager
              - _gameModeClient: GameModeClient
              - ~20 GSettings signal handler IDs
              - _lastMoveX, _lastMoveY: number
              - Glass morphism cached values

GObject
  └── Shell.GLSLEffect
       └── SpotlightGLSLEffect             [spotlightEffect.ts]
            Fields:
              - _settings: SettingsManager
              - _mouseX, _mouseY: number
              - _visible: boolean
              - _monitorGeometry: MonitorGeometry | null
              - _refreshRate: number
              - _frameInterval: number

Plain TypeScript Classes:
  ├── SettingsManager                     [settings.ts]
  │     Fields: _settings (Gio.Settings), ~20 cached properties
  ├── SpotlightManager                    [spotlight.ts]
  │     Fields: _spotlight (St.DrawingArea), _glslEffect, _useGLSL, 
  │             _spotlightVisible, _idleTimeoutId
  ├── MouseTracker                        [mouseTracking.ts]
  │     Fields: _pointerWatch, _lastX/Y, _movementHistory[]
  ├── KeybindingManager                   [keybindings.ts]
  │     Fields: _settingsManager, _toggleSpotlight, _keybindingHandler
  ├── GameModeClient                      [gamemodeClient.ts]
  │     Fields: _proxy (Gio.DBusProxy), _clientCount, 
  │             _stateChangedHandlers[]
  └── (prefs.ts)
        └── ExtensionPreferences
             └── FindMyMousePreferences
```

### 3.3 File Size Distribution

```
prefs.ts           782 lines (37%)  — Preferences UI (largest by far)
extension.ts       379 lines (18%)  — Extension lifecycle and orchestration
spotlightEffect.ts 387 lines (18%)  — GLSL shader and GLSLEffect subclass
spotlight.ts       172 lines  (8%)  — Spotlight manager (GLSL + Cairo)
settings.ts        135 lines  (6%)  — Settings caching and parsing
mouseTracking.ts   127 lines  (6%)  — Pointer tracking + shake detection
gamemodeClient.ts   99 lines  (5%)  — GameMode DBus integration
keybindings.ts      58 lines  (3%)  — Keyboard shortcut management
utils.ts            37 lines  (2%)  — Shared utilities
                   ─────
        Total:    ~2,176 lines
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
enable()
  ├── getSettings() → Gio.Settings
  ├── setLogLevel() from settings
  ├── Connect 'changed::log-level' signal
  ├── new GameModeClient().setup()
  │     └── DBus async init → callback on connect/fail
  ├── Read glass morphism settings
  ├── Connect 7 glass morphism/ring 'changed::*' signals
  ├── new SettingsManager(settings)
  ├── new SpotlightManager(settings, glassOpts)
  ├── new MouseTracker(settings, callback)
  ├── new KeybindingManager(settings, toggleCallback)
  ├── Connect 'changed' and 'changed::activation-method'
  ├── this._keybindingManager.setup()
  ├── await this._mouseTracker.setup()
  ├── this._setupClickActivation()
  ├── this._setupAlwaysVisible()
         │
         ▼
disable()
  ├── this._keybindingManager.remove()
  ├── this._mouseTracker.remove()
  ├── this._removeClickActivation()
  ├── this._removeAlwaysVisible()
  ├── Disconnect all 10+ GSettings signal IDs
  ├── this._spotlightManager.hide()
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
         │       ├── [GLSL]: SpotlightGLSLEffect.setMousePosition()
         │       │     ├── update _mouseX, _mouseY
         │       │     ├── _updateRefreshRate() [cached per monitor]
         │       │     └── queue_repaint()
         │       │           └── vfunc_paint_target()
         │       │                 └── set_uniform_float() × 10 uniforms
         │       │                 └── super.vfunc_paint_target()
         │       │
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
User action (varies by method)
         │
         ▼
FindMyMouseExtension._toggleSpotlight()
         │
         ├── [method === 'always'] → _showSpotlight() if not visible; return
         │
         ├── [GameMode check]:
         │     doNotActivateInGameMode && gameModeAvailable && gameModeActive
         │     → _spotlightManager.hide(); return
         │
         └── [toggle]:
               ├── if visible → _spotlightManager.hide()
               └── if hidden  → _showSpotlight()
                                 ├── GameMode re-check
                                 ├── _spotlightManager.show(showOnAllMonitors)
                                 │     ├── _getMonitorGeometry()
                                 │     ├── new St.DrawingArea(geometry)
                                 │     ├── Try new SpotlightGLSLEffect()
                                 │     │     └── On fail → Cairo connect('repaint')
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
         ├── [extension.ts handler ex: 'changed::blur-radius']
         │     ├── this._blurRadius = settings.get_double(...)
         │     ├── this._settingsManager.cacheSettings()
         │     └── this._spotlightManager.queueRepaint()
         │           ├── [GLSL]: _glslEffect.queue_repaint()
         │           └── [Cairo]: _spotlight.queue_repaint()
         │
         └── [If 'changed::activation-method']
               ├── cacheSettings()
               ├── _keybindingManager.remove()
               ├── _mouseTracker.remove()
               ├── _removeClickActivation()
               ├── _keybindingManager.setup()
               ├── _mouseTracker.setup()
               ├── _setupClickActivation()
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

### 4.7 GLSL Shader Pipeline Flow

```
vfunc_build_pipeline() called once during effect construction
         │
         └── Shell.GLSLEffect.add_glsl_snippet(
               SnippetHook.FRAGMENT,
               [uniform declarations],
               [shader body]
             )

vfunc_paint_target(node, paintContext) called each frame
         │
         ├── if !_visible || !_monitorGeometry → return (skip rendering)
         │
         ├── Compute normalized coordinates:
         │     centerX = (mouseX - geom.x) / geom.width
         │     centerY = (mouseY - geom.y) / geom.height
         │     aspectRatio = geom.height / geom.width
         │     radius = cachedRadius / geom.width
         │     ringHalfWidth = (ringWidth / 2) / geom.width
         │
         ├── Set 10 uniforms via set_uniform_float():
         │     1. spotlightCenter (vec4)
         │     2. spotlightRadius (float)
         │     3. bgColor (vec4)
         │     4. spotlightColor (vec4)
         │     5. aspectRatio (float)
         │     6. blurRadius (float)
         │     7. glassOpacity (float)
         │     8. glowColor (vec4)
         │     9. glassTint (vec4)
         │    10. glassMorphismEnabled (float)
         │    11. ringHalfWidth (float)
         │
         └── super.vfunc_paint_target(node, paintContext)

Shader fragment execution (per pixel):
         │
         ├── Transform coord by aspect ratio
         ├── Compute distance from spotlight center
         │
         ├── Inside spotlight (dist < radius):
         │     ├── [glassMorphism]: 5×5 Gaussian blur + noise
         │     └── [no glass]: vec4(0,0,0,0) transparent
         │
         ├── Outside spotlight:
         │     └── tintedBg = mix(bgColor, glassTint, glassTint.a)
         │     └── vec4(tintedBg, bgColor.a * 0.7)
         │
         ├── Ring (dist ≈ radius):
         │     └── mix current color with spotlightColor based on ring width
         │
         └── Glow (outside, glass enabled):
               └── exponential falloff: exp(-gd * 8.0)
               └── mix current color with glowColor
```

---

## 5. Integration Points (GNOME Shell & System APIs)

### 5.1 GNOME Shell Extension API (8 APIs)

| # | API | Module | Usage |
|---|-----|--------|-------|
| 1 | `Extension` class | `extension.ts:1` | Base class for `FindMyMouseExtension` |
| 2 | `Extension.getSettings()` | `extension.ts:62` | Obtains `Gio.Settings` for the extension's schema |
| 3 | `ExtensionPreferences` class | `prefs.ts:12` | Base class for `FindMyMousePreferences` |
| 4 | `Main.uiGroup.add_child()` | `spotlight.ts:82` | Adds `St.DrawingArea` to the UI stack |
| 5 | `Main.wm.addKeybinding()` | `keybindings.ts:29` | Registers a system-level keyboard shortcut |
| 6 | `Main.wm.removeKeybinding()` | `keybindings.ts:48` | Unregisters the keyboard shortcut |
| 7 | `Main.layoutManager.monitors` | `spotlightEffect.ts:90` | Access monitor list for refresh rate detection |
| 8 | `pointerWatcher` (dynamic import) | `mouseTracking.ts:33` | `getPointerWatcher().addWatch(16ms, callback)` — high-frequency mouse tracking |

### 5.2 Clutter API (4 APIs)

| # | API | Module | Usage |
|---|-----|--------|-------|
| 9 | `Clutter.Actor` | `spotlightEffect.ts:36` | Parent actor for `GLSLEffect` |
| 10 | `Clutter.Event` / `Clutter.EVENT_STOP` / `Clutter.EVENT_PROPAGATE` | `extension.ts:240-242` | Event propagation control in click activation handler |
| 11 | `global.stage.connect('button-press-event')` | `extension.ts:231` | Mouse click detection for click activation method |
| 12 | `global.get_pointer()` | `spotlight.ts:154`, `extension.ts:373` | Get current mouse coordinates (used in Cairo repaint and initial show) |

### 5.3 Meta/Mutter API (4 APIs)

| # | API | Module | Usage |
|---|-----|--------|-------|
| 13 | `Meta.KeyBindingFlags.NONE` | `keybindings.ts:32` | Keybinding configuration flag |
| 14 | `Meta.MonitorManager.get()` | `spotlightEffect.ts:204-205` | Alternative refresh rate detection API |
| 15 | `global.backend.get_monitor_manager()` | `spotlightEffect.ts:188-189` | Secondary refresh rate detection via backend |
| 16 | `global.display.get_monitor_geometry()` / `get_n_monitors()` / `get_current_monitor()` | `spotlight.ts:41-53` | Monitor geometry computation for multi-monitor |

### 5.4 St/Shell Toolkit API (3 APIs)

| # | API | Module | Usage |
|---|-----|--------|-------|
| 17 | `St.DrawingArea` | `spotlight.ts:60` | Cairo-rendered full-screen overlay widget |
| 18 | `St.DrawingArea.get_context()` | `spotlight.ts:146` | Obtain Cairo context for repaint |
| 19 | `Shell.GLSLEffect` | `spotlightEffect.ts:26` | Base class for GLSL-based spotlight effect |
| 20 | `Shell.ActionMode.NORMAL` | `keybindings.ts:28` | Keybinding action mode |
| 21 | `Shell.SnippetHook.FRAGMENT` | `spotlightEffect.ts:262` | Shader injection hook point |

### 5.5 GObject/GLib API (3 APIs)

| # | API | Module | Usage |
|---|-----|--------|-------|
| 22 | `GObject.registerClass()` | `spotlightEffect.ts:24` | Registers `SpotlightGLSLEffect` as a proper GObject class |
| 23 | `GLib.timeout_add()` | `spotlight.ts:132` | Idle timeout callback for auto-hide |
| 24 | `GLib.get_monotonic_time()` | `mouseTracking.ts:63` | High-resolution timestamp for shake detection |
| 25 | `GLib.source_remove()` | `spotlight.ts:111`, `spotlight.ts:128` | Cancel idle timeout |

### 5.6 GIO/DBus API (3 APIs)

| # | API | Module | Usage |
|---|-----|--------|-------|
| 26 | `Gio.Settings.get_*` / `set_*` / `bind` | `settings.ts`, `prefs.ts` | Reading/writing all 20+ extension preferences |
| 27 | `Gio.Settings.connect('changed::*')` | `extension.ts`, `settings.ts` | Reacting to preference changes at runtime |
| 28 | `Gio.DBusProxy.new()` / `Gio.DBusNodeInfo` | `gamemodeClient.ts:19-38` | Asynchronous DBus connection to GameMode service |

### 5.7 GTK4/Adwaita API (10 APIs)

| # | API | Module | Usage |
|---|-----|--------|-------|
| 29 | `Adw.PreferencesWindow` | `prefs.ts:17` | The main preferences window |
| 30 | `Adw.PreferencesPage` | `prefs.ts:21` | Six preference pages |
| 31 | `Adw.PreferencesGroup` | `prefs.ts:27` | Grouping related preferences |
| 32 | `Adw.ComboRow` | `prefs.ts:33` | Dropdown for activation method, click button, log level |
| 33 | `Adw.SpinRow` | `prefs.ts:378` | Numeric inputs for radius, zoom, timeout, etc. |
| 34 | `Adw.SwitchRow` | `prefs.ts:226` | Toggle for GameMode suppression, multi-monitor, glass morphism |
| 35 | `Adw.ActionRow` | `prefs.ts:61` | For color pickers, about button, reset rows |
| 36 | `Adw.AboutWindow` | `prefs.ts:725` | About dialog with release notes |
| 37 | `Gtk.ColorButton` | `prefs.ts:364` | Color pickers with alpha support |
| 38 | `Gtk.ShortcutLabel` / `Gtk.EventControllerKey` | `prefs.ts:67-141` | Custom shortcut capture dialog |

### 5.8 Cairo API (5 APIs)

| # | API | Module | Usage |
|---|-----|--------|-------|
| 39 | `Cairo.Context` (`cr`) | `spotlight.ts:146` | Cairo rendering context from `St.DrawingArea` |
| 40 | `Cairo.Operator.SOURCE` | `spotlight.ts:150` | Dim background overlay |
| 41 | `Cairo.Operator.CLEAR` | `spotlight.ts:159` | Punch transparent hole for spotlight |
| 42 | `Cairo.Operator.OVER` | `spotlight.ts:164` | Draw spotlight ring arc |
| 43 | `cr.arc()` / `cr.fill()` / `cr.stroke()` | `spotlight.ts:160-168` | Circle geometry for spotlight hole and ring |

**Total distinct GNOME/System APIs documented: 43**

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
Used by: `SpotlightManager._getMonitorGeometry()`, `SpotlightGLSLEffect.setMonitorGeometry()`

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
// Each component in range [0, 1] for Cairo/GLSL consumption
// [red, green, blue, alpha]
```
Used by: `SettingsManager` cached colors, GLSL uniforms, Cairo `setSourceRGBA`

---

## 7. Settings Schema Overview

The extension defines 20 GSettings keys in `org.gnome.shell.extensions.find-my-mouse`:

| Key | Type | Default | Page |
|-----|------|---------|------|
| `activation-method` | string | `'shake'` | General |
| `find-my-mouse-activation` | string | `'<Super>f'` | General |
| `click-activation-button` | int | `1` | General |
| `show-on-all-monitors` | bool | `false` | General |
| `do-not-activate-gamemode` | bool | `true` | General |
| `log-level` | int | `2` (INFO) | General |
| `background-color` | string | `'#00000080'` | Appearance |
| `spotlight-color` | string | `'#FFFFFF80'` | Appearance |
| `spotlight-radius` | int | `100` | Appearance |
| `spotlight-zoom` | double | `9.0` | Appearance |
| `spotlight-ring-width` | int | `2` | Appearance |
| `idle-timeout` | int | `1000` | Timing |
| `animation-duration` | int | `500` | Timing |
| `shake-interval` | int | `1000` | Shake Detection |
| `shake-sensitivity` | int | `400` | Shake Detection |
| `enable-glass-morphism` | bool | `false` | Glass Morphism |
| `blur-radius` | double | `5.0` | Glass Morphism |
| `glass-opacity` | double | `0.3` | Glass Morphism |
| `glow-color` | string | `'rgba(255,255,255,0.1)'` | Glass Morphism |
| `glass-tint` | string | `'#FFFFFF1A'` | Glass Morphism |
| `excluded-apps` | string[] | `[]` | (unused in code) |

---

## 8. Error Handling & Edge Cases

| Scenario | Handling | Location |
|----------|----------|----------|
| GLSL effect initialization fails | Catch → fallback to Cairo with `_useGLSL = false` | `spotlight.ts:76-80` |
| GameMode DBus service unavailable | Exponential backoff retry (3 attempts, 5s→10s→20s) | `gamemodeClient.ts:49-65` |
| Keybinding registration fails | Try/catch with ERROR log; no crash | `keybindings.ts:40-42` |
| Keybinding removal fails | Try/catch — silently ignore if never set | `keybindings.ts:48-51` |
| Refresh rate detection fails | Multiple method fallbacks; default to 60 Hz | `spotlightEffect.ts:166-225` |
| `global.display.get_monitor_index_for_rect()` fails | Fallback: manual geometry search | `spotlightEffect.ts:68-81` |
| Monitor API version mismatches | 4 methods tried: `Main.layoutManager`, `global.display.get_monitors()`, `global.screen.get_monitors()`, direct `Meta.MonitorManager` | `spotlightEffect.ts:89-98` |
| Missing/invalid color strings | `parseColor` returns `[0,0,0,255]` default; `_parseRgbaString` falls back to hex parsing | `utils.ts:27-37`, `settings.ts:121-134` |
| `St.DrawingArea.get_context()` returns null | Guard clause: `if (!cr) return;` | `spotlight.ts:147` |
| Idle timeout fires after spotlight already hidden | `_idleTimeoutId` set to 0 after `hide()` — harmless `GLib.source_remove(0)` | `spotlight.ts:110-113` |
| Mouse press handler during non-click mode | Handler only registered when `activation-method === 'click'` | `extension.ts:230` |
| Activation method changes at runtime | Full teardown and re-setup of keyboard, mouse, click handlers | `extension.ts:266-273` |

---

## 9. Performance Considerations

1. **Shake detection history capped at 100 entries** — prevents unbounded memory growth during prolonged shaking.

2. **Refresh rate cached per monitor** — `_updateRefreshRate()` only re-detects when the mouse moves to a different monitor, avoiding repeated DBus/API calls.

3. **Cairo context disposal** — each `_onRepaint` call explicitly disposes the Cairo context via `cr.$dispose()` to prevent resource leaks.

4. **Movement delta threshold (5px)** — `_handleMouseMovement` skips `queueRepaint()` for sub-5px movements, reducing GPU work.

5. **GLSL over Cairo** — the GLSL path avoids Cairo's CPU-based rendering entirely, leveraging GPU pixel shaders for the blur and glass effects.

6. **GObject lifecycle** — `disable()` nulls all manager references and disconnects all signal handlers to allow garbage collection.

7. **GameMode DBus retry with backoff** — prevents flooding the bus with connection attempts when the service is unavailable.

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
