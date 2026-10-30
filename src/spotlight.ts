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
    private _lastPointerX: number | null;
    private _lastPointerY: number | null;
    private _repaintTimeoutId: number;

    constructor(settingsManager: SettingsManager, _options?: any) {
        this._settingsManager = settingsManager;
        this._spotlight = null;
        this._spotlightVisible = false;
        this._idleTimeoutId = 0;
        this._zoomTimeline = null;
        this._currentZoom = 1;
        this._lastPointerX = null;
        this._lastPointerY = null;
        this._repaintTimeoutId = 0;
    }

    get isVisible() {
        return this._spotlightVisible;
    }

    private _cancelScheduledRepaint(): void {
        if (this._repaintTimeoutId) {
            GLib.source_remove(this._repaintTimeoutId);
            this._repaintTimeoutId = 0;
        }
    }

    private _scheduleRepaint(): void {
        if (!this._spotlight || this._repaintTimeoutId) {
            return;
        }

        this._repaintTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 0, () => {
            this._repaintTimeoutId = 0;
            if (this._spotlight) {
                this._spotlight.queue_repaint();
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _getMonitorGeometry(showOnAllMonitors: boolean): MonitorGeometry {
        if (showOnAllMonitors) {
            let x = 0;
            let y = 0;
            let width = 0;
            let height = 0;
            const monitors = global.display.get_n_monitors();

            for (let i = 0; i < monitors; i++) {
                const geom = global.display.get_monitor_geometry(i);
                x = Math.min(x, geom.x);
                y = Math.min(y, geom.y);
                width = Math.max(width, geom.x + geom.width) - x;
                height = Math.max(height, geom.y + geom.height) - y;
            }

            return { x, y, width, height };
        }

        const monitor = global.display.get_current_monitor();
        return global.display.get_monitor_geometry(monitor);
    }

    show(showOnAllMonitors: boolean): void {
        this._cancelScheduledRepaint();

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

        this._spotlight.connect('repaint', this._onRepaint.bind(this));
        Main.uiGroup.add_child(this._spotlight);
        this._spotlight.show();
        this._spotlightVisible = true;
        this._resetIdleTimeout();

        this._lastPointerX = null;
        this._lastPointerY = null;
        this._startZoomAnimation();
    }

    updateMousePosition(x: number, y: number): void {
        if (!this._spotlight) {
            return;
        }

        const lastX = this._lastPointerX ?? x;
        const lastY = this._lastPointerY ?? y;
        if (Math.abs(x - lastX) < 1 && Math.abs(y - lastY) < 1) {
            return;
        }

        this._lastPointerX = x;
        this._lastPointerY = y;
        this._scheduleRepaint();
    }

    queueRepaint(): void {
        if (!this._spotlight) {
            return;
        }

        const actor = this._spotlight as any;
        if (actor.get_transition('opacity')) {
            actor.remove_all_transitions();
            actor.opacity = 255;
            this._spotlightVisible = true;
        }

        this._scheduleRepaint();
        this._resetIdleTimeout();
    }

    private _startZoomAnimation(): void {
        const duration = this._settingsManager.cachedAnimationDuration;
        const initialZoom = this._settingsManager.cachedZoom;

        if (this._zoomTimeline) {
            this._zoomTimeline.stop();
            this._zoomTimeline = null;
        }

        if (!this._spotlight) {
            return;
        }

        this._currentZoom = initialZoom;
        this._scheduleRepaint();

        this._zoomTimeline = new Clutter.Timeline({ duration });
        this._zoomTimeline.set_actor(this._spotlight);

        this._zoomTimeline.connect('new-frame', () => {
            if (!this._zoomTimeline) {
                return;
            }

            const progress = this._zoomTimeline.get_progress();
            const eased = easeOutQuad(progress);
            this._currentZoom = 1 + (initialZoom - 1) * (1 - eased);
            this._scheduleRepaint();
        });

        this._zoomTimeline.connect('stopped', (_timeline: any, isFinished: boolean) => {
            this._zoomTimeline = null;
            if (isFinished) {
                this._currentZoom = 1;
                this._scheduleRepaint();
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
        this._cancelScheduledRepaint();

        if (this._idleTimeoutId) {
            GLib.source_remove(this._idleTimeoutId);
            this._idleTimeoutId = 0;
        }

        if (this._zoomTimeline) {
            this._zoomTimeline.stop();
            this._zoomTimeline = null;
        }

        this._currentZoom = 1;

        if (this._spotlight) {
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

    destroyImmediately(): void {
        this._cancelScheduledRepaint();

        if (this._idleTimeoutId) {
            GLib.source_remove(this._idleTimeoutId);
            this._idleTimeoutId = 0;
        }

        if (this._zoomTimeline) {
            this._zoomTimeline.stop();
            this._zoomTimeline = null;
        }

        this._currentZoom = 1;
        this._lastPointerX = null;
        this._lastPointerY = null;
        this._spotlight?.remove_all_transitions();
        this._destroySpotlightActor();
    }

    _resetIdleTimeout() {
        if (this._settingsManager.cachedActivationMethod === 'always') {
            return;
        }

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
        if (!cr) {
            return;
        }

        const [mx, my] = global.get_pointer();
        const radius = this._settingsManager.cachedRadius;
        const zoom = this._currentZoom;
        const centerX = mx - area.x;
        const centerY = my - area.y;

        const bgColor = this._settingsManager.cachedBgColorNormalized;
        cr.setOperator(Cairo.Operator.SOURCE);
        cr.setSourceRGBA(bgColor[0], bgColor[1], bgColor[2], bgColor[3]);
        cr.paint();

        cr.setOperator(Cairo.Operator.CLEAR);
        cr.arc(centerX, centerY, radius * zoom, 0, Math.PI * 2);
        cr.fill();

        cr.setOperator(Cairo.Operator.OVER);
        const spotlightColor = this._settingsManager.cachedSpotlightColorNormalized;
        cr.setSourceRGBA(spotlightColor[0], spotlightColor[1], spotlightColor[2], spotlightColor[3]);
        cr.setLineWidth(this._settingsManager.cachedRingWidth);
        cr.arc(centerX, centerY, radius * zoom, 0, Math.PI * 2);
        cr.stroke();

        cr.$dispose();
    }
}
