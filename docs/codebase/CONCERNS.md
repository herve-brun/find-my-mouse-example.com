# Find My Mouse — Concerns

## Technical Debt and Design Constraints

| Issue | Description | Evidence |
|---|---|---|
| **Wayland pointer sampling** | `pointerWatcher` reports absolute positions at irregular intervals, and callbacks arrive only on change. Pure per-sample ratio metrics (the removed squared-distance/diagonal rule) were unreliable: 1-pixel jitter could score highly while a deliberate wave might not. The detector now uses injected monotonic timestamps, speed, direction reversals with hysteresis, and an amplitude floor scaled by sweep × reversals. | `src/mouseTracking.ts`, `src/gestureDetector.ts` |
| **Gesture detector isolation** | All gesture logic is in an import-free class so `node:test` can exercise it without GNOME Shell. `MouseTracker` owns the GNOME-specific guards and the short-lived 16 ms settle clock; adding GI dependencies to the detector would break unit tests. | `src/gestureDetector.ts`, `test/gestureDetector.test.mjs` |
| **Legacy keys** | `shake-interval` and `shake-sensitivity` remain in the schema with their old defaults and are cached as deprecated getters. They are compatibility-only: hidden in Preferences and not read by the detector. Keeping them avoids invalidating existing user settings. | `schemas/...gschema.xml`, `src/settings.ts`, `src/prefs.ts` |
| **Modifier keys on Wayland** | Ctrl double-press is unreliable; Ctrl is treated as a guard rather than an activation method. The `<Super>f` shortcut and the mouse gesture are the supported paths. | `AGENTS.md`, `src/mouseTracking.ts` |
| **X11 support** | X11 runs via Xephyr for testing only; primary target is Wayland. | `AGENTS.md` |
| **Optional sound helper** | `canberra-gtk-play` is invoked best-effort when `gesture-sound` is enabled; a missing helper is silently ignored. | `src/gestureFeedback.ts` |
| **Shortcut registration** | `find-my-mouse-activation` is described in the schema as activating the spotlight, matching the show-only runtime policy: `<Super>f` never toggles it off. | `schemas/...gschema.xml`, `src/activationController.ts` |

## Practice Lifecycle Risks

| Risk | Mitigation | Evidence |
|---|---|---|
| A practice success accidentally shows the real spotlight | While practice is active, `activated` is routed to `PracticeService.reportEvent()` → `Result(success=true, …)`; `ActivationController.activate('gesture')` is never called and the real progress ring stays visible until the session ends. | `src/extension.ts`, `src/practiceService.ts` |
| A session outlives its dialog | `Result`, `Cancel()`, dialog destroy, prefs close and the 10 s watchdog all end the session; `_finish()` clears the watchdog and notifies the extension. | `src/practiceService.ts`, `src/practiceClient.ts`, `src/prefs.ts` |
| Extension disable or reload leaves prefs waiting | `disable()` calls `practiceService.destroy()`; the bus name is unowned, the client handles bus-name loss without crashing and can retry or show the text-only fallback. | `src/extension.ts`, `src/practiceService.ts`, `src/practiceClient.ts` |
| Two prefs windows contend for one session | The service owns the bus name and is the single source of session state; every terminal path ends the shared session. | `src/practiceService.ts`, `src/practiceClient.ts` |
| No accessible or non-visual guidance | The button's accessible name matches the visible `Practice` label, status changes are live announcements, and text-only instructions remain when D-Bus is unavailable. The dialog has no auto-close timer. | `src/prefs.ts`, `src/practiceClient.ts` |
| An obsolete fixed cadence teaches an impossible gesture | Instructions are derived from the current GSettings gesture keys; the old three-step, 1500 ms / ~30 px cadence is covered by a no-activation regression test. | `src/prefs.ts`, `test/gestureDetector.test.mjs` |

## Security

- No secrets or environment variables are used.
- Standard GNOME Shell extension permissions; GameMode access is via its D-Bus service.
- Practice uses the per-user session bus under `org.gnome.shell.extensions.find_my_mouse.Practice`; no privileged APIs or external helpers are involved.

## Performance

| Area | Detail |
|---|---|
| Pointer tracking | `pointerWatcher` requests 16 ms sampling; the settle clock runs only while a gesture is in progress. |
| Detector state | Only samples within `gesture-window` are retained; no unbounded movement history. |
| Rendering | Cairo on `St.DrawingArea`; the feedback ring is a ~40×40 actor created only during an attempt. |
| Animation | `Clutter.Timeline` with `easeOutQuad`; timelines are cancelled before re-show. |
| Idle timer | Owned by `ActivationController`, cleared on every reset/hide. |
| Practice watchdog | One 10 s `GLib.timeout_add` per active session, removed on every terminal path. |

## Validation Coverage

- `npm test` runs `node --test` unit tests against the pure detector (deliberate wave, jitter, circles, drags, warps, cooldown, pause/gap, the retired 1500 ms / ~30 px tutorial cadence as a no-activation regression, and a normal 900 ms/180 ms gesture).
- Manual scenarios (fullscreen, GameMode, multi-monitor with negative X, settings extremes, practice success/failure/retry/cancel, extension reload, two prefs windows, watchdog) are listed in `docs/codebase/TESTING.md`; none were run in a Wayland session for this documentation change.
- CI runs lint, type-check, schema and metadata validation, and invokes `npm test` (build + `node:test`) in a dedicated job (see `.github/workflows/test.yml`).

## Evidence
- `AGENTS.md` (Wayland/X11 and test commands)
- `src/mouseTracking.ts` (sampling interval, guards, settle clock)
- `src/gestureDetector.ts` (state machine and thresholds)
- `src/practiceService.ts`, `src/practiceClient.ts` (practice lifecycle and D-Bus contract)
- `test/gestureDetector.test.mjs` (unit scenarios)
- `schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml` (legacy keys)
- `.github/workflows/test.yml` (CI jobs)
