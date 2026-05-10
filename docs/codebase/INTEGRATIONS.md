# Find My Mouse - Integrations

## External APIs

### GNOME Shell APIs

| API                                      | Purpose                                                                 |
|------------------------------------------|-------------------------------------------------------------------------|
| `resource:///org/gnome/shell/extensions/extension.js` | Base extension class.                                                  |
| `resource:///org/gnome/shell/ui/main.js`       | Access to `Main.uiGroup` for rendering.                                |
| `resource:///org/gnome/shell/ui/pointerWatcher.js`   | Mouse movement tracking.                                               |
| `gi://Clutter`                                 | Event handling (e.g., `button-press-event`).                          |
| `gi://St`                                     | Widgets (e.g., `St.DrawingArea` for spotlight rendering).              |
| `gi://Cairo`                                   | 2D graphics for rendering the spotlight.                             |
| `gi://Gtk`                                    | GTK4 widgets for preferences UI.                                        |
| `gi://Adw`                                    | Adwaita components for modern UI.                                      |
| `gi://Gdk`                                    | Keyboard shortcut handling.                                            |
| `gi://GLib`                                   | Timers and utilities.                                                  |
| `gi://Meta`                                   | Keybinding management.                                                 |
| `gi://Shell`                                  | Action modes for keybindings.                                          |

### Example Usage
- **Rendering**:
  ```javascript
  this._spotlight = new St.DrawingArea({ ... }); // St widget
  const cr = area.get_context(); // Cairo context
  ```
- **Keybindings**:
  ```javascript
  Main.wm.addKeybinding('find-my-mouse-activation', ...); // Meta/Shell
  ```

## GSettings

### Schema
- **ID**: `org.gnome.shell.extensions.find-my-mouse`
- **Path**: `/org/gnome/shell/extensions/find-my-mouse/`

### Keys

| Key                          | Type   | Default Value       | Description                                                                 |
|-----------------------------|--------|---------------------|-----------------------------------------------------------------------------|
| `activation-method`         | String | `'shake'`           | Activation method: `shortcut`, `shake`, `click`, `always`.                 |
| `find-my-mouse-activation`  | String | `'<Super>f'`        | Keyboard shortcut for activation.                                         |
| `click-activation-button`   | Int    | `1`                 | Mouse button for click activation (1=left, 2=middle, 3=right).           |
| `shake-interval`            | Int    | `1000`              | Time window (ms) for shake detection.                                     |
| `shake-sensitivity`         | Int    | `400`               | Shake sensitivity factor (400% = 4x).                                     |
| `background-color`          | String | `'#00000080'`       | Background color with alpha (black, 50% opacity).                         |
| `spotlight-color`           | String | `'#FFFFFF80'`       | Spotlight color with alpha (white, 50% opacity).                         |
| `spotlight-radius`          | Int    | `100`               | Spotlight radius in pixels.                                                |
| `spotlight-zoom`            | Double | `9.0`               | Initial zoom factor for animation.                                        |
| `idle-timeout`              | Int    | `1000`              | Time (ms) before hiding after mouse stops.                              |
| `animation-duration`        | Int    | `500`               | Fade-out animation duration (ms).                                        |
| `show-on-all-monitors`      | Bool   | `false`             | Show spotlight on all monitors.                                           |
| `log-level`                 | Int    | `2`                 | Log level (0=ERROR, 1=WARN, 2=INFO, 3=DEBUG).                              |

### Example Usage
- **Reading Settings**:
  ```javascript
  const radius = this._settings.get_int('spotlight-radius');
  ```
- **Writing Settings**:
  ```javascript
  settings.set_int('spotlight-radius', newValue);
  ```

## Evidence
- `schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml` (schema definition)
- `settings.js:cacheSettings()` (GSettings usage)
- `extension.js:enable()` (GNOME Shell API usage)