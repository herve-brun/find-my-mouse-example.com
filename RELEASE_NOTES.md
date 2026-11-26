# Find My Mouse 1.0.0

Initial release of **Find My Mouse**, a GNOME Shell extension for GNOME 46–50 on Wayland that highlights the pointer with a customizable spotlight.

## What it does

- **Spotlight** — four dim actors with a pointer-local circular cutout and ring, a zoom-in animation, and configurable colors, radius, ring width and duration. The ring adapts to GNOME's high-contrast setting, and animations respect the system "Enable Animations" preference.
- **Two ways to reveal the pointer** — press `<Super>f`, or wave the pointer sideways and stop. The gesture uses a self-contained state machine with a live pointer-local progress ring, including a bright "stop now" state. Both paths are show-only: activating again refreshes the spotlight instead of toggling it off.
- **Gesture tuning** — Light, Standard and Firm presets plus fine-grained controls for reversals, sweep distance, time window, settle time and cooldown. Optional confirmation sound, button and fullscreen guards are included.
- **Practice mode** — "Try the Gesture" in Preferences runs real gesture detection with live feedback and retry/cancel, without showing the spotlight. A text-only walkthrough is available when the live session cannot be reached.
- **Preferences** — Adwaita pages for General, Appearance, Timing, Mouse Gesture and About, with reset-to-defaults and Undo on every page, a live shortcut capture dialog and runtime log-level control.
- **Desktop integration** — optional Game Mode suppression, current-monitor or all-monitor coverage, and English, French and Spanish translations.

## Install

Install the attached `find-my-mouse@herve-brun.github.io.zip` with GNOME Extensions, or follow the build instructions in the [README](https://github.com/herve-brun/find-my-mouse-example.com#installation).

Extension UUID: `find-my-mouse@herve-brun.github.io`. GNOME Shell 46, 47, 48, 49 and 50 are supported. See the [README](https://github.com/herve-brun/find-my-mouse-example.com#usage) for the user guide and the [repository atlas](https://github.com/herve-brun/find-my-mouse-example.com/blob/main/codemap.md) for architecture notes.
