import GLib from 'gi://GLib';

import { GestureDetector, type GestureConfig, type GestureEvent } from './gestureDetector.js';
import type { SettingsManager } from './settings.js';
import { debugLog, LogLevel } from './utils.js';

interface PointerWatch {
    remove(): void;
}

interface FocusWindow {
    is_fullscreen(): boolean;
}

interface DisplayWithFocus {
    get_focus_window?(): FocusWindow | null;
}

export interface GestureEventInfo {
    event: GestureEvent;
    progress: number;
    total: number;
}

export type PointerMoveHandler = (x: number, y: number, dx: number, dy: number) => void;
export type GestureEventHandler = (info: GestureEventInfo) => void;
export type DetectionAllowedHandler = () => boolean;

/** Clutter modifier bits used by global.get_pointer() (GI enums avoided here). */
const BUTTON_MASK = (1 << 8) | (1 << 9) | (1 << 10) | (1 << 11) | (1 << 12);
const CTRL_MASK = 1 << 2;
const ALT_MASK = 1 << 3;

const SAMPLE_INTERVAL_MS = 16;

/**
 * Thin adapter between GNOME's pointer sampler and the pure gesture detector.
 * It owns the only authoritative "last position" for gesture samples and the
 * short-lived clock that lets a stopped pointer commit the gesture.
 */
export class MouseTracker {
    private _settingsManager: SettingsManager;
    private _onPointerMove: PointerMoveHandler;
    private _onGestureEvent: GestureEventHandler;
    private _canDetect: DetectionAllowedHandler;
    private _detector: GestureDetector;
    private _pointerWatch: PointerWatch | null;
    private _removed: boolean;
    private _tickId: number;
    private _lastX: number | null;
    private _lastY: number | null;

    constructor(
        settingsManager: SettingsManager,
        onPointerMove: PointerMoveHandler,
        onGestureEvent: GestureEventHandler,
        canDetect: DetectionAllowedHandler,
    ) {
        this._settingsManager = settingsManager;
        this._onPointerMove = onPointerMove;
        this._onGestureEvent = onGestureEvent;
        this._canDetect = canDetect;
        this._detector = new GestureDetector(this._buildConfig());
        this._pointerWatch = null;
        this._removed = false;
        this._tickId = 0;
        this._lastX = null;
        this._lastY = null;
    }

    async setup(): Promise<void> {
        const { getPointerWatcher } = await import(
            'resource:///org/gnome/shell/ui/pointerWatcher.js'
        );
        if (this._removed)
            return;
        const watcher = getPointerWatcher();
        this._pointerWatch = watcher.addWatch(SAMPLE_INTERVAL_MS, (x, y) => {
            this._handleSample(x, y);
        });
        debugLog('Using pointerWatcher for mouse tracking', LogLevel.INFO);
    }

    remove(): void {
        this._removed = true;
        if (this._pointerWatch) {
            this._pointerWatch.remove();
            this._pointerWatch = null;
        }
        this._stopClock();
    }

    /** Rebuild detector settings after GSettings changed. */
    updateConfig(): void {
        this._detector.setConfig(this._buildConfig());
        this._stopClock();
    }

    /** Forget any in-progress attempt (mode change, spotlight shown, etc.). */
    reset(): void {
        this._detector.reset();
        this._lastX = null;
        this._stopClock();
    }

    private _buildConfig(): GestureConfig {
        const reversals = this._settingsManager.cachedGestureReversals;
        const sweepPx = this._settingsManager.cachedGestureSweep;
        return {
            reversals,
            sweepPx,
            windowMs: this._settingsManager.cachedGestureWindow,
            settleMs: this._settingsManager.cachedGestureSettle,
            cooldownMs: this._settingsManager.cachedGestureCooldown,
            // Scale the amplitude floor with the selected effort preset so the
            // Light preset stays achievable and tiny jitter never qualifies.
            minTravelPx: Math.max(120, sweepPx * reversals),
            maxJumpPx: 250,
            armSpeedPxPerSec: 400,
            settleSpeedPxPerSec: 150,
            axisDominance: 2,
            pauseMs: 400,
        };
    }

    private _handleSample(x: number, y: number): void {
        const previousX = this._lastX;
        const previousY = this._lastY;
        this._lastX = x;
        this._lastY = y;

        if (previousX === null || previousY === null) {
            this._onPointerMove(x, y, 0, 0);
            return;
        }

        const dx = x - previousX;
        const dy = y - previousY;
        this._onPointerMove(x, y, dx, dy);

        if (!this._canDetect()) {
            this._abortIfActive();
            return;
        }

        if (!this._guardsAllowGesture()) {
            this._abortIfActive();
            return;
        }

        this._feed({ dx, dy, tMs: this._nowMs() });
    }

    private _feed(sample: { dx: number; dy: number; tMs: number }): void {
        const event = this._detector.feed(sample);
        if (event !== 'none')
            this._publish(event);

        if (this._needsClock())
            this._startClock();
        else
            this._stopClock();
    }

    private _publish(event: GestureEvent): void {
        this._onGestureEvent({
            event,
            progress: this._detector.progress,
            total: this._settingsManager.cachedGestureReversals,
        });
        if (event === 'activated')
            debugLog('Mouse gesture detected', LogLevel.INFO);
    }

    private _abortIfActive(): void {
        const phase = this._detector.phase;
        if (phase === 'idle' || phase === 'cooldown')
            return;
        this._detector.reset();
        this._publish('aborted');
        this._stopClock();
    }

    private _guardsAllowGesture(): boolean {
        const [, , mask] = global.get_pointer();
        if (this._settingsManager.cachedGestureIgnoreButtons && (mask & BUTTON_MASK) !== 0)
            return false;
        if ((mask & (CTRL_MASK | ALT_MASK)) !== 0)
            return false;

        if (this._settingsManager.cachedGestureIgnoreFullscreen) {
            const display = global.display as unknown as DisplayWithFocus;
            const window = display.get_focus_window?.();
            if (typeof window?.is_fullscreen === 'function' && window.is_fullscreen())
                return false;
        }
        return true;
    }

    private _needsClock(): boolean {
        const phase = this._detector.phase;
        return phase === 'tracking' || phase === 'ready';
    }

    private _startClock(): void {
        if (this._tickId)
            return;
        this._tickId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            SAMPLE_INTERVAL_MS,
            () => {
                if (!this._canDetect()) {
                    this._abortIfActive();
                    return GLib.SOURCE_REMOVE;
                }
                this._feed({ dx: 0, dy: 0, tMs: this._nowMs() });
                return this._needsClock() ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
            },
        );
    }

    private _stopClock(): void {
        if (!this._tickId)
            return;
        GLib.source_remove(this._tickId);
        this._tickId = 0;
    }

    private _nowMs(): number {
        return GLib.get_monotonic_time() / 1000;
    }
}
