import St from 'gi://St';
import Cairo from 'gi://cairo';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type { SettingsManager } from './settings.js';
import { debugLog, isLogLevelEnabled, LogLevel } from './utils.js';

/** EASE_OUT_QUAD: t * (2 - t) — Clutter.get_progress() is linear, so we apply easing manually. */
function easeOutQuad(t: number): number {
    return t * (2 - t);
}

interface MonitorGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface FadeParams {
    opacity: number;
    duration: number;
    mode: Clutter.AnimationMode;
    onComplete: () => void;
}

/** ease() exists on Clutter.Actor at runtime but is missing from the st-14 types. */
type FadeableActor = Clutter.Actor & { ease(params: FadeParams): void };

export class SpotlightManager {
    private _settingsManager: SettingsManager;
    private _spotlight: St.DrawingArea | null;
    private _spotlightVisible: boolean;
    private _zoomTimeline: Clutter.Timeline | null;
    private _currentZoom: number;
    private _lastRepaintTime: number = 0;
    private _repaintCount: number = 0;
    private _fpsTimer: number = 0;
    private _lastMouseX: number = -1;
    private _lastMouseY: number = -1;
    private _interfaceSettings: Gio.Settings | null;

    constructor(settingsManager: SettingsManager) {
        this._settingsManager = settingsManager;
        try {
            this._interfaceSettings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.interface',
            });
        } catch (e) {
            this._interfaceSettings = null;
            debugLog(`Cannot read interface settings: ${e}`, LogLevel.WARN);
        }
        this._spotlight = null;
        this._spotlightVisible = false;
        this._zoomTimeline = null;
        this._currentZoom = 1;
    }

    get isVisible() {
        return this._spotlightVisible;
    }

    /** Honour the system-wide "reduce animation" accessibility setting. */
    private _animationsEnabled(): boolean {
        return this._interfaceSettings?.get_boolean('enable-animations') ?? true;
    }

    _getMonitorGeometry(showOnAllMonitors: boolean): MonitorGeometry {
        if (showOnAllMonitors) {
            // Calculate combined geometry for all monitors
            let x = 0,
                y = 0,
                width = 0,
                height = 0;
            const monitors = global.display.get_n_monitors();
            for (let i = 0; i < monitors; i++) {
                const geom = global.display.get_monitor_geometry(i);
                x = Math.min(x, geom.x);
                y = Math.min(y, geom.y);
                width = Math.max(width, geom.x + geom.width) - x;
                height = Math.max(height, geom.y + geom.height) - y;
            }
            return { x, y, width, height };
        } else {
            // Use current monitor geometry
            const monitor = global.display.get_current_monitor();
            return global.display.get_monitor_geometry(monitor);
        }
    }

    show(showOnAllMonitors: boolean): void {
        // Cancel any in-progress fade-out and destroy old actor synchronously.
        // This prevents a stale ease onComplete from destroying the new actor.
        if (this._spotlight) {
            this._spotlight.remove_all_transitions();
            this._destroySpotlightActor();
        }

        const geometry = this._getMonitorGeometry(showOnAllMonitors);

        this._spotlight = new St.DrawingArea({
            x: geometry.x,
            y: geometry.y,
            width: geometry.width,
            height: geometry.height,
            opacity: 255,
        });

        // Offscreen redirection forces a full-size buffer; configure it once per actor,
        // not on every repaint.
        this._spotlight.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS);

        // Always use Cairo repaint (no blur effect — Shell.BlurEffect can't do selective blur)
        this._spotlight.connect('repaint', this._onRepaint.bind(this));

        Main.uiGroup.add_child(this._spotlight);
        this._spotlight.show();
        this._spotlightVisible = true;

        // Start zoom-in animation: large circle shrinks to final radius
        this._startZoomAnimation();
    }

    updateMousePosition(x: number, y: number): void {
        // The pointer watcher only fires on position changes. Keep this guard so
        // duplicate coordinates never trigger a full-screen repaint.
        if (x === this._lastMouseX && y === this._lastMouseY) return;
        this._lastMouseX = x;
        this._lastMouseY = y;

        if (isLogLevelEnabled(LogLevel.DEBUG)) {
            debugLog(`Spotlight updateMousePosition: (${x}, ${y})`, LogLevel.DEBUG);
        }
        if (this._spotlight) {
            this._spotlight.queue_repaint();
        }
    }

    queueRepaint(): void {
        if (isLogLevelEnabled(LogLevel.DEBUG)) {
            debugLog('Spotlight queueRepaint called', LogLevel.DEBUG);
        }

        if (this._spotlight) {
            // If a fade-out ease is running, mouse activity should cancel it and re-show
            const actor = this._spotlight as Clutter.Actor;
            if (actor.get_transition('opacity')) {
                actor.remove_all_transitions();
                actor.opacity = 255;
                this._spotlightVisible = true;
            }
            this._spotlight.queue_repaint();
        }
    }

    private _startZoomAnimation(): void {
        const duration = this._settingsManager.cachedAnimationDuration;
        const initialZoom = this._settingsManager.cachedZoom;

        // Cancel any in-progress zoom
        if (this._zoomTimeline) {
            this._zoomTimeline.stop();
            this._zoomTimeline = null;
        }

        if (!this._spotlight) return;

        if (!this._animationsEnabled()) {
            this._currentZoom = 1;
            this._spotlight.queue_repaint();
            return;
        }

        // Start at the large zoom value
        this._currentZoom = initialZoom;
        this._spotlight.queue_repaint();

        this._zoomTimeline = new Clutter.Timeline({ duration });
        this._zoomTimeline.set_actor(this._spotlight);

        this._zoomTimeline.connect('new-frame', () => {
            if (!this._zoomTimeline) return; // Safety: stopped during frame callback
            // get_progress() returns linear [0,1]; apply easing manually
            const progress = this._zoomTimeline.get_progress();
            const eased = easeOutQuad(progress);
            this._currentZoom = 1 + (initialZoom - 1) * (1 - eased);
            if (this._spotlight) {
                this._spotlight.queue_repaint();
            }
        });

        this._zoomTimeline.connect('stopped', (_timeline: Clutter.Timeline, isFinished: boolean) => {
            this._zoomTimeline = null;
            if (isFinished) {
                this._currentZoom = 1;
                if (this._spotlight) {
                    this._spotlight.queue_repaint();
                }
            }
        });

        this._zoomTimeline.start();
    }

    private _destroySpotlightActor(): void {
        if (this._spotlight) {
            this._spotlight.destroy();
            this._spotlight = null;
        }
        this._spotlightVisible = false;
    }

    hide(): void {
        // Cancel any in-progress zoom animation
        if (this._zoomTimeline) {
            this._zoomTimeline.stop();
            this._zoomTimeline = null;
        }
        this._currentZoom = 1;

        if (this._spotlight) {
            if (!this._animationsEnabled()) {
                this._destroySpotlightActor();
                return;
            }

            // Fade out via actor.ease(), then destroy on completion
            const actor = this._spotlight as unknown as FadeableActor;
            actor.remove_all_transitions();
            actor.ease({
                opacity: 0,
                duration: this._settingsManager.cachedAnimationDuration,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this._destroySpotlightActor();
                },
            });
        } else {
            this._spotlightVisible = false;
        }
    }

    /**
     * Synchronous immediate teardown — no animation.
     * Used by disable() to avoid async races during extension shutdown.
     */
    destroyImmediately(): void {
        if (this._zoomTimeline) {
            this._zoomTimeline.stop();
            this._zoomTimeline = null;
        }
        this._currentZoom = 1;
        this._spotlight?.remove_all_transitions();
        this._destroySpotlightActor();
    }

    _onRepaint(area: St.DrawingArea): void {
        const now = GLib.get_monotonic_time();
        if (this._lastRepaintTime > 0 && isLogLevelEnabled(LogLevel.DEBUG)) {
            const deltaMs = (now - this._lastRepaintTime) / 1000;
            debugLog(`Repaint delta: ${deltaMs.toFixed(2)}ms`, LogLevel.DEBUG);
        }
        this._lastRepaintTime = now;
        this._repaintCount++;

        if ((now - this._fpsTimer) / 1000000 >= 1.0) {
            if (isLogLevelEnabled(LogLevel.DEBUG)) {
                debugLog(`FPS: ${this._repaintCount.toFixed(1)}`, LogLevel.DEBUG);
            }
            this._repaintCount = 0;
            this._fpsTimer = now;
        }

        const cr = area.get_context();
        if (!cr) return;

        // The pointer watcher already supplies coordinates; avoid a GI round-trip
        // on every repaint. Fall back once before the first position update.
        const [mx, my] = this._lastMouseX >= 0
            ? [this._lastMouseX, this._lastMouseY]
            : global.get_pointer();
        const radius = this._settingsManager.cachedRadius;
        const zoom = this._currentZoom;

        // Dark overlay
        const bgColor = this._settingsManager.cachedBgColorNormalized;
        cr.setOperator(Cairo.Operator.SOURCE);
        cr.setSourceRGBA(bgColor[0], bgColor[1], bgColor[2], bgColor[3]);
        cr.paint();

        // Clear circle
        cr.setOperator(Cairo.Operator.CLEAR);
        cr.arc(mx - area.x, my - area.y, radius * zoom, 0, Math.PI * 2);
        cr.fill();

        // Spotlight ring
        cr.setOperator(Cairo.Operator.OVER);
        const spotlightColor = this._settingsManager.cachedSpotlightColorNormalized;
        cr.setSourceRGBA(
            spotlightColor[0],
            spotlightColor[1],
            spotlightColor[2],
            spotlightColor[3],
        );
        cr.setLineWidth(this._settingsManager.cachedRingWidth);
        cr.arc(mx - area.x, my - area.y, radius * zoom, 0, Math.PI * 2);
        cr.stroke();

        cr.$dispose();
    }
}
