import GLib from 'gi://GLib';
import type { SettingsManager } from './settings.js';
import { debugLog, isLogLevelEnabled, LogLevel } from './utils.js';

interface PointerWatch {
    remove(): void;
}

interface MovementRecord {
    dx: number;
    dy: number;
    tick: number;
}

const MAX_HISTORY = 100;

export class MouseTracker {
    private _settingsManager: SettingsManager;
    private _handleMouseMovement: (x: number, y: number) => void;
    private _pointerWatch: PointerWatch | null;
    private _lastX: number;
    private _lastY: number;
    private _movementHistory: MovementRecord[];
    private _historyStart: number;
    private _historyCount: number;
    private _lastTime: number;

    constructor(settingsManager: SettingsManager, handleMouseMovement: (x: number, y: number) => void) {
        this._settingsManager = settingsManager;
        this._handleMouseMovement = handleMouseMovement;
        this._pointerWatch = null;
        this._lastX = -1;
        this._lastY = -1;
        this._lastTime = 0;
        this._movementHistory = Array.from({ length: MAX_HISTORY }, () => ({ dx: 0, dy: 0, tick: 0 }));
        this._historyStart = 0;
        this._historyCount = 0;
    }

    async setup() {
        const { getPointerWatcher } = await import('resource:///org/gnome/shell/ui/pointerWatcher.js');
        const watcher = getPointerWatcher();
        this._pointerWatch = watcher.addWatch(16, (x, y) => {
            this._handleMouseMovement(x, y);
        });
        debugLog('Using pointerWatcher for mouse tracking', LogLevel.INFO);
    }

    remove() {
        if (this._pointerWatch) {
            this._pointerWatch.remove();
            this._pointerWatch = null;
        }
    }

    handleMouseMovement(x, y) {
      const now = GLib.get_monotonic_time(); // ✅ μs → seconds
      if (isLogLevelEnabled(LogLevel.DEBUG)) {
        if (this._lastX >= 0) {
          const dx = x - this._lastX;
          const dy = y - this._lastY;
          const deltaMs = (now - this._lastTime) / 1000;
          debugLog(
            `Mouse move: (${x}, ${y}) | Δx=${dx}, Δy=${dy} | Δt=${deltaMs.toFixed(2)}ms`,
            LogLevel.DEBUG,
          );
        } else {
          debugLog(`Mouse move: (${x}, ${y}) | First movement`, LogLevel.DEBUG);
        }
      }
      this._lastX = x;
      this._lastY = y;
      this._lastTime = now;

      // Don't overwrite _lastX/_lastY here — detectShake() sets them when called,
      // and the extension's callback uses its own tracking for movement detection.
      this._handleMouseMovement(x, y);
    }

    detectShake(x, y) {
        if (this._lastX < 0) {
            this._lastX = x;
            this._lastY = y;
            return false;
        }

        const dx = x - this._lastX;
        const dy = y - this._lastY;
        const now = GLib.get_monotonic_time() / 1000;

        // Fixed-size ring buffer: pointer events arrive every 16 ms, so pushing,
        // shifting and slicing an array on each one only creates GC pressure.
        const slot = (this._historyStart + this._historyCount) % MAX_HISTORY;
        const record = this._movementHistory[slot];
        record.dx = dx;
        record.dy = dy;
        record.tick = now;
        if (this._historyCount < MAX_HISTORY) {
            this._historyCount++;
        } else {
            this._historyStart = (this._historyStart + 1) % MAX_HISTORY;
        }

        const cutoffTime = now - this._settingsManager.cachedShakeInterval;
        while (
            this._historyCount > 0 &&
            this._movementHistory[this._historyStart].tick <= cutoffTime
        ) {
            this._historyStart = (this._historyStart + 1) % MAX_HISTORY;
            this._historyCount--;
        }

        let totalDistanceSquared = 0;
        let currentX = 0, currentY = 0;
        let minX = currentX, maxX = currentX;
        let minY = currentY, maxY = currentY;

        for (let i = 0; i < this._historyCount; i++) {
            const mov = this._movementHistory[(this._historyStart + i) % MAX_HISTORY];
            currentX += mov.dx;
            currentY += mov.dy;
            totalDistanceSquared += mov.dx * mov.dx + mov.dy * mov.dy;
            minX = Math.min(currentX, minX);
            maxX = Math.max(currentX, maxX);
            minY = Math.min(currentY, minY);
            maxY = Math.max(currentY, maxY);
        }

        const rectWidth = maxX - minX;
        const rectHeight = maxY - minY;
        const diagonalSquared = rectWidth * rectWidth + rectHeight * rectHeight;

        const shakeFactor = this._settingsManager.cachedShakeSensitivity / 100;
        if (
            diagonalSquared > 0 &&
            totalDistanceSquared / diagonalSquared > shakeFactor * shakeFactor
        ) {
            debugLog('Shake detected!', LogLevel.INFO);
            this.clearHistory();
            return true;
        }

        this._lastX = x;
        this._lastY = y;
        return false;
    }

    clearHistory() {
        this._historyStart = 0;
        this._historyCount = 0;
        this._lastX = -1;
        this._lastY = -1;
    }

    get lastX() { return this._lastX; }
    get lastY() { return this._lastY; }
}