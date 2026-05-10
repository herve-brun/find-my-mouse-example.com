# Codebase Concerns

## Core Sections (Required)

### 1) Top Risks (Prioritized)

| Severity | Concern | Evidence | Impact | Suggested action |
|----------|---------|----------|--------|------------------|
| High | **No automated testing** | Missing test files | Undetected regressions, manual QA bottleneck | **DECISION: Manual testing sufficient for now** |
| High | **Wayland/X11 compatibility** | `mouseTracking.js:15-20` | Different mouse tracking APIs, potential behavior divergence | Centralize display server detection and API selection |
| High | **Mixed DPI multi-monitor support** | `spotlight.js:68-100` | Incorrect scaling/positioning on mixed-DPI setups | Test with mixed-DPI configurations, add scaling logic |
| Medium | **State management complexity** | Spotlight visibility state in `spotlight.js`, activation logic in `extension.js` | Race conditions, inconsistent UI states | Consolidate state management |
| Medium | **Performance under load** | Real-time mouse tracking + rendering in `spotlight.js` | Janky animations, dropped frames | Profile rendering loop, optimize Cairo operations |
| Medium | **Multi-monitor edge cases** | `spotlight.js:68-100` | Incorrect geometry calculations | Add validation for monitor layouts |
| Low | **Error handling gaps** | Minimal try-catch usage | Unhandled exceptions may crash extension | Add defensive error boundaries |
| Low | **No CI pipeline** | `.github/workflows/test.yml` exists but minimal | No automated quality gates | Expand CI to include linting/testing |

### 2) Technical Debt

| Debt item | Why it exists | Where | Risk if ignored | Suggested fix |
|-----------|---------------|-------|-----------------|---------------|
| **Hardcoded defaults** | Magic numbers for animations/timings | `spotlight.js`, `settings.js` | Inconsistent behavior if defaults change | Centralize in constants file |
| **Duplicate color parsing** | Both `utils.js` and `prefs.js` parse colors | `utils.js:7`, `prefs.js:398` | Divergent behavior, maintenance overhead | Consolidate in `utils.js` |
| **No TypeScript** | Plain JavaScript | All `.js` files | Type safety issues | Migrate to TypeScript (planned post-v1.0) |

### 2.1) **RESOLVED: Debug Logging System**
- **Problem**: Excessive `debugLog` calls in hot paths (`spotlight.js`) causing performance overhead and noisy logs.
- **Solution Implemented**:
  - **Dynamic log levels** (ERROR=0, WARN=1, INFO=2, DEBUG=3) configurable via GSettings.
  - **Real-time updates**: Log level changes apply immediately without extension restart.
  - **Centralized filtering**: All logs pass through `utils.js` with level-based filtering.
  - **Default level**: INFO (2) for balanced verbosity.
- **Files Modified**:
  - `extension.js`: GSettings listener for dynamic updates.
  - `utils.js`: Log level filtering and `debugLog()` function.
  - `prefs.js`: UI for log level selection.
  - `schemas/org.gnome.shell.extensions.find-my-mouse.gschema.xml`: GSettings schema for `log-level`.
- **Evidence**:
  - Logs now respect the selected level (e.g., `DEBUG` shows detailed mouse coordinates, `INFO` shows key events only).
  - Changes apply immediately (tested via `journalctl --user -f | grep "Find My Mouse"`).

### 3) Security Concerns

| Risk | OWASP category (if applicable) | Evidence | Current mitigation | Gap |
|------|--------------------------------|----------|--------------------|-----|
| **Arbitrary code execution** | A03:2021 (Injection) | GSettings schema allows string values | Schema validation | Input sanitization for color values |
| **Privacy leakage** | N/A | No personal data handled | N/A | N/A |

### 4) Performance and Scaling Concerns

| Concern | Evidence | Current symptom | Scaling risk | Suggested improvement |
|---------|----------|-----------------|-------------|-----------------------|
| **Rendering performance** | `spotlight.js:109-146` (repaint handler) | Potential jank with complex animations | Poor user experience on low-end systems | Optimize Cairo operations, throttle repaints |
| **Mouse tracking overhead** | `mouseTracking.js:17-20` (50ms poll interval) | High CPU usage with frequent events | Battery drain on laptops | Implement event throttling/debouncing |
| **Memory leaks** | GLib timeout/source management | Accumulated timeouts if not cleaned up | Extension crashes over time | Audit timeout cleanup in `spotlight.js` |

### 5) Fragile/High-Churn Areas

| Area | Why fragile | Churn signal | Safe change strategy |
|------|-------------|-------------|----------------------|
| `extension.js` | Core orchestration logic | 12 commits in 90 days | Small, focused PRs with manual testing |
| `spotlight.js` | Complex rendering + animation | 8.8KB file size | Isolate changes, test on multiple monitor setups |
| `prefs.js` | GTK4 UI implementation | 15.3KB file size | UI component tests, visual regression checks |
| GSettings schema | Configuration contract | 5 commits in 90 days | Schema validation tests, versioned migrations |

### 6) `[ASK USER]` Questions

1. **[ASK USER]** Should automated testing (e.g., Jest, GNOME Shell test harness) be implemented? If so, what's the priority?
2. **[ASK USER]** Is TypeScript migration desirable for type safety?
3. **[ASK USER]** Should the unused `stylesheet.css` be removed or implemented?
4. **[ASK USER]** Are there specific multi-monitor configurations that need explicit support/testing?
5. **[ASK USER]** Should automated testing (e.g., Jest, GNOME Shell test harness) be implemented? If so, what's the priority?
5. **[RESOLVED]** Debug logging is now configurable via GSettings (`log-level`) with dynamic updates.

### 7) Evidence

- `/home/herve/Dev/Projets/find-my-mouse-example.com/docs/codebase/.codebase-scan.txt` (high-churn files)
- `/home/herve/Dev/Projets/find-my-mouse-example.com/spotlight.js` (rendering/animation complexity)
- `/home/herve/Dev/Projets/find-my-mouse-example.com/mouseTracking.js` (input handling)
- `/home/herve/Dev/Projets/find-my-mouse-example.com/.github/workflows/test.yml` (minimal CI)