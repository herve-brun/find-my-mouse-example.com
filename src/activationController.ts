import GLib from 'gi://GLib';

import type { SettingsManager } from './settings.js';
import type { SpotlightManager } from './spotlight.js';
import { debugLog, LogLevel } from './utils.js';

/** Only the feedback operations the activation policy needs. */
export interface ActivationFeedback {
    hide(): void;
    playConfirmation(): void;
}

export type ActivationSource = 'shortcut' | 'gesture' | 'always';

/**
 * Owns activation intent and the idle timer. The spotlight manager only renders;
 * the mouse tracker only detects gestures. Keeping policy here prevents a
 * gesture from hiding a spotlight that was shown by another source.
 */
export class ActivationController {
    private _settingsManager: SettingsManager;
    private _spotlightManager: SpotlightManager;
    private _feedback: ActivationFeedback;
    private _isGameModeActive: () => boolean;
    private _idleTimeoutId: number;
    private _enabled: boolean;

    constructor(
        settingsManager: SettingsManager,
        spotlightManager: SpotlightManager,
        feedback: ActivationFeedback,
        isGameModeActive: () => boolean,
    ) {
        this._settingsManager = settingsManager;
        this._spotlightManager = spotlightManager;
        this._feedback = feedback;
        this._isGameModeActive = isGameModeActive;
        this._idleTimeoutId = 0;
        this._enabled = false;
    }

    setEnabled(enabled: boolean): void {
        this._enabled = enabled;
        if (!enabled)
            this._clearIdleTimeout();
    }

    /** Called by the keyboard shortcut, the gesture detector and always-visible mode. */
    activate(source: ActivationSource): void {
        if (!this._enabled)
            return;

        const method = this._settingsManager.cachedActivationMethod;
        if (method === 'always') {
            if (!this._spotlightManager.isVisible)
                this._spotlightManager.show(false);
            else
                // A repeat activation must cancel any in-progress fade-out.
                this._spotlightManager.queueRepaint();
            return;
        }

        if (
            this._settingsManager.cachedDoNotActivateInGameMode &&
            this._isGameModeActive()
        ) {
            debugLog('Spotlight not shown: GameMode is active', LogLevel.INFO);
            return;
        }

        if (this._spotlightManager.isVisible) {
            // A second activation refreshes the spotlight instead of hiding it:
            // queueRepaint() also cancels a fade-out started just before.
            this._spotlightManager.queueRepaint();
            this.resetIdleTimeout();
            return;
        }

        const showOnAllMonitors =
            this._settingsManager.settings.get_boolean('show-on-all-monitors');
        this._spotlightManager.show(showOnAllMonitors);
        const [mouseX, mouseY] = global.get_pointer();
        this._spotlightManager.updateMousePosition(mouseX, mouseY);
        this.resetIdleTimeout();

        if (source === 'gesture' && this._settingsManager.cachedGestureSound)
            this._feedback.playConfirmation();
    }

    /** Pointer activity keeps an existing spotlight alive. */
    notifyActivity(): void {
        if (!this._enabled || !this._spotlightManager.isVisible)
            return;
        this._spotlightManager.queueRepaint();
        this.resetIdleTimeout();
    }

    hide(): void {
        this._clearIdleTimeout();
        this._feedback.hide();
        this._spotlightManager.hide();
    }

    /** Re-read idle-timeout after a settings change. */
    refreshIdleTimeout(): void {
        if (this._spotlightManager.isVisible)
            this.resetIdleTimeout();
    }

    resetIdleTimeout(): void {
        this._clearIdleTimeout();
        if (
            !this._enabled ||
            this._settingsManager.cachedActivationMethod === 'always'
        )
            return;

        const timeout = this._settingsManager.cachedIdleTimeout;
        if (timeout <= 0)
            return;

        this._idleTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            timeout,
            () => {
                this._idleTimeoutId = 0;
                this.hide();
                return GLib.SOURCE_REMOVE;
            },
        );
    }

    destroy(): void {
        this._clearIdleTimeout();
        this._feedback.hide();
    }

    private _clearIdleTimeout(): void {
        if (this._idleTimeoutId) {
            GLib.source_remove(this._idleTimeoutId);
            this._idleTimeoutId = 0;
        }
    }
}
