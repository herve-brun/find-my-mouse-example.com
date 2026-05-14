import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import Clutter from 'gi://Clutter';
import { SettingsManager } from './settings.js';
import { SpotlightManager } from './spotlight.js';
import { MouseTracker } from './mouseTracking.js';
import { KeybindingManager } from './keybindings.js';
import { GameModeClient } from './gamemodeClient.js';
import { debugLog, LogLevel, setLogLevel } from './utils.js';

export default class FindMyMouseExtension extends Extension {
    private _settingsManager: SettingsManager | null;
    private _spotlightManager: SpotlightManager | null;
    private _mouseTracker: MouseTracker | null;
    private _keybindingManager: KeybindingManager | null;
    private _gameModeClient: GameModeClient | null;
    private _gameModeChangedId: number;
    private _settingsChangedId: number;
    private _shortcutChangedId: number;
    private _mousePressHandler: number;
    private _alwaysVisibleHandler: number;
    private _logLevelChangedId: number;
    private _glassMorphismChangedId: number;
    private _blurRadiusChangedId: number;
    private _glassOpacityChangedId: number;
    private _glowColorChangedId: number;
    private _glassTintChangedId: number;
    private _ringWidthChangedId: number;
    private _lastMoveX: number;
    private _lastMoveY: number;
    private _gameModeAvailable: boolean;
    private _glassMorphismEnabled!: boolean;
    private _blurRadius!: number;
    private _glassOpacity!: number;
    private _glowColor!: string;
    constructor(metadata: any) {
        super(metadata);
        this._settingsManager = null;
        this._spotlightManager = null;
        this._mouseTracker = null;
        this._keybindingManager = null;
        this._gameModeClient = null;
        this._gameModeChangedId = 0;
        this._settingsChangedId = 0;
        this._shortcutChangedId = 0;
        this._mousePressHandler = 0;
        this._alwaysVisibleHandler = 0;
        this._logLevelChangedId = 0;
        this._glassMorphismChangedId = 0;
        this._blurRadiusChangedId = 0;
        this._glassOpacityChangedId = 0;
        this._glowColorChangedId = 0;
        this._glassTintChangedId = 0;
        this._ringWidthChangedId = 0;
        this._lastMoveX = -1;
        this._lastMoveY = -1;
        
        // Flag to indicate GameMode service availability for preferences UI
        this._gameModeAvailable = false;
    }

    enable() {
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
            debugLog(`GameMode state updated: ${active}`, LogLevel.INFO);
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
        
        this._glassMorphismEnabled = settings.get_boolean('enable-glass-morphism');
        this._blurRadius = settings.get_double('blur-radius');
        this._glassOpacity = settings.get_double('glass-opacity');
        this._glowColor = settings.get_string('glow-color');
        


        
        // Connect to glass morphism settings changes
        this._glassMorphismChangedId = settings.connect('changed::enable-glass-morphism', () => {
            this._glassMorphismEnabled = settings.get_boolean('enable-glass-morphism');
            this._settingsManager.cacheSettings();
            this._spotlightManager.queueRepaint();
        });
        this._blurRadiusChangedId = settings.connect('changed::blur-radius', () => {
            this._blurRadius = settings.get_double('blur-radius');
            this._settingsManager.cacheSettings();
            this._spotlightManager.queueRepaint();
        });
        this._glassOpacityChangedId = settings.connect('changed::glass-opacity', () => {
            this._glassOpacity = settings.get_double('glass-opacity');
            this._settingsManager.cacheSettings();
            this._spotlightManager.queueRepaint();
        });
        this._glowColorChangedId = settings.connect('changed::glow-color', () => {
            this._glowColor = settings.get_string('glow-color');
            this._settingsManager.cacheSettings();
            this._spotlightManager.queueRepaint();
        });
        this._glassTintChangedId = settings.connect('changed::glass-tint', () => {
            this._settingsManager.cacheSettings();
            this._spotlightManager.queueRepaint();
        });
        this._ringWidthChangedId = settings.connect('changed::spotlight-ring-width', () => {
            this._settingsManager.cacheSettings();
            this._spotlightManager.queueRepaint();
        });
        
         this._settingsManager = new SettingsManager(settings);


        this._spotlightManager = new SpotlightManager(this._settingsManager, {
            glassMorphismEnabled: this._glassMorphismEnabled,
            blurRadius: this._blurRadius,
            glassOpacity: this._glassOpacity,
            glowColor: this._glowColor,
        });
        
        // Re-check GameMode state now that managers are initialized
        // (the state change handler may have fired before they were ready)
        if (this._gameModeAvailable && this._gameModeClient?.isActive && this._settingsManager.cachedDoNotActivateInGameMode) {
            debugLog('Hiding spotlight: GameMode is already active at extension init', LogLevel.INFO);
            this._spotlightManager.hide();
        }
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
        if (this._glassMorphismChangedId) {
            this._settingsManager.settings.disconnect(this._glassMorphismChangedId);
            this._glassMorphismChangedId = 0;
        }
        if (this._blurRadiusChangedId) {
            this._settingsManager.settings.disconnect(this._blurRadiusChangedId);
            this._blurRadiusChangedId = 0;
        }
        if (this._glassOpacityChangedId) {
            this._settingsManager.settings.disconnect(this._glassOpacityChangedId);
            this._glassOpacityChangedId = 0;
        }
        if (this._glowColorChangedId) {
            this._settingsManager.settings.disconnect(this._glowColorChangedId);
            this._glowColorChangedId = 0;
        }
        if (this._glassTintChangedId) {
            this._settingsManager.settings.disconnect(this._glassTintChangedId);
            this._glassTintChangedId = 0;
        }
        if (this._ringWidthChangedId) {
            this._settingsManager.settings.disconnect(this._ringWidthChangedId);
            this._ringWidthChangedId = 0;
        }

        this._spotlightManager.hide();
        this._settingsManager = null;
        this._spotlightManager = null;
        this._mouseTracker = null;
        this._keybindingManager = null;
        
         // Clean up GameMode client
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

    _handleMouseMovement(x: number, y: number): void {
        this._spotlightManager.updateMousePosition(x, y);

        if (this._spotlightManager.isVisible) {
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

        if (this._settingsManager.cachedActivationMethod === 'shake') {
            if (this._mouseTracker.detectShake(x, y)) {
                this._toggleSpotlight();
            }
        }
    }

    _toggleSpotlight() {
        const method = this._settingsManager.cachedActivationMethod;

        // "Always Visible" mode takes precedence over all other checks
        if (method === 'always') {
            if (!this._spotlightManager.isVisible) {
                this._showSpotlight();
            }
            return;
        }

        // Check if GameMode is active and we should not activate in GameMode
        // This setting prevents the spotlight from appearing when GameMode is active,
        // ensuring a distraction-free gaming experience.
        const doNotActivateInGameMode = this._settingsManager.cachedDoNotActivateInGameMode;
        
        // Only check GameMode status if:
        // 1. The setting is enabled
        // 2. The GameMode service is available
        // 3. GameMode is currently active
        debugLog(`GameMode check: doNotActivateInGameMode=${doNotActivateInGameMode}, _gameModeAvailable=${this._gameModeAvailable}, isActive=${this._gameModeClient?.isActive}`, LogLevel.INFO);
        debugLog(`Current global GameMode available: ${globalThis.FindMyMouseGameModeAvailable}`, LogLevel.INFO);
        if (doNotActivateInGameMode && this._gameModeAvailable && this._gameModeClient?.isActive) {
            debugLog('Spotlight not shown: GameMode is active and setting is enabled', LogLevel.INFO);
            this._spotlightManager.hide();
            return;
        }

        // Toggle spotlight for other activation methods
        if (this._spotlightManager.isVisible) {
            this._spotlightManager.hide();
        } else {
            this._showSpotlight();
        }
    }

    _showSpotlight() {
        const showOnAllMonitors = this._settingsManager.settings.get_boolean('show-on-all-monitors') || false;
        debugLog(`showOnAllMonitors = ${showOnAllMonitors}`);
        
        // Don't show if GameMode is active and suppression is enabled
        if (this._settingsManager.cachedDoNotActivateInGameMode && this._gameModeClient?.isActive) {
            debugLog('Spotlight not shown: GameMode is active', LogLevel.INFO);
            return;
        }

        // Show the spotlight
        this._spotlightManager.show(showOnAllMonitors);
        
        // Get current mouse position and update spotlight immediately
        const [mouseX, mouseY] = global.get_pointer();
        debugLog(`Setting initial spotlight position to mouse coordinates: (${mouseX}, ${mouseY})`);
        this._spotlightManager.updateMousePosition(mouseX, mouseY);
        

    }
}