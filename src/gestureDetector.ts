/**
 * Pure, environment-independent "wave then stop" gesture detector.
 *
 * This module deliberately has no imports: it can be compiled standalone and
 * exercised with node:test. The pointer adapter feeding it is responsible for
 * providing deltas and a monotonic millisecond timestamp (including periodic
 * zero-delta ticks while the pointer is stationary).
 */

export interface GestureSample {
    dx: number;
    dy: number;
    tMs: number;
}

export interface GestureConfig {
    reversals: number;
    sweepPx: number;
    windowMs: number;
    settleMs: number;
    cooldownMs: number;
    minTravelPx: number;
    maxJumpPx: number;
    armSpeedPxPerSec: number;
    settleSpeedPxPerSec: number;
    axisDominance: number;
    pauseMs: number;
}

export type GestureEvent = 'none' | 'armed' | 'progress' | 'ready' | 'activated' | 'aborted';

export type GesturePhase = 'idle' | 'tracking' | 'ready' | 'cooldown';

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
    reversals: 3,
    sweepPx: 90,
    windowMs: 900,
    settleMs: 180,
    cooldownMs: 1500,
    minTravelPx: 300,
    maxJumpPx: 250,
    armSpeedPxPerSec: 400,
    settleSpeedPxPerSec: 150,
    axisDominance: 2,
    pauseMs: 400,
};

/** Fraction of a sweep's peak speed that counts as a speed dip. */
const DIP_RATIO = 0.2;
/** Width of the trailing interval used for arming speed. */
const SPEED_SAMPLE_MS = 80;
/** Assumed sample interval when the very first sample has no predecessor. */
const FIRST_SAMPLE_DT_MS = 16;

export class GestureDetector {
    private config: GestureConfig;
    private _phase: GesturePhase = 'idle';
    private _progress = 0;

    private window: GestureSample[] = [];
    private lastT: number | null = null;
    private activatedAt = Number.NEGATIVE_INFINITY;
    private readyAt = Number.NEGATIVE_INFINITY;

    // Current horizontal sweep (direction changes are counted from these).
    private sweepSign = 0;
    private sweepDistance = 0;
    private sweepPeakSpeed = 0;
    private sweepSawDip = false;

    constructor(config: GestureConfig) {
        // Spread tolerates partially specified configs while keeping a copy.
        this.config = { ...DEFAULT_GESTURE_CONFIG, ...config };
    }

    get phase(): GesturePhase {
        return this._phase;
    }

    get progress(): number {
        return this._progress;
    }

    reset(): void {
        this._phase = 'idle';
        this.clearAttempt();
        this.lastT = null;
        this.activatedAt = Number.NEGATIVE_INFINITY;
        this.readyAt = Number.NEGATIVE_INFINITY;
    }

    setConfig(config: GestureConfig): void {
        this.config = { ...DEFAULT_GESTURE_CONFIG, ...config };
        this.reset();
    }

    feed(sample: GestureSample): GestureEvent {
        const cfg = this.config;
        const t = sample.tMs;

        // 1. Non-finite values and backwards timestamps are ignored.
        if (!Number.isFinite(sample.dx) || !Number.isFinite(sample.dy) || !Number.isFinite(t)) {
            return 'none';
        }
        if (this.lastT !== null && t < this.lastT) {
            return 'none';
        }

        // 2. Cooldown: ignore the whole attempt until it has elapsed.
        if (this._phase === 'cooldown') {
            if (t - this.activatedAt < cfg.cooldownMs) {
                return 'none';
            }
            this.reset();
        }

        const dtMs = this.lastT === null ? FIRST_SAMPLE_DT_MS : Math.max(t - this.lastT, 1);
        const stepPx = Math.hypot(sample.dx, sample.dy);
        const instantSpeed = (stepPx * 1000) / dtMs;

        // 3. Guard against cursor warps / monitor jumps.
        if (stepPx > cfg.maxJumpPx) {
            this.reset();
            this.lastT = t;
            return 'aborted';
        }

        // 9a. A silence mid-gesture aborts the attempt.
        if ((this._phase === 'tracking' || this._phase === 'ready') &&
            this.lastT !== null && t - this.lastT > cfg.pauseMs) {
            this.reset();
            this.lastT = t;
            return 'aborted';
        }

        this.lastT = t;

        // 4. Retain only samples inside the sliding window.
        this.window.push({ dx: sample.dx, dy: sample.dy, tMs: t });
        const cutoff = t - cfg.windowMs;
        while (this.window.length > 0 && this.window[0].tMs < cutoff) {
            this.window.shift();
        }
        const sums = this.windowSums();

        // 5. Arm only on fast, horizontal travel.
        if (this._phase === 'idle') {
            const speed = Math.max(this.recentSpeed(SPEED_SAMPLE_MS), this.windowSpeed(sums.path));
            if (sums.path >= cfg.minTravelPx &&
                sums.absDx >= cfg.axisDominance * sums.absDy &&
                speed >= cfg.armSpeedPxPerSec) {
                this._phase = 'tracking';
                this.startSweep(sample.dx, instantSpeed);
                return 'armed';
            }
            return 'none';
        }

        // 9b. Losing horizontal dominance invalidates the attempt.
        if (sums.absDx < cfg.axisDominance * sums.absDy) {
            this.reset();
            this.lastT = t;
            return 'aborted';
        }

        // 6. Track horizontal direction changes with a speed-dip hysteresis.
        const reversal = this.updateSweep(sample.dx, instantSpeed);
        if (reversal) {
            this._progress += 1;
            if (this._phase !== 'ready' && this._progress >= cfg.reversals) {
                // 7. Ready is emitted once; settling is checked on the
                // following sample.
                this._phase = 'ready';
                this.readyAt = t;
                return 'ready';
            }
            if (this._phase !== 'ready') {
                return 'progress';
            }
        }

        // 8. Settle after the final reversal.
        if (this._phase === 'ready') {
            if (t - this.readyAt > cfg.settleMs) {
                this.reset();
                this.lastT = t;
                return 'aborted';
            }
            if (instantSpeed < cfg.settleSpeedPxPerSec) {
                this.activatedAt = t;
                this._phase = 'cooldown';
                this.clearAttempt();
                this.lastT = t;
                return 'activated';
            }
        }

        return 'none';
    }

    /** Clear per-attempt state without touching config or cooldown timing. */
    private clearAttempt(): void {
        this.window = [];
        this._progress = 0;
        this.sweepSign = 0;
        this.sweepDistance = 0;
        this.sweepPeakSpeed = 0;
        this.sweepSawDip = false;
    }

    private startSweep(dx: number, speed: number): void {
        this.sweepSign = dx > 0 ? 1 : dx < 0 ? -1 : 0;
        this.sweepDistance = this.sweepSign === 0 ? 0 : Math.abs(dx);
        this.sweepPeakSpeed = speed;
        this.sweepSawDip = false;
    }

    /** Returns true when a valid, hysteretic direction change was counted. */
    private updateSweep(dx: number, instantSpeed: number): boolean {
        const sign = dx > 0 ? 1 : dx < 0 ? -1 : 0;
        if (sign === 0) {
            if (this.sweepSign !== 0 &&
                instantSpeed < DIP_RATIO * this.sweepPeakSpeed) {
                this.sweepSawDip = true;
            }
            return false;
        }

        if (this.sweepSign === 0) {
            this.startSweep(dx, instantSpeed);
            return false;
        }

        if (sign === this.sweepSign) {
            this.sweepPeakSpeed = Math.max(this.sweepPeakSpeed, instantSpeed);
            this.sweepDistance += Math.abs(dx);
            if (instantSpeed < DIP_RATIO * this.sweepPeakSpeed) {
                this.sweepSawDip = true;
            }
            return false;
        }

        const valid = this.sweepDistance >= this.config.sweepPx &&
            (this.sweepSawDip || instantSpeed < DIP_RATIO * this.sweepPeakSpeed);
        this.startSweep(dx, instantSpeed);
        return valid;
    }

    private windowSums(): { path: number; absDx: number; absDy: number } {
        let path = 0;
        let absDx = 0;
        let absDy = 0;
        for (const s of this.window) {
            path += Math.hypot(s.dx, s.dy);
            absDx += Math.abs(s.dx);
            absDy += Math.abs(s.dy);
        }
        return { path, absDx, absDy };
    }

    private windowSpeed(path: number): number {
        if (this.window.length < 2) return 0;
        const span = this.window[this.window.length - 1].tMs - this.window[0].tMs;
        return span > 0 ? (path * 1000) / span : 0;
    }

    /** Speed over the most recent ~intervalMs of retained samples. */
    private recentSpeed(intervalMs: number): number {
        if (this.window.length === 0) return 0;
        const newest = this.window[this.window.length - 1].tMs;
        const floor = newest - intervalMs;
        let first: number | null = null;
        let last: number | null = null;
        let path = 0;
        let previous: GestureSample | null = null;
        for (const s of this.window) {
            if (s.tMs < floor) {
                previous = s;
                continue;
            }
            if (first === null) first = s.tMs;
            last = s.tMs;
            if (previous !== null) {
                path += Math.hypot(s.dx, s.dy);
            }
            previous = s;
        }
        if (first === null || last === null || last <= first) return 0;
        return (path * 1000) / (last - first);
    }
}
