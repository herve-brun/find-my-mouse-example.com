import GLib from 'gi://GLib';
import { debugLog } from './utils.js';

export class MouseTracker {
    constructor(settingsManager, handleMouseMovement) {
        this._settingsManager = settingsManager;
        this._handleMouseMovement = handleMouseMovement;
        this._pointerWatch = null;
        this._lastX = -1;
        this._lastY = -1;
        this._movementHistory = [];
    }

    setup() {
        const { getPointerWatcher } = import('resource:///org/gnome/shell/ui/pointerWatcher.js');
        const watcher = getPointerWatcher();
        this._pointerWatch = watcher.addWatch(50, (x, y) => {
            this._handleMouseMovement(x, y);
        });
        debugLog('Using pointerWatcher for mouse tracking');
    }

    remove() {
        if (this._pointerWatch) {
            this._pointerWatch.remove();
            this._pointerWatch = null;
        }
    }

    handleMouseMovement(x, y) {
        this._lastX = x;
        this._lastY = y;
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

        this._movementHistory.push({ dx, dy, tick: now });

        if (this._movementHistory.length > 100) {
            this._movementHistory.shift();
        }

        const cutoffTime = now - this._settingsManager.cachedShakeInterval;
        let oldestIndex = 0;
        while (
            oldestIndex < this._movementHistory.length &&
            this._movementHistory[oldestIndex].tick <= cutoffTime
        ) {
            oldestIndex++;
        }
        if (oldestIndex > 0) {
            this._movementHistory = this._movementHistory.slice(oldestIndex);
        }

        let totalDistanceSquared = 0;
        let currentX = 0, currentY = 0;
        let minX = currentX, maxX = currentX;
        let minY = currentY, maxY = currentY;

        for (const mov of this._movementHistory) {
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
            debugLog('Shake detected!');
            this._movementHistory = [];
            this._lastX = -1;
            this._lastY = -1;
            return true;
        }

        this._lastX = x;
        this._lastY = y;
        return false;
    }

    clearHistory() {
        this._movementHistory = [];
        this._lastX = -1;
        this._lastY = -1;
    }

    get lastX() { return this._lastX; }
    get lastY() { return this._lastY; }
}