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
dbus-run-session gnome-shell --nested --wayland

# View extension logs
journalctl --user -f | grep "Find My Mouse"
```

## Architecture
- `extension.js` - Core logic: spotlight rendering, mouse/keyboard tracking, Cairo painting
- `prefs.js` - Adwaita/GTK4 preferences UI
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
