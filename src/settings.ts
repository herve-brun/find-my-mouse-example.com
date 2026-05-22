import Gio from 'gi://Gio';
import { parseColor, debugLog, LogLevel } from './utils.js';

export class SettingsManager {
    private _settings: Gio.Settings;
    private _cachedBgColor: [number, number, number, number] | null;
    private _cachedSpotlightColor: [number, number, number, number] | null;
    private _cachedBgColorNormalized: [number, number, number, number];
    private _cachedSpotlightColorNormalized: [number, number, number, number];
    private _cachedRadius: number;
    private _cachedZoom: number;
    private _cachedAnimationDuration: number;
    private _cachedIdleTimeout: number;
    private _cachedShakeInterval: number;
    private _cachedShakeSensitivity: number;
    private _cachedActivationMethod: string;
    private _cachedRingWidth: number;
    private _cachedDoNotActivateInGameMode: boolean;
    private _cachedLogLevel: number;

    constructor(settings: Gio.Settings) {
        this._settings = settings;
        this._cachedBgColor = null;
        this._cachedSpotlightColor = null;
        this._cachedBgColorNormalized = [0, 0, 0, 0.5];
        this._cachedSpotlightColorNormalized = [1, 1, 1, 0.5];
        this._cachedRadius = 100;
        this._cachedZoom = 9.0;
        this._cachedAnimationDuration = 500;
        this._cachedIdleTimeout = 1000;
        this._cachedShakeInterval = 1000;
        this._cachedShakeSensitivity = 400;
        this._cachedActivationMethod = 'shake';
        this._cachedRingWidth = 2;
        this._cachedDoNotActivateInGameMode = true;
        this.cacheSettings();
        
        // Update cache when GSettings key changes
        this._settings.connect('changed::do-not-activate-gamemode', () => {
            this._cachedDoNotActivateInGameMode = this._settings.get_boolean('do-not-activate-gamemode');
            debugLog(`Updated cachedDoNotActivateInGameMode: ${this._cachedDoNotActivateInGameMode}`, LogLevel.INFO);
        });
    }

    cacheSettings() {
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
        this._cachedShakeInterval = this._settings.get_int('shake-interval') || 1000;
        this._cachedShakeSensitivity = this._settings.get_int('shake-sensitivity') || 400;
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
    get cachedShakeInterval() { return this._cachedShakeInterval; }
    get cachedShakeSensitivity() { return this._cachedShakeSensitivity; }
    get cachedDoNotActivateInGameMode() { return this._cachedDoNotActivateInGameMode; }
    get cachedRingWidth() { return this._cachedRingWidth; }
    get settings() { return this._settings; }

}