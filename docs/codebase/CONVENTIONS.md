# Coding Conventions

## Core Sections (Required)

### 1) Naming Rules

| Item | Rule | Example | Evidence |
|------|------|---------|----------|
| Files | `kebab-case.js` | `mouse-tracking.js` | Directory listing |
| Classes | `PascalCase` | `SpotlightManager` | `spotlight.js:8` |
| Functions/methods | `camelCase` | `detectShake()` | `mouseTracking.js:36` |
| Variables | `camelCase` | `mouseX`, `_fadeTimeoutId` | `spotlight.js:20` |
| Constants | `UPPER_CASE` | `DEBUG` | `utils.js:1` |
| Private members | `_camelCase` | `_spotlightVisible` | `spotlight.js:13` |

### 2) Formatting and Linting

- Formatter: None (manual formatting)
- Linter: None
- Most relevant enforced rules:
  - 4-space indentation
  - Braces on same line for control structures
  - Semicolons required
- Run commands: N/A

### 3) Import and Module Conventions

- Import grouping/order: 
  - GNOME GI modules first (e.g., `import GLib from 'gi://GLib'`)
  - Local modules second (e.g., `import { debugLog } from './utils.js'`)
  - Alphabetical within groups
- Alias vs relative import policy: Relative paths only (no aliases)
- Public exports/barrel policy: Single named exports per file

### 4) Error and Logging Conventions

- Error strategy by layer:
  - **Extension layer**: Log errors but continue execution where possible
  - **UI layer**: Silent failure for non-critical UI issues
  - **Input layer**: Graceful degradation (e.g., fallback tracking methods)
- Logging style and required context fields:
  - Prefix: `Find My Mouse: `
  - Context: Method/function name where applicable
  - Example: `debugLog('Repaint handler called!')`
- Sensitive-data redaction rules: None (no sensitive data handled)

### 5) Testing Conventions

- Test file naming/location rule: N/A (no formal test suite)
- Mocking strategy norm: N/A
- Coverage expectation: N/A

### 6) Evidence

- `/home/herve/Dev/Projets/find-my-mouse-example.com/spotlight.js` (naming, formatting)
- `/home/herve/Dev/Projets/find-my-mouse-example.com/utils.js` (logging convention)
- `/home/herve/Dev/Projets/find-my-mouse-example.com/extension.js` (import order)