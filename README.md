# Find My Mouse — GNOME Shell Extension

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GNOME Shell](https://img.shields.io/badge/GNOME-Shell-46+-blueviolet)](https://www.gnome.org/)
[![CI](https://img.shields.io/github/actions/workflow/status/herve-brun/find-my-mouse-example.com/test.yml?branch=main&label=CI)](https://github.com/herve-brun/find-my-mouse-example.com/actions/workflows/test.yml)
[![Release](https://img.shields.io/github/actions/workflow/status/herve-brun/find-my-mouse-example.com/release.yml?branch=main&label=Release)](https://github.com/herve-brun/find-my-mouse-example.com/actions/workflows/release.yml)

A GNOME Shell extension (GNOME 46–50, Wayland) that highlights the pointer with a circular spotlight, similar to Microsoft PowerToys Find My Mouse.

## Features

- **Spotlight**: Cairo-rendered overlay with configurable radius, colors, ring width, zoom and animation duration.
- **Mouse Gesture**: wave the pointer horizontally and stop to show the spotlight. The detector is a pure state machine; a pointer-local progress ring shows attempt progress.
- **Keyboard Shortcut**: `<Super>f` by default, active in the default gesture mode as well as in other modes.
- **Always Visible**: opt-in mode that keeps the spotlight on screen.
- **Show-only activation**: activating again refreshes the spotlight and resets the idle timeout; it does not hide it. The spotlight hides on idle or via extension shutdown.
- **Game Mode suppression**: optional suppression while `com.feralinteractive.GameMode` reports an active game.
- **Multi-monitor**: show on the current monitor or on the bounding box of all monitors.
- **Practice mode**: "Try the Gesture" in Preferences runs a real gesture session through the extension, with live progress feedback and retry/cancel, without showing the spotlight.
- **Dynamic logging**: log level adjustable at runtime in Preferences → About.
- **Translations**: gettext catalogs for English (source), French and Spanish.

## Installation

Prerequisites: GNOME Shell 46 or later, Git, Node.js 22+, npm, `glib-compile-schemas` (from `libglib2.0-bin` on Ubuntu/Debian) and `msgfmt` (from `gettext` on Ubuntu/Debian).

```bash
git clone https://github.com/herve-brun/find-my-mouse-example.com.git
cd find-my-mouse-example.com
npm install
npm run build

mkdir -p ~/.local/share/gnome-shell/extensions/find-my-mouse@herve-brun.github.io
cp -r dist/* metadata.json ~/.local/share/gnome-shell/extensions/find-my-mouse@herve-brun.github.io/
```

`npm run build` compiles TypeScript from `src/` into `dist/`, compiles the GSettings schema and translation catalogs, and copies the schema and `metadata.json` into `dist/`. Restart GNOME Shell (`Alt+F2`, `r`, `Enter`, or log out/in; Wayland sessions may require logout) and enable the extension with `gnome-extensions-app` or `gnome-extensions enable find-my-mouse@herve-brun.github.io`.

## Usage

### Activation

| Method | Description |
|---|---|
| Shortcut + Mouse Gesture (default) | Press `<Super>f`, or wave and stop. Internal `activation-method` value is `'shake'` for compatibility. |
| Always Visible | Set `activation-method` to `'always'`; the spotlight is shown continuously. |

### Mouse gesture

1. Move horizontally at ≥400 px/s with at least 2:1 horizontal dominance to arm the detector.
2. Reverse direction 3 times; each sweep must cover ≥90 px and the speed must dip below 20% of the sweep peak before a reversal counts. All reversals must happen within 900 ms.
3. Stop: the pointer must slow below 150 px/s within 180 ms to activate. A 1500 ms cooldown follows activation.

The gesture is ignored while a mouse button or Ctrl/Alt is held, in fullscreen apps (both configurable), on pointer jumps >250 px per sample, on monitor/focus changes, while the spotlight is already visible, and during Game Mode when suppression is enabled. There is no minimum-distance setting; the amplitude floor scales with sweep × reversals (minimum 120 px), so small jitter does not qualify.

### Configuration

Open GNOME Extensions → Find My Mouse → settings. The **Mouse Gesture** page offers Light / Standard / Firm presets, a "Fine-tune gesture" expander with the individual keys below, a live "Try the Gesture" practice session, and an optional confirmation sound (off by default). The activation shortcut row remains available in gesture mode.

#### Try the Gesture (practice)

"Try the Gesture" starts a real, time-limited practice session (10 s watchdog) in the shell extension. The preferences dialog talks to a small D-Bus service (`org.gnome.shell.extensions.find_my_mouse.Practice` at `/org/gnome/shell/extensions/find_my_mouse/Practice`) through a client proxy; gesture events flow through the real detector and the progress ring, but a success is reported back to the dialog instead of calling the normal activation path. No spotlight is shown during practice. The dialog announces status changes, offers retry and cancel, and has no auto-close timer. If the D-Bus service is unavailable, a text-only fallback presents the same instructions derived from your current gesture settings.

| Key | Default | Range |
|---|---|---|
| `gesture-reversals` | 3 | 2–6 |
| `gesture-sweep` | 90 px | 40–300 |
| `gesture-window` | 900 ms | 400–1500 |
| `gesture-settle` | 180 ms | 80–400 |
| `gesture-cooldown` | 1500 ms | 500–4000 |
| `gesture-ignore-buttons` | true | — |
| `gesture-ignore-fullscreen` | true | — |
| `gesture-sound` | false | — |

`shake-interval` and `shake-sensitivity` remain in the schema so existing user settings stay valid; they are deprecated, hidden in Preferences, and no longer read by the detector.

## Translations

User-facing strings are marked with `gettext` (`_()`) in `src/prefs.ts`. The `gettext-domain` in `metadata.json` makes GNOME Shell initialize the catalogs automatically; the compiled `.mo` files are installed under `dist/locale/<lang>/LC_MESSAGES/`.

| Language | Catalog |
|---|---|
| English (source) | `po/en.po` |
| French | `po/fr.po` |
| Spanish | `po/es.po` |

The template is `po/find-my-mouse@herve-brun.github.io.pot`. After adding or changing translatable strings:

```bash
npm run build            # compile dist/*.js first
npm run i18n:update      # regenerate the POT and merge it into every PO
npm test                 # msgfmt verifies headers and format placeholders
```

`npm run i18n:pot` only regenerates the template. To check a translated preferences dialog without changing the system locale:

```bash
LANGUAGE=fr gnome-extensions prefs find-my-mouse@herve-brun.github.io
```

## Development

Source files are TypeScript under `src/` and compile to `dist/` (gitignored). Edit only `.ts` files.

```
src/
  extension.ts             →  dist/extension.js          (Lifecycle and wiring)
  prefs.ts                 →  dist/prefs.js              (Preferences UI)
  settings.ts              →  dist/settings.js           (GSettings wrapper)
  activationController.ts  →  dist/activationController.js (Activation policy + idle timeout)
  gestureDetector.ts       →  dist/gestureDetector.js    (Pure gesture state machine)
  gestureFeedback.ts       →  dist/gestureFeedback.js    (Progress ring + sound)
  spotlight.ts             →  dist/spotlight.js          (Cairo rendering + zoom)
  mouseTracking.ts         →  dist/mouseTracking.js      (pointerWatcher adapter)
  gamemodeClient.ts        →  dist/gamemodeClient.js     (Game Mode D-Bus client)
  practiceService.ts       →  dist/practiceService.js    (Shell-side practice D-Bus service)
  practiceClient.ts        →  dist/practiceClient.js     (Preferences-side D-Bus proxy)
  utils.ts                 →  dist/utils.js              (Shared utilities)
```

| Script | Description |
|---|---|
| `npm run check` | TypeScript type-check without emitting output |
| `npm run lint` | ESLint on `src/` |
| `npm run build` | Clean `dist/`, compile TypeScript, compile schema, copy schema and metadata |
| `npm run build:schemas` | Compile the GSettings XML schema |
| `npm run i18n:pot` | Regenerate the gettext POT from compiled `dist/*.js` |
| `npm run i18n:update` | Regenerate the POT and merge it into `en`, `fr` and `es` PO files |
| `npm run i18n:build` | Validate PO files and compile `.mo` catalogs into `dist/locale/` |
| `npm run build:dist` | Build and create a distributable ZIP for EGO upload |
| `npm test` | Build, then run `node --test test/*.test.mjs` |

### Testing

Unit tests feed synthesized pointer streams to the detector with injected timestamps (deliberate wave activates; jitter, circles, drags and warps do not; cooldown and pause/gap behavior are covered). A regression test feeds the retired tutorial cadence — three ~30 px steps 1500 ms apart — and confirms it does not activate; a companion test checks that a normal 900 ms window with a 180 ms settle still does.

For manual testing, use a nested Wayland session; GNOME 49+ needs `mutter-devkit` to draw the host window (Ubuntu: `sudo apt install mutter-dev-bin`), otherwise `--devkit` runs headless.

```bash
if [ "$(gnome-shell --version | awk '{print int($3)}')" -ge 49 ]; then
    dbus-run-session gnome-shell --devkit --wayland
else
    SHELL_DEBUG=backtrace-warnings dbus-run-session gnome-shell --nested --wayland
fi
```

X11 testing requires Xephyr: `Xephyr :1 -screen 1920x1080 &` then `DISPLAY=:1 dbus-run-session gnome-shell`.

View logs with `journalctl --user -f | grep "Find My Mouse"`. Concrete manual scenarios are listed in `docs/codebase/TESTING.md`.

### Logging

| Level | Value | Description |
|---|---|---|
| ERROR | 0 | Critical errors |
| WARN | 1 | Warnings and errors |
| INFO | 2 | General information (default) |
| DEBUG | 3 | Coordinates, settings and animation detail |

The level is changed in Preferences → About → Logging → Log Level and applies immediately.

## Troubleshooting

- **Spotlight does not appear**: verify the extension is enabled (`gnome-extensions list`), check the log, and try the `<Super>f` shortcut. Use "Try the Gesture" in Preferences for a live practice session: it reports progress and the result through the extension without showing a real spotlight, and offers retry or cancel. Ensure no mouse button or Ctrl/Alt is held, no fullscreen app is focused, and the spotlight is not already visible.
- **Gesture does not activate**: the pointer must move horizontally, cover ≥90 px per sweep, and stop promptly. Large jumps, pauses, circular motion and small jitter are rejected by design.
- **Multi-monitor**: enable "Show on All Monitors" to cover the bounding box of all monitors; otherwise the current monitor is used.

## Contributing

Fork the repository, create a branch, edit `src/*.ts`, run `npm test` and `npm run lint`, and commit using [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). A local `commitlint` hook enforces the allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. PR titles are validated by CI (`.github/workflows/lint-pr.yml`).

## License

[MIT License](LICENSE.md), including a non-endorsement clause: the name "Hervé Brun" cannot be used to promote or advertise derived works without prior written authorization.

Project documentation and architecture notes are in `codemap.md` and `docs/codebase/`.
