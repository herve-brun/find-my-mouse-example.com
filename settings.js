import { parseColor } from './utils.js';

export class SettingsManager {
    constructor(settings) {
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
        this.cacheSettings();
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
         this._cachedBlurEnabled = this._settings.get_boolean('blur-enabled') || true;
         this._cachedBlurRadius = this._settings.get_int('blur-radius') || 10;
         this._cachedBlurBrightness = this._settings.get_double('blur-brightness') || 0.8;
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
     get cachedBlurEnabled() { return this._cachedBlurEnabled; }
     get cachedBlurRadius() { return this._cachedBlurRadius; }
     get cachedBlurBrightness() { return this._cachedBlurBrightness; }
     get settings() { return this._settings; }
}