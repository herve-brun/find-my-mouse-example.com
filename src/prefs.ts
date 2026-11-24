import type { ExtensionMetadata } from 'resource:///org/gnome/shell/extensions/extension.js';

import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { setLogLevel, LogLevel } from './utils.js';

/** Suffix widgets need their own name: the row title is not enough for a screen reader. */
function setAccessibleLabel(widget: Gtk.Widget, label: string): void {
    widget.update_property([Gtk.AccessibleProperty.LABEL], [label]);
}

/** Modifiers are shown live while pressed, but are not valid accelerators on their own. */
const MODIFIER_KEY_MAP: Array<[number, Gdk.ModifierType]> = [
    [Gdk.KEY_Shift_L, Gdk.ModifierType.SHIFT_MASK],
    [Gdk.KEY_Shift_R, Gdk.ModifierType.SHIFT_MASK],
    [Gdk.KEY_Control_L, Gdk.ModifierType.CONTROL_MASK],
    [Gdk.KEY_Control_R, Gdk.ModifierType.CONTROL_MASK],
    [Gdk.KEY_Alt_L, Gdk.ModifierType.ALT_MASK],
    [Gdk.KEY_Alt_R, Gdk.ModifierType.ALT_MASK],
    [Gdk.KEY_Super_L, Gdk.ModifierType.SUPER_MASK],
    [Gdk.KEY_Super_R, Gdk.ModifierType.SUPER_MASK],
    [Gdk.KEY_Hyper_L, Gdk.ModifierType.HYPER_MASK],
    [Gdk.KEY_Hyper_R, Gdk.ModifierType.HYPER_MASK],
    [Gdk.KEY_Meta_L, Gdk.ModifierType.META_MASK],
    [Gdk.KEY_Meta_R, Gdk.ModifierType.META_MASK],
];
const LOCK_KEYS: number[] = [
    Gdk.KEY_Caps_Lock, Gdk.KEY_Num_Lock, Gdk.KEY_Scroll_Lock,
];

export default class FindMyMousePreferences extends ExtensionPreferences {
    constructor(metadata: ExtensionMetadata) {
        super(metadata);
    }

    fillPreferencesWindow(window: Adw.PreferencesWindow): void {
        window.set_default_size(700, 645);
        const settings = this.getSettings();

        // General page
        const generalPage = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(generalPage);

        const activationGroup = new Adw.PreferencesGroup({
            title: _('Activation'),
            description: _('Configure how Find My Mouse is activated'),
        });
        generalPage.add(activationGroup);

        const activationRow = new Adw.ComboRow({
            title: _('Activation Method'),
            subtitle: _('Choose how to activate the spotlight'),
            model: Gtk.StringList.new([
                _('Mouse Shake'),
                _('Always Visible'),
            ]),
        });

        const activationMap: Record<string, number> = {
            shake: 0,
            always: 1,
        };

        const currentMethod = settings.get_string('activation-method') || 'shake';
        activationRow.selected = activationMap[currentMethod] ?? 0;
        activationGroup.add(activationRow);

        const shortcutRow = new Adw.ActionRow({
            title: _('Activation Shortcut'),
            subtitle: _('Toggle the spotlight from the keyboard'),
            activatable: true,
        });
        const shortcutLabel = new Gtk.ShortcutLabel({
            accelerator: this._shortcutAccelerator(settings),
            valign: Gtk.Align.CENTER,
        });
        const shortcutButton = new Gtk.Button({
            label: _('Change'),
            valign: Gtk.Align.CENTER,
        });
        setAccessibleLabel(shortcutButton, _('Change Activation Shortcut'));
        shortcutButton.connect('clicked', () => {
            this._showShortcutDialog(window, settings);
        });
        shortcutRow.connect('activated', () => {
            this._showShortcutDialog(window, settings);
        });
        shortcutRow.add_suffix(shortcutLabel);
        shortcutRow.add_suffix(shortcutButton);
        activationGroup.add(shortcutRow);

        const updateShortcutRow = (): void => {
            const alwaysVisible = settings.get_string('activation-method') === 'always';
            shortcutRow.sensitive = !alwaysVisible;
            shortcutRow.activatable = !alwaysVisible;
            shortcutButton.sensitive = !alwaysVisible;
            shortcutRow.subtitle = alwaysVisible
                ? _('Unavailable in Always Visible mode: the spotlight is already on screen')
                : _('Toggle the spotlight from the keyboard');
        };

        activationRow.connect('notify::selected', () => {
            const methods = ['shake', 'always'];
            settings.set_string('activation-method', methods[activationRow.selected]);
        });
        settings.connect('changed::activation-method', updateShortcutRow);
        updateShortcutRow();
        settings.connect('changed::find-my-mouse-activation', () => {
            shortcutLabel.set_accelerator(this._shortcutAccelerator(settings));
        });

        // Game Mode — prevent spotlight activation during Game Mode
        const gamemodeRow = new Adw.SwitchRow({
            title: _('Disable During Game Mode'),
            subtitle: _('Keep spotlight off while Game Mode is active'),
        });
        settings.bind(
            'do-not-activate-gamemode',
            gamemodeRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT,
        );
        activationGroup.add(gamemodeRow);

        const multiMonitorGroup = new Adw.PreferencesGroup({
            title: _('Multi-Monitor'),
            description: _('Settings for multi-monitor setups'),
        });
        generalPage.add(multiMonitorGroup);

        const allMonitorsRow = new Adw.SwitchRow({
            title: _('Show on All Monitors'),
            subtitle: _('When enabled, spotlight covers all connected monitors'),
        });
        settings.bind(
            'show-on-all-monitors',
            allMonitorsRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT,
        );
        multiMonitorGroup.add(allMonitorsRow);

        // Reset to defaults
        const generalDefaultsGroup = new Adw.PreferencesGroup();
        generalPage.add(generalDefaultsGroup);
        const generalResetRow = new Adw.ActionRow({
            title: _('Reset General Settings to Defaults'),
            subtitle: _('Restore default values'),
        });
        const generalResetButton = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
        });
        generalResetButton.add_css_class('destructive-action');
        generalResetButton.connect('clicked', () => {
            settings.set_boolean('show-on-all-monitors', false);
            settings.set_boolean('do-not-activate-gamemode', true);
            activationRow.selected = 0;
        });
        setAccessibleLabel(generalResetButton, _('Reset General Settings to Defaults'));
        generalResetRow.add_suffix(generalResetButton);
        generalDefaultsGroup.add(generalResetRow);

        // Appearance page
        const appearancePage = new Adw.PreferencesPage({
            title: _('Appearance'),
            icon_name: 'preferences-desktop-symbolic',
        });
        window.add(appearancePage);

        const appearanceGroup = new Adw.PreferencesGroup({
            title: '',
            description: _('Customize the spotlight appearance'),
        });
        appearancePage.add(appearanceGroup);

        const bgColorRow = new Adw.ActionRow({
            title: _('Background Color'),
            subtitle: _('Color of the spotlight backdrop'),
        });
        const bgColorButton = new Gtk.ColorButton({
            rgba: this._parseColor(
                settings.get_string('background-color') || '#00000080',
            ),
            use_alpha: true,
        });
        setAccessibleLabel(bgColorButton, _('Background Color'));
        bgColorButton.connect('color-set', () => {
            const rgba = bgColorButton.get_rgba();
            const color = this._rgbaToHex(rgba);
            settings.set_string('background-color', color);
        });
        bgColorRow.add_suffix(bgColorButton);
        appearanceGroup.add(bgColorRow);

        const radiusRow = new Adw.SpinRow({
            title: _('Spotlight Radius (px)'),
            subtitle: _('Radius of the circle (default: 100)'),
            adjustment: new Gtk.Adjustment({
                lower: 50,
                upper: 500,
                step_increment: 10,
            }),
        });
        settings.bind(
            'spotlight-radius',
            radiusRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT,
        );
        appearanceGroup.add(radiusRow);

        const zoomRow = new Adw.SpinRow({
            title: _('Spotlight Initial Zoom'),
            subtitle: _('Starts big and shrinks (default: 9x)'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 20,
                step_increment: 0.5,
            }),
        });
        settings.bind(
            'spotlight-zoom',
            zoomRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT,
        );
        appearanceGroup.add(zoomRow);

        // Ring group
        const ringGroup = new Adw.PreferencesGroup({
            title: _('Ring'),
            description: _('Configure the spotlight ring border'),
        });
        appearancePage.add(ringGroup);

        const spotColorRow = new Adw.ActionRow({
            title: _('Ring Color'),
            subtitle: _('Color of the ring that outlines the spotlight circle'),
        });
        const spotColorButton = new Gtk.ColorButton({
            rgba: this._parseColor(
                settings.get_string('spotlight-color') || '#FFFFFFCC',
            ),
            use_alpha: true,
        });
        setAccessibleLabel(spotColorButton, _('Ring Color'));
        spotColorButton.connect('color-set', () => {
            const rgba = spotColorButton.get_rgba();
            const color = this._rgbaToHex(rgba);
            settings.set_string('spotlight-color', color);
        });
        spotColorRow.add_suffix(spotColorButton);
        ringGroup.add(spotColorRow);

        const ringWidthRow = new Adw.SpinRow({
            title: _('Ring Width (px)'),
            subtitle: _('Thickness of the spotlight border circle'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 20,
                step_increment: 1,
            }),
        });
        settings.bind(
            'spotlight-ring-width',
            ringWidthRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT,
        );
        ringGroup.add(ringWidthRow);

        // Reset to defaults
        const appearanceDefaultsGroup = new Adw.PreferencesGroup();
        appearancePage.add(appearanceDefaultsGroup);
        const appearanceResetRow = new Adw.ActionRow({
            title: _('Reset Appearance Settings to Defaults'),
            subtitle: _('Restore default values'),
        });
        const appearanceResetButton = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
        });
        appearanceResetButton.add_css_class('destructive-action');
        appearanceResetButton.connect('clicked', () => {
            settings.set_string('background-color', '#00000080');
            settings.set_string('spotlight-color', '#FFFFFFCC');
            settings.set_int('spotlight-radius', 100);
            settings.set_double('spotlight-zoom', 9.0);
            settings.set_int('spotlight-ring-width', 2);
            bgColorButton.set_rgba(this._parseColor('#00000080'));
            spotColorButton.set_rgba(this._parseColor('#FFFFFFCC'));
        });
        setAccessibleLabel(appearanceResetButton, _('Reset Appearance Settings to Defaults'));
        appearanceResetRow.add_suffix(appearanceResetButton);
        appearanceDefaultsGroup.add(appearanceResetRow);

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
            subtitle: _(
                'Wait time after mouse stops before hiding (default: 1000ms)',
            ),
            adjustment: new Gtk.Adjustment({
                lower: 100,
                upper: 10000,
                step_increment: 100,
            }),
        });
        settings.bind(
            'idle-timeout',
            idleRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT,
        );
        timingGroup.add(idleRow);

        const durationRow = new Adw.SpinRow({
            title: _('Animation Duration (ms)'),
            subtitle: _('Fade-out animation time (default: 500ms)'),
            adjustment: new Gtk.Adjustment({
                lower: 100,
                upper: 5000,
                step_increment: 100,
            }),
        });
        settings.bind(
            'animation-duration',
            durationRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT,
        );
        timingGroup.add(durationRow);

        // Reset to defaults
        const timingResetRow = new Adw.ActionRow({
            title: _('Reset Timing Settings to Defaults'),
            subtitle: _('Restore default values'),
        });
        const timingResetButton = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
        });
        timingResetButton.add_css_class('destructive-action');
        timingResetButton.connect('clicked', () => {
            settings.set_int('idle-timeout', 1000);
            settings.set_int('animation-duration', 500);
        });
        setAccessibleLabel(timingResetButton, _('Reset Timing Settings to Defaults'));
        timingResetRow.add_suffix(timingResetButton);
        timingGroup.add(timingResetRow);

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
            subtitle: _(
                'Time window to monitor mouse movement (default: 1000ms)',
            ),
            adjustment: new Gtk.Adjustment({
                lower: 100,
                upper: 5000,
                step_increment: 100,
            }),
        });
        settings.bind(
            'shake-interval',
            intervalRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT,
        );
        shakeGroup.add(intervalRow);

        const sensitivityRow = new Adw.SpinRow({
            title: _('Shake Sensitivity (%)'),
            subtitle: _(
                'Distance must be this % of movement diagonal (default: 400%)',
            ),
            adjustment: new Gtk.Adjustment({
                lower: 100,
                upper: 10000,
                step_increment: 100,
            }),
        });
        settings.bind(
            'shake-sensitivity',
            sensitivityRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT,
        );
        shakeGroup.add(sensitivityRow);

        // Reset to defaults
        const shakeResetRow = new Adw.ActionRow({
            title: _('Reset Shake Detection Settings to Defaults'),
            subtitle: _('Restore default values'),
        });
        const shakeResetButton = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
        });
        shakeResetButton.add_css_class('destructive-action');
        shakeResetButton.connect('clicked', () => {
            settings.set_int('shake-interval', 1000);
            settings.set_int('shake-sensitivity', 400);
        });
        setAccessibleLabel(shakeResetButton, _('Reset Shake Detection Settings to Defaults'));
        shakeResetRow.add_suffix(shakeResetButton);
        shakeGroup.add(shakeResetRow);

        // About page
        const aboutPage = new Adw.PreferencesPage({
            title: _('About'),
            icon_name: 'help-about-symbolic',
        });
        window.add(aboutPage);

        const aboutGroup = new Adw.PreferencesGroup({
            title: _('About'),
        });
        aboutPage.add(aboutGroup);

        const versionRow = new Adw.ActionRow({
            title: _('Version'),
            subtitle: String(this.metadata['version-name'] ?? '1.0.0'),
            icon_name: 'software-update-available-symbolic',
            activatable: false,
        });
        aboutGroup.add(versionRow);

        const websiteRow = new Adw.ActionRow({
            title: _('Website'),
            subtitle: 'github.com/herve-brun/find-my-mouse-example.com',
            icon_name: 'web-browser-symbolic',
            activatable: true,
        });
        websiteRow.connect('activated', () => {
            Gio.AppInfo.launch_default_for_uri(
                'https://github.com/herve-brun/find-my-mouse-example.com',
                null,
            );
        });
        aboutGroup.add(websiteRow);

        const creditsRow = new Adw.ActionRow({
            title: _('Credits and License'),
            subtitle: _('View credits, license, and release notes'),
            icon_name: 'help-about-symbolic',
            activatable: true,
        });
        creditsRow.connect('activated', () => this._showAboutDialog(window));
        aboutGroup.add(creditsRow);

        // Log level preferences group
        const logGroup = new Adw.PreferencesGroup({
            title: _('Logging'),
            description: _('Configure extension logging verbosity'),
        });
        aboutPage.add(logGroup);

        const logLevelRow = new Adw.ComboRow({
            title: _('Log Level'),
            subtitle: _('Set the maximum log level to display'),
            model: Gtk.StringList.new([
                _('Errors Only'),
                _('Warnings and Errors'),
                _('Info and Above'),
                _('Debug (Verbose)'),
            ]),
        });

        const levels = [
            LogLevel.ERROR,
            LogLevel.WARN,
            LogLevel.INFO,
            LogLevel.DEBUG,
        ];

        // Set initial log level from stored setting (not from widget,
        // to avoid a race where the GSettings bind hasn't propagated yet)
        const initialLevel = settings.get_int('log-level');
        setLogLevel(levels[initialLevel >= 0 ? initialLevel : LogLevel.INFO]);

        settings.bind(
            'log-level',
            logLevelRow,
            'selected',
            Gio.SettingsBindFlags.DEFAULT,
        );

        logLevelRow.connect('notify::selected', () => {
            setLogLevel(levels[logLevelRow.selected]);
        });

        logGroup.add(logLevelRow);

        // Inline reset for logging settings
        const logResetRow = new Adw.ActionRow({
            title: _('Reset Logging to Defaults'),
            subtitle: _('Restore the default log level'),
        });
        const logResetButton = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
        });
        logResetButton.add_css_class('destructive-action');
        logResetButton.connect('clicked', () => {
            settings.set_int('log-level', 2);
            setLogLevel(LogLevel.INFO);
        });
        setAccessibleLabel(logResetButton, _('Reset Logging to Defaults'));
        logResetRow.add_suffix(logResetButton);
        logGroup.add(logResetRow);
    }

    private _shortcutAccelerator(settings: Gio.Settings): string {
        return settings.get_strv('find-my-mouse-activation')[0] ?? '';
    }

    /** GTK4 has no public shortcut entry widget, so capture the key with an EventControllerKey. */
    private _showShortcutDialog(
        parent: Gtk.Window,
        settings: Gio.Settings,
    ): void {
        const dialog = new Gtk.Dialog({
            title: _('Set Activation Shortcut'),
            transient_for: parent,
            modal: true,
        });
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 24,
            margin_end: 24,
        });
        box.append(new Gtk.Label({
            label: _('Press the new shortcut — modifiers appear as you type'),
            wrap: true,
        }));
        const preview = new Gtk.ShortcutLabel({
            accelerator: '',
            halign: Gtk.Align.CENTER,
        });
        box.append(preview);
        const status = new Gtk.Label({ label: '', wrap: true });
        box.append(status);
        box.append(new Gtk.Label({
            label: _('Escape to cancel, BackSpace to clear'),
            wrap: true,
        }));
        dialog.get_content_area().append(box);

        const pressedModifiers = new Set<Gdk.ModifierType>();
        let closeId = 0;
        dialog.connect('destroy', () => {
            if (closeId) {
                GLib.source_remove(closeId);
                closeId = 0;
            }
        });
        const updatePreview = (keyval: number, mask: Gdk.ModifierType): void => {
            preview.set_accelerator(
                Gtk.accelerator_name(
                    keyval,
                    mask & Gtk.accelerator_get_default_mod_mask(),
                ),
            );
        };

        const controller = new Gtk.EventControllerKey();
        controller.connect('key-pressed', (
            _controller: Gtk.EventControllerKey,
            keyval: number,
            _keycode: number,
            state: Gdk.ModifierType,
        ) => {
            if (keyval === Gdk.KEY_Escape) {
                dialog.destroy();
                return true;
            }
            if (keyval === Gdk.KEY_BackSpace) {
                settings.set_strv('find-my-mouse-activation', []);
                dialog.destroy();
                return true;
            }
            const modifier = MODIFIER_KEY_MAP.find(([key]) => key === keyval);
            if (modifier) {
                pressedModifiers.add(modifier[1]);
                updatePreview(
                    0,
                    [...pressedModifiers].reduce((mask, flag) => mask | flag, 0),
                );
                status.label = '';
                return true;
            }
            if (LOCK_KEYS.includes(keyval))
                return true;
            const mask = state & Gtk.accelerator_get_default_mod_mask();
            if (mask === 0) {
                status.label = _('Include at least one modifier key');
                return true;
            }
            const accelerator = Gtk.accelerator_name(keyval, mask);
            if (!accelerator) {
                status.label = _('That key cannot be used as a shortcut');
                return true;
            }
            updatePreview(keyval, mask);
            status.label = '';
            settings.set_strv('find-my-mouse-activation', [accelerator]);
            // Keep the completed sequence visible for a moment before closing.
            closeId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
                closeId = 0;
                dialog.destroy();
                return GLib.SOURCE_REMOVE;
            });
            return true;
        });
        controller.connect('key-released', (
            _controller: Gtk.EventControllerKey,
            keyval: number,
            _keycode: number,
            _state: Gdk.ModifierType,
        ) => {
            const modifier = MODIFIER_KEY_MAP.find(([key]) => key === keyval);
            if (!modifier || closeId)
                return true;
            pressedModifiers.delete(modifier[1]);
            updatePreview(
                0,
                [...pressedModifiers].reduce((mask, flag) => mask | flag, 0),
            );
            return true;
        });
        dialog.add_controller(controller);
        dialog.show();
    }

    _showAboutDialog(parent: Gtk.Window): void {
        const dialog = new Adw.AboutWindow({
            transient_for: parent,
            modal: true,
            application_name: _('Find My Mouse'),
            application_icon: 'input-mouse-symbolic',
            version: String(this.metadata['version-name'] ?? '1.0.0'),
            developer_name: 'Hervé Brun',
            copyright: '© 2026 Hervé Brun',
            license_type: 3, // Gtk.License.GTK_LICENSE_GPL_3_0,
            website: 'https://github.com/herve-brun/find-my-mouse-example.com',
            developers: ['Hervé Brun'],
            designers: ['Microsoft PowerToys Team (inspiration)'],
            translator_credits: _('translator-credits'),
            comments: _(
                'A GNOME Shell extension that helps you locate your mouse cursor by creating a spotlight effect around it. Inspired by Microsoft PowerToys Find My Mouse feature.',
            ),
            release_notes_version: String(this.metadata['version-name'] ?? '1.0.0'),
            release_notes: `<p>Initial release with the following features:</p>
                <ul>
                    <li>Multiple activation methods (mouse shake, always visible)</li>
                    <li>Customizable appearance and timing</li>
                    <li>Multi-monitor support</li>
                </ul>`,
        });
        dialog.present();
    }

    _parseColor(colorStr: string): Gdk.RGBA {
        const rgba = new Gdk.RGBA({ red: 0, green: 0, blue: 0, alpha: 1.0 });
        if (colorStr && colorStr !== '') {
            const hex = colorStr.replace('#', '');
            if (hex.length >= 6) {
                rgba.red = parseInt(hex.substring(0, 2), 16) / 255;
                rgba.green = parseInt(hex.substring(2, 4), 16) / 255;
                rgba.blue = parseInt(hex.substring(4, 6), 16) / 255;
                rgba.alpha =
                    hex.length >= 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1.0;
            }
        }
        return rgba;
    }

    _rgbaToHex(rgba: Gdk.RGBA): string {
        const r = Math.round(rgba.red * 255)
            .toString(16)
            .padStart(2, '0');
        const g = Math.round(rgba.green * 255)
            .toString(16)
            .padStart(2, '0');
        const b = Math.round(rgba.blue * 255)
            .toString(16)
            .padStart(2, '0');
        const a = Math.round(rgba.alpha * 255)
            .toString(16)
            .padStart(2, '0');
        return `#${r}${g}${b}${a}`;
    }
}
