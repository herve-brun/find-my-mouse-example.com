# Find My Mouse — Testing

## Testing Approach

### Unit Tests

`npm test` builds the extension and runs the detector unit tests with Node's built-in runner:

```bash
npm test   # npm run build && node --test test/*.test.mjs
```

The tests feed synthesized pointer streams (absolute positions converted to deltas with injected monotonic millisecond timestamps) to `GestureDetector`, which is import-free and needs no GNOME Shell. Current coverage includes:

- a deliberate horizontal wave followed by stopping activates (including a discrete 900 ms window / 180 ms settle case);
- small jitter, circular motion, fast monotonic drags, and single large jumps (warps) do not activate;
- cooldown suppresses a second activation;
- pauses/gaps mid-attempt abort the attempt;
- the retired tutorial cadence — three ~30 px steps 1500 ms apart — never activates.

### Manual Testing

#### Wayland Session (Recommended)

```bash
if [ "$(gnome-shell --version | awk '{print int($3)}')" -ge 49 ]; then
    dbus-run-session gnome-shell --devkit --wayland
else
    SHELL_DEBUG=backtrace-warnings dbus-run-session gnome-shell --nested --wayland
fi
```

GNOME 49+ `--devkit` needs `mutter-devkit` to draw the host window (Ubuntu: `sudo apt install mutter-dev-bin`); without it the shell runs headless. This tests the extension without restarting the main shell. Use Preferences → Mouse Gesture → "Try the Gesture" for a live practice session: progress and result are reported to the dialog through the extension, and no real spotlight is shown. The dialog has no auto-close timer; retry/cancel stay available. These manual scenarios were not executed as part of this documentation change.

#### X11 Session

```bash
Xephyr :1 -screen 1920x1080 &
DISPLAY=:1 dbus-run-session gnome-shell
```

### Logging

- Adjustable at runtime: Preferences → About → Logging → Log Level (ERROR 0, WARN 1, INFO 2 default, DEBUG 3).
- View logs: `journalctl --user -f | grep "Find My Mouse"`.

### Manual Scenarios

| Scenario | Steps | Expected result |
|---|---|---|
| Deliberate wave | Move horizontally ≥90 px per sweep at ≥400 px/s, reverse 3 times within 900 ms, then stop. | Progress ring fills per reversal, turns bright at "stop now", then the spotlight shows; optional sound only if `gesture-sound` is on. |
| 1-pixel jitter | Move back and forth by ~1 px rapidly for several seconds. | No activation; the amplitude floor (`max(120 px, sweep × reversals)`) rejects it. |
| Circular motion | Trace a fast circle around the pointer's starting point. | No activation; horizontal dominance ≥2:1 is not maintained. |
| Drag with a button held | Hold left button and perform a deliberate wave. | No activation while `gesture-ignore-buttons` is true; the attempt aborts. |
| Fullscreen and Game Mode | Repeat the wave in a fullscreen app; then with an active GameMode client and suppression enabled. | No activation while `gesture-ignore-fullscreen` is true or GameMode suppression applies; the shortcut still shows the spotlight. |
| Multi-monitor with negative X | Place a monitor left of the primary one so x coordinates are negative; wave and check the spotlight/feedback position. | Spotlight and progress ring track the pointer without coordinate wrap or sign errors. |
| Settings extremes | Set presets and fine-tune keys to both range ends (e.g. 2 vs 6 reversals, 40 vs 300 px sweep, 400 vs 1500 ms window, 80 vs 400 ms settle, 500 vs 4000 ms cooldown); toggle both ignore switches and the sound. | Detector config updates without restart; attempts succeed/fail according to the configured thresholds; no stale progress ring remains. |
| Cooldown re-trigger | Activate with a wave, then immediately repeat the exact same wave; wait past `gesture-cooldown` and repeat again. | Second attempt ignored during cooldown; third activates normally. |
| Show-only repeat | Press `<Super>f` while the spotlight is visible, then trigger a gesture while it is visible. | Spotlight stays shown and the idle timeout is refreshed; it is not toggled off. |
| Idle timeout | Stop moving after activation. | Spotlight hides after `idle-timeout` ms (not in Always Visible mode). |
| Practice success | Start "Try the Gesture", then perform a deliberate wave and stop. | `Progress` fills the real pointer-local ring; `Result(success=true)` ends the session; no real spotlight appears and `ActivationController.activate('gesture')` is not called. |
| Practice failure and retry | Start practice, make a small jitter or aborted wave, then press retry and perform a correct wave. | Failure reports `Result(success=false, 'gesture-aborted')`; retry starts a fresh session; the following correct wave succeeds. |
| Practice cancel | Start practice, then press Cancel or close the preferences window. | `Cancel()`/dialog destroy ends the session, clears the watchdog and restores normal activation; no spotlight was shown. |
| Extension reload during practice | Start practice, then disable/re-enable the extension (or restart the nested shell). | Bus-name loss ends the session; the client survives without crashing and can retry or show the text-only fallback; no stale dialog remains. |
| Two prefs windows | Open two preferences windows and start practice from both. | The service is the single session owner; both clients see the same `Progress`/`Result`, and a terminal result ends the shared session. |
| Practice watchdog | Start practice and do nothing for 10 s. | `Result(success=false, 'timeout')` ends the session, clears the watchdog and restores normal activation. |
| Text-only fallback | Make the practice D-Bus service unavailable (e.g. extension disabled) and open the dialog. | Text-only instructions derived from current gesture keys are shown; no crash and no auto-close timer. |

## Evidence
- `package.json` (`test` script)
- `test/gestureDetector.test.mjs` (unit scenarios, including old-cadence regression)
- `src/gestureDetector.ts` (thresholds and state machine)
- `src/practiceService.ts`, `src/practiceClient.ts` (practice lifecycle and signals)
- `AGENTS.md` (nested session commands)
- `src/prefs.ts` (practice dialog and tuning UI)
