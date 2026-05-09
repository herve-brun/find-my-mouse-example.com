# Technology Stack

## Core Sections (Required)

### 1) Runtime Summary

| Area | Value | Evidence |
|------|-------|----------|
| Primary language | JavaScript | `extension.js`, `spotlight.js`, `mouseTracking.js` |
| Runtime | GNOME Shell (GJS) | `metadata.json`, `extension.js` |
| Package manager | None (GNOME Shell extension) | N/A |
| Module/build system | None (GNOME Shell extension) | N/A |

### 2) Production Frameworks and Dependencies

| Dependency | Version | Role in system | Evidence |
|------------|---------|----------------|----------|
| GNOME Shell | 46-50 | Core runtime environment | `metadata.json` |
| GJS | N/A | JavaScript engine for GNOME | `extension.js` |
| GLib | N/A | Core GNOME utilities | `mouseTracking.js`, `spotlight.js` |
| Clutter | N/A | UI rendering | `spotlight.js` |
| St | N/A | UI components | `spotlight.js` |
| Cairo | N/A | Graphics rendering | `spotlight.js` |
| Meta | N/A | Window management | `keybindings.js` |
| Shell | N/A | GNOME Shell utilities | `keybindings.js` |

### 3) Development Toolchain

| Tool | Purpose | Evidence |
|------|---------|----------|
| `glib-compile-schemas` | Compile GSettings schemas | `AGENTS.md` |
| `dbus-run-session` | Test nested GNOME sessions | `AGENTS.md` |
| `journalctl` | View extension logs | `AGENTS.md` |
| `Xephyr` | Test X11 sessions | `AGENTS.md` |

### 4) Key Commands

```bash
# Compile GSettings schema (required after schema changes)
glib-compile-schemas schemas/

# Test in nested Wayland session
if [ "$(gnome-shell --version | awk '{print int($3)}')" -ge 49 ]; then
    dbus-run-session gnome-shell --devkit --wayland
else
    SHELL_DEBUG=backtrace-warnings dbus-run-session gnome-shell --nested --wayland
fi

# View extension logs
journalctl --user -f | grep "Find My Mouse"
```

### 5) Environment and Config

- Config sources: `schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml`
- Required env vars: None
- Deployment/runtime constraints: GNOME Shell 46-50 (Wayland preferred)

### 6) Evidence

- `/home/herve/Dev/Projets/find-my-mouse-example.com/metadata.json`
- `/home/herve/Dev/Projets/find-my-mouse-example.com/schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml`
- `/home/herve/Dev/Projets/find-my-mouse-example.com/AGENTS.md`