# Architecture

## Core Sections (Required)

### 1) Architectural Style

- Primary style: **Modular Component-Based Architecture**
- Why this classification: The extension is organized into discrete components (`SpotlightManager`, `MouseTracker`, `KeybindingManager`, `SettingsManager`) that encapsulate specific responsibilities and interact through well-defined interfaces.
- Primary constraints:
  - GNOME Shell extension API limitations
  - Wayland/X11 compatibility requirements
  - Real-time performance needs for mouse tracking and rendering

### 2) System Flow

```text
[GNOME Shell] -> [extension.js:enable()] -> 
  [SettingsManager] + [SpotlightManager] + [MouseTracker] + [KeybindingManager] ->
  [User Interaction (mouse/keyboard)] -> [Event Handling] -> [Spotlight Rendering/Animation] ->
  [Idle Timeout] -> [Fade Animation] -> [Hide Spotlight]
```

1. **Initialization**: `extension.js` creates and connects all managers during `enable()`
2. **Event Handling**: 
   - Mouse movement → `MouseTracker` → `SpotlightManager.updateMousePosition()`
   - Keyboard shortcut → `KeybindingManager` → `SpotlightManager.toggle()`
   - Mouse click → Direct event handler → `SpotlightManager.toggle()`
3. **Rendering**: `SpotlightManager` handles Cairo-based rendering on `St.DrawingArea`
4. **Animation**: Fade-in/fade-out managed via GLib timeouts in `SpotlightManager`
5. **Settings**: All components read from cached `SettingsManager` for performance

### 3) Layer/Module Responsibilities

| Layer or module | Owns | Must not own | Evidence |
|-----------------|------|--------------|----------|
| `extension.js` | Extension lifecycle, component orchestration | Direct rendering, input handling | `extension.js` |
| `SpotlightManager` | Spotlight rendering, visibility, animation | Settings management, input tracking | `spotlight.js` |
| `MouseTracker` | Mouse movement tracking, shake detection | Spotlight logic, settings | `mouseTracking.js` |
| `KeybindingManager` | Keyboard shortcut registration/handling | Mouse tracking, rendering | `keybindings.js` |
| `SettingsManager` | Settings caching and access | UI rendering, business logic | `settings.js` |
| `prefs.js` | Preferences UI implementation | Core extension logic | `prefs.js` |

### 4) Reused Patterns

| Pattern | Where found | Why it exists |
|---------|-------------|---------------|
| **Observer Pattern** | Settings change handlers in `extension.js` | Decouple settings changes from component logic |
| **Singleton-like** | Manager classes (`SpotlightManager`, etc.) | Single instance per extension lifecycle |
| **Event Delegation** | Mouse/keyboard event handling | Centralized input handling with component-specific actions |
| **Caching** | `SettingsManager.cached*` properties | Avoid repeated GSettings lookups for performance |
| **Animation Loop** | GLib timeouts in `SpotlightManager` | Frame-by-frame fade animations |

### 5) Known Architectural Risks

- **Wayland/X11 Compatibility**: Mouse tracking implementation differs between display servers (`pointerWatcher` vs `CursorTracker`)
- **Performance**: Real-time mouse tracking and rendering must stay responsive under system load
- **GNOME Version Dependencies**: Uses APIs specific to GNOME Shell 46-50
- **State Management**: Spotlight visibility state distributed across components

### 6) Evidence

- `/home/herve/Dev/Projets/find-my-mouse-example.com/extension.js` (component orchestration)
- `/home/herve/Dev/Projets/find-my-mouse-example.com/spotlight.js` (rendering/animation)
- `/home/herve/Dev/Projets/find-my-mouse-example.com/mouseTracking.js` (input handling)
- `/home/herve/Dev/Projets/find-my-mouse-example.com/keybindings.js` (shortcut handling)
- `/home/herve/Dev/Projets/find-my-mouse-example.com/settings.js` (settings cache)