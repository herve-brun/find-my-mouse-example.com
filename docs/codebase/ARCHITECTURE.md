# Find My Mouse - Architecture

## Layers

### 1. Extension Core (`extension.js`)
- **Responsibility**: Lifecycle management and coordination.
- **Key Functions**:
  - `enable()`: Initializes all managers and sets up event listeners.
  - `disable()`: Cleans up managers and event listeners.
  - `_handleMouseMovement()`: Delegates mouse movement to `MouseTracker` and `SpotlightManager`.
  - `_toggleSpotlight()`: Toggles spotlight visibility.

### 2. Managers

| Manager               | File               | Responsibility                                                                 |
|-----------------------|---------------------|-------------------------------------------------------------------------------|
| `SettingsManager`     | `settings.js`       | Caches and provides access to GSettings.                                      |
| `SpotlightManager`    | `spotlight.js`      | Handles rendering, animations, and visibility of the spotlight.              |
| `MouseTracker`        | `mouseTracking.js`  | Tracks mouse movement and detects shake gestures.                             |
| `KeybindingManager`   | `keybindings.js`    | Manages keyboard shortcuts for activation.                                    |

### 3. Preferences UI (`prefs.js`)
- **Responsibility**: Provides a GTK4/Adwaita-based settings dialog.
- **Key Components**:
  - Multi-page layout (General, Appearance, Timing, Shake Detection).
  - Dynamic UI elements (e.g., `Gtk.ColorButton` for color selection).
  - Real-time log level adjustments.

## Patterns

### Singleton Managers
- Each manager is instantiated once in `extension.js` and reused.
- Example: `this._settingsManager = new SettingsManager(settings);`

### Event-Driven Architecture
- Uses GNOME Shell signals for:
  - Mouse movement (`pointerWatcher.js`).
  - Keyboard shortcuts (`Main.wm.addKeybinding()`).
  - Settings changes (`settings.connect('changed::...')`).

### Caching
- Settings are cached in `SettingsManager` for performance.
- Example: `this._cachedBgColorNormalized` stores the normalized background color.

## Data Flow

### Activation Flow
1. **User Action**: Shortcut/shake/click/always.
2. **Event Handling**:
   - Shortcut: `KeybindingManager` → `_toggleSpotlight()`.
   - Shake: `MouseTracker.detectShake()` → `_toggleSpotlight()`.
   - Click: `global.stage.connect('button-press-event')` → `_toggleSpotlight()`.
3. **Spotlight Management**:
   - `_toggleSpotlight()` calls `SpotlightManager.show()` or `hide()`.
4. **Rendering**:
   - `SpotlightManager` uses `St.DrawingArea` and Cairo to render the spotlight.
   - Mouse movement updates the spotlight position via `queueRepaint()`.

### Settings Flow
1. **User Changes Setting**: UI in `prefs.js` updates GSettings.
2. **GSettings Signal**: Triggers `SettingsManager.cacheSettings()`.
3. **Cached Values**: Managers use cached values (e.g., `cachedBgColorNormalized`).

## Evidence
- `extension.js:enable()` (manager initialization and event setup)
- `spotlight.js:_setupSpotlightCommon()` (rendering and Cairo usage)
- `mouseTracking.js:detectShake()` (shake detection algorithm)
- `prefs.js:fillPreferencesWindow()` (UI structure and dynamic elements)
- `settings.js:cacheSettings()` (settings caching logic)