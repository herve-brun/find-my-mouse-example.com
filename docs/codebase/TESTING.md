# Find My Mouse - Testing

## Testing Approach

### Manual Testing

#### Wayland Session (Recommended)
- **Command**:
  ```bash
  if [ "$(gnome-shell --version | awk '{print int($3)}')" -ge 49 ]; then
      dbus-run-session gnome-shell --devkit --wayland  # Best for debugging
  else
      SHELL_DEBUG=backtrace-warnings dbus-run-session gnome-shell --nested --wayland
  fi
  ```
- **Purpose**: Test extension in a nested Wayland session without restarting the main shell.

#### X11 Session
- **Command**:
  ```bash
  Xephyr :1 -screen 1920x1080 &
  DISPLAY=:1 dbus-run-session gnome-shell
  ```
- **Purpose**: Test X11 compatibility (requires `Xephyr`).

### Logging
- **Dynamic Log Levels**: Adjustable via preferences UI (ERROR, WARN, INFO, DEBUG).
- **View Logs**:
  ```bash
  journalctl --user -f | grep "Find My Mouse"
  ```

### Test Scenarios

| Scenario                     | Steps                                                                 |
|------------------------------|-----------------------------------------------------------------------|
| **Spotlight Activation**     | Trigger via shortcut/shake/click; verify spotlight appears.         |
| **Multi-Monitor Support**    | Enable "Show on All Monitors"; verify spotlight covers all screens.|
| **Shake Detection**          | Move mouse rapidly; verify spotlight activates.                      |
| **Idle Timeout**             | Stop mouse movement; verify spotlight fades after timeout.         |
| **Log Level Changes**        | Adjust log level; verify output in `journalctl`.                     |

## Evidence
- `AGENTS.md` (test commands)
- `prefs.js` (log level UI)
- `utils.js:debugLog()` (logging implementation)