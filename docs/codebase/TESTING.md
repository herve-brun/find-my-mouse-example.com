# Testing Patterns

## Core Sections (Required)

### 1) Test Stack and Commands

- Primary test framework: **Manual Testing** (no automated test framework)
- Assertion/mocking tools: None
- Commands:

```bash
# Test in nested Wayland session (primary testing method)
if [ "$(gnome-shell --version | awk '{print int($3)}')" -ge 49 ]; then
    dbus-run-session gnome-shell --devkit --wayland
else
    SHELL_DEBUG=backtrace-warnings dbus-run-session gnome-shell --nested --wayland
fi

# Test in nested X11 session (requires Xephyr)
Xephyr :1 -screen 1920x1080 &
DISPLAY=:1 dbus-run-session gnome-shell

# View extension logs during testing
journalctl --user -f | grep "Find My Mouse"
```

### 2) Test Layout

- Test file placement pattern: N/A (no test files)
- Naming convention: N/A
- Setup files and where they run: N/A

### 3) Test Scope Matrix

| Scope | Covered? | Typical target | Notes |
|-------|----------|----------------|-------|
| Unit | No | Individual functions | Manual verification only |
| Integration | Partial | Component interactions | Tested via manual UI workflows |
| E2E | Yes | Full extension behavior | Primary testing approach |

### 4) Mocking and Isolation Strategy

- Main mocking approach: None
- Isolation guarantees: None
- Common failure mode in tests: N/A

### 5) Coverage and Quality Signals

- Coverage tool + threshold: N/A
- Current reported coverage: 0% (no automated tests)
- Known gaps/flaky areas:
  - Multi-monitor support edge cases
  - Wayland vs X11 compatibility
  - Animation performance under load
  - Shake detection false positives/negatives

### 6) Evidence

- `/home/herve/Dev/Projets/find-my-mouse-example.com/AGENTS.md` (testing commands)
- `/home/herve/Dev/Projets/find-my-mouse-example.com/README.md` (testing instructions)