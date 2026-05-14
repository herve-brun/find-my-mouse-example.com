import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';
import { debugLog, LogLevel } from './utils.js';

export class KeybindingManager {
    private _settingsManager: any;
    private _toggleSpotlight: any;
    private _keybindingHandler: any;

    constructor(settingsManager, toggleSpotlight) {
        this._settingsManager = settingsManager;
        this._toggleSpotlight = toggleSpotlight;
        this._keybindingHandler = 0;
    }

    setup() {
        if (this._settingsManager.cachedActivationMethod === 'shortcut') {
            this._addKeybinding();
        }
    }

    _addKeybinding() {
        const shortcut = this._settingsManager.settings.get_string('find-my-mouse-activation');
        if (shortcut && shortcut !== '') {
            try {
                const mode = Shell.ActionMode.NORMAL;
                Main.wm.addKeybinding(
                    'find-my-mouse-activation',
                    this._settingsManager.settings,
                    Meta.KeyBindingFlags.NONE,
                    mode,
                    () => {
                        debugLog('Shortcut activated!', LogLevel.INFO);
                        this._toggleSpotlight();
                    }
                );
                debugLog(`Added keybinding: ${shortcut}`, LogLevel.INFO);
            } catch (e) {
                    debugLog(`Failed to add keybinding: ${e}`, LogLevel.ERROR);
            }
        }
    }

    remove() {
        try {
            Main.wm.removeKeybinding('find-my-mouse-activation');
        } catch (e) {
            // Ignore errors if keybinding wasn't set
        }
    }

    updateKeybinding() {
        this.remove();
        this._addKeybinding();
    }
}