# Find My Mouse — GNOME Shell Extension

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![GNOME Shell 46–50](https://img.shields.io/badge/GNOME%20Shell-46%E2%80%9350-blueviolet)](https://www.gnome.org/)
[![CI](https://img.shields.io/github/actions/workflow/status/herve-brun/find-my-mouse-example.com/test.yml?branch=master&label=CI)](https://github.com/herve-brun/find-my-mouse-example.com/actions/workflows/test.yml)
[![Release](https://img.shields.io/github/actions/workflow/status/herve-brun/find-my-mouse-example.com/release.yml?branch=master&label=Release)](https://github.com/herve-brun/find-my-mouse-example.com/actions/workflows/release.yml)

A GNOME Shell extension (GNOME 46–50, Wayland) that highlights the pointer with a circular spotlight, inspired by Microsoft PowerToys Find My Mouse. This README documents the 1.0.0 release.

## Features

- **Hybrid spotlight**: four plain `St.Widget` dim actors compose the dim area; a small pointer-local `St.DrawingArea` is rasterised with Cairo to cut out the transparent circle and draw its ring. Radius, colors, ring width, initial zoom and animation duration are configurable.
- **Contrast-aware appearance**: with GNOME high contrast enabled, the spotlight uses opaque black/white palettes when its colors are still the defaults; the progress ring uses an explicit contrast-aware palette whose "stop now" state is yellow. Zoom-in and fade-out honor GNOME's system "Enable Animations" setting.
- **Mouse gesture**: wave the pointer horizontally and stop to show the spotlight. A pure, import-free state machine evaluates injected timestamps, and a pointer-local progress ring shows attempt progress with a distinct bright, thicker ready state. An optional confirmation sound uses `canberra-gtk-play -i message-new-instant` on a best-effort basis.
- **Two activation methods**: **Shortcut and gesture** (default, `<Super>f`) or opt-in **Always visible**. Activation is show-only: activating again refreshes the spotlight rather than hiding it, and moving the pointer ≥5 px refreshes a visible spotlight and resets its idle timeout.
- **Game Mode and multi-monitor**: optional Game Mode suppression, plus a choice of the current monitor or the bounding box of all monitors.
- **Practice mode**: "Try the Gesture" runs a real gesture session with live progress feedback, retry/cancel, text-only steps and success/warning status, without showing the real spotlight.
- **Settings, diagnostics and translations**: per-page reset controls with Undo, runtime log level, and gettext catalogs for English (source), French and Spanish.

## Installation

Prerequisites: GNOME Shell 46 or later, Git, Node.js 22+, npm, `glib-compile-schemas` (from `libglib2.0-bin` on Ubuntu/Debian) and `msgfmt` (from `gettext` on Ubuntu/Debian).

```bash
git clone https://github.com/herve-brun/find-my-mouse-example.com.git
cd find-my-mouse-example.com
npm install
npm run build

mkdir -p ~/.local/share/gnome-shell/extensions/find-my-mouse@herve-brun.github.io
cp -r dist/. ~/.local/share/gnome-shell/extensions/find-my-mouse@herve-brun.github.io/
```

`npm run build` compiles TypeScript from `src/` into `dist/`. Its automatic `postbuild` step compiles the GSettings schema and translation catalogs and copies `metadata.json`, `LICENSE.md`, the schema files and `assets/*.svg` into `dist/`, so `dist/` is the installable payload. Restart GNOME Shell (`Alt+F2`, `r`, `Enter`, or log out/in; Wayland sessions may require logout) and enable the extension with `gnome-extensions-app` or `gnome-extensions enable find-my-mouse@herve-brun.github.io`.

## Usage

### Activation

| Method | Description |
|---|---|
| Shortcut and gesture (default) | Internal `activation-method` value is `'shake'`. Press `<Super>f` or complete the wave-and-stop gesture; both use show-only activation. |
| Always visible | Set `activation-method` to `'always'`; the spotlight stays on screen with no idle timeout. `<Super>f` is not used in this mode: the shortcut row in Preferences is disabled and activation short-circuits. |

The `<Super>f` keybinding is registered regardless of activation method; it ignores auto-repeat and works in Normal and Overview shell modes. It stays the default deliberately: this is a shell-wide shortcut for a shell-wide feature, treated as a system-level exception to the HIG's usual app-shortcut conventions. `<Control>f` is not a good replacement because the HIG reserves it for Find.

Activating again repaints the spotlight and resets its idle timeout; it never toggles it off. While the spotlight is visible, pointer movement of ≥5 px also repaints it and resets the idle timeout. The spotlight hides on idle or when the extension shuts down.

Game Mode suppression is applied at activation time (when enabled): a gesture may be detected while Game Mode is active, but the spotlight is not shown. A Game Mode state change hides a visible spotlight, and when Game Mode ends the Always visible spotlight is restored.

### Mouse gesture

1. Move horizontally at ≥400 px/s with at least 2:1 horizontal dominance to arm the detector.
2. Reverse direction 3 times; each sweep must cover ≥90 px and the speed must dip below 20% of the sweep peak before a reversal counts. All reversals must happen within 900 ms.
3. Stop: the pointer must slow below 150 px/s within 180 ms to activate. A 1500 ms cooldown follows activation.

Detection is put on hold while a mouse button (configurable) or Ctrl/Alt is held, in a fullscreen app (configurable), on pointer jumps >250 px per sample, and while the spotlight is already visible. Inside the detector, a pause >400 ms or loss of horizontal dominance aborts the attempt. There is no minimum-distance setting; the amplitude floor is `max(120, sweep × reversals)` — 270 px at the defaults — so small, slow steps do not qualify.

### Configuration

Open GNOME Extensions → Find My Mouse → settings. The **General** page holds the activation mode, activation shortcut, Game Mode suppression and Show on All Monitors; **Appearance** holds the colors, radius, zoom and ring width; **Timing** holds the idle timeout and animation duration. The **Mouse Gesture** page offers Light / Standard / Firm presets, a "Fine-tune gesture" expander with the individual keys below, a live **Practice** row (**Try the Gesture** dialog), and an optional confirmation sound (off by default). When fine-tune values do not match a preset, a fourth display-only **Custom** state is shown. Preset values for reversals/sweep/window/settle/cooldown are Light `2/60/1200/260/1000`, Standard `3/90/900/180/1500` (default) and Firm `4/140/700/120/2000`.

Changing the shortcut opens a capture modal with a live shortcut preview: Escape cancels, BackSpace clears the pending shortcut, and at least one modifier key is required. The shortcut row is disabled in Always visible mode.

Each of General, Appearance, Timing, Mouse Gesture and About → Logging has a Reset control that restores that settings group's defaults and offers an Undo toast; older libadwaita releases show a confirmation dialog instead. The About page has Version, Website and Credits and License rows; the last opens an About dialog with a 2026 copyright, the GPL license and the 1.0.0 release notes.

#### Try the Gesture (practice)

"Try the Gesture" starts a real, time-limited practice session (10 s watchdog) in the shell extension. The preferences dialog talks to a small D-Bus service (`org.gnome.shell.extensions.find_my_mouse.Practice` at `/org/gnome/shell/extensions/find_my_mouse/Practice`) through a client proxy; gesture events flow through the real detector and the progress ring, but a success is reported back to the dialog instead of calling the normal activation path. No spotlight is shown during practice. The dialog announces status changes, reports success or warning, offers Cancel, Retry and "Show text-only steps…", and has no auto-close timer. If the D-Bus service is unavailable, a text-only fallback presents the same instructions derived from your current gesture settings.

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

Source files are TypeScript under `src/`; the Shell loads the compiled `dist/*.js`. Edit only `.ts` files. See `src/codemap.md` for a module-by-module source atlas and `schemas/codemap.md` for the GSettings key map.

```
src/
  extension.ts             →  dist/extension.js            (Lifecycle and wiring)
  prefs.ts                 →  dist/prefs.js                (Preferences UI)
  settings.ts              →  dist/settings.js             (GSettings wrapper)
  activationController.ts  →  dist/activationController.js (Activation policy + idle timeout)
  gestureDetector.ts       →  dist/gestureDetector.js      (Pure gesture state machine)
  gestureFeedback.ts       →  dist/gestureFeedback.js      (Progress ring + sound)
  spotlight.ts             →  dist/spotlight.js            (Hybrid spotlight + zoom animation)
  spotlightLayout.ts       →  dist/spotlightLayout.js      (Pure mask/dim rectangle layout math; unit-tested)
  mouseTracking.ts         →  dist/mouseTracking.js        (pointerWatcher adapter)
  gamemodeClient.ts        →  dist/gamemodeClient.js       (Game Mode D-Bus client)
  practiceService.ts       →  dist/practiceService.js      (Shell-side practice D-Bus service)
  practiceClient.ts        →  dist/practiceClient.js       (Preferences-side D-Bus proxy)
  utils.ts                 →  dist/utils.js                (Shared utilities)
```

| Script | Description |
|---|---|
| `npm run clean` | Remove `dist/` |
| `npm run check` | TypeScript type-check without emitting output |
| `npm run lint` | ESLint on `src/` |
| `npm run build` | Clean `dist/`, compile TypeScript; `postbuild` then compiles schema/catalogs and copies payload files |
| `postbuild` | Automatic after `npm run build`: compile schema and translations, copy `metadata.json`, `LICENSE.md`, schema files and `assets/*.svg` into `dist/` |
| `npm run build:schemas` | Compile the GSettings XML schema |
| `npm run i18n:pot` | Regenerate the gettext POT from compiled `dist/*.js` |
| `npm run i18n:update` | Regenerate the POT and merge it into `en`, `fr` and `es` PO files |
| `npm run i18n:build` | Validate PO files and compile `.mo` catalogs into `dist/locale/` |
| `npm run build:dist` | Build and create a distributable ZIP for EGO upload |
| `npm test` | Build, then run `node --test test/*.test.mjs` |
| `prepare` | Install the Husky git hooks (runs with `npm install`) |

### Testing

Unit tests feed synthesized pointer streams to the pure detector with injected timestamps (a deliberate wave activates; jitter, circles, drags, warps, slow/small steps, cooldown and pause/gap behavior are covered). `spotlightLayout.test.mjs` checks mask/dim tiling, negative monitor origins, edge clipping and zoom larger than the monitor.

For manual testing, use a nested Wayland session; GNOME 49+ needs `mutter-devkit` to draw the host window (Ubuntu: `sudo apt install mutter-dev-bin`), otherwise `--devkit` runs headless.

```bash
if [ "$(gnome-shell --version | awk '{print int($3)}')" -ge 49 ]; then
    dbus-run-session gnome-shell --devkit --wayland
else
    SHELL_DEBUG=backtrace-warnings dbus-run-session gnome-shell --nested --wayland
fi
```

X11 testing requires Xephyr: `Xephyr :1 -screen 1920x1080 &` then `DISPLAY=:1 dbus-run-session gnome-shell`.

View logs with `journalctl --user -f | grep "Find My Mouse"`. Concrete manual scenarios and the [manual HIG verification checklist](docs/codebase/TESTING.md#manual-hig-verification-checklist) are listed in `docs/codebase/TESTING.md`.

### Logging

| Level | Value | Description |
|---|---|---|
| ERROR | 0 | Critical errors |
| WARN | 1 | Warnings and errors |
| INFO | 2 | General information (default), including settings values and activation/practice events |
| DEBUG | 3 | Pointer coordinates, repaint/rendering activity and verbose diagnostics |

The level is changed in Preferences → About → Logging → Log level and applies immediately.

## Troubleshooting

- **Spotlight does not appear**: verify the extension is enabled (`gnome-extensions list`), check the log, and try the `<Super>f` shortcut in the default activation mode. Game Mode suppression can hold off activation even when a gesture is detected. Use "Try the Gesture" in Preferences for a live practice session: it reports progress and the result through the extension without showing a real spotlight, and offers retry, cancel and text-only steps. Ensure no mouse button or Ctrl/Alt is held, no fullscreen app is focused, and the spotlight is not already visible.
- **Gesture does not activate**: the pointer must move horizontally, cover ≥90 px per sweep, and stop promptly. Large jumps, pauses, circular motion and small jitter are rejected by design.
- **Shortcut unavailable in Preferences**: choose Shortcut and gesture instead of Always visible; in Always visible mode the spotlight is already on screen and the shortcut is not used.
- **Multi-monitor**: enable "Show on All Monitors" to cover the bounding box of all monitors; otherwise the current monitor is used.

## Contributing

Fork the repository, create a branch, edit `src/*.ts`, run `npm test` and `npm run lint`, and commit using [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). A local `commitlint` hook enforces the allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. PR titles are validated by CI (`.github/workflows/lint-pr.yml`).

## License

[GNU General Public License v3.0 or later](LICENSE.md). GNOME Shell extensions must be distributed under GPL-compatible terms; see the [GNOME extension review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html#licensing).

Project documentation and architecture notes are in `codemap.md`, `src/codemap.md`, `schemas/codemap.md` and `docs/codebase/`.
