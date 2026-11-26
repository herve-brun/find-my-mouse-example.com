# DESIGN & ARCHITECTURAL CHOICES

*Alors, voilà.* This file is not a thesis written by a committee in a tower. It is a plain explanation of why this extension looks like it does.

The main idea is small: when you lose your mouse on a big screen, we put a bright circle under it and dim the rest. But a GNOME Shell extension lives *inside* the Shell process. If we are messy, the whole desktop feels it. So the choices below are mostly about being a polite guest: clear jobs, small moving parts, no surprises.

---

## The short version, before the coffee gets cold

| Choice | Why, in plain words |
|---|---|
| One extension, no separate daemon | GNOME already gives us the lifecycle. Less machinery, less to break. |
| `extension.ts` is the conductor | It wires things; it does not paint or decide everything itself. |
| Activation is show-only | Pressing the shortcut again refreshes the spotlight, it does not hide it. Predictable. |
| Gesture is "wave then stop" | Wayland pointer samples are irregular; a deliberate gesture is easier to trust than jitter. |
| Detector is pure and import-free | We can test it with `node:test` without booting GNOME Shell. Very practical. |
| Rendering is a hybrid | Four dim widgets plus one small Cairo drawing = good look, less repaint work. |
| Settings live in GSettings | Preferences survive restart, and the Shell already knows how to do it. |
| Practice uses D-Bus | The preferences window can learn the gesture without showing the real spotlight. |
| TypeScript in `src/`, JavaScript in `dist/` | One source of truth, with types to catch silly mistakes. |
| Tests are cheap, manual checks are rare | Unit tests run fast; nested Shell is for the things a unit test cannot see. |

---

## 1. We are a guest in the Shell, not a separate kingdom

The extension starts in `src/extension.ts`. In `enable()`, it creates the managers, registers `<Super>f`, connects settings and Game Mode signals, and starts the pointer watch. In `disable()`, it removes all of that and destroys the managers.

Why like that? Because the Shell owns the house. We do not start our own service just to watch a cursor; we use `pointerWatcher`, `Main.uiGroup`, and the Shell keybinding API. And when the user disables the extension, we must leave no little sandwich wrapper on the table: no keybinding, no pointer watch, no timers, no stale actors.

Each manager is created once. There is one pointer, one spotlight, one activation policy, one practice session. Having three copies of those would not make us more correct; it would only make debugging longer.

---

## 2. Activation is show-only, because toggle games are annoying

Both activation paths — the `<Super>f` shortcut and the mouse gesture — call `ActivationController.activate(source)`. If the spotlight is already visible, we do **not** hide it. We repaint it and reset the idle timeout.

This was a real choice. A toggle sounds clever on paper, but in use it is frustrating: you press the shortcut because you cannot find the mouse, and if you press it twice the thing you asked for disappears. *Non, merci.* We prefer: "show me the mouse again".

The idle timeout also lives in `ActivationController`, not in `SpotlightManager`. `SpotlightManager` paints and animates; it does not decide when the user is finished. That separation is small, but it keeps the code calm. `SpotlightManager.isVisible` is just a fact, not a policy.

Game Mode suppression is checked in the same place. If a game is running and the user asked not to be disturbed, we stay quiet.

---

## 3. The gesture is "wave then stop", because Wayland is a diva

On Wayland, Ctrl double-press is not a reliable activation signal. Ctrl (with Alt) serves as a guard that suppresses a gesture while held; the supported activation paths are the `<Super>f` shortcut and a deliberate mouse gesture.

A squared-distance ratio alone cannot tell one-pixel jitter from a deliberate wave: tiny movement can score as highly as a real gesture. The detector therefore looks for a small story:

1. Arm on fast horizontal movement: at least **400 px/s**, with horizontal movement at least twice the vertical.
2. Count direction reversals of at least **90 px**, but require the speed to dip below 20% of the sweep peak first. This is the hysteresis; it stops us counting every little tremor.
3. Need **3 reversals within 900 ms**.
4. Then require the pointer to settle below **150 px/s within 180 ms**.
5. After a success, take a **1500 ms cooldown** so one wave does not become five activations.

There is also an amplitude floor of `max(120 px, sweep × reversals)`, a jump guard, and guards for buttons, Ctrl/Alt and fullscreen. Game Mode suppresses activation separately. It is not a math contest. It is a recipe for "the human really meant to do this".

The gesture is configured entirely by the `gesture-*` keys read from GSettings.

---

## 4. Pure logic here, GNOME glue there

`gestureDetector.ts` imports nothing. It receives samples with injected monotonic millisecond timestamps and returns events. `spotlightLayout.ts` is also pure: it does rectangle maths and knows nothing about GJS.

`mouseTracking.ts` is the adapter. It takes the absolute positions from `pointerWatcher`, keeps the authoritative last position, computes deltas, applies the guards, and feeds the detector. It also owns the little **16 ms clock** — but only while an attempt is in progress. Why? Because the pointer can stop moving, and we still need a "settle" tick to decide the gesture is finished. We do not want that timer running all day just in case.

This boundary is important. It is the fence between the garden and the road:

- Garden: pure detector and layout code, tested with `node:test`, no Shell needed.
- Road: pointer watchers, GI imports, actors, signals, real desktop state.

If we put `gi://St` inside the detector, our unit tests suddenly need GNOME Shell. Then testing becomes slow, and people stop testing. We avoid that trap.

---

## 5. Rendering: dim the world, draw only a small hole

The spotlight is a hybrid. Four `St.Widget` actors dim the screen. A small pointer-local `St.DrawingArea` draws the transparent hole and the ring with Cairo.

Why not paint the whole screen every time? Because that is wasteful. The dim parts are simple widgets with inline CSS colour; only the small mask is rasterised. We use `Cairo.Operator.CLEAR` to punch the hole and `Cairo.Operator.OVER` for the ring border.

A few house rules came from fighting with GNOME versions:

- Get the Cairo context inside `repaint` with `area.get_context()`, then dispose it.
- Use `queue_repaint()`, not `queue_redraw()`, for `St.DrawingArea`.
- Prefer inline CSS colour instead of `Clutter.Color`, because that changed between GNOME versions.
- Cancel an in-progress zoom timeline before showing again.

The zoom animation uses `Clutter.Timeline` with `easeOutQuad`. Multi-monitor geometry is the bounding box of all monitors, and absolute coordinates are kept, including negative X on monitors placed left of the primary one.

The result is simple to look at: dark screen, bright circle, soft zoom. Under the bonnet it is careful, not fancy.

---

## 6. Settings: one place for the memory

All user choices are stored in GSettings under `org.gnome.shell.extensions.find-my-mouse`. There are 20 keys. `SettingsManager` reads, normalises and caches them, so we are not calling GSettings for every pointer sample.

Preferences writes to GSettings, and `changed::` signals refresh the running extension. That is the GNOME way, and it works across processes without us inventing a config file format.

Some defaults deserve a word:

| Setting | Default | Why |
|---|---|---|
| Background | `#00000080` | Dim, but you can still see the desktop. |
| Spotlight | `#FFFFFFCC` | White at 80% keeps about 3:1 contrast. Visible without being aggressive. |
| Radius / zoom / animation | `100 px` / `9.0` / `500 ms` | A clear spotlight with a quick, not circus-like, zoom. |
| Idle timeout | `1000 ms` | Long enough to find the pointer, short enough to go away. |
| Gesture reversals / sweep / window | `3` / `90 px` / `900 ms` | A deliberate wave, not a spill from your coffee cup. |
| Settle / cooldown | `180 ms` / `1500 ms` | Finish cleanly, then rest. |
| Confirmation sound | off | A polite extension does not make noise by default. |

Colours use `#AARRGGBB` hex, because that is what the preferences code converts and what the rendering expects.

---

## 7. Practice mode: learn the gesture without lying to the user

The "Try the Gesture" page is not a fake animation. It uses the real `MouseTracker`, the real `GestureDetector`, and the real `GestureFeedback` ring. But it must **never** call `ActivationController.activate('gesture')`.

When practice is active, a successful gesture is reported as `PracticeService.Result(success=true, …)`. No real spotlight appears, and the progress ring stays until the session ends. This is the golden rule of practice mode. Break it, and the user sees a spotlight in the middle of a lesson that promised no spotlight. Bad trust.

The split is:

- `practiceService.ts` lives Shell-side. It owns the session-bus name, handles `Start()` and `Cancel()`, emits `Progress` and `Result`, and arms a 10 s watchdog. On `Start()` it hides any visible spotlight and resets `MouseTracker`, so the lesson begins from a clean desk.
- `practiceClient.ts` lives in Preferences. It is a `Gio.DBusProxy`; it retries, dispatches signals, and does not crash if the extension reloads.

The service is the single owner of session state. Every terminal path — Result, Cancel, dialog destroy, prefs close, extension disable, bus-name loss, watchdog — calls `_finish()` exactly once. So two preferences windows cannot leave a stale session waiting forever. *C'est réglé.*

If D-Bus is unavailable, the dialog falls back to text-only instructions derived from the current GSettings values. There is no auto-close timer: the human decides when they are done. Status changes are live announcements, and the accessible name matches the visible label.

---

## 8. Game Mode: we know when to be quiet

`gamemodeClient.ts` talks to `com.feralinteractive.GameMode` over D-Bus. If Game Mode is active and `do-not-activate-gamemode` is true, activation is suppressed.

The client retries proxy creation with backoff, and the extension re-checks Game Mode state at the end of `enable()` because the state can change before our managers are ready. This is not clever architecture; it is just respect for someone in the middle of a game.

---

## 9. Preferences: native clothes, human words

The preferences UI uses GTK4 and Adwaita, with pages for General, Appearance, Timing, Mouse Gesture and About. We want it to look like it belongs in GNOME, not like a web page that escaped from a browser.

User-facing strings are marked with `_()`. After changing them, we regenerate the gettext template and merge into the English, French and Spanish PO files. The build compiles catalogs with `msgfmt` into `dist/locale/`.

Two small details:

- GTK4 has no public shortcut entry widget, so the shortcut row uses a small modal capture dialog with a live `Gtk.ShortcutLabel`. The row is available in **Shortcut and gesture** mode and disabled in **Always visible** mode.
- Every preferences page has a reset-to-defaults control with an Undo toast.

The About dialog carries release notes and the year. When a new version is made, the notes must be updated; if the year changed, fix that too. Otherwise it looks like we forgot about the extension in a drawer.

---

## 10. TypeScript source, JavaScript runtime, no double bookkeeping

We edit only `src/*.ts`. The Shell loads `dist/*.js`, which is generated from that source and gitignored. A single source tree avoids two copies drifting apart and leaves no ambiguity about which one is authoritative.

`tsconfig.prod.json` compiles to `dist/`. Imports use `.js` extensions for NodeNext resolution even in TypeScript source; GI imports use `gi://…`, and Shell resource imports use `resource:///org/gnome/shell/...`. The custom declarations live in `ambient.d.ts` and `gnome-shell-extensions.d.ts`.

Why TypeScript at all? Because GNOME APIs are wide, and a type error found by `npm run check` is cheaper than an error found in a running Shell at 23:00.

---

## 11. Tests: small, fast, and honest

`npm test` builds first, then runs `node --test test/*.test.mjs`. The tests focus on the pure modules:

- deliberate wave, jitter, circles, drags, warps, cooldown, pauses and gaps;
- slow, small pointer steps (~30 px apart, 1500 ms apart) that must not activate;
- a normal 900 ms / 180 ms gesture that should activate;
- layout maths for mask/dim tiling, negative monitor origins, edge clipping and zoom bigger than the monitor.

CI also runs type-check, lint, schema and metadata validation, and commit message rules. That is enough guardrail for this size of project.

For real desktop behaviour, we use a nested Wayland session. GNOME 49+ needs the `mutter-devkit` helper to draw the host window; without it, `--devkit` starts headless and you will stare at nothing, wondering where the shell went. Older versions use `--nested`. No shell restart is needed, which is good for everyone's patience.

Logs come from `journalctl --user --no-pager | grep "Find My Mouse"`. Add `-f` to follow.

---

## 12. Things we deliberately did **not** do

- No separate background daemon. The Shell is already the host.
- Ctrl is a guard, never the trigger: Wayland double-press detection is unreliable, so activation comes from the `<Super>f` shortcut or the gesture.
- No toggle-off behaviour on repeat activation. Show means show.
- A squared-distance ratio would reward one-pixel noise, so the detector requires the shape of a deliberate wave instead.
- No auto-close timer in the practice dialog. The user is not a timer.
- No real activation during practice. Ever.
- One source tree: `src/*.ts` is authoritative; `dist/*.js` is generated output.
- No privileged APIs or secrets. Practice uses only the per-user session bus.
- No X11 as the primary target. Xephyr is useful for testing, but the real target is Wayland.
- No full-screen Cairo repaint. Small mask, small cost.

---

## 13. If you change something, remember this

1. Keep `gestureDetector.ts` and `spotlightLayout.ts` import-free. That is why tests are cheap.
2. Keep the 16 ms settle clock in `MouseTracker`, only while an attempt is alive.
3. Keep activation show-only, and keep the idle timer in `ActivationController`.
4. In practice mode, report success via `PracticeService`; never call the real activation path.
5. Every practice terminal path must end the session exactly once.
6. Compile the schema after editing `schemas/*.xml`.
7. After changing `_()` strings, run `npm run i18n:update`, translate, and commit the PO/POT files.
8. Use `queue_repaint()` for `St.DrawingArea`.
9. Update About release notes and year when a version is released.
10. Keep commits Conventional. The hook and CI are not there for decoration.

---

## Last word

The architecture is not built to impress anybody. It is built so a small extension can sit inside GNOME Shell, find a lost pointer, and then get out of the way.

Conductor in `extension.ts`. Pure brain in the detector. Careful painter in the spotlight. Session owner in practice. Settings in GSettings. Tests where they are cheap, manual checks where they are needed.

Simple, separated, and predictable. *Voilà, c'est tout.*
