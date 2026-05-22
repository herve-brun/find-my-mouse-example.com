import St from 'gi://St';
import Cairo from 'gi://cairo';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type { SettingsManager } from './settings.js';


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

export class SpotlightManager {
    private _settingsManager: SettingsManager;
    private _spotlight: St.DrawingArea | null;
    private _spotlightVisible: boolean;
    private _idleTimeoutId: number;
    private _zoomTimeline: Clutter.Timeline | null;
    private _currentZoom: number;

    constructor(settingsManager: SettingsManager, _options?: any) {
        this._settingsManager = settingsManager;
        this._spotlight = null;
        this._spotlightVisible = false;
        this._idleTimeoutId = 0;
        this._zoomTimeline = null;
        this._currentZoom = 1;
    }

    get isVisible() {
        return this._spotlightVisible;
    }

    _getMonitorGeometry(showOnAllMonitors: boolean): MonitorGeometry {
        if (showOnAllMonitors) {
            // Calculate combined geometry for all monitors
            let x = 0, y = 0, width = 0, height = 0;
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

        // Always use Cairo repaint (no blur effect — Shell.BlurEffect can't do selective blur)
        this._spotlight.connect('repaint', this._onRepaint.bind(this));

        Main.uiGroup.add_child(this._spotlight);
        this._spotlight.show();
        this._spotlightVisible = true;
        this._resetIdleTimeout();

        // Start zoom-in animation: large circle shrinks to final radius
        this._startZoomAnimation();
    }

    updateMousePosition(_x: number, _y: number): void {
        if (this._spotlight) {
            this._spotlight.queue_repaint();
        }
    }

    queueRepaint(): void {
        if (this._spotlight) {
            // If a fade-out ease is running, mouse activity should cancel it and re-show
            const actor = this._spotlight as any;
            if (actor.get_transition('opacity')) {
                actor.remove_all_transitions();
                actor.opacity = 255;
                this._spotlightVisible = true;
            }
            this._spotlight.queue_repaint();
            this._resetIdleTimeout();
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

        this._zoomTimeline.connect('stopped', (_t: any, isFinished: boolean) => {
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
        if (this._idleTimeoutId) {
            GLib.source_remove(this._idleTimeoutId);
            this._idleTimeoutId = 0;
        }

        // Cancel any in-progress zoom animation
        if (this._zoomTimeline) {
            this._zoomTimeline.stop();
            this._zoomTimeline = null;
        }
        this._currentZoom = 1;

        if (this._spotlight) {
            // Fade out via actor.ease(), then destroy on completion
            // Cast: ease() exists on Clutter.Actor at runtime but isn't in st-14 types
            const actor = this._spotlight as any;
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
        if (this._idleTimeoutId) {
            GLib.source_remove(this._idleTimeoutId);
            this._idleTimeoutId = 0;
        }
        if (this._zoomTimeline) {
            this._zoomTimeline.stop();
            this._zoomTimeline = null;
        }
        this._currentZoom = 1;
        this._spotlight?.remove_all_transitions();
        this._destroySpotlightActor();
    }

    _resetIdleTimeout() {
        if (this._settingsManager.cachedActivationMethod === 'always') return;
        if (this._idleTimeoutId) {
            GLib.source_remove(this._idleTimeoutId);
        }
        const timeout = this._settingsManager.cachedIdleTimeout;
        if (timeout > 0 && this._spotlightVisible) {
            this._idleTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                timeout,
                () => {
                    this.hide();
                    this._idleTimeoutId = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
        }
    }

    _onRepaint(area: St.DrawingArea): void {
        const cr = area.get_context();
        if (!cr) return;

        const [mx, my] = global.get_pointer();
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
        cr.setSourceRGBA(spotlightColor[0], spotlightColor[1], spotlightColor[2], spotlightColor[3]);
        cr.setLineWidth(this._settingsManager.cachedRingWidth);
        cr.arc(mx - area.x, my - area.y, radius * zoom, 0, Math.PI * 2);
        cr.stroke();

        cr.$dispose();
    }
}
