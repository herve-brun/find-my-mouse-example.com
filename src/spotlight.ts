import St from 'gi://St';
import Cairo from 'gi://cairo';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type { SettingsManager } from './settings.js';
import { debugLog, LogLevel } from './utils.js';
import { SpotlightGLSLEffect } from "./spotlightEffect.js"

interface MonitorGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
}

export class SpotlightManager {
    private _settingsManager: SettingsManager;
    private _spotlight: St.DrawingArea | null;
    private _glslEffect: InstanceType<typeof SpotlightGLSLEffect> | null;
    private _useGLSL: boolean;
    private _spotlightVisible: boolean;
    private _idleTimeoutId: number;

    constructor(settingsManager: SettingsManager, options?: any) {
        this._settingsManager = settingsManager;
        this._spotlight = null;
        this._glslEffect = null;
        this._useGLSL = true;
        this._spotlightVisible = false;
        this._idleTimeoutId = 0;
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
        const geometry = this._getMonitorGeometry(showOnAllMonitors);

        this._spotlight = new St.DrawingArea({
            x: geometry.x,
            y: geometry.y,
            width: geometry.width,
            height: geometry.height,
            opacity: 255,
        });

        // Attempt to use pure GLSL spotlight effect
        try {
            this._glslEffect = new SpotlightGLSLEffect(this._spotlight, this._settingsManager);
            this._spotlight.add_effect(this._glslEffect);
            this._glslEffect.setMonitorGeometry(geometry);
            this._glslEffect.show();
            this._useGLSL = true;
            debugLog('GLSL spotlight effect activated', LogLevel.INFO);
        } catch (e) {
            debugLog(`Failed to initialize GLSL effect, using Cairo fallback: ${e}`, LogLevel.WARN);
            this._useGLSL = false;
            this._spotlight.connect('repaint', this._onRepaint.bind(this));
        }

        Main.uiGroup.add_child(this._spotlight);
        this._spotlight.show();
        this._spotlightVisible = true;
        this._resetIdleTimeout();
    }

    updateMousePosition(x: number, y: number): void {
        if (this._useGLSL && this._glslEffect) {
            this._glslEffect.setMousePosition(x, y);
        }
        // Always repaint the Cairo base when mouse moves and no GLSL available
        if (!this._useGLSL && this._spotlight) {
            this._spotlight.queue_repaint();
        }
    }

    queueRepaint() {
        if (this._spotlight) {
            if (this._useGLSL && this._glslEffect) {
                this._glslEffect.queue_repaint();
            } else {
                this._spotlight.queue_repaint();
            }
            this._resetIdleTimeout();
        }
    }

    hide() {
        if (this._idleTimeoutId) {
            GLib.source_remove(this._idleTimeoutId);
            this._idleTimeoutId = 0;
        }
        if (this._spotlight) {
            if (this._glslEffect) {
                this._glslEffect.hide();
            }
            this._spotlight.destroy();
            this._spotlight = null;
            this._glslEffect = null;
        }
        this._spotlightVisible = false;
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
        // Cairo fallback: dimmed background + spotlight hole + circle
        const cr = area.get_context();
        if (!cr) return;

        const bgColor = this._settingsManager.cachedBgColorNormalized;
        cr.setOperator(Cairo.Operator.SOURCE);
        cr.setSourceRGBA(bgColor[0], bgColor[1], bgColor[2], bgColor[3]);
        cr.paint();

        const [mx, my] = global.get_pointer();
        const radius = this._settingsManager.cachedRadius;
        const zoom = this._settingsManager.cachedZoom;

        // Clear spotlight hole
        cr.setOperator(Cairo.Operator.CLEAR);
        cr.arc(mx - area.x, my - area.y, radius * zoom, 0, Math.PI * 2);
        cr.fill();

        // Draw spotlight circle
        cr.setOperator(Cairo.Operator.OVER);
        const spotlightColor = this._settingsManager.cachedSpotlightColorNormalized;
        cr.setSourceRGBA(spotlightColor[0], spotlightColor[1], spotlightColor[2], spotlightColor[3]);
        cr.arc(mx - area.x, my - area.y, radius, 0, Math.PI * 2);
        cr.stroke();

        cr.$dispose();
    }
}
