# Find My Mouse - Codebase Structure

## Directory Layout

```
.
├── extension.js          # Core extension logic and manager coordination
├── prefs.js              # Preferences UI (Adwaita/GTK4)
├── spotlight.js          # Spotlight rendering and animation
├── mouseTracking.js      # Mouse movement and shake detection
├── keybindings.js        # Keyboard shortcut handling
├── settings.js           # GSettings management and caching
├── utils.js              # Utilities (logging, color parsing)
├── schemas/              # GSettings schema definition
│   └── org.gnome.shell.extensions.find-my-mouse.gschema.xml
├── metadata.json          # Extension metadata (UUID, version, compatibility)
└── AGENTS.md             # Development and testing instructions
```

## Entry Points

| File               | Role                                                                 |
|--------------------|----------------------------------------------------------------------|
| `extension.js`     | Main extension class; initializes all managers and handles lifecycle. |
| `prefs.js`         | Preferences dialog (Adwaita/GTK4) with multi-page settings.          |
| `metadata.json`    | Extension metadata (UUID, name, version, GNOME Shell compatibility).|

## Key Files

### `extension.js`
- **Role**: Core extension logic.
- **Key Components**:
  - `FindMyMouseExtension` class (extends `Extension`).
  - Managers: `SettingsManager`, `SpotlightManager`, `MouseTracker`, `KeybindingManager`.
  - Lifecycle methods: `enable()`, `disable()`.
  - Event handlers: `_handleMouseMovement()`, `_toggleSpotlight()`.

### `prefs.js`
- **Role**: Preferences UI.
- **Key Components**:
  - `FindMyMousePreferences` class (extends `ExtensionPreferences`).
  - Pages: General, Appearance, Timing, Shake Detection.
  - UI Elements: `Adw.PreferencesPage`, `Adw.ComboRow`, `Gtk.ColorButton`.

### `spotlight.js`
- **Role**: Spotlight rendering and animation.
- **Key Components**:
  - `SpotlightManager` class.
  - Methods: `show()`, `hide()`, `_setupSpotlightCommon()`.
  - Rendering: Uses `St.DrawingArea` and Cairo for spotlight effect.

### `mouseTracking.js`
- **Role**: Mouse movement and shake detection.
- **Key Components**:
  - `MouseTracker` class.
  - Methods: `setup()`, `detectShake()`.
  - Uses `pointerWatcher.js` for mouse tracking.

### `keybindings.js`
- **Role**: Keyboard shortcut handling.
- **Key Components**:
  - `KeybindingManager` class.
  - Methods: `setup()`, `updateKeybinding()`.
  - Uses `Main.wm.addKeybinding()` for global shortcuts.

### `settings.js`
- **Role**: GSettings management and caching.
- **Key Components**:
  - `SettingsManager` class.
  - Methods: `cacheSettings()`.
  - Caches settings for performance (e.g., colors, radii).

### `utils.js`
- **Role**: Utilities.
- **Key Components**:
  - `debugLog()`: Logging with levels (ERROR, WARN, INFO, DEBUG).
  - `parseColor()`: Converts hex color strings to RGBA arrays.

### `schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml`
- **Role**: GSettings schema definition.
- **Key Components**:
  - Keys: `activation-method`, `background-color`, `spotlight-radius`, etc.
  - Defaults match Microsoft PowerToys.

## Evidence
- `extension.js:enable()` (manager initialization)
- `prefs.js:fillPreferencesWindow()` (UI structure)
- `spotlight.js:_setupSpotlightCommon()` (rendering logic)
- `mouseTracking.js:detectShake()` (shake detection algorithm)
- `keybindings.js:_addKeybinding()` (shortcut handling)
- `settings.js:cacheSettings()` (settings caching)
- `utils.js:debugLog()` (logging utility)