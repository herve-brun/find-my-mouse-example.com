# External Integrations

## Core Sections (Required)

### 1) Integration Inventory

| System | Type (API/DB/Queue/etc) | Purpose | Auth model | Criticality | Evidence |
|--------|---------------------------|---------|------------|-------------|----------|
| GNOME Shell | Platform API | Core extension runtime | N/A | High | `extension.js` |
| GSettings | Configuration API | Persistent settings storage | N/A | High | `settings.js`, `schemas/` |
| Clutter | UI Framework | Spotlight rendering surface | N/A | High | `spotlight.js` |
| Cairo | Graphics Library | Spotlight drawing operations | N/A | High | `spotlight.js` |
| Meta | Window Manager | Keyboard shortcut handling | N/A | Medium | `keybindings.js` |
| Shell | GNOME Utilities | Keybinding registration | N/A | Medium | `keybindings.js` |
| GLib | Utility Library | Timeouts, main loop integration | N/A | High | `spotlight.js`, `mouseTracking.js` |

### 2) Data Stores

| Store | Role | Access layer | Key risk | Evidence |
|-------|------|--------------|----------|----------|
| GSettings | Persistent configuration | `SettingsManager` | Schema compilation required | `schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml` |

### 3) Secrets and Credentials Handling

- Credential sources: None (no secrets or credentials)
- Hardcoding checks: N/A
- Rotation or lifecycle notes: N/A

### 4) Reliability and Failure Behavior

- Retry/backoff behavior: None (immediate failure)
- Timeout policy:
  - Idle timeout configurable (default: 1000ms)
  - Animation duration configurable (default: 500ms)
- Circuit-breaker or fallback behavior:
  - Fallback from `CursorTracker` to `pointerWatcher` for mouse tracking
  - Graceful degradation if rendering context unavailable

### 5) Observability for Integrations

- Logging around external calls:
  - Yes (via `debugLog`)
  - Example: Mouse movement, keybinding activation, rendering events
- Metrics/tracing coverage: None
- Missing visibility gaps:
  - No performance metrics for rendering frame rates
  - No error tracking for failed operations

### 6) Evidence

- `/home/herve/Dev/Projets/find-my-mouse-example.com/spotlight.js` (Clutter/Cairo integration)
- `/home/herve/Dev/Projets/find-my-mouse-example.com/keybindings.js` (Meta/Shell integration)
- `/home/herve/Dev/Projets/find-my-mouse-example.com/settings.js` (GSettings integration)
- `/home/herve/Dev/Projets/find-my-mouse-example.com/utils.js` (logging)