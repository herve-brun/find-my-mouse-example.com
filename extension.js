import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { SettingsManager } from './settings.js';
import { SpotlightManager } from './spotlight.js';
import { MouseTracker } from './mouseTracking.js';
import { KeybindingManager } from './keybindings.js';
import { debugLog, LogLevel, setLogLevel } from './utils.js';

export default class FindMyMouseExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._settingsManager = null;
        this._spotlightManager = null;
        this._mouseTracker = null;
        this._keybindingManager = null;
        this._settingsChangedId = 0;
        this._shortcutChangedId = 0;
        this._mousePressHandler = 0;
        this._alwaysVisibleHandler = 0;
        this._logLevelChangedId = 0; // ID pour l'écouteur de log-level
    }

    async enable() {
        // Lire le niveau de log depuis GSettings et l'appliquer avant toute initialisation
        const settings = this.getSettings();
        const logLevel = settings.get_int('log-level') || 2; // 2 = INFO (valeur par défaut)
        setLogLevel(logLevel);
        
        // Écouter les changements de log-level
        this._logLevelChangedId = settings.connect('changed::log-level', () => {
            const newLogLevel = settings.get_int('log-level');
            setLogLevel(newLogLevel);
            debugLog(`Log level changed to ${newLogLevel}`, LogLevel.INFO);
        });
        
        this._settingsManager = new SettingsManager(settings);
        this._spotlightManager = new SpotlightManager(this._settingsManager);
        this._mouseTracker = new MouseTracker(this._settingsManager, (x, y) => this._handleMouseMovement(x, y));
        this._keybindingManager = new KeybindingManager(this._settingsManager, () => this._toggleSpotlight());

        this._settingsChangedId = this._settingsManager.settings.connect('changed', () => {
            this._settingsManager.cacheSettings();
        });

        this._shortcutChangedId = this._settingsManager.settings.connect(
            'changed::find-my-mouse-activation',
            () => {
                if (this._settingsManager.cachedActivationMethod === 'shortcut') {
                    this._keybindingManager.updateKeybinding();
                }
            }
        );

        this._keybindingManager.setup();
        await this._mouseTracker.setup();
        this._setupClickActivation();
        this._setupAlwaysVisible();
        debugLog('Extension enabled', LogLevel.INFO);
    }

    disable() {
        this._keybindingManager.remove();
        this._mouseTracker.remove();
        this._removeClickActivation();
        this._removeAlwaysVisible();

        if (this._settingsChangedId) {
            this._settingsManager.settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        if (this._shortcutChangedId) {
            this._settingsManager.settings.disconnect(this._shortcutChangedId);
            this._shortcutChangedId = 0;
        }

        this._spotlightManager.hide();
        this._settingsManager = null;
        this._spotlightManager = null;
        this._mouseTracker = null;
        this._keybindingManager = null;
        debugLog('Extension disabled', LogLevel.INFO);
    }

    _setupClickActivation() {
        if (this._settingsManager.cachedActivationMethod === 'click') {
            this._mousePressHandler = global.stage.connect(
                'button-press-event',
                (_, event) => {
                    const button = event.get_button();
                    const expectedButton = this._settingsManager.settings.get_int('click-activation-button') || 1;

                    if (button === expectedButton) {
                        debugLog(`Click activation (button ${button})`, LogLevel.DEBUG);
                        this._toggleSpotlight();
                        return Clutter.EVENT_STOP;
                    }
                    return Clutter.EVENT_PROPAGATE;
                }
            );
        }
    }

    _removeClickActivation() {
        if (this._mousePressHandler) {
            global.stage.disconnect(this._mousePressHandler);
            this._mousePressHandler = 0;
        }
    }

    _setupAlwaysVisible() {
        const method = this._settingsManager.cachedActivationMethod;
        debugLog(`Activation method is: ${method}`, LogLevel.DEBUG);
        if (method === 'always') {
            debugLog('Showing spotlight (always mode)');
            this._showSpotlight();
        }

        this._alwaysVisibleHandler = this._settingsManager.settings.connect(
            'changed::activation-method',
            () => {
                const newMethod = this._settingsManager.settings.get_string('activation-method');
                this._settingsManager.cacheSettings();
                this._keybindingManager.remove();
                this._mouseTracker.remove();
                this._removeClickActivation();
                this._keybindingManager.setup();
                this._mouseTracker.setup();
                this._setupClickActivation();

                if (newMethod === 'always') {
                    this._showSpotlight();
                } else if (this._spotlightManager.isVisible && newMethod !== 'always') {
                    this._spotlightManager.hide();
                }
            }
        );
    }

    _removeAlwaysVisible() {
        if (this._alwaysVisibleHandler) {
            this._settingsManager.settings.disconnect(this._alwaysVisibleHandler);
            this._alwaysVisibleHandler = 0;
        }

        // Débrancher l'écouteur de log-level
        if (this._logLevelChangedId) {
            this._settingsManager.settings.disconnect(this._logLevelChangedId);
            this._logLevelChangedId = 0;
        }
    }

    _handleMouseMovement(x, y) {
        this._spotlightManager.updateMousePosition(x, y);

        if (this._spotlightManager.isVisible) {
            const dx = Math.abs(x - this._mouseTracker.lastX);
            const dy = Math.abs(y - this._mouseTracker.lastY);

            if (dx >= 5 || dy >= 5) {
                this._spotlightManager.queueRepaint();
                this._spotlightManager._resetIdleTimeout();
            }
            return;
        }

        if (this._settingsManager.cachedActivationMethod === 'shake') {
            if (this._mouseTracker.detectShake(x, y)) {
                this._toggleSpotlight();
            }
        }
    }

    _toggleSpotlight() {
        const method = this._settingsManager.cachedActivationMethod;

        if (method === 'always') {
            if (!this._spotlightManager.isVisible) {
                this._showSpotlight();
            }
            return;
        }

        if (this._spotlightManager.isVisible) {
            this._spotlightManager.hide();
        } else {
            this._showSpotlight();
        }
    }

    _showSpotlight() {
        const showOnAllMonitors = this._settingsManager.settings.get_boolean('show-on-all-monitors') || false;
        debugLog(`showOnAllMonitors = ${showOnAllMonitors}`);
        this._spotlightManager.show(showOnAllMonitors);
    }
}