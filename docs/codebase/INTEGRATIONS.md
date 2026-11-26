# Find My Mouse — Integrations

## External APIs

### GNOME Shell / GJS APIs

| API | Purpose | Consumer |
|---|---|---|
| `resource:///org/gnome/shell/extensions/extension.js` | Base extension class | `extension.ts` |
| `resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js` | Base preferences class | `prefs.ts` |
| `resource:///org/gnome/shell/ui/main.js` | `Main.uiGroup`, `Main.wm.addKeybinding()` | `extension.ts`, `spotlight.ts`, `gestureFeedback.ts` |
| `resource:///org/gnome/shell/ui/pointerWatcher.js` | Absolute pointer samples (dynamic import) | `mouseTracking.ts` |
| `gi://St` | `St.DrawingArea` for spotlight and progress ring | `spotlight.ts`, `gestureFeedback.ts` |
| `gi://cairo` | Spotlight hole/ring and progress arcs | `spotlight.ts`, `gestureFeedback.ts` |
| `gi://Clutter` | `Clutter.Timeline` zoom and transition cleanup | `spotlight.ts`, `gestureFeedback.ts` |
| `gi://GLib` | Idle timer, monotonic timestamps, optional sound spawn | `activationController.ts`, `mouseTracking.ts`, `gestureFeedback.ts` |
| `gi://Gio` | GSettings and D-Bus proxy | `settings.ts`, `prefs.ts`, `gamemodeClient.ts`, `practiceService.ts`, `practiceClient.ts` |
| `gi://Gtk`, `gi://Adw`, `gi://Gdk` | Preferences UI | `prefs.ts` |
| `gi://Meta`, `gi://Shell` | Keybinding flags and action modes | `extension.ts` |
| `global.get_pointer()`, `global.display` | Position, modifier mask, focused window, monitor geometry | `extension.ts`, `mouseTracking.ts`, `activationController.ts`, `spotlight.ts`, `gestureFeedback.ts` |

### Node.js

| API | Purpose | Consumer |
|---|---|---|
| `node:test` | Unit test runner invoked by `npm test` (`build && node --test test/*.test.mjs`) | `test/*.test.mjs` |

### Examples

```typescript
// Pointer watch (adapter only; detector receives deltas)
const { getPointerWatcher } = await import('resource:///org/gnome/shell/ui/pointerWatcher.js');
this._pointerWatch = getPointerWatcher().addWatch(16, (x, y) => this._handleSample(x, y));

// Shortcut registered regardless of activation method
Main.wm.addKeybinding('find-my-mouse-activation', settings, flags, modes,
    () => this._activationController?.activate('shortcut'));

// Cairo rendering (both actors)
const cr = area.get_context();
```

## GSettings

- **Schema ID**: `org.gnome.shell.extensions.find-my-mouse`
- **Path**: `/org/gnome/shell/extensions/find-my-mouse/`
- **Keys**: 22 total, including the gesture tuning keys and two deprecated compatibility keys.

| Key | Type | Default | Description |
|---|---|---|---|
| `activation-method` | String | `'shake'` | "Shortcut and gesture" (`'shake'`) or "Always visible" (`'always'`) |
| `find-my-mouse-activation` | String[] | `['<Super>f']` | Activation shortcut; active in gesture mode |
| `gesture-reversals` | Int | `3` | Reversals required (2–6) |
| `gesture-sweep` | Int | `90` px | Minimum travel per sweep (40–300) |
| `gesture-window` | Int | `900` ms | Time allowed for all reversals (400–1500) |
| `gesture-settle` | Int | `180` ms | Time to slow down after the last reversal (80–400) |
| `gesture-cooldown` | Int | `1500` ms | Ignore gestures after activation (500–4000) |
| `gesture-ignore-buttons` | Bool | `true` | Ignore gestures while a mouse button is held |
| `gesture-ignore-fullscreen` | Bool | `true` | Ignore gestures in fullscreen apps |
| `gesture-sound` | Bool | `false` | Optional confirmation sound |
| `shake-interval` | Int | `1000` | Deprecated compatibility key; the detector uses the `gesture-*` keys |
| `shake-sensitivity` | Int | `400` | Deprecated compatibility key; the detector uses the `gesture-*` keys |
| `do-not-activate-gamemode` | Bool | `true` | Suppress spotlight during GameMode |
| `show-on-all-monitors` | Bool | `false` | Cover the bounding box of all monitors |
| `background-color` | String | `'#00000080'` | Backdrop with alpha |
| `spotlight-color` | String | `'#FFFFFFCC'` | Ring with alpha |
| `spotlight-radius` | Int | `100` | Spotlight radius in pixels |
| `spotlight-zoom` | Double | `9.0` | Initial zoom factor |
| `spotlight-ring-width` | Int | `2` | Ring width in pixels (0–20) |
| `idle-timeout` | Int | `1000` | Hide delay after pointer stops (ms) |
| `animation-duration` | Int | `500` | Zoom animation duration (ms) |
| `log-level` | Int | `2` | 0 ERROR, 1 WARN, 2 INFO, 3 DEBUG |

There is no minimum-distance setting or per-app exclusion key. The detector applies an amplitude floor of `max(120 px, gesture-sweep × gesture-reversals)`.

```typescript
const radius = settings.get_int('spotlight-radius');
settings.set_string('activation-method', 'shake');
```

## Practice D-Bus Integration

Practice uses the per-user session bus; the service lives in the shell extension and the client lives in the preferences process.

| Item | Value |
|---|---|
| Bus name / interface | `org.gnome.shell.extensions.find_my_mouse.Practice` |
| Object path | `/org/gnome/shell/extensions/find_my_mouse/Practice` |
| Methods | `Start()`, `Cancel()` |
| Signals | `Progress(event: s, progress: i, total: i)`, `Result(success: b, detail: s)` |
| Service | `src/practiceService.ts` — owns the name, reuses the real detector/progress ring, 10 s watchdog, routes `activated` to `Result(true, 'gesture-completed')` instead of real activation; the extension hides the progress ring when the terminal gesture event is handled |
| Client | `src/practiceClient.ts` — `Gio.DBusProxy` with retry, signal dispatch, and a text-only fallback; never crashes on extension reload |

Both sides converge on session teardown for `Result`, `Cancel()`, dialog destroy, prefs close, extension disable, bus-name loss and watchdog timeout. Practice has no dedicated GSettings keys: instructions are derived from the existing gesture keys.

## External System Dependencies

- **GameMode**: `com.feralinteractive.GameMode` D-Bus service; discovery failures are retried with backoff and treated as "GameMode unavailable".
- **Practice**: the extension-owned session-bus service above; if it is unavailable the preferences dialog shows text-only instructions instead of a live session.
- **Sound helper**: `canberra-gtk-play` is an optional, best-effort dependency. When `gesture-sound` is enabled, `GestureFeedback.playConfirmation()` spawns `canberra-gtk-play -i message-new-instant`; if the helper is missing or spawn fails, activation continues silently (no-op).
- **mutter-devkit**: required only for visible nested Wayland testing on GNOME 49+.

## Evidence
- `src/extension.ts` (GNOME Shell API and keybinding usage)
- `src/mouseTracking.ts` (pointerWatcher adapter)
- `src/gestureFeedback.ts` (optional sound helper)
- `src/practiceService.ts`, `src/practiceClient.ts` (practice D-Bus contract)
- `src/settings.ts` (GSettings cache)
- `schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml` (22 keys)
