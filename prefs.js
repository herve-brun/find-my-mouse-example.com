import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk?version=4.0';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { setLogLevel, LogLevel } from './utils.js';

export default class FindMyMousePreferences extends ExtensionPreferences {
    constructor(metadata) {
        super(metadata);
    }

    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        
        // General page
        const generalPage = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(generalPage);
        
        // Add log level preferences group to generalPage
        const logGroup = new Adw.PreferencesGroup({
            title: _('Logging'),
            description: _('Configure extension logging verbosity'),
        });
        generalPage.add(logGroup);
        
        const logLevelRow = new Adw.ComboRow({
            title: _('Log Level'),
            subtitle: _('Set the maximum log level to display'),
            model: Gtk.StringList.new([
                _('Errors Only'),
                _('Warnings and Errors'),
                _('Info and Above'),
                _('Debug (Verbose)')
            ]),
        });
        
        // Map log level to combo row index
        const levelMap = {
            [LogLevel.ERROR]: 0,
            [LogLevel.WARN]: 1,
            [LogLevel.INFO]: 2,
            [LogLevel.DEBUG]: 3
        };
        
        // Default to INFO level
        let currentLevel = settings.get_int('log-level') || LogLevel.INFO;
        logLevelRow.selected = levelMap[currentLevel] || 2;
        
        logLevelRow.connect('notify::selected', () => {
            const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
            const selectedLevel = levels[logLevelRow.selected];
            settings.set_int('log-level', selectedLevel);
            setLogLevel(selectedLevel);
        });
        
        // Set initial log level
        setLogLevel(currentLevel);
        
        logGroup.add(logLevelRow);
        
        const activationGroup = new Adw.PreferencesGroup({
            title: _('Activation'),
            description: _('Configure how Find My Mouse is activated'),
        });
        generalPage.add(activationGroup);

        const activationRow = new Adw.ComboRow({
            title: _('Activation Method'),
            subtitle: _('Choose how to activate the spotlight'),
            model: Gtk.StringList.new([
                _('Keyboard Shortcut'),
                _('Mouse Shake'),
                _('Mouse Click'),
                _('Always Visible')
            ]),
        });
        
        const activationMap = {
            'shortcut': 0,
            'shake': 1,
            'click': 2,
            'always': 3,
        };
        
        const currentMethod = settings.get_string('activation-method') || 'shake';
        activationRow.selected = activationMap[currentMethod] || 1; // shake is index 1
        
        activationRow.connect('notify::selected', () => {
            const methods = ['shortcut', 'shake', 'click', 'always'];
            settings.set_string('activation-method', methods[activationRow.selected]);
        });
        activationGroup.add(activationRow);

        // Shortcut row with proper GNOME-style shortcut capture
        const shortcutRow = new Adw.ActionRow({
            title: _('Keyboard Shortcut'),
            subtitle: _('Press a key combination to set the shortcut'),
        });
        
        // Use Gtk.ShortcutLabel for proper display
        const shortcutLabel = new Gtk.ShortcutLabel({
            accelerator: settings.get_string('find-my-mouse-activation') || '',
            halign: Gtk.Align.END,
        });
        shortcutRow.add_suffix(shortcutLabel);
        
        // Button to trigger shortcut capture
        const setShortcutButton = new Gtk.Button({
            label: _('Set Shortcut…'),
            halign: Gtk.Align.END,
        });
        shortcutRow.add_suffix(setShortcutButton);
        
        // Clear button
        const clearButton = new Gtk.Button({
            label: _('Clear'),
            halign: Gtk.Align.END,
        });
        clearButton.connect('clicked', () => {
            shortcutLabel.set_accelerator('');
            settings.set_string('find-my-mouse-activation', '');
        });
        shortcutRow.add_suffix(clearButton);
        
        // Create a proper shortcut capture dialog
        const shortcutDialog = new Gtk.Dialog({
            title: _('Set Shortcut'),
            transient_for: window,
            modal: true,
            use_header_bar: true,
        });
        shortcutDialog.add_button(_('Cancel'), Gtk.ResponseType.CANCEL);
        
        const dialogBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });
        shortcutDialog.get_content_area().append(dialogBox);
        
        const dialogLabel = new Gtk.Label({
            label: _('Press a key combination to set the shortcut.'),
            wrap: true,
            xalign: 0.5,
        });
        dialogBox.append(dialogLabel);
        
        const shortcutDisplay = new Gtk.ShortcutLabel({
            accelerator: '',
            halign: Gtk.Align.CENTER,
        });
        dialogBox.append(shortcutDisplay);
        
        // Modifier keys to ignore (prevent setting modifier-only shortcuts)
        const MODIFIER_KEYS = [
            Gdk.KEY_Shift_L, Gdk.KEY_Shift_R,
            Gdk.KEY_Control_L, Gdk.KEY_Control_R,
            Gdk.KEY_Alt_L, Gdk.KEY_Alt_R,
            Gdk.KEY_Super_L, Gdk.KEY_Super_R,
            Gdk.KEY_Meta_L, Gdk.KEY_Meta_R,
            Gdk.KEY_Caps_Lock, Gdk.KEY_Num_Lock
        ];

        // Create an event controller for key presses
        const keyController = new Gtk.EventControllerKey();
        shortcutDialog.add_controller(keyController);

        // Handle key press in dialog
        keyController.connect('key-pressed', (controller, keyval, keycode, state) => {
            // Ignore modifier-only keys
            if (MODIFIER_KEYS.includes(keyval)) {
                return Gdk.EVENT_PROPAGATE;
            }

            // Handle Escape to cancel
            if (keyval === Gdk.KEY_Escape) {
                shortcutDialog.close();
                return Gdk.EVENT_STOP;
            }

            // Get the key name
            let keyName = Gdk.keyval_name(keyval);
            if (!keyName) return Gdk.EVENT_PROPAGATE;

            // Normalize Tab
            if (keyval === Gdk.KEY_ISO_Left_Tab) {
                keyName = 'Tab';
            }

            // Build the accelerator string (GNOME format: <Ctrl><Alt>f)
            const modifiers = [];
            if (state & Gdk.ModifierType.CONTROL_MASK) modifiers.push('Ctrl');
            if (state & Gdk.ModifierType.SHIFT_MASK) modifiers.push('Shift');
            if (state & Gdk.ModifierType.ALT_MASK) modifiers.push('Alt');
            if (state & Gdk.ModifierType.SUPER_MASK) modifiers.push('Super');

            let accelerator = '';
            for (const mod of modifiers) {
                accelerator += `<${mod}>`;
            }
            accelerator += keyName;

            // Update display
            shortcutDisplay.set_accelerator(accelerator);

            // Accept the shortcut
            shortcutDialog.response(Gtk.ResponseType.OK);

            // Update the main label and settings
            shortcutLabel.set_accelerator(accelerator);
            settings.set_string('find-my-mouse-activation', accelerator);

            return Gdk.EVENT_STOP;
        });
        
        // Connect button to open dialog
        setShortcutButton.connect('clicked', () => {
            shortcutDisplay.set_accelerator('');
            shortcutDialog.present();
        });
        
        activationGroup.add(shortcutRow);

        const clickButtonRow = new Adw.ComboRow({
            title: _('Click Activation Button'),
            subtitle: _('Which mouse button activates the spotlight'),
            model: Gtk.StringList.new([
                _('Left Button'),
                _('Middle Button'),
                _('Right Button')
            ]),
        });
        
        const buttonMap = { 1: 0, 2: 1, 3: 2 };
        const currentButton = settings.get_int('click-activation-button') || 1;
        clickButtonRow.selected = buttonMap[currentButton] || 0;
        
        clickButtonRow.connect('notify::selected', () => {
            const buttons = [1, 2, 3];
            settings.set_int('click-activation-button', buttons[clickButtonRow.selected]);
        });
        activationGroup.add(clickButtonRow);

        const multiMonitorGroup = new Adw.PreferencesGroup({
            title: _('Multi-Monitor'),
            description: _('Settings for multi-monitor setups'),
        });
        generalPage.add(multiMonitorGroup);

        const allMonitorsRow = new Adw.SwitchRow({
            title: _('Show on All Monitors'),
            subtitle: _('When enabled, spotlight covers all connected monitors'),
            active: settings.get_boolean('show-on-all-monitors'),
        });
        allMonitorsRow.connect('notify::active', () => {
            settings.set_boolean('show-on-all-monitors', allMonitorsRow.active);
        });
        multiMonitorGroup.add(allMonitorsRow);

        // Appearance page
        const appearancePage = new Adw.PreferencesPage({
            title: _('Appearance'),
            icon_name: 'preferences-desktop-symbolic',
        });
        window.add(appearancePage);

        const appearanceGroup = new Adw.PreferencesGroup({
            title: _('Appearance'),
            description: _('Customize the spotlight appearance'),
        });
        appearancePage.add(appearanceGroup);

        const bgColorRow = new Adw.ActionRow({
            title: _('Background Color'),
            subtitle: _('Color of the spotlight backdrop'),
        });
        const bgColorButton = new Gtk.ColorButton({
            rgba: this._parseColor(settings.get_string('background-color') || '#00000080'),
            use_alpha: true,
        });
        bgColorButton.connect('color-set', () => {
            const rgba = bgColorButton.get_rgba();
            const color = this._rgbaToHex(rgba);
            settings.set_string('background-color', color);
        });
        bgColorRow.add_suffix(bgColorButton);
        appearanceGroup.add(bgColorRow);

        const spotColorRow = new Adw.ActionRow({
            title: _('Spotlight Color'),
            subtitle: _('Color of the circle that centers on the cursor'),
        });
        const spotColorButton = new Gtk.ColorButton({
            rgba: this._parseColor(settings.get_string('spotlight-color') || '#FFFFFF80'),
            use_alpha: true,
        });
        spotColorButton.connect('color-set', () => {
            const rgba = spotColorButton.get_rgba();
            const color = this._rgbaToHex(rgba);
            settings.set_string('spotlight-color', color);
        });
        spotColorRow.add_suffix(spotColorButton);
        appearanceGroup.add(spotColorRow);

        const radiusRow = new Adw.SpinRow({
            title: _('Spotlight Radius (px)'),
            subtitle: _('Radius of the circle (PowerToys default: 100)'),
            adjustment: new Gtk.Adjustment({
                lower: 50,
                upper: 500,
                step_increment: 10,
                value: settings.get_int('spotlight-radius') || 100,
            }),
        });
        radiusRow.connect('notify::value', () => {
            settings.set_int('spotlight-radius', radiusRow.value);
        });
        appearanceGroup.add(radiusRow);

        const zoomRow = new Adw.SpinRow({
            title: _('Spotlight Initial Zoom'),
            subtitle: _('Starts big and shrinks (PowerToys default: 9x)'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 20,
                step_increment: 0.5,
                value: settings.get_double('spotlight-zoom') || 9.0,
            }),
        });
        zoomRow.connect('notify::value', () => {
            settings.set_double('spotlight-zoom', zoomRow.value);
        });
        appearanceGroup.add(zoomRow);

        const gamemodeRow = new Adw.SwitchRow({
            title: _('Do not activate in Game Mode'),
            subtitle: _('Prevents spotlight when Game Mode is on'),
            active: settings.get_boolean('do-not-activate-gamemode'),
        });
        gamemodeRow.connect('notify::active', () => {
            settings.set_boolean('do-not-activate-gamemode', gamemodeRow.active);
        });
        appearanceGroup.add(gamemodeRow);

        // Timing page
        const timingPage = new Adw.PreferencesPage({
            title: _('Timing'),
            icon_name: 'preferences-system-time-symbolic',
        });
        window.add(timingPage);

        const timingGroup = new Adw.PreferencesGroup({
            title: _('Timing'),
            description: _('Configure timeouts and delays'),
        });
        timingPage.add(timingGroup);

        const idleRow = new Adw.SpinRow({
            title: _('Idle Timeout (ms)'),
            subtitle: _('Wait time after mouse stops before hiding (PowerToys default: 1000)'),
            adjustment: new Gtk.Adjustment({
                lower: 100,
                upper: 10000,
                step_increment: 100,
                value: settings.get_int('idle-timeout') || 1000,
            }),
        });
        idleRow.connect('notify::value', () => {
            settings.set_int('idle-timeout', idleRow.value);
        });
        timingGroup.add(idleRow);

        const durationRow = new Adw.SpinRow({
            title: _('Animation Duration (ms)'),
            subtitle: _('Fade-out animation time (PowerToys default: 500)'),
            adjustment: new Gtk.Adjustment({
                lower: 100,
                upper: 5000,
                step_increment: 100,
                value: settings.get_int('animation-duration') || 500,
            }),
        });
        durationRow.connect('notify::value', () => {
            settings.set_int('animation-duration', durationRow.value);
        });
        timingGroup.add(durationRow);

        // Shake Detection page
        const shakePage = new Adw.PreferencesPage({
            title: _('Shake Detection'),
            icon_name: 'input-mouse-symbolic',
        });
        window.add(shakePage);

        const shakeGroup = new Adw.PreferencesGroup({
            title: _('Shake Detection'),
            description: _('Settings for mouse shake detection'),
        });
        shakePage.add(shakeGroup);

        const intervalRow = new Adw.SpinRow({
            title: _('Shake Detection Interval (ms)'),
            subtitle: _('Time window to monitor mouse movement (PowerToys default: 1000)'),
            adjustment: new Gtk.Adjustment({
                lower: 100,
                upper: 5000,
                step_increment: 100,
                value: settings.get_int('shake-interval') || 1000,
            }),
        });
        intervalRow.connect('notify::value', () => {
            settings.set_int('shake-interval', intervalRow.value);
        });
        shakeGroup.add(intervalRow);

        const sensitivityRow = new Adw.SpinRow({
            title: _('Shake Sensitivity (%)'),
            subtitle: _('Distance must be this % of movement diagonal (PowerToys default: 400%)'),
            adjustment: new Gtk.Adjustment({
                lower: 100,
                upper: 10000,
                step_increment: 100,
                value: settings.get_int('shake-sensitivity') || 400,
            }),
        });
        sensitivityRow.connect('notify::value', () => {
            settings.set_int('shake-sensitivity', sensitivityRow.value);
        });
        shakeGroup.add(sensitivityRow);
    }

    _parseColor(colorStr) {
        const rgba = new Gdk.RGBA({ red: 0, green: 0, blue: 0, alpha: 1.0 });
        if (colorStr && colorStr !== '') {
            const hex = colorStr.replace('#', '');
            if (hex.length >= 6) {
                rgba.red = parseInt(hex.substring(0, 2), 16) / 255;
                rgba.green = parseInt(hex.substring(2, 4), 16) / 255;
                rgba.blue = parseInt(hex.substring(4, 6), 16) / 255;
                rgba.alpha = hex.length >= 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1.0;
            }
        }
        return rgba;
    }

    _rgbaToHex(rgba) {
        const r = Math.round(rgba.red * 255).toString(16).padStart(2, '0');
        const g = Math.round(rgba.green * 255).toString(16).padStart(2, '0');
        const b = Math.round(rgba.blue * 255).toString(16).padStart(2, '0');
        const a = Math.round(rgba.alpha * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}${a}`;
    }
}
