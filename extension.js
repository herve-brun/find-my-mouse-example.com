import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Cairo from 'gi://cairo';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SPOTLIGHT_DURATION = 500;
const SHAKE_DETECTION_INTERVAL = 1000;
const SHAKE_SENSITIVITY = 2000;

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
        this._keyPressTime = 0;
        this._lastX = -1;
        this._lastY = -1;
        this._shakeCount = 0;
        this._shakeTimeoutId = 0;
        this._spotlightTimeout = 0;
        this._settings = null;
        this._keybindingHandler = 0;
        this._mouseTracker = 0;
    }

    enable() {
        this._settings = this.getSettings();
        this._setupKeybindings();
        this._setupMouseTracking();
        console.log('Find My Mouse: Extension enabled');
    }

    disable() {
        this._removeKeybindings();
        this._removeMouseTracking();
        this._hideSpotlight();
        this._settings = null;
        console.log('Find My Mouse: Extension disabled');
    }

    _setupKeybindings() {
        console.log('Find My Mouse: Setting up keybindings');
        
        // Use captured-event on global.stage to detect key events
        this._keybindingHandler = global.stage.connect('captured-event', (actor, event) => {
            const eventType = event.type();
            
            // Only process key press events
            if (eventType !== Clutter.EventType.KEY_PRESS) {
                return Clutter.EVENT_PROPAGATE;
            }
            
            const key = event.get_key_symbol();
            const now = GLib.get_monotonic_time() / 1000;
            
            // Check for Ctrl keys
            if (key === Clutter.KEY_Control_L || key === Clutter.KEY_Control_R) {
                const timeSinceLast = now - this._keyPressTime;
                
                if (this._keyPressTime > 0 && timeSinceLast < 500) {
                    console.log('Find My Mouse: DOUBLE CTRL DETECTED!');
                    this._showSpotlight();
                    this._keyPressTime = 0;
                    return Clutter.EVENT_STOP;
                } else {
                    this._keyPressTime = now;
                }
            }
            return Clutter.EVENT_PROPAGATE;
        });
        
        // Also add a proper keybinding for custom shortcut
        this._addKeybinding();
    }
    
    _addKeybinding() {
        // Add a keybinding using the proper API
        const shortcut = this._settings.get_string('activation-shortcut');
        if (shortcut && shortcut !== '') {
            try {
                const mode = Shell.ActionMode.NORMAL;
                Main.wm.addKeybinding(
                    'activation-shortcut',
                    this._settings,
                    Meta.KeyBindingFlags.NONE,
                    mode,
                    () => {
                        console.log('Find My Mouse: Custom shortcut activated!');
                        this._showSpotlight();
                    }
                );
                console.log(`Find My Mouse: Added keybinding: ${shortcut}`);
            } catch (e) {
                console.log(`Find My Mouse: Failed to add keybinding: ${e}`);
            }
        }
    }

    _removeKeybindings() {
        if (this._keybindingHandler) {
            global.stage.disconnect(this._keybindingHandler);
            this._keybindingHandler = 0;
        }
        try {
            Main.wm.removeKeybinding('activation-shortcut');
        } catch (e) {
            // Ignore errors if keybinding wasn't set
        }
    }

    _setupMouseTracking() {
        this._mouseTracker = global.stage.connect('motion-event', (_, event) => {
            const [x, y] = event.get_coords();
            
            if (this._spotlight && this._spotlight.visible) {
                this._resetSpotlightTimeout();
                return Clutter.EVENT_PROPAGATE;
            }

            if (this._settings.get_string('activation-method') === 'shake') {
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

    _detectShake(x, y) {
        const now = GLib.get_monotonic_time() / 1000;
        
        if (this._lastX >= 0) {
            const dx = Math.abs(x - this._lastX);
            const dy = Math.abs(y - this._lastY);
            const distance = Math.sqrt(dx * dx + dy * dy);
            const screen = global.display.get_monitor_geometry(global.display.get_primary_monitor());
            const diagonal = Math.sqrt(screen.width * screen.width + screen.height * screen.height);
            
            if (distance > diagonal / (this._settings.get_int('shake-sensitivity') || SHAKE_SENSITIVITY)) {
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
                this._showSpotlight();
            }
            this._shakeCount = 0;
            this._shakeTimeoutId = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    _showSpotlight() {
        if (this._spotlight) {
            this._spotlight.destroy();
        }

        const monitor = global.display.get_current_monitor();
        const geometry = global.display.get_monitor_geometry(monitor);
        
        this._spotlight = new St.DrawingArea({
            x: geometry.x,
            y: geometry.y,
            width: geometry.width,
            height: geometry.height,
            reactive: true
        });

        const settings = this._settings;
        
        this._spotlight.connect('repaint', (area) => {
            const cr = area.get_context();
            const [mx, my] = global.get_pointer();
            
            const radius = settings.get_int('spotlight-radius') || 100;
            const bgColor = parseColor(settings.get_string('background-color') || '#000000', 180);
            const spotlightColor = parseColor(settings.get_string('spotlight-color') || '#FFFFFF', 80);
            
            cr.setOperator(Cairo.Operator.SOURCE);
            cr.setSourceRGBA(bgColor[0]/255, bgColor[1]/255, bgColor[2]/255, bgColor[3]/255);
            cr.paint();
            
            cr.setOperator(Cairo.Operator.CLEAR);
            cr.arc(mx - geometry.x, my - geometry.y, radius, 0, 2 * Math.PI);
            cr.fill();
            
            cr.setOperator(Cairo.Operator.OVER);
            cr.setSourceRGBA(spotlightColor[0]/255, spotlightColor[1]/255, spotlightColor[2]/255, spotlightColor[3]/255);
            cr.arc(mx - geometry.x, my - geometry.y, radius, 0, 2 * Math.PI);
            cr.setLineWidth(2);
            cr.stroke();
        });

        this._spotlight.connect('button-press-event', () => {
            this._hideSpotlight();
            return Clutter.EVENT_STOP;
        });

        Main.layoutManager.addChrome(this._spotlight, {
            affectsInputRegion: true,
            trackFullscreen: true
        });

        this._spotlight.grab_key_focus();
        
        this._spotlight.connect('key-press-event', () => {
            this._hideSpotlight();
            return Clutter.EVENT_STOP;
        });

        this._resetSpotlightTimeout();
        console.log('Find My Mouse: Spotlight shown');
    }

    _resetSpotlightTimeout() {
        if (this._spotlightTimeout) {
            GLib.source_remove(this._spotlightTimeout);
        }
        
        this._spotlight?.queue_repaint();
        
        this._spotlightTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 
            this._settings.get_int('animation-duration') || SPOTLIGHT_DURATION, () => {
            this._hideSpotlight();
            this._spotlightTimeout = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    _hideSpotlight() {
        if (this._spotlight) {
            Main.layoutManager.removeChrome(this._spotlight);
            this._spotlight.destroy();
            this._spotlight = null;
            console.log('Find My Mouse: Spotlight hidden');
        }
        
        if (this._spotlightTimeout) {
            GLib.source_remove(this._spotlightTimeout);
            this._spotlightTimeout = 0;
        }
    }
}
