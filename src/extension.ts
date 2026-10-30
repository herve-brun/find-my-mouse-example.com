import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { SettingsManager } from './settings.js';
import { SpotlightManager } from './spotlight.js';
import { MouseTracker } from './mouseTracking.js';
import { GameModeClient } from './gamemodeClient.js';
import { debugLog, LogLevel, setLogLevel } from './utils.js';

export default class FindMyMouseExtension extends Extension {
    private _settingsManager: SettingsManager | null;
    private _spotlightManager: SpotlightManager | null;
    private _mouseTracker: MouseTracker | null;
    private _gameModeClient: GameModeClient | null;
    private _gameModeChangedId: number;
    private _settingsChangedId: number;
    private _alwaysVisibleHandler: number;
    private _logLevelChangedId: number;
    private _ringWidthChangedId: number;
    private _lastMoveX: number;
    private _lastMoveY: number;
    private _gameModeAvailable: boolean;

    constructor(metadata: any) {
        super(metadata);
        this._settingsManager = null;
        this._spotlightManager = null;
        this._mouseTracker = null;
        this._gameModeClient = null;
        this._gameModeChangedId = 0;
        this._settingsChangedId = 0;
        this._alwaysVisibleHandler = 0;
        this._logLevelChangedId = 0;
        this._ringWidthChangedId = 0;
        this._lastMoveX = -1;
        this._lastMoveY = -1;
        this._gameModeAvailable = false;
    }

    async enable() {
        const settings = this.getSettings();
        const logLevel = settings.get_int('log-level') || 2;
        setLogLevel(logLevel);

        this._logLevelChangedId = settings.connect('changed::log-level', () => {
            const newLogLevel = settings.get_int('log-level');
            setLogLevel(newLogLevel);
            debugLog(`Log level changed to ${newLogLevel}`, LogLevel.INFO);
        });

        this._gameModeClient = new GameModeClient();
        this._gameModeClient.setup();
        this._gameModeClient.onStateChanged((active) => {
            this._gameModeAvailable = true;
            if (typeof globalThis !== 'undefined') {
                (globalThis as any).FindMyMouseGameModeAvailable = this._gameModeAvailable;
            }

            if (this._settingsManager && this._spotlightManager) {
                const doNotActivateInGameMode = this._settingsManager.cachedDoNotActivateInGameMode;
                const currentMethod = this._settingsManager.cachedActivationMethod;
                if (active && doNotActivateInGameMode && this._spotlightManager.isVisible) {
                    debugLog('Hiding spotlight: GameMode activated', LogLevel.INFO);
                    this._spotlightManager.hide();
                } else if (!active && currentMethod === 'always' && !this._spotlightManager.isVisible) {
                    debugLog('Showing spotlight: GameMode deactivated and mode is Always Visible', LogLevel.INFO);
                    this._showSpotlight();
                }
            }
        });

        this._ringWidthChangedId = settings.connect('changed::spotlight-ring-width', () => {
            this._settingsManager?.cacheSettings();
            this._spotlightManager?.queueRepaint();
        });

        this._settingsManager = new SettingsManager(settings);
        this._spotlightManager = new SpotlightManager(this._settingsManager);

        if (this._gameModeAvailable && this._gameModeClient?.isActive && this._settingsManager.cachedDoNotActivateInGameMode) {
            debugLog('Hiding spotlight: GameMode is already active at extension init', LogLevel.INFO);
            this._spotlightManager.hide();
        }

        this._mouseTracker = new MouseTracker(this._settingsManager, (x, y) => this._handleMouseMovement(x, y));

        this._settingsChangedId = this._settingsManager.settings.connect('changed', () => {
            this._settingsManager?.cacheSettings();
            this._spotlightManager?.queueRepaint();
        });

        await this._mouseTracker.setup();
        this._setupAlwaysVisible();
        debugLog('Extension enabled', LogLevel.INFO);
    }

    disable() {
        this._mouseTracker?.remove();
        this._removeAlwaysVisible();

        if (this._settingsChangedId) {
            this._settingsManager?.settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        if (this._ringWidthChangedId) {
            this._settingsManager?.settings.disconnect(this._ringWidthChangedId);
            this._ringWidthChangedId = 0;
        }
        if (this._logLevelChangedId) {
            this._settingsManager?.settings.disconnect(this._logLevelChangedId);
            this._logLevelChangedId = 0;
        }

        this._spotlightManager?.destroyImmediately();
        this._settingsManager = null;
        this._spotlightManager = null;
        this._mouseTracker = null;

        debugLog('Disabling GameMode client...', LogLevel.INFO);
        if (this._gameModeClient) {
            this._gameModeClient.clearStateChangedHandlers();
            if (this._gameModeClient && this._gameModeClient._proxy) {
                this._gameModeClient._proxy.run_dispose();
            }
            this._gameModeClient = null;
            debugLog('GameMode client disabled.', LogLevel.INFO);
        }

        debugLog('Extension disabled', LogLevel.INFO);
    }

    _setupAlwaysVisible() {
        const method = this._settingsManager?.cachedActivationMethod;
        debugLog(`Activation method is: ${method}`, LogLevel.DEBUG);
        if (method === 'always') {
            debugLog('Showing spotlight (always mode)');
            this._showSpotlight();
        }

        this._alwaysVisibleHandler = this._settingsManager!.settings.connect(
            'changed::activation-method',
            () => {
                const newMethod = this._settingsManager?.settings.get_string('activation-method');
                this._settingsManager?.cacheSettings();

                if (newMethod === 'always') {
                    this._showSpotlight();
                } else if (this._spotlightManager?.isVisible) {
                    this._spotlightManager.hide();
                }
            }
        );
    }

    _removeAlwaysVisible() {
        if (this._alwaysVisibleHandler) {
            this._settingsManager?.settings.disconnect(this._alwaysVisibleHandler);
            this._alwaysVisibleHandler = 0;
        }
    }

    _handleMouseMovement(x: number, y: number): void {
        this._spotlightManager?.updateMousePosition(x, y);

        if (this._spotlightManager?.isVisible) {
            if (this._lastMoveX >= 0) {
                const dx = Math.abs(x - this._lastMoveX);
                const dy = Math.abs(y - this._lastMoveY);
                if (dx >= 5 || dy >= 5) {
                    this._spotlightManager.queueRepaint();
                }
            }
            this._lastMoveX = x;
            this._lastMoveY = y;
            return;
        }

        this._lastMoveX = x;
        this._lastMoveY = y;

        if (this._settingsManager?.cachedActivationMethod === 'shake') {
            if (this._mouseTracker?.detectShake(x, y)) {
                this._toggleSpotlight();
            }
        }
    }

    _toggleSpotlight() {
        const method = this._settingsManager?.cachedActivationMethod;

        if (method === 'always') {
            if (!this._spotlightManager?.isVisible) {
                this._showSpotlight();
            }
            return;
        }

        const doNotActivateInGameMode = this._settingsManager?.cachedDoNotActivateInGameMode;
        if (doNotActivateInGameMode && this._gameModeAvailable && this._gameModeClient?.isActive) {
            this._spotlightManager?.hide();
            return;
        }

        if (this._spotlightManager?.isVisible) {
            this._spotlightManager.hide();
        } else {
            this._showSpotlight();
        }
    }

    _showSpotlight() {
        const showOnAllMonitors = this._settingsManager?.settings.get_boolean('show-on-all-monitors') || false;
        if (this._settingsManager?.cachedDoNotActivateInGameMode && this._gameModeClient?.isActive) {
            return;
        }

        this._spotlightManager?.show(showOnAllMonitors);

        const [mouseX, mouseY] = global.get_pointer();
        this._spotlightManager?.updateMousePosition(mouseX, mouseY);
    }
}
