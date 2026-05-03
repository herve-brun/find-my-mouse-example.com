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
const FADE_STEPS = 30;

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
        // Cached settings for performance
        this._cachedBgColor = null;
        this._cachedSpotlightColor = null;
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
        this._cachedBgColor = parseColor(this._settings.get_string('background-color') || '#00000080');
        this._cachedSpotlightColor = parseColor(this._settings.get_string('spotlight-color') || '#FFFFFF80');
        this._cachedRadius = this._settings.get_int('spotlight-radius') || 100;
        this._cachedZoom = this._settings.get_double('spotlight-zoom') || 9.0;
        this._cachedAnimationDuration = this._settings.get_int('animation-duration') || 500;
        this._cachedIdleTimeout = this._settings.get_int('idle-timeout') || 1000;
        this._cachedShakeInterval = this._settings.get_int('shake-interval') || SHAKE_DETECTION_INTERVAL;
        this._cachedShakeSensitivity = this._settings.get_int('shake-sensitivity') || 400;
        this._cachedActivationMethod = this._settings.get_string('activation-method') || 'shake';
    }

    _setupKeybindings() {
        // Only setup shortcut keybinding if method is 'shortcut'
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
        // Use GNOME Shell's built-in pointerWatcher for efficient mouse tracking
        // Works on both Wayland and X11 - event-driven, automatically stops polling when idle
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
        if (this._spotlightVisible) {
            this._lastX = x;
            this._lastY = y;
            if (this._spotlight && this._spotlight.mapped) {
                this._spotlight.queue_repaint();
            }
            this._resetIdleTimeout();
            return;
        }

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
        const method = this._settings.get_string('activation-method');
        if (method === 'click') {
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
        const method = this._settings.get_string('activation-method');
        if (method === 'always') {
            this._showSpotlight();
        }
        // Listen for activation-method changes to rebuild handlers
        this._alwaysVisibleHandler = this._settings.connect('changed::activation-method', () => {
            const newMethod = this._settings.get_string('activation-method');
            // Cache settings first so _setup* methods use updated values
            this._cacheSettings();
            // Remove old handlers
            this._removeKeybindings();
            this._removeMouseTracking();
            this._removeClickActivation();
            // Re-setup based on new method
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
        if (this._lastX >= 0) {
            const dx = x - this._lastX;
            const dy = y - this._lastY;

            // Record this movement with timestamp
            const now = GLib.get_monotonic_time() / 1000;
            this._movementHistory = this._movementHistory || [];

            // Prune old movements outside the shake interval
            const shakeInterval = this._cachedShakeInterval;
            const cutoffTime = now - shakeInterval;
            this._movementHistory = this._movementHistory.filter(m => m.tick > cutoffTime);

            // Add current movement
            this._movementHistory.push({ dx: dx, dy: dy, tick: now });

            // Calculate total distance and bounding rectangle
            let totalDistance = 0;
            let currentX = 0, currentY = 0;
            let minX = 0, maxX = 0, minY = 0, maxY = 0;

            for (const mov of this._movementHistory) {
                currentX += mov.dx;
                currentY += mov.dy;
                totalDistance += Math.sqrt(mov.dx * mov.dx + mov.dy * mov.dy);
                minX = Math.min(currentX, minX);
                maxX = Math.max(currentX, maxX);
                minY = Math.min(currentY, minY);
                maxY = Math.max(currentY, maxY);
            }

            // Calculate diagonal of bounding rectangle
            const rectWidth = maxX - minX;
            const rectHeight = maxY - minY;
            const diagonal = Math.sqrt(rectWidth * rectWidth + rectHeight * rectHeight);

            // Check if distance/diagonal > shake factor (default 400% = 4.0)
            const shakeFactor = this._cachedShakeSensitivity;
            if (diagonal > 0 && totalDistance / diagonal > (shakeFactor / 100)) {
                console.log('Find My Mouse: Shake detected!');
                this._toggleSpotlight();
                this._movementHistory = [];
                this._lastX = -1;
                this._lastY = -1;
                return;
            }
        }

        this._lastX = x;
        this._lastY = y;
        return;
    }

    _toggleSpotlight() {
        const method = this._settings.get_string('activation-method');
        
        // In 'always' mode, don't toggle - just show if not visible
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
        const method = this._settings.get_string('activation-method');
        
        // If already visible and not in always mode, don't show again
        if (this._spotlightVisible && method !== 'always') {
            return;
        }
        
        // Cancel any ongoing fade
        this._cancelFade();
        
        // Destroy existing spotlights
        if (this._spotlight) {
            this._spotlight.destroy();
            this._spotlight = null;
        }

        // Check if we should show on all monitors or just current
        const showOnAllMonitors = this._settings.get_boolean('show-on-all-monitors') || false;
        
        if (showOnAllMonitors) {
            this._showOnAllMonitors();
        } else {
            this._showOnCurrentMonitor();
        }
    }

    _showOnCurrentMonitor() {
        const monitor = global.display.get_current_monitor();
        const geometry = global.display.get_monitor_geometry(monitor);
        
        this._spotlight = new St.DrawingArea({
            x: geometry.x,
            y: geometry.y,
            width: geometry.width,
            height: geometry.height,
        });
        this._setupSpotlightCommon(geometry);
    }

    _showOnAllMonitors() {
        // Create a container for all monitors
        const nMonitors = global.display.get_n_monitors();
        const geometries = [];
        for (let i = 0; i < nMonitors; i++) {
            geometries.push(global.display.get_monitor_geometry(i));
        }
        
        // Calculate bounding box for all monitors
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
        
        this._spotlight = new St.DrawingArea({
            x: geometry.x,
            y: geometry.y,
            width: geometry.width,
            height: geometry.height,
        });
        this._setupSpotlightCommon(geometry);
    }

    _setupSpotlightCommon(geometry) {
        // Store geometry for repaint
        this._spotlightGeometry = geometry;

        // Cache values at setup time
        const zoom = this._cachedZoom;
        const animationDuration = this._cachedAnimationDuration;
        const bgColor = this._cachedBgColor;
        const spotlightColor = this._cachedSpotlightColor;
        const radius = this._cachedRadius;

        // Start with transparent
        this._currentAlpha = 0;
        this._targetAlpha = 255;

        this._spotlight.connect('repaint', (area) => {
            const cr = area.get_context();
            if (!cr) {
                return;
            }

            const geom = this._spotlightGeometry;
            const [mx, my] = global.get_pointer();

            // Apply current alpha to background
            const currentBgAlpha = (bgColor[3] / 255) * (this._currentAlpha / 255);
            const currentSpotAlpha = (spotlightColor[3] / 255) * (this._currentAlpha / 255);

            const startRadius = Math.max(10, this._cachedRadius / this._cachedZoom);
            const endRadius = this._cachedRadius;
            const radiusChange = (currentAlpha / 255) * (endRadius - startRadius);
        const startRadius = Math.max(10, this._cachedRadius / this._cachedZoom);
        const endRadius = this._cachedRadius;
        // Calculate the current radius proportional to the current alpha (0 to 255)
        // The radius should transition smoothly from min to max size as alpha goes from 0 to 255.
        const currentRadius = startRadius + (this._currentAlpha / 255) * (endRadius - startRadius);

            // Draw semi-transparent background
            cr.setOperator(Cairo.Operator.SOURCE);
            cr.setSourceRGBA(bgColor[0]/255, bgColor[1]/255, bgColor[2]/255, currentBgAlpha);
            cr.paint();

            // Clear the spotlight circle area (make it transparent)
            const currentSpotRadius = radius * zoom;
            cr.setOperator(Cairo.Operator.CLEAR);
            cr.arc(mx - geom.x, my - geom.y, currentSpotRadius, 0, 2 * Math.PI);
            cr.fill();

            // Draw spotlight border
            cr.setOperator(Cairo.Operator.OVER);
            cr.setSourceRGBA(spotlightColor[0]/255, spotlightColor[1]/255, spotlightColor[2]/255, currentSpotAlpha);
            cr.arc(mx - geom.x, my - geom.y, currentSpotRadius, 0, 2 * Math.PI);
            cr.setLineWidth(2);
            cr.stroke();
        });

        // Start fade-in animation
        this._startFadeIn(animationDuration);

        // Don't connect button-press-event on spotlight - let clicks pass through

        Main.uiGroup.add_child(this._spotlight);

        this._spotlight.show();

        // Wait for the actor to be mapped before repainting
        if (this._spotlight.mapped) {
            this._spotlight.queue_repaint();
        } else {
            this._mappedSignalId = this._spotlight.connect('notify::mapped', () => {
                this._spotlight.queue_repaint();
                if (this._mappedSignalId) {
                    this._spotlight.disconnect(this._mappedSignalId);
                    this._mappedSignalId = 0;
                }
            });
        }

         // Don't grab focus - let events pass through
         
         this._spotlightVisible = true;
        this._resetIdleTimeout();
    }

    _cancelFade() {
        if (this._fadeTimeoutId) {
            GLib.source_remove(this._fadeTimeoutId);
            this._fadeTimeoutId = 0;
        }
    }

    _resetIdleTimeout() {
        // Don't set idle timeout in always mode
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
        
        const stepDuration = duration / FADE_STEPS;
        this._fadeStep = 255 / FADE_STEPS;
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

        // Don't fade out in always mode
        if (this._cachedActivationMethod === 'always') {
            return;
        }

        const duration = this._cachedAnimationDuration;
        const stepDuration = duration / FADE_STEPS;
        this._fadeStep = 255 / FADE_STEPS;

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
        // Don't hide in always mode
        if (this._cachedActivationMethod === 'always') {
            return;
        }

        this._cancelFade();

        // Cleanup mapped signal handler
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
    }
}
