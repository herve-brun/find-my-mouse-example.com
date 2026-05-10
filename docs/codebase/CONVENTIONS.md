# Find My Mouse - Conventions

## Naming Conventions

| Type          | Convention          | Example                     |
|---------------|---------------------|-----------------------------|
| Classes       | PascalCase          | `SpotlightManager`          |
| Methods       | camelCase           | `detectShake()`             |
| Variables     | `_camelCase`        | `_spotlightVisible`         |
| Constants     | UPPER_SNAKE_CASE    | `LogLevel.ERROR`            |

## Formatting

- **Indentation**: 4 spaces.
- **Braces**: Opening brace on the same line.
- **Semicolons**: Always present.
- **Line Length**: No strict limit; logical wrapping.

### Example
```javascript
if (this._spotlightVisible) {
    this._spotlight.queue_repaint();
}
```

## Error Handling

- **Logging**: Uses `debugLog()` with levels:
  - `ERROR`: Critical errors.
  - `WARN`: Warnings.
  - `INFO`: General information.
  - `DEBUG`: Detailed debugging.
- **Graceful Degradation**: Checks for `null`/`undefined` before operations.

### Example
```javascript
if (!this._settings) return;
```

## Imports

- **GNOME Modules**: Imported via `gi://` or `resource://`.
  ```javascript
  import Clutter from 'gi://Clutter';
  import * as Main from 'resource:///org/gnome/shell/ui/main.js';
  ```
- **Local Modules**: Relative paths.
  ```javascript
  import { debugLog } from './utils.js';
  ```

## Coding Practices

- **Caching**: Settings are cached for performance.
  ```javascript
  this._cachedBgColorNormalized = [
      this._cachedBgColor[0] / 255,
      this._cachedBgColor[1] / 255,
      this._cachedBgColor[2] / 255,
      this._cachedBgColor[3] / 255
  ];
  ```
- **Event Cleanup**: Always disconnect signals in `disable()`.
  ```javascript
  if (this._settingsChangedId) {
      this._settingsManager.settings.disconnect(this._settingsChangedId);
  }
  ```

## Evidence
- `utils.js:debugLog()` (logging convention)
- `spotlight.js:constructor()` (private variable naming)
- `extension.js:disable()` (event cleanup)
- `settings.js:cacheSettings()` (caching logic)