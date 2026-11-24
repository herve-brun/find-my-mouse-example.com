# Find My Mouse — Conventions

## Naming Conventions

| Type | Convention | Example |
|---|---|---|
| Classes | PascalCase | `GestureDetector`, `ActivationController` |
| Methods | camelCase | `feed()`, `activate()`, `setProgress()` |
| Private fields | `_camelCase` | `_spotlightVisible`, `_lastX`, `_idleTimeoutId` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_GESTURE_CONFIG`, `LogLevel.DEBUG`, `SAMPLE_INTERVAL_MS` |

Detector types use the names from the public API: `GestureSample`, `GestureConfig`, `GestureEvent`, `GesturePhase`, `GestureEventInfo`.

## Formatting

- Indentation: 4 spaces.
- Braces: opening brace on the same line.
- Semicolons: always present.
- Line length: no strict limit; logical wrapping.
- Local imports use `.js` extensions (NodeNext resolution), e.g. `import { GestureDetector } from './gestureDetector.js'`.

### Example

```typescript
if (this._spotlightManager.isVisible) {
    this._activationController.resetIdleTimeout();
}
```

## Error Handling

- Logging via `debugLog()` with levels `ERROR`, `WARN`, `INFO`, `DEBUG`.
- Guard clauses for optional resources (`if (!area) return;`, `if (!cr) return;`).
- Best-effort operations stay non-fatal: a missing `canberra-gtk-play` is swallowed in `GestureFeedback.playConfirmation()`.
- Detector guards ignore non-finite samples, backwards timestamps, jumps >250 px, and pauses >400 ms rather than throwing.

### Example

```typescript
if (!Number.isFinite(sample.dx) || !Number.isFinite(sample.tMs)) {
    return 'none';
}
```

## Imports

- GNOME modules: `gi://` or `resource://` paths.
  ```typescript
  import St from 'gi://St';
  import * as Main from 'resource:///org/gnome/shell/ui/main.js';
  ```
- Local modules: relative paths with `.js` extensions.
- `gestureDetector.ts` deliberately imports nothing; keep it free of GJS/GNOME dependencies so `node:test` can run it directly.

## Coding Practices

- Cache settings in `SettingsManager`; pass derived config into `GestureDetector` via `setConfig()` rather than reading GSettings inside the detector.
- Keep responsibilities separate: activation policy in `ActivationController`, rendering in `SpotlightManager`, pointer adaptation in `MouseTracker`, attempt feedback in `GestureFeedback`.
- Activation is show-only: use `activate(source)` for shortcut, gesture and always mode; never hide the spotlight in response to an activation.
- Practice sessions never call `ActivationController.activate('gesture')`: report `activated` through `PracticeService` as `Result(success=true, …)` and keep the progress ring visible.
- Keep the D-Bus contract in one place: bus name/interface `org.gnome.shell.extensions.find_my_mouse.Practice`, path `/org/gnome/shell/extensions/find_my_mouse/Practice`, methods `Start()`/`Cancel()`, signals `Progress(event: s, progress: i, total: i)` and `Result(success: b, detail: s)`.
- End every practice session exactly once: route terminal paths through `_finish()` (Result, Cancel, dialog destroy, prefs close, extension disable, bus-name loss, 10 s watchdog) and clear the watchdog.
- Disconnect signals and destroy actors in `disable()`; remove the 16 ms settle clock when an attempt ends.
- Use `queue_repaint()` on `St.DrawingArea`; dispose Cairo contexts with `cr.$dispose()`.
- Commit messages follow Conventional Commits (enforced by commitlint and CI).

## Evidence
- `src/gestureDetector.ts` (pure module and guard style)
- `src/activationController.ts` (show-only policy, timer cleanup)
- `src/practiceService.ts`, `src/practiceClient.ts` (D-Bus contract and session cleanup)
- `src/mouseTracking.ts` (adapter and settle clock)
- `src/extension.ts` (signal cleanup in `disable()`)
- `src/utils.ts` (logging convention)
