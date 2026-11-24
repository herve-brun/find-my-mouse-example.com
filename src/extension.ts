import {
    Extension,
    type ExtensionMetadata,
} from 'resource:///org/gnome/shell/extensions/extension.js';
import { SettingsManager } from './settings.js';
import { SpotlightManager } from './spotlight.js';
import { MouseTracker } from './mouseTracking.js';
import { GameModeClient } from './gamemodeClient.js';
import { debugLog, isLogLevelEnabled, LogLevel, setLogLevel } from './utils.js';

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class FindMyMouseExtension extends Extension {
    private _settingsManager: SettingsManager;
    private _spotlightManager: SpotlightManager | null;
    private _mouseTracker: MouseTracker | null;
    private _gameModeClient: GameModeClient | null;
    private _settingsChangedId: number;
    private _alwaysVisibleHandler: number;
    private _logLevelChangedId: number;
    private _lastMoveX: number;
    private _lastMoveY: number;
    private _gameModeAvailable: boolean;
    private _lastMoveTime: number;
    private _enabled: boolean;

    constructor(metadata: ExtensionMetadata) {
        super(metadata);
        this._settingsManager = null;
        this._spotlightManager = null;
        this._mouseTracker = null;
        this._gameModeClient = null;
        this._settingsChangedId = 0;
        this._alwaysVisibleHandler = 0;
        this._logLevelChangedId = 0;
        this._lastMoveX = -1;
        this._lastMoveY = -1;
        
        // Flag to indicate GameMode service availability for activation checks
        this._gameModeAvailable = false;

        this._lastMoveTime = 0;
        this._enabled = false;
    }

    async enable() {
        this._enabled = true;
        const settings = this.getSettings();
        const logLevel = settings.get_int('log-level') || 2;
        setLogLevel(logLevel);

        this._logLevelChangedId = settings.connect('changed::log-level', () => {
            const newLogLevel = settings.get_int('log-level');
            setLogLevel(newLogLevel);
            debugLog(`Log level changed to ${newLogLevel}`, LogLevel.INFO);
        });

        debugLog('Enabling Find My Mouse', LogLevel.DEBUG);

        this._gameModeClient = new GameModeClient();
        this._gameModeClient.setup();
        this._gameModeClient.onStateChanged((active) => {
            if (!this._enabled)
                return;
            debugLog(`GameMode state updated: ${active}`, LogLevel.DEBUG);
            this._gameModeAvailable = true;
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
        
        this._settingsManager = new SettingsManager(settings);

        this._spotlightManager = new SpotlightManager(this._settingsManager);

        // Keyboard activation, so the spotlight is not mouse-only.
        Main.wm.addKeybinding(
            'find-my-mouse-activation',
            settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._toggleSpotlight(),
        );

        // The generic 'changed' handler below already refreshes the cache and
        // queues a repaint for every key, including spotlight-ring-width.

        // Re-check GameMode state now that managers are initialized
        // (the state change handler may have fired before they were ready)
        if (this._gameModeAvailable && this._gameModeClient?.isActive && this._settingsManager.cachedDoNotActivateInGameMode) {
            debugLog('Hiding spotlight: GameMode is already active at extension init', LogLevel.INFO);
            this._spotlightManager.hide();
        }
        this._mouseTracker = new MouseTracker(this._settingsManager, (x, y) => this._handleMouseMovement(x, y));

        this._settingsChangedId = this._settingsManager.settings.connect('changed', () => {
            this._settingsManager.cacheSettings();
            this._spotlightManager?.queueRepaint();
        });

        await this._mouseTracker.setup();
        if (!this._enabled) {
            // disable() ran while the pointer watcher module was loading.
            this._mouseTracker?.remove();
            return;
        }
        this._setupAlwaysVisible();
        debugLog('Extension enabled', LogLevel.DEBUG);
    }

    disable() {
        this._enabled = false;
        Main.wm.removeKeybinding('find-my-mouse-activation');
        this._mouseTracker?.remove();
        this._removeAlwaysVisible();

        if (this._settingsChangedId && this._settingsManager) {
            this._settingsManager.settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        if (this._logLevelChangedId && this._settingsManager) {
            this._settingsManager.settings.disconnect(this._logLevelChangedId);
            this._logLevelChangedId = 0;
        }

        this._spotlightManager?.destroyImmediately();
        this._settingsManager?.destroy();
        this._settingsManager = null;
        this._spotlightManager = null;
        this._mouseTracker = null;

        if (this._gameModeClient) {
            this._gameModeClient.destroy();
            this._gameModeClient = null;
        }

        debugLog('Extension disabled', LogLevel.DEBUG);
    }

    _setupAlwaysVisible() {
        if (!this._enabled || !this._settingsManager)
            return;
        const method = this._settingsManager.cachedActivationMethod;
        debugLog(`Activation method is: ${method}`, LogLevel.DEBUG);
        if (method === 'always') {
            debugLog('Showing spotlight (always mode)');
            this._showSpotlight();
        }

        this._alwaysVisibleHandler = this._settingsManager.settings.connect(
            'changed::activation-method',
            () => {
                // The generic 'changed' handler refreshes the cache separately.
                const newMethod = this._settingsManager.settings.get_string('activation-method');

                if (newMethod === 'always') {
                    this._showSpotlight();
                } else if (this._spotlightManager.isVisible) {
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
        const now = GLib.get_monotonic_time();
        const wasTracked = this._lastMoveX >= 0;
        const dx = wasTracked ? x - this._lastMoveX : 0;
        const dy = wasTracked ? y - this._lastMoveY : 0;

        if (isLogLevelEnabled(LogLevel.DEBUG)) {
            if (wasTracked) {
                const deltaMs = (now - this._lastMoveTime) / 1000;
                debugLog(
                    `Extension mouse move: (${x}, ${y}) | Δx=${dx}, Δy=${dy} | Δt=${deltaMs.toFixed(2)}ms | Spotlight visible: ${this._spotlightManager?.isVisible}`,
                    LogLevel.DEBUG,
                );
            } else {
                debugLog(
                    `Extension mouse move: (${x}, ${y}) | First movement`,
                    LogLevel.DEBUG,
                );
            }
        }
        this._lastMoveX = x;
        this._lastMoveY = y;
        this._lastMoveTime = now;

        this._spotlightManager.updateMousePosition(x, y);

        if (this._spotlightManager.isVisible) {
            // Only reset the idle timeout / cancel a fade for meaningful movement.
            if (wasTracked && (Math.abs(dx) >= 5 || Math.abs(dy) >= 5)) {
                this._spotlightManager.queueRepaint();
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
        if (!this._enabled)
            return;
        const method = this._settingsManager.cachedActivationMethod;

        // 'Always Visible' mode takes precedence over all other checks
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
        debugLog(
            `GameMode check: suppress=${doNotActivateInGameMode}, available=${this._gameModeAvailable}, active=${this._gameModeClient?.isActive}`,
            LogLevel.DEBUG,
        );
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
        if (!this._enabled)
            return;
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