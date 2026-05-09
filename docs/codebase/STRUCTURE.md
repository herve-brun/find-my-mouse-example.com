# Codebase Structure

## Core Sections (Required)

### 1) Top-Level Map

| Path | Purpose | Evidence |
|------|---------|----------|
| `extension.js` | Main extension entry point | `extension.js` |
| `spotlight.js` | Spotlight rendering and animation logic | `spotlight.js` |
| `mouseTracking.js` | Mouse movement tracking and shake detection | `mouseTracking.js` |
| `keybindings.js` | Keyboard shortcut handling | `keybindings.js` |
| `settings.js` | Settings management and caching | `settings.js` |
| `prefs.js` | Preferences UI (GTK4/Adwaita) | `prefs.js` |
| `utils.js` | Utility functions (logging, color parsing) | `utils.js` |
| `schemas/` | GSettings schema definitions | `schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml` |
| `metadata.json` | Extension metadata (UUID, name, version) | `metadata.json` |
| `stylesheet.css` | CSS styles (unused in current implementation) | `stylesheet.css` |

### 2) Entry Points

- Main runtime entry: `extension.js`
- Secondary entry points: `prefs.js` (preferences UI)
- How entry is selected: GNOME Shell loads `extension.js` as main entry, `prefs.js` for settings

### 3) Module Boundaries

| Boundary | What belongs here | What must not be here |
|----------|-------------------|------------------------|
| `extension.js` | Core extension lifecycle, component orchestration | Direct rendering logic, UI details |
| `spotlight.js` | Spotlight rendering, animation, visibility control | Settings management, input handling |
| `mouseTracking.js` | Mouse movement tracking, shake detection | Spotlight rendering, settings management |
| `keybindings.js` | Keyboard shortcut registration and handling | Mouse tracking, spotlight logic |
| `settings.js` | Settings caching and access | Direct UI rendering, input handling |
| `prefs.js` | Preferences UI implementation | Core extension logic, business logic |

### 4) Naming and Organization Rules

- File naming pattern: `kebab-case.js` (e.g., `mouse-tracking.js`)
- Directory organization pattern: Flat structure with functional grouping
- Import aliasing or path conventions: Relative paths (e.g., `./utils.js`)

### 5) Evidence

- `/home/herve/Dev/Projets/find-my-mouse-example.com/extension.js`
- `/home/herve/Dev/Projets/find-my-mouse-example.com/spotlight.js`
- `/home/herve/Dev/Projets/find-my-mouse-example.com/mouseTracking.js`
- `/home/herve/Dev/Projets/find-my-mouse-example.com/keybindings.js`
- `/home/herve/Dev/Projets/find-my-mouse-example.com/settings.js`
- `/home/herve/Dev/Projets/find-my-mouse-example.com/prefs.js`