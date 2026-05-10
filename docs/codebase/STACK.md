# Find My Mouse - Codebase Documentation

## Project Intent

The **Find My Mouse** GNOME Shell extension replicates Microsoft PowerToys' "Find My Mouse" feature, helping users locate their cursor with a customizable spotlight effect. It supports multiple activation methods (keyboard shortcut, mouse shake, click, or always visible), multi-monitor setups, and dynamic logging.

### Key Features
- **Spotlight Effect**: Highlights the mouse cursor with customizable radius, color, and zoom.
- **Shake Activation**: Activate the spotlight by quickly shaking the mouse.
- **Dynamic Logging**: Real-time log level adjustments without restarting.
- **Multi-Monitor Support**: Works across multiple monitors with DPI awareness.
- **Customizable Activation**: Keyboard shortcut, mouse click, or shake gesture.

### Evidence
- `README.md`
- `metadata.json`

---

## STACK.md

### Core Stack
- **Language**: JavaScript (ES6+)
- **Runtime**: GNOME Shell (GJS)
- **Frameworks/Libraries**:
  - GNOME Shell APIs (`resource:///org/gnome/shell/extensions/extension.js`)
  - GObject Introspection (Gtk, Adw, Gdk, Clutter, St, Cairo, GLib, Meta, Shell)
  - GSettings for configuration

### Dependencies
- **Development**: Meson, SassC, gettext
- **Runtime**: GNOME Shell 46-50 (Wayland/X11)

### Evidence
- `metadata.json` (GNOME Shell version compatibility)
- `prefs.js` (Gtk/Adw imports)
- `spotlight.js` (Clutter/St/Cairo imports)

---

## STRUCTURE.md

### Directory Layout
```
.
├── extension.js          # Core extension logic
├── prefs.js              # Preferences UI (Adwaita/GTK4)
├── spotlight.js          # Spotlight rendering (Cairo/Clutter)
├── mouseTracking.js      # Mouse movement/shake detection
├── keybindings.js        # Keyboard shortcut handling
├── settings.js           # GSettings management
├── utils.js              # Utilities (logging, color parsing)
├── schemas/              # GSettings schema
└── metadata.json          # Extension metadata
```

### Entry Points
- **Main**: `extension.js` (GNOME Shell extension entry)
- **Preferences**: `prefs.js` (GTK4/Adwaita UI)

### Key Files
- `extension.js`: Initializes all managers (settings, spotlight, mouse tracking, keybindings).
- `spotlight.js`: Handles rendering using `St.DrawingArea` and Cairo.
- `prefs.js`: Provides a multi-page preferences dialog (General, Appearance, Timing, Shake Detection).

### Evidence
- `extension.js:enable()` (initialization flow)
- `prefs.js:fillPreferencesWindow()` (UI structure)

---

## ARCHITECTURE.md

### Layers
1. **Extension Core** (`extension.js`):
   - Manages lifecycle (enable/disable).
   - Coordinates between managers.
2. **Managers**:
   - `SettingsManager`: Caches and provides access to GSettings.
   - `SpotlightManager`: Handles rendering and animations.
   - `MouseTracker`: Detects mouse movement/shake.
   - `KeybindingManager`: Manages keyboard shortcuts.
3. **Preferences UI** (`prefs.js`):
   - Adwaita/GTK4-based settings dialog.

### Patterns
- **Singleton Managers**: Each manager is instantiated once in `extension.js`.
- **Event-Driven**: Uses GNOME Shell signals for mouse/keyboard events.
- **Caching**: Settings are cached for performance.

### Data Flow
1. User triggers activation (shortcut/shake/click).
2. `extension.js` delegates to `SpotlightManager`.
3. `SpotlightManager` renders using Cairo on a `St.DrawingArea`.
4. Mouse movement updates the spotlight position.

### Evidence
- `extension.js:constructor()` (manager instantiation)
- `spotlight.js:_setupSpotlightCommon()` (rendering logic)

---

## CONVENTIONS.md

### Naming
- **Classes**: PascalCase (e.g., `SpotlightManager`).
- **Methods**: camelCase (e.g., `detectShake()`).
- **Variables**: `_camelCase` for private (e.g., `_spotlightVisible`).

### Formatting
- **Indentation**: 4 spaces.
- **Braces**: Opening brace on same line.
- **Semicolons**: Always present.

### Error Handling
- **Logging**: Uses `debugLog()` with levels (ERROR, WARN, INFO, DEBUG).
- **Graceful Degradation**: Checks for `null`/`undefined` (e.g., `if (!this._settings) return`).

### Imports
- **GNOME Modules**: Imported via `gi://` or `resource://`.
- **Local Modules**: Relative paths (e.g., `./utils.js`).

### Evidence
- `utils.js:debugLog()` (logging convention)
- `spotlight.js:constructor()` (private variable naming)

---

## INTEGRATIONS.md

### External APIs
- **GNOME Shell APIs**:
  - `resource:///org/gnome/shell/extensions/extension.js` (base extension class).
  - `resource:///org/gnome/shell/ui/main.js` (UI group access).
  - `resource:///org/gnome/shell/ui/pointerWatcher.js` (mouse tracking).

### GSettings
- Schema: `org.gnome.shell.extensions.find-my-mouse`
- Keys: `activation-method`, `background-color`, `spotlight-radius`, etc.

### Evidence
- `schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml`
- `settings.js:cacheSettings()` (GSettings usage)

---

## TESTING.md

### Testing Approach
- **Manual Testing**:
  - Nested Wayland session for development:
    ```bash
    dbus-run-session gnome-shell --devkit --wayland
    ```
  - X11 session (via Xephyr).
- **Logging**: Dynamic log levels (ERROR, WARN, INFO, DEBUG) for debugging.

### Evidence
- `AGENTS.md` (test commands)
- `prefs.js` (log level UI)

---

## CONCERNS.md

### Technical Debt
- **Wayland Limitations**: Modifier key (Ctrl) double-press may be unreliable; custom keybinding preferred.
- **X11 Support**: Limited testing; may require additional handling.

### Security
- **No Secrets**: No sensitive data or environment variables used.

### Performance
- **Mouse Tracking**: Uses `pointerWatcher.js` with a 50ms interval.
- **Rendering**: Cairo-based; optimized for GNOME Shell.

### Evidence
- `AGENTS.md` (Wayland/X11 notes)
- `mouseTracking.js:setup()` (tracking interval)

---

## [ASK USER] Questions

1. Are there additional activation methods or customization options planned beyond the current set (shortcut, shake, click, always)?
2. Should the extension support themes or presets for the spotlight appearance?
3. Are there plans to add accessibility features (e.g., screen reader support)?

---

## Intent vs. Reality
- **Intent**: Full PowerToys feature parity.
- **Reality**: Core functionality implemented; advanced features (e.g., per-app exclusions) may need further work.

### Evidence
- `schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml` (`excluded-apps` key exists but not fully implemented).