import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk?version=4.0';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class FindMyMousePreferences extends ExtensionPreferences {
    constructor(metadata) {
        super(metadata);
    }

    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        
        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        const activationGroup = new Adw.PreferencesGroup({
            title: _('Activation'),
            description: _('Configure how Find My Mouse is activated'),
        });
        page.add(activationGroup);

        const activationRow = new Adw.ComboRow({
            title: _('Activation Method'),
            subtitle: _('Choose how to activate the spotlight'),
            model: Gtk.StringList.new([
                _('Press Left Ctrl twice'),
                _('Press Right Ctrl twice'),
                _('Shake mouse'),
                _('Custom shortcut')
            ]),
        });
        
        const activationMap = {
            'ctrl-l': 0,
            'ctrl-r': 1,
            'shake': 2,
            'custom': 3,
        };
        
        const currentMethod = settings.get_string('activation-method') || 'ctrl-l';
        activationRow.selected = activationMap[currentMethod] || 0;
        
        activationRow.connect('notify::selected', () => {
            const methods = ['ctrl-l', 'ctrl-r', 'shake', 'custom'];
            settings.set_string('activation-method', methods[activationRow.selected]);
        });
        activationGroup.add(activationRow);

        const shortcutRow = new Adw.EntryRow({
            title: _('Custom Shortcut'),
            text: settings.get_string('activation-shortcut') || '',
        });
        shortcutRow.connect('notify::text', () => {
            settings.set_string('activation-shortcut', shortcutRow.text);
        });
        activationGroup.add(shortcutRow);

        const timingGroup = new Adw.PreferencesGroup({
            title: _('Timing'),
            description: _('Configure timeouts and delays'),
        });
        page.add(timingGroup);

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

        const shakeGroup = new Adw.PreferencesGroup({
            title: _('Shake Detection'),
            description: _('Settings for mouse shake detection'),
        });
        page.add(shakeGroup);

        const distanceRow = new Adw.SpinRow({
            title: _('Minimum Distance (px)'),
            subtitle: _('Minimum travel distance to detect shake (PowerToys default: 1000)'),
            adjustment: new Gtk.Adjustment({
                lower: 100,
                upper: 10000,
                step_increment: 100,
                value: settings.get_int('shake-distance') || 1000,
            }),
        });
        distanceRow.connect('notify::value', () => {
            settings.set_int('shake-distance', distanceRow.value);
        });
        shakeGroup.add(distanceRow);

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

        const appearanceGroup = new Adw.PreferencesGroup({
            title: _('Appearance'),
            description: _('Customize the spotlight appearance'),
        });
        page.add(appearanceGroup);

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
