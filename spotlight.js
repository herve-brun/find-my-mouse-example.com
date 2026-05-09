import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Cairo from 'gi://cairo';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { debugLog } from './utils.js';

export class SpotlightManager {
    constructor(settingsManager) {
        this._settingsManager = settingsManager;
        this._spotlight = null;
        this._spotlightGeometry = null;
        this._spotlightVisible = false;
        this._currentAlpha = 0;
        this._targetAlpha = 255;
        this._fadeStep = 0;
        this._fadeTimeoutId = 0;
        this._idleTimeoutId = 0;
        this._mappedSignalId = 0;
        this._mouseX = -1;
        this._mouseY = -1;
    }

    show(showOnAllMonitors) {
        debugLog(`_showSpotlight called (method: ${this._settingsManager.cachedActivationMethod})`);
        if (this._spotlightVisible && this._settingsManager.cachedActivationMethod !== 'always') {
            debugLog('Already visible, skipping');
            return;
        }

        this._cancelFade();

        if (this._spotlight) {
            this._spotlight.destroy();
            this._spotlight = null;
        }

        if (showOnAllMonitors) {
            debugLog('Calling _showOnAllMonitors');
            this._showOnAllMonitors();
        } else {
            debugLog('Calling _showOnCurrentMonitor');
            this._showOnCurrentMonitor();
        }
    }

    _showOnCurrentMonitor() {
        const monitor = global.display.get_current_monitor();
        const geometry = global.display.get_monitor_geometry(monitor);
        debugLog(`Current monitor geometry: ${JSON.stringify(geometry)}`);

        const [mx, my] = global.get_pointer();
        this._mouseX = mx;
        this._mouseY = my;

        const opacity = this._settingsManager.cachedActivationMethod === 'always' ? 255 : 0;
        this._spotlight = new St.DrawingArea({
            x: geometry.x,
            y: geometry.y,
            width: geometry.width,
            height: geometry.height,
            opacity: opacity,
        });
        debugLog(`St.DrawingArea created with size: ${geometry.width}x${geometry.height}`);
        this._setupSpotlightCommon(geometry);
    }

    _showOnAllMonitors() {
        const nMonitors = global.display.get_n_monitors();
        const geometries = [];
        for (let i = 0; i < nMonitors; i++) {
            geometries.push(global.display.get_monitor_geometry(i));
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const geom of geometries) {
            minX = Math.min(minX, geom.x);
            minY = Math.min(minY, geom.y);
            maxX = Math.max(maxX, geom.x + geom.width);
            maxY = Math.max(maxY, geom.y + geom.height);
        }

        const geometry = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        debugLog(`All monitors geometry: ${JSON.stringify(geometry)}`);

        const [mx, my] = global.get_pointer();
        this._mouseX = mx;
        this._mouseY = my;

        const opacity = this._settingsManager.cachedActivationMethod === 'always' ? 255 : 0;
        this._spotlight = new St.DrawingArea({
            x: geometry.x,
            y: geometry.y,
            width: geometry.width,
            height: geometry.height,
            opacity: opacity,
        });
        debugLog(`St.DrawingArea created for all monitors with size: ${geometry.width}x${geometry.height}`);
        this._setupSpotlightCommon(geometry);
    }

    _setupSpotlightCommon(geometry) {
        this._spotlightGeometry = geometry;
        this._currentAlpha = 255;
        this._targetAlpha = 255;
        this._spotlight.opacity = 255;

        debugLog('Setting up repaint handler');
        this._spotlight.connect('repaint', (area) => {
            debugLog('Repaint handler called!');
            const cr = area.get_context();
            if (!cr) {
                debugLog('Repaint context is null!');
                return;
            }

            const geom = this._spotlightGeometry;
            const mx = this._mouseX !== undefined ? this._mouseX : global.get_pointer()[0];
            const my = this._mouseY !== undefined ? this._mouseY : global.get_pointer()[1];
            debugLog(`Repaint - mx=${mx}, my=${my}, geom.x=${geom.x}, geom.y=${geom.y}`);

            const bgColor = this._settingsManager.cachedBgColorNormalized;
            const spotlightColor = this._settingsManager.cachedSpotlightColorNormalized;
            const radius = this._settingsManager.cachedRadius;
            const zoom = this._settingsManager.cachedZoom;

            const currentBgAlpha = bgColor[3];
            const currentSpotAlpha = spotlightColor[3];
            const currentSpotRadius = radius * zoom;

            debugLog(`Repaint - currentBgAlpha=${currentBgAlpha}, currentSpotAlpha=${currentSpotAlpha}, currentSpotRadius=${currentSpotRadius}`);

            cr.setOperator(Cairo.Operator.SOURCE);
            cr.setSourceRGBA(bgColor[0], bgColor[1], bgColor[2], currentBgAlpha);
            cr.paint();

            cr.setOperator(Cairo.Operator.CLEAR);
            cr.arc(mx - geom.x, my - geom.y, currentSpotRadius, 0, 2 * Math.PI);
            cr.fill();

            cr.setOperator(Cairo.Operator.OVER);
            cr.setSourceRGBA(spotlightColor[0], spotlightColor[1], spotlightColor[2], currentSpotAlpha);
            cr.arc(mx - geom.x, my - geom.y, currentSpotRadius, 0, 2 * Math.PI);
            cr.setLineWidth(2);
            cr.stroke();
        });

        debugLog('Adding to Main.uiGroup');
        Main.uiGroup.add_child(this._spotlight);
        debugLog('Showing spotlight');
        this._spotlight.show();

        this._mappedSignalId = this._spotlight.connect('notify::mapped', () => {
            debugLog('Spotlight mapped, queueing repaint');
            this._spotlight.queue_repaint();
            if (this._mappedSignalId) {
                this._spotlight.disconnect(this._mappedSignalId);
                this._mappedSignalId = 0;
            }
        });

        this._spotlightVisible = true;
        debugLog('Spotlight is now visible');
        this._resetIdleTimeout();
    }

    hide() {
        if (this._settingsManager.cachedActivationMethod === 'always') return;

        this._cancelFade();

        if (this._mappedSignalId) {
            if (this._spotlight) this._spotlight.disconnect(this._mappedSignalId);
            this._mappedSignalId = 0;
        }

        if (this._spotlight) {
            Main.uiGroup.remove_child(this._spotlight);
            this._spotlight.destroy();
            this._spotlight = null;
            this._spotlightVisible = false;
        }

        if (this._idleTimeoutId) {
            GLib.source_remove(this._idleTimeoutId);
            this._idleTimeoutId = 0;
        }

        this._currentAlpha = 0;
    }

    _cancelFade() {
        if (this._fadeTimeoutId) {
            GLib.source_remove(this._fadeTimeoutId);
            this._fadeTimeoutId = 0;
        }
    }

    _resetIdleTimeout() {
        if (this._settingsManager.cachedActivationMethod === 'always') return;

        if (this._idleTimeoutId) {
            GLib.source_remove(this._idleTimeoutId);
        }

        const timeoutMs = this._settingsManager.cachedIdleTimeout;
        this._idleTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            timeoutMs,
            () => {
                this._startFadeOut();
                this._idleTimeoutId = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _startFadeOut() {
        if (!this._spotlight || !this._spotlightVisible) return;

        if (this._idleTimeoutId) {
            GLib.source_remove(this._idleTimeoutId);
            this._idleTimeoutId = 0;
        }

        if (this._settingsManager.cachedActivationMethod === 'always') return;

        const duration = this._settingsManager.cachedAnimationDuration;
        const stepDuration = duration / 15;
        this._fadeStep = 255 / 15;

        this._fadeTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            stepDuration,
            () => {
                this._currentAlpha = Math.max(0, this._currentAlpha - this._fadeStep);
                if (this._spotlight) {
                    this._spotlight.queue_repaint();
                }

                if (this._currentAlpha <= 0) {
                    this.hide();
                    this._fadeTimeoutId = 0;
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    updateMousePosition(x, y) {
        this._mouseX = x;
        this._mouseY = y;
    }

    queueRepaint() {
        if (this._spotlight && this._spotlight.mapped) {
            this._spotlight.queue_repaint();
        }
    }

    get isVisible() { return this._spotlightVisible; }
    get mouseX() { return this._mouseX; }
    get mouseY() { return this._mouseY; }
}