import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Cairo from 'gi://cairo';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Use GNOME Shell's built-in pointerWatcher for efficient mouse tracking on X11
// Documented in GNOME docs: js/ui/pointerWatcher.js
// This automatically stops polling when the user is idle
import { getPointerWatcher } from 'resource:///org/gnome/shell/ui/pointerWatcher.js';

const SHAKE_DETECTION_INTERVAL = 1000;

function parseColor(colorStr, defaultAlpha = 255) {
    if (!colorStr || colorStr === '') return [0, 0, 0, defaultAlpha];
    const hex = colorStr.replace('#', '');
    if (hex.length >= 6) {
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const a = hex.length >= 8 ? parseInt(hex.substring(6, 8), 16) : defaultAlpha;
        return [r, g, b, a];
    }
    return [0, 0, 0, defaultAlpha];
}

export default class FindMyMouseExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._spotlight = null;
        this._lastX = -1;
        this._lastY = -1;
        this._shakeCount = 0;
        this._shakeTimeoutId = 0;
        this._spotlightTimeout = 0;
        this._idleTimeoutId = 0;
        this._fadeTimeoutId = 0;
        this._settings = null;
        this._keybindingHandler = 0;
        this._pointerWatch = null;
        this._settingsChangedId = 0;
        this._mousePressHandler = 0;
        this._spotlightVisible = false;
        this._alwaysVisibleHandler = 0;
        this._currentAlpha = 0;
        this._targetAlpha = 255;
        this._fadeStep = 0;
        this._mappedSignalId = 0;
        this._repaintPending = false;
        this._mouseX = -1;
        this._mouseY = -1;
        
        // Cached settings for performance
        this._cachedBgColor = null;
        this._cachedSpotlightColor = null;
        this._cachedBgColorNormalized = [0, 0, 0, 0.5];
        this._cachedSpotlightColorNormalized = [1, 1, 1, 0.5];
        this._cachedRadius = 100;
        this._cachedZoom = 9.0;
        this._cachedAnimationDuration = 500;
        this._cachedIdleTimeout = 1000;
        this._cachedShakeInterval = SHAKE_DETECTION_INTERVAL;
        this._cachedShakeSensitivity = 400;
        this._cachedActivationMethod = 'shake';
    }

    enable() {
        this._settings = this.getSettings();
        this._cacheSettings();
        this._settingsChangedId = this._settings.connect('changed', () => {
            this._cacheSettings();
        });
        this._shortcutChangedId = this._settings.connect('changed::find-my-mouse-activation', () => {
            if (this._cachedActivationMethod === 'shortcut') {
                this._removeKeybindings();
                this._addKeybinding();
            }
        });
        this._setupKeybindings();
        this._setupMouseTracking();
        this._setupClickActivation();
        this._setupAlwaysVisible();
        console.log('Find My Mouse: Extension enabled');
    }

    disable() {
        this._removeKeybindings();
        this._removeMouseTracking();
        this._removeClickActivation();
        this._removeAlwaysVisible();
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        if (this._shortcutChangedId) {
            this._settings.disconnect(this._shortcutChangedId);
            this._shortcutChangedId = 0;
        }
        this._hideSpotlight();
        this._settings = null;
        console.log('Find My Mouse: Extension disabled');
    }

    _cacheSettings() {
        if (!this._settings) return;
        
        const bgColorStr = this._settings.get_string('background-color') || '#00000080';
        const spotlightColorStr = this._settings.get_string('spotlight-color') || '#FFFFFF80';
        
        this._cachedBgColor = parseColor(bgColorStr);
        this._cachedSpotlightColor = parseColor(spotlightColorStr);
        
        this._cachedBgColorNormalized = [
            this._cachedBgColor[0] / 255,
            this._cachedBgColor[1] / 255,
            this._cachedBgColor[2] / 255,
            this._cachedBgColor[3] / 255
        ];
        this._cachedSpotlightColorNormalized = [
            this._cachedSpotlightColor[0] / 255,
            this._cachedSpotlightColor[1] / 255,
            this._cachedSpotlightColor[2] / 255,
            this._cachedSpotlightColor[3] / 255
        ];
        
        this._cachedRadius = this._settings.get_int('spotlight-radius') || 100;
        this._cachedZoom = this._settings.get_double('spotlight-zoom') || 9.0;
        this._cachedAnimationDuration = this._settings.get_int('animation-duration') || 500;
        this._cachedIdleTimeout = this._settings.get_int('idle-timeout') || 1000;
        this._cachedShakeInterval = this._settings.get_int('shake-interval') || SHAKE_DETECTION_INTERVAL;
        this._cachedShakeSensitivity = this._settings.get_int('shake-sensitivity') || 400;
        this._cachedActivationMethod = this._settings.get_string('activation-method') || 'shake';
    }

    _setupKeybindings() {
        if (this._cachedActivationMethod === 'shortcut') {
            this._addKeybinding();
        }
    }
    
    _addKeybinding() {
        const shortcut = this._settings.get_string('find-my-mouse-activation');
        if (shortcut && shortcut !== '') {
            try {
                const mode = Shell.ActionMode.NORMAL;
                Main.wm.addKeybinding(
                    'find-my-mouse-activation',
                    this._settings,
                    Meta.KeyBindingFlags.NONE,
                    mode,
                    () => {
                        console.log('Find My Mouse: Shortcut activated!');
                        this._toggleSpotlight();
                    }
                );
                console.log(`Find My Mouse: Added keybinding: ${shortcut}`);
            } catch (e) {
                console.log(`Find My Mouse: Failed to add keybinding: ${e}`);
            }
        }
    }

    _removeKeybindings() {
        try {
            Main.wm.removeKeybinding('find-my-mouse-activation');
        } catch (e) {
            // Ignore errors if keybinding wasn't set
        }
    }

    _setupMouseTracking() {
        const watcher = getPointerWatcher();
        this._pointerWatch = watcher.addWatch(50, (x, y) => {
            this._handleMouseMovement(x, y);
        });
        console.log('Find My Mouse: Using pointerWatcher for mouse tracking');
    }

    _setupPointerWatcher() {
        const watcher = getPointerWatcher();
        this._pointerWatch = watcher.addWatch(50, (x, y) => {
            this._handleMouseMovement(x, y);
        });
        console.log('Find My Mouse: Using pointerWatcher for mouse tracking');
    }

    _handleMouseMovement(x, y) {
        // Met toujours à jour _mouseX/_mouseY
        this._mouseX = x;
        this._mouseY = y;

        // Si le spotlight est visible, on gère le repaint
        if (this._spotlightVisible) {
            const dx = Math.abs(x - this._lastX);
            const dy = Math.abs(y - this._lastY);

            if (dx < 5 && dy < 5) return;

            this._lastX = x;
            this._lastY = y;
            if (this._spotlight && this._spotlight.mapped) {
                if (!this._repaintPending) {
                    this._repaintPending = true;
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
                        if (this._spotlight) {
                            this._spotlight.queue_repaint();
                        }
                        this._repaintPending = false;
                        return GLib.SOURCE_REMOVE;
                    });
                }
            }
            this._resetIdleTimeout();
            return;
        }

        // Si le spotlight n'est PAS visible, on vérifie si on doit détecter le shake
        if (this._cachedActivationMethod === 'shake') {
            this._detectShake(x, y);
        }
    }

    _removeMouseTracking() {
        if (this._pointerWatch) {
            this._pointerWatch.remove();
            this._pointerWatch = null;
        }
    }

    _setupClickActivation() {
        if (this._cachedActivationMethod === 'click') {
            this._mousePressHandler = global.stage.connect('button-press-event', (_, event) => {
                const button = event.get_button();
                const expectedButton = this._settings.get_int('click-activation-button') || 1;
                
                if (button === expectedButton) {
                    console.log(`Find My Mouse: Click activation (button ${button})`);
                    this._toggleSpotlight();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
        }
    }

    _removeClickActivation() {
        if (this._mousePressHandler) {
            global.stage.disconnect(this._mousePressHandler);
            this._mousePressHandler = 0;
        }
    }

    _setupAlwaysVisible() {
        const method = this._cachedActivationMethod;
        console.log(`Find My Mouse: Activation method is: ${method}`);
        if (method === 'always') {
            console.log('Find My Mouse: Showing spotlight (always mode)');
            this._showSpotlight();
        }
        this._alwaysVisibleHandler = this._settings.connect('changed::activation-method', () => {
            const newMethod = this._settings.get_string('activation-method');
            this._cacheSettings();
            this._removeKeybindings();
            this._removeMouseTracking();
            this._removeClickActivation();
            this._setupKeybindings();
            this._setupMouseTracking();
            this._setupClickActivation();
            if (newMethod === 'always') {
                this._showSpotlight();
            } else if (this._spotlightVisible && newMethod !== 'always') {
                this._hideSpotlight();
            }
        });
    }

    _removeAlwaysVisible() {
        if (this._alwaysVisibleHandler) {
            this._settings.disconnect(this._alwaysVisibleHandler);
            this._alwaysVisibleHandler = 0;
        }
    }

    _detectShake(x, y) {
        if (this._lastX < 0) {
            this._lastX = x;
            this._lastY = y;
            return;
        }

        const dx = x - this._lastX;
        const dy = y - this._lastY;
        const now = GLib.get_monotonic_time() / 1000;

        this._movementHistory = this._movementHistory || [];
        this._movementHistory.push({ dx, dy, tick: now });
        
        if (this._movementHistory.length > 100) {
            this._movementHistory.shift();
        }

        const cutoffTime = now - this._cachedShakeInterval;
        let oldestIndex = 0;
        while (oldestIndex < this._movementHistory.length && this._movementHistory[oldestIndex].tick <= cutoffTime) {
            oldestIndex++;
        }
        if (oldestIndex > 0) {
            this._movementHistory = this._movementHistory.slice(oldestIndex);
        }

        let totalDistanceSquared = 0;
        let currentX = 0, currentY = 0;
        let minX = 0, maxX = 0, minY = 0, maxY = 0;

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

        const shakeFactor = this._cachedShakeSensitivity / 100;
        if (diagonalSquared > 0 && (totalDistanceSquared / diagonalSquared) > shakeFactor * shakeFactor) {
            console.log('Find My Mouse: Shake detected!');
            this._toggleSpotlight();
            this._movementHistory = [];
            this._lastX = -1;
            this._lastY = -1;
            return;
        }

        this._lastX = x;
        this._lastY = y;
    }

    _toggleSpotlight() {
        const method = this._cachedActivationMethod;
        
        if (method === 'always') {
            if (!this._spotlightVisible) {
                this._showSpotlight();
            }
            return;
        }
        
        if (this._spotlightVisible) {
            this._hideSpotlight();
        } else {
            this._showSpotlight();
        }
    }

    _showSpotlight() {
        const method = this._cachedActivationMethod;
        console.log(`Find My Mouse: _showSpotlight called (method: ${method})`);
        
        if (this._spotlightVisible && method !== 'always') {
            console.log('Find My Mouse: Already visible, skipping');
            return;
        }
        
        this._cancelFade();
        
        if (this._spotlight) {
            this._spotlight.destroy();
            this._spotlight = null;
        }

        const showOnAllMonitors = this._settings.get_boolean('show-on-all-monitors') || false;
        console.log(`Find My Mouse: showOnAllMonitors = ${showOnAllMonitors}`);
        
        if (showOnAllMonitors) {
            console.log('Find My Mouse: Calling _showOnAllMonitors');
            this._showOnAllMonitors();
        } else {
            console.log('Find My Mouse: Calling _showOnCurrentMonitor');
            this._showOnCurrentMonitor();
        }
    }

    _showOnCurrentMonitor() {
        const monitor = global.display.get_current_monitor();
        const geometry = global.display.get_monitor_geometry(monitor);
        console.log(`Find My Mouse: Current monitor geometry: ${JSON.stringify(geometry)}`);
        
        const [mx, my] = global.get_pointer();
        this._mouseX = mx;
        this._mouseY = my;
        
        const opacity = this._cachedActivationMethod === 'always' ? 255 : 0;
        this._spotlight = new St.DrawingArea({
            x: geometry.x,
            y: geometry.y,
            width: geometry.width,
            height: geometry.height,
            opacity: opacity,
        });
        console.log(`Find My Mouse: St.DrawingArea created with size: ${geometry.width}x${geometry.height}`);
        this._setupSpotlightCommon(geometry);
    }

    _showOnAllMonitors() {
        const nMonitors = global.display.get_n_monitors();
        const geometries = [];
        for (let i = 0; i < nMonitors; i++) {
            geometries.push(global.display.get_monitor_geometry(i));
        }
        
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        
        for (const geom of geometries) {
            minX = Math.min(minX, geom.x);
            minY = Math.min(minY, geom.y);
            maxX = Math.max(maxX, geom.x + geom.width);
            maxY = Math.max(maxY, geom.y + geom.height);
        }
        
        const geometry = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
        console.log(`Find My Mouse: All monitors geometry: ${JSON.stringify(geometry)}`);
        
        const [mx, my] = global.get_pointer();
        this._mouseX = mx;
        this._mouseY = my;
        
        const opacity = this._cachedActivationMethod === 'always' ? 255 : 0;
        this._spotlight = new St.DrawingArea({
            x: geometry.x,
            y: geometry.y,
            width: geometry.width,
            height: geometry.height,
            opacity: opacity,
        });
        console.log(`Find My Mouse: St.DrawingArea created for all monitors with size: ${geometry.width}x${geometry.height}`);
        this._setupSpotlightCommon(geometry);
    }

    _setupSpotlightCommon(geometry) {
        this._spotlightGeometry = geometry;
        const animationDuration = this._cachedAnimationDuration;

        // Force TOUJOURS this._currentAlpha à 255 (pour que le spotlight soit opaque)
        this._currentAlpha = 255;
        this._targetAlpha = 255;
        this._spotlight.opacity = 255;

        console.log('Find My Mouse: Setting up repaint handler');
        this._spotlight.connect('repaint', (area) => {
            console.log('Find My Mouse: Repaint handler called!');
            const cr = area.get_context();
            if (!cr) {
                console.log('Find My Mouse: Repaint context is null!');
                return;
            }

            const geom = this._spotlightGeometry;
            const mx = this._mouseX !== undefined ? this._mouseX : global.get_pointer()[0];
            const my = this._mouseY !== undefined ? this._mouseY : global.get_pointer()[1];
            console.log(`Find My Mouse: Repaint - mx=${mx}, my=${my}, geom.x=${geom.x}, geom.y=${geom.y}`);
            const bgColor = this._cachedBgColorNormalized;
            const spotlightColor = this._cachedSpotlightColorNormalized;
            const radius = this._cachedRadius;
            const zoom = this._cachedZoom;

            // Utilise directement les alphas des couleurs (sans multiplication par currentAlpha)
            const currentBgAlpha = bgColor[3];
            const currentSpotAlpha = spotlightColor[3];
            const currentSpotRadius = radius * zoom;

            console.log(`Find My Mouse: Repaint - currentBgAlpha=${currentBgAlpha}, currentSpotAlpha=${currentSpotAlpha}, currentSpotRadius=${currentSpotRadius}`);

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

        console.log('Find My Mouse: Adding to Main.uiGroup');
        Main.uiGroup.add_child(this._spotlight);
        console.log('Find My Mouse: Showing spotlight');
        this._spotlight.show();

        this._mappedSignalId = this._spotlight.connect('notify::mapped', () => {
            console.log('Find My Mouse: Spotlight mapped, queueing repaint');
            this._spotlight.queue_repaint();
            if (this._mappedSignalId) {
                this._spotlight.disconnect(this._mappedSignalId);
                this._mappedSignalId = 0;
            }
        });

        this._spotlightVisible = true;
        console.log('Find My Mouse: Spotlight is now visible');

        // Ne lance JAMAIS le fade-in (pour un affichage immédiat comme PowerToys)
        // this._startFadeIn(animationDuration);

        // Réactive le timeout d'inactivité immédiatement
        this._resetIdleTimeout();
    }

    _cancelFade() {
        if (this._fadeTimeoutId) {
            GLib.source_remove(this._fadeTimeoutId);
            this._fadeTimeoutId = 0;
        }
    }

    _resetIdleTimeout() {
        if (this._cachedActivationMethod === 'always') {
            return;
        }

        if (this._idleTimeoutId) {
            GLib.source_remove(this._idleTimeoutId);
        }

        const timeoutMs = this._cachedIdleTimeout;

        this._idleTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            timeoutMs, () => {
                this._startFadeOut();
                this._idleTimeoutId = 0;
                return GLib.SOURCE_REMOVE;
            });
    }

    _startFadeIn(duration) {
        this._cancelFade();
        
        const stepDuration = duration / 15;
        this._fadeStep = 255 / 15;
        this._currentAlpha = 0;
        
        this._fadeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, stepDuration, () => {
            this._currentAlpha = Math.min(255, this._currentAlpha + this._fadeStep);
            if (this._spotlight) {
                this._spotlight.queue_repaint();
            }
            
            if (this._currentAlpha >= 255) {
                this._fadeTimeoutId = 0;
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _startFadeOut() {
        if (!this._spotlight || !this._spotlightVisible) {
            return;
        }

        if (this._idleTimeoutId) {
            GLib.source_remove(this._idleTimeoutId);
            this._idleTimeoutId = 0;
        }

        if (this._cachedActivationMethod === 'always') {
            return;
        }

        const duration = this._cachedAnimationDuration;
        const stepDuration = duration / 15;
        this._fadeStep = 255 / 15;

        this._fadeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, stepDuration, () => {
            this._currentAlpha = Math.max(0, this._currentAlpha - this._fadeStep);
            if (this._spotlight) {
                this._spotlight.queue_repaint();
            }

            if (this._currentAlpha <= 0) {
                this._hideSpotlight();
                this._fadeTimeoutId = 0;
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _hideSpotlight() {
        if (this._cachedActivationMethod === 'always') {
            return;
        }

        this._cancelFade();

        if (this._mappedSignalId) {
            if (this._spotlight) {
                this._spotlight.disconnect(this._mappedSignalId);
            }
            this._mappedSignalId = 0;
        }

        if (this._spotlight) {
            Main.uiGroup.remove_child(this._spotlight);
            this._spotlight.destroy();
            this._spotlight = null;
            this._spotlightVisible = false;
        }

        if (this._spotlightTimeout) {
            GLib.source_remove(this._spotlightTimeout);
            this._spotlightTimeout = 0;
        }

        if (this._idleTimeoutId) {
            GLib.source_remove(this._idleTimeoutId);
            this._idleTimeoutId = 0;
        }

        this._currentAlpha = 0;
        this._repaintPending = false;
    }
}
