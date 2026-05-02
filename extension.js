import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Cairo from 'gi://cairo';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

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
        this._mouseTracker = 0;
        this._mousePressHandler = 0;
        this._spotlightVisible = false;
        this._alwaysVisibleHandler = 0;
        this._currentAlpha = 0;
        this._targetAlpha = 255;
        this._fadeStep = 0;
        this._mappedSignalId = 0;
    }

    enable() {
        this._settings = this.getSettings();
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
        this._hideSpotlight();
        this._settings = null;
        console.log('Find My Mouse: Extension disabled');
    }

    _setupKeybindings() {
        const method = this._settings.get_string('activation-method');
        
        // Only setup shortcut keybinding if method is 'shortcut'
        if (method === 'shortcut') {
            this._addKeybinding();
        }
    }
    
    _addKeybinding() {
        const shortcut = this._settings.get_string('activation-shortcut');
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
        this._mouseTracker = global.stage.connect('motion-event', (_, event) => {
            const [x, y] = event.get_coords();
            
            if (this._spotlight && this._spotlightVisible) {
                this._resetIdleTimeout();
                this._spotlight?.queue_repaint();
                return Clutter.EVENT_PROPAGATE;
            }

            const method = this._settings.get_string('activation-method');
            if (method === 'shake') {
                this._detectShake(x, y);
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _removeMouseTracking() {
        if (this._mouseTracker) {
            global.stage.disconnect(this._mouseTracker);
            this._mouseTracker = 0;
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
        // Toujours connecter le handler pour gérer les changements futurs
        this._alwaysVisibleHandler = this._settings.connect('changed::activation-method', () => {
            const newMethod = this._settings.get_string('activation-method');
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
        const now = GLib.get_monotonic_time() / 1000;
        
        if (this._lastX >= 0) {
            const dx = Math.abs(x - this._lastX);
            const dy = Math.abs(y - this._lastY);
            const distance = Math.sqrt(dx * dx + dy * dy);
            const monitor = global.display.get_current_monitor();
            const geometry = global.display.get_monitor_geometry(monitor);
            const diagonal = Math.sqrt(geometry.width * geometry.width + geometry.height * geometry.height);
            const sensitivity = this._settings.get_int('shake-sensitivity') || 400;
            
            if (distance > diagonal / (sensitivity / 100)) {
                this._shakeCount++;
            }
        }
        
        this._lastX = x;
        this._lastY = y;
        
        if (this._shakeTimeoutId) {
            GLib.source_remove(this._shakeTimeoutId);
        }
        
        this._shakeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 
            this._settings.get_int('shake-interval') || SHAKE_DETECTION_INTERVAL, () => {
            if (this._shakeCount >= 2) {
                console.log('Find My Mouse: Shake detected!');
                this._toggleSpotlight();
            }
            this._shakeCount = 0;
            this._shakeTimeoutId = 0;
            return GLib.SOURCE_REMOVE;
        });
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
            reactive: true
        });
        this._setupSpotlightCommon(geometry);
    }

    _showOnAllMonitors() {
        // Create a container for all monitors
        const allMonitors = global.display.get_all_monitors();
        const geometries = allMonitors.map(monitor => global.display.get_monitor_geometry(monitor));
        
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
            reactive: true
        });
        this._setupSpotlightCommon(geometry);
    }

    _setupSpotlightCommon(geometry) {
        // Store geometry for repaint
        this._spotlightGeometry = geometry;

        const settings = this._settings;
        const zoom = settings.get_double('spotlight-zoom') || 9.0;
        const animationDuration = settings.get_int('animation-duration') || 500;
        
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
            const radius = settings.get_int('spotlight-radius') || 100;
            const bgColor = parseColor(settings.get_string('background-color') || '#00000080');
            const spotlightColor = parseColor(settings.get_string('spotlight-color') || '#FFFFFF80');
            
            // Apply current alpha to background
            const currentBgAlpha = (bgColor[3] / 255) * (this._currentAlpha / 255);
            const currentSpotAlpha = (spotlightColor[3] / 255) * (this._currentAlpha / 255);
            
            // Draw semi-transparent background
            cr.setOperator(Cairo.Operator.SOURCE);
            cr.setSourceRGBA(bgColor[0]/255, bgColor[1]/255, bgColor[2]/255, currentBgAlpha);
            cr.paint();
            
            // Clear the spotlight circle area (make it transparent)
            const currentRadius = radius * zoom;
            cr.setOperator(Cairo.Operator.CLEAR);
            cr.arc(mx - geom.x, my - geom.y, currentRadius, 0, 2 * Math.PI);
            cr.fill();
            
            // Draw spotlight border
            cr.setOperator(Cairo.Operator.OVER);
            cr.setSourceRGBA(spotlightColor[0]/255, spotlightColor[1]/255, spotlightColor[2]/255, currentSpotAlpha);
            cr.arc(mx - geom.x, my - geom.y, currentRadius, 0, 2 * Math.PI);
            cr.setLineWidth(2);
            cr.stroke();
        });
        
        // Start fade-in animation
        this._startFadeIn(animationDuration);

        this._spotlight.connect('button-press-event', () => {
            this._hideSpotlight();
            return Clutter.EVENT_STOP;
        });

        Main.layoutManager.addChrome(this._spotlight, {
            affectsInputRegion: true,
            trackFullscreen: true
        });

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

        this._spotlight.grab_key_focus();
        
        this._spotlight.connect('key-press-event', () => {
            const method = this._settings.get_string('activation-method');
            // Don't hide on key press if in always mode
            if (method !== 'always') {
                this._hideSpotlight();
            }
            return Clutter.EVENT_STOP;
        });

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
        const method = this._settings.get_string('activation-method');
        
        // Don't set idle timeout in always mode
        if (method === 'always') {
            return;
        }
        
        if (this._idleTimeoutId) {
            GLib.source_remove(this._idleTimeoutId);
        }
        
        const timeoutMs = this._settings.get_int('idle-timeout') || 1000;
        
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
        
        const method = this._settings.get_string('activation-method');
        
        // Don't fade out in always mode
        if (method === 'always') {
            return;
        }
        
        const duration = this._settings.get_int('animation-duration') || 500;
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
        const method = this._settings.get_string('activation-method');
        
        // Don't hide in always mode
        if (method === 'always') {
            return;
        }
        
        this._cancelFade();
        
        // Cleanup mapped signal handler
        if (this._mappedSignalId) {
            this._spotlight.disconnect(this._mappedSignalId);
            this._mappedSignalId = 0;
        }
        
        if (this._spotlight) {
            Main.layoutManager.removeChrome(this._spotlight);
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
