import {
    Extension,
    type ExtensionMetadata,
} from 'resource:///org/gnome/shell/extensions/extension.js';
import { SettingsManager } from './settings.js';
import { SpotlightManager } from './spotlight.js';
import { MouseTracker, type GestureEventInfo } from './mouseTracking.js';
import { GameModeClient } from './gamemodeClient.js';
import { ActivationController } from './activationController.js';
import { GestureFeedback } from './gestureFeedback.js';
import { PracticeService } from './practiceService.js';
import { debugLog, isLogLevelEnabled, LogLevel, setLogLevel } from './utils.js';

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class FindMyMouseExtension extends Extension {
    private _settingsManager: SettingsManager | null;
    private _spotlightManager: SpotlightManager | null;
    private _mouseTracker: MouseTracker | null;
    private _gameModeClient: GameModeClient | null;
    private _activationController: ActivationController | null;
    private _gestureFeedback: GestureFeedback | null;
    private _practiceService: PracticeService | null;
    private _settingsChangedId: number;
    private _alwaysVisibleHandler: number;
    private _logLevelChangedId: number;
    private _gameModeAvailable: boolean;
    private _enabled: boolean;

    constructor(metadata: ExtensionMetadata) {
        super(metadata);
        this._settingsManager = null;
        this._spotlightManager = null;
        this._mouseTracker = null;
        this._gameModeClient = null;
        this._activationController = null;
        this._gestureFeedback = null;
        this._practiceService = null;
        this._settingsChangedId = 0;
        this._alwaysVisibleHandler = 0;
        this._logLevelChangedId = 0;
        this._gameModeAvailable = false;
        this._enabled = false;
    }

    async enable(): Promise<void> {
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
            if (!this._activationController || !this._settingsManager)
                return;

            const suppress = this._settingsManager.cachedDoNotActivateInGameMode;
            if (active && suppress && this._spotlightManager?.isVisible) {
                debugLog('Hiding spotlight: GameMode activated', LogLevel.INFO);
                this._activationController.hide();
            } else if (
                !active &&
                this._settingsManager.cachedActivationMethod === 'always' &&
                !this._spotlightManager?.isVisible
            ) {
                debugLog('Showing spotlight: GameMode deactivated', LogLevel.INFO);
                this._activationController.activate('always');
            }
        });

        this._settingsManager = new SettingsManager(settings);
        this._spotlightManager = new SpotlightManager(this._settingsManager);
        this._gestureFeedback = new GestureFeedback();
        this._activationController = new ActivationController(
            this._settingsManager,
            this._spotlightManager,
            this._gestureFeedback,
            () => this._gameModeClient?.isActive ?? false,
        );
        this._activationController.setEnabled(true);
        this._practiceService = new PracticeService(
            () => {
                // A practice session must start from a clean, hidden state.
                this._activationController?.hide();
                this._mouseTracker?.reset();
                this._gestureFeedback?.hide();
            },
            () => {
                this._mouseTracker?.reset();
                this._gestureFeedback?.hide();
                // Practice hides an always-visible spotlight temporarily.
                if (
                    this._settingsManager?.cachedActivationMethod === 'always' &&
                    !this._spotlightManager?.isVisible
                ) {
                    this._activationController?.activate('always');
                }
            },
        );

        // The keyboard shortcut is always available in gesture mode.
        Main.wm.addKeybinding(
            'find-my-mouse-activation',
            settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._activationController?.activate('shortcut'),
        );

        if (
            this._gameModeAvailable &&
            this._gameModeClient?.isActive &&
            this._settingsManager.cachedDoNotActivateInGameMode &&
            this._spotlightManager.isVisible
        ) {
            debugLog('Hiding spotlight: GameMode active at startup', LogLevel.INFO);
            this._activationController.hide();
        }

        this._mouseTracker = new MouseTracker(
            this._settingsManager,
            (x, y, dx, dy) => this._handleMouseMovement(x, y, dx, dy),
            (info) => this._handleGestureEvent(info),
            () => this._canDetect(),
        );

        this._settingsChangedId = this._settingsManager.settings.connect('changed', () => {
            this._settingsManager?.cacheSettings();
            this._mouseTracker?.updateConfig();
            this._activationController?.refreshIdleTimeout();
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

    disable(): void {
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

        // Disable activation before ending practice: its cleanup callback must
        // not re-show an always-visible spotlight while the extension is stopping.
        this._activationController?.setEnabled(false);
        this._practiceService?.destroy();
        this._activationController?.destroy();
        this._spotlightManager?.destroyImmediately();
        this._settingsManager?.destroy();
        this._gestureFeedback?.destroy();

        this._settingsManager = null;
        this._spotlightManager = null;
        this._mouseTracker = null;
        this._activationController = null;
        this._gestureFeedback = null;
        this._practiceService = null;

        if (this._gameModeClient) {
            this._gameModeClient.destroy();
            this._gameModeClient = null;
        }

        debugLog('Extension disabled', LogLevel.DEBUG);
    }

    _setupAlwaysVisible(): void {
        if (!this._enabled || !this._settingsManager || !this._activationController)
            return;

        if (this._settingsManager.cachedActivationMethod === 'always') {
            debugLog('Showing spotlight (always mode)', LogLevel.INFO);
            this._activationController.activate('always');
        }

        this._alwaysVisibleHandler = this._settingsManager.settings.connect(
            'changed::activation-method',
            () => {
                const newMethod = this._settingsManager.settings.get_string(
                    'activation-method',
                );
                // Practice depends on the previous mode; end it cleanly before
                // applying the new one.
                this._practiceService?.cancel();
                this._mouseTracker?.reset();
                this._gestureFeedback?.hide();
                if (newMethod === 'always') {
                    this._activationController?.activate('always');
                } else if (this._spotlightManager?.isVisible) {
                    this._activationController?.hide();
                }
            },
        );
    }

    _removeAlwaysVisible(): void {
        if (this._alwaysVisibleHandler) {
            this._settingsManager?.settings.disconnect(this._alwaysVisibleHandler);
            this._alwaysVisibleHandler = 0;
        }
    }

    private _canDetect(): boolean {
        const practiceActive = this._practiceService?.isActive ?? false;
        return (
            this._enabled &&
            (practiceActive ||
                (this._settingsManager?.cachedActivationMethod === 'shake' &&
                    !this._spotlightManager?.isVisible))
        );
    }

    private _handleMouseMovement(x: number, y: number, dx: number, dy: number): void {
        if (isLogLevelEnabled(LogLevel.DEBUG)) {
            debugLog(
                `Pointer move: (${x}, ${y}) | Δx=${dx}, Δy=${dy} | visible=${this._spotlightManager?.isVisible}`,
                LogLevel.DEBUG,
            );
        }
        this._gestureFeedback?.setPosition(x, y);
        this._spotlightManager?.updateMousePosition(x, y);

        if (Math.abs(dx) >= 5 || Math.abs(dy) >= 5)
            this._activationController?.notifyActivity();
    }

    private _handleGestureEvent(info: GestureEventInfo): void {
        if (!this._enabled || !this._gestureFeedback || !this._activationController)
            return;

        // Capture before reportEvent(): a terminal event ends the session.
        const practiceActive = this._practiceService?.isActive ?? false;
        if (practiceActive)
            this._practiceService?.reportEvent(info);

        switch (info.event) {
        case 'armed':
            this._gestureFeedback.show();
            break;
        case 'progress':
            this._gestureFeedback.setProgress(info.progress, info.total);
            break;
        case 'ready':
            this._gestureFeedback.setReady();
            break;
        case 'activated':
            this._gestureFeedback.hide();
            // Practice reports success but must never reveal the spotlight.
            if (!practiceActive)
                this._activationController.activate('gesture');
            break;
        case 'aborted':
            this._gestureFeedback.hide();
            break;
        default:
            break;
        }
    }
}
