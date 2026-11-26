import Gio from 'gi://Gio';
import { parseColor, debugLog, LogLevel } from './utils.js';

export class SettingsManager {
    private _settings: Gio.Settings;
    private _cachedBgColorNormalized: [number, number, number, number];
    private _cachedSpotlightColorNormalized: [number, number, number, number];
    private _cachedRadius: number;
    private _cachedZoom: number;
    private _cachedAnimationDuration: number;
    private _cachedIdleTimeout: number;
    private _cachedGestureReversals: number;
    private _cachedGestureSweep: number;
    private _cachedGestureWindow: number;
    private _cachedGestureSettle: number;
    private _cachedGestureCooldown: number;
    private _cachedGestureIgnoreButtons: boolean;
    private _cachedGestureIgnoreFullscreen: boolean;
    private _cachedGestureSound: boolean;
    private _cachedActivationMethod: string;
    private _cachedRingWidth: number;
    private _cachedDoNotActivateInGameMode: boolean;
    private _cachedLogLevel: number;
    private _gamemodeChangedId: number;

    constructor(settings: Gio.Settings) {
        this._settings = settings;
        this._cachedBgColorNormalized = [0, 0, 0, 0.5];
        this._cachedSpotlightColorNormalized = [1, 1, 1, 0.8];
        this._cachedRadius = 100;
        this._cachedZoom = 9.0;
        this._cachedAnimationDuration = 500;
        this._cachedIdleTimeout = 1000;
        this._cachedGestureReversals = 3;
        this._cachedGestureSweep = 90;
        this._cachedGestureWindow = 900;
        this._cachedGestureSettle = 180;
        this._cachedGestureCooldown = 1500;
        this._cachedGestureIgnoreButtons = true;
        this._cachedGestureIgnoreFullscreen = true;
        this._cachedGestureSound = false;
        this._cachedActivationMethod = 'shake';
        this._cachedRingWidth = 2;
        this._cachedDoNotActivateInGameMode = true;
        this._gamemodeChangedId = 0;
        this.cacheSettings();
        
        // Update cache when GSettings key changes
        this._gamemodeChangedId = this._settings.connect('changed::do-not-activate-gamemode', () => {
            this._cachedDoNotActivateInGameMode = this._settings.get_boolean('do-not-activate-gamemode');
            debugLog(`Updated cachedDoNotActivateInGameMode: ${this._cachedDoNotActivateInGameMode}`, LogLevel.INFO);
        });
    }

    cacheSettings() {
        if (!this._settings) return;

        const bgColorStr = this._settings.get_string('background-color') || '#00000080';
        const spotlightColorStr = this._settings.get_string('spotlight-color') || '#FFFFFFCC';

        const bgColor = parseColor(bgColorStr);
        const spotlightColor = parseColor(spotlightColorStr);

        this._cachedBgColorNormalized = [
            bgColor[0] / 255,
            bgColor[1] / 255,
            bgColor[2] / 255,
            bgColor[3] / 255
        ];
        this._cachedSpotlightColorNormalized = [
            spotlightColor[0] / 255,
            spotlightColor[1] / 255,
            spotlightColor[2] / 255,
            spotlightColor[3] / 255
        ];

        this._cachedRadius = this._settings.get_int('spotlight-radius') || 100;
        this._cachedZoom = this._settings.get_double('spotlight-zoom') || 9.0;
        this._cachedAnimationDuration = this._settings.get_int('animation-duration') || 500;
        this._cachedIdleTimeout = this._settings.get_int('idle-timeout') || 1000;
        this._cachedGestureReversals = this._settings.get_int('gesture-reversals') || 3;
        this._cachedGestureSweep = this._settings.get_int('gesture-sweep') || 90;
        this._cachedGestureWindow = this._settings.get_int('gesture-window') || 900;
        this._cachedGestureSettle = this._settings.get_int('gesture-settle') || 180;
        this._cachedGestureCooldown = this._settings.get_int('gesture-cooldown') || 1500;
        this._cachedGestureIgnoreButtons = this._settings.get_boolean('gesture-ignore-buttons');
        this._cachedGestureIgnoreFullscreen = this._settings.get_boolean('gesture-ignore-fullscreen');
        this._cachedGestureSound = this._settings.get_boolean('gesture-sound');
        this._cachedLogLevel = this._settings.get_int('log-level') || 2;
        this._cachedActivationMethod = this._settings.get_string('activation-method') || 'shake';
        this._cachedDoNotActivateInGameMode = this._settings.get_boolean('do-not-activate-gamemode');
        this._cachedRingWidth = this._settings.get_int('spotlight-ring-width') || 2;
    }

    get cachedActivationMethod() { return this._cachedActivationMethod; }
    get cachedBgColorNormalized() { return this._cachedBgColorNormalized; }
    get cachedLogLevel() { return this._cachedLogLevel; }
    get cachedSpotlightColorNormalized() { return this._cachedSpotlightColorNormalized; }
    get cachedRadius() { return this._cachedRadius; }
    get cachedZoom() { return this._cachedZoom; }
    get cachedAnimationDuration() { return this._cachedAnimationDuration; }
    get cachedIdleTimeout() { return this._cachedIdleTimeout; }
    get cachedGestureReversals() { return this._cachedGestureReversals; }
    get cachedGestureSweep() { return this._cachedGestureSweep; }
    get cachedGestureWindow() { return this._cachedGestureWindow; }
    get cachedGestureSettle() { return this._cachedGestureSettle; }
    get cachedGestureCooldown() { return this._cachedGestureCooldown; }
    get cachedGestureIgnoreButtons() { return this._cachedGestureIgnoreButtons; }
    get cachedGestureIgnoreFullscreen() { return this._cachedGestureIgnoreFullscreen; }
    get cachedGestureSound() { return this._cachedGestureSound; }
    get cachedDoNotActivateInGameMode() { return this._cachedDoNotActivateInGameMode; }
    get cachedRingWidth() { return this._cachedRingWidth; }
    get settings() { return this._settings; }

    /** Disconnect the signal created in the constructor and release the settings. */
    destroy(): void {
        if (this._gamemodeChangedId) {
            this._settings.disconnect(this._gamemodeChangedId);
            this._gamemodeChangedId = 0;
        }
        this._settings = null;
    }

}
