# AGENTS.md - Find My Mouse GNOME Extension

## Quick Facts
- GNOME Shell extension for GNOME 46-50 (Wayland)
- Replicates Microsoft PowerToys Find My Mouse spotlight feature
- Uses St.DrawingArea with Cairo for spotlight rendering
- GSettings schema at `schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml`

## Developer Commands
```bash
# Compile GSettings schema (required after schema changes)
glib-compile-schemas schemas/

# Test in nested Wayland session (no shell restart needed)
# For GNOME Shell 49+, use the devkit mode for better debugging
# For older versions, use the nested mode with backtrace warnings
if [ "$(gnome-shell --version | awk '{print int($3)}')" -ge 49 ]; then
    dbus-run-session gnome-shell --devkit --wayland
else
    SHELL_DEBUG=backtrace-warnings dbus-run-session gnome-shell --nested --wayland
fi

# Test in nested X11 session (requires Xephyr)
# Install Xephyr first:
#   Ubuntu/Debian: sudo apt install xserver-xephyr
#   Fedora/RHEL:   sudo dnf install xorg-x11-server-Xephyr
#   Arch:          sudo pacman -S xorg-server-xephyr
Xephyr :1 -screen 1920x1080 &
DISPLAY=:1 dbus-run-session gnome-shell

# View extension logs
journalctl --user -f | grep "Find My Mouse"
```

## Commit Message Convention

Commits must adhere to [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) rules.

### Example
```
feat(spotlight): add zoom effect to spotlight

This adds a zoom effect to the spotlight feature, allowing users to
magnify the area around the mouse cursor. The zoom level is configurable
via the preferences UI and defaults to 9.0x.

BREAKING CHANGE: The spotlight rendering logic has been completely
rewritten to support the zoom effect. Extensions that depend on the
internal spotlight API may need to be updated.
```

## Architecture
- `extension.js` - Core logic: spotlight rendering, mouse/keyboard tracking, Cairo painting
- `prefs.js` - Adwaita/GTK4 preferences UI with separate pages for General, Appearance, Timing, and Shake Detection settings
- `metadata.json` - Extension metadata (uuid, supported GNOME versions)
- `schemas/` - GSettings schema (XML + compiled)

## Critical Gotchas
- **Always compile schema** after modifying `schemas/*.xml`: `glib-compile-schemas schemas/`
- **Cairo context** obtained via `area.get_context()` in `repaint` signal handler
- **Use `queue_repaint()`** not `queue_redraw()` for St.DrawingArea
- **Extension runs in Wayland** - modifier key (Ctrl) double-press unreliable; custom keybinding preferred
- **No shell restart** - user tests via nested session
- **XML escaping** in schema defaults: use `&lt;` and `&gt;` for `<` and `>` in keybindings

## Default Values (PowerToys-matched)
- Background: `#00000080` (black 50% opacity)
- Spotlight: `#FFFFFF80` (white 50% opacity)  
- Radius: 100px, Zoom: 9.0x, Animation: 500ms
- Idle timeout: 1000ms (hide after mouse stops)
- Shake: 1000px distance, 400% sensitivity, 1000ms interval

## Debugging
- Extension logs via `console.log()` appear in `journalctl --user -f`
- Look for "Find My Mouse:" prefixed messages
- Spotlight visibility tracked via `_spotlightVisible` boolean
- View extension logs with: `journalctl --user --no-pager | grep "Find My Mouse"

## Recent Changes
- Preferences UI reorganized into separate pages for better usability:
  - General: Activation methods, multi-monitor settings
  - Appearance: Spotlight colors, radius, zoom, game mode toggle
  - Timing: Idle timeout and animation duration
  - Shake Detection: Shake interval and sensitivity settings
