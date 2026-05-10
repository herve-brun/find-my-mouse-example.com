# Find My Mouse - Concerns

## Technical Debt

| Issue                          | Description                                                                                     | Evidence                                  |
|--------------------------------|-------------------------------------------------------------------------------------------------|-------------------------------------------|
| **Wayland Limitations**        | Modifier key (Ctrl) double-press may be unreliable; custom keybinding preferred.                | `AGENTS.md`                              |
| **X11 Support**                | Limited testing; may require additional handling for full compatibility.                     | `AGENTS.md`                              |
| **Excluded Apps**              | `excluded-apps` key exists in schema but is not fully implemented.                              | `schemas/...gschema.xml`                  |
| **Game Mode Detection**        | `do-not-activate-gamemode` setting exists but Game Mode detection is not implemented.          | `schemas/...gschema.xml`                  |

## Security

- **No Secrets**: No sensitive data or environment variables are used.
- **Permissions**: Uses standard GNOME Shell extension permissions.

## Performance

| Area               | Detail                                                                                     |
|--------------------|--------------------------------------------------------------------------------------------|
| **Mouse Tracking**  | Uses `pointerWatcher.js` with a 50ms interval.                                            |
| **Rendering**       | Cairo-based rendering on `St.DrawingArea`; optimized for GNOME Shell.                |
| **Animation**       | Fade-out animation uses `GLib.timeout_add` with 15 steps.                                |

## High-Churn Files

| File               | Changes (Last 90 Days) | Notes                                  |
|--------------------|-----------------------|----------------------------------------|
| `README.md`        | 4                      | Documentation updates.                 |
| `extension.js`     | 3                      | Core logic adjustments.               |
| `prefs.js`         | 3                      | UI tweaks and feature additions.       |
| `metadata.json`    | 3                      | Metadata updates.                      |

## Evidence
- `AGENTS.md` (Wayland/X11 notes)
- `mouseTracking.js:setup()` (tracking interval)
- `schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml` (unimplemented keys)
- `git log --since="90 days ago" --name-only` (high-churn files)