import type { ExtensionMetadata } from 'resource:///org/gnome/shell/extensions/extension.js';

import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { setLogLevel, LogLevel } from './utils.js';
import { PracticeClient } from './practiceClient.js';

/** `pattern` must come from gettext; GJS provides String.prototype.format. */
function formatSetting(pattern: string, value: number): string {
    return pattern.format(value);
}

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

/** Preset values map directly to the five numeric gesture threshold keys. */
interface GesturePreset {
    reversals: number;
    sweep: number;
    window: number;
    settle: number;
    cooldown: number;
}

const GESTURE_PRESETS: GesturePreset[] = [
    { reversals: 2, sweep: 60, window: 1200, settle: 260, cooldown: 1000 },
    { reversals: 3, sweep: 90, window: 900, settle: 180, cooldown: 1500 },
    { reversals: 4, sweep: 140, window: 700, settle: 120, cooldown: 2000 },
];
const CUSTOM_GESTURE_PRESET = GESTURE_PRESETS.length;
const DEFAULT_GESTURE_PRESET = 1;
const GESTURE_NUMERIC_KEYS = [
    'gesture-reversals',
    'gesture-sweep',
    'gesture-window',
    'gesture-settle',
    'gesture-cooldown',
] as const;

export default class FindMyMousePreferences extends ExtensionPreferences {
    private _undoToast: Adw.Toast | null = null;

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

        // GTK4 radio buttons are CheckButtons with an explicit group.
        const shortcutMethodRow = new Adw.ActionRow({
            title: _('Shortcut and gesture'),
            subtitle: _('Show the spotlight from the keyboard or with a gesture'),
        });
        const shortcutMethodCheck = new Gtk.CheckButton({
            valign: Gtk.Align.CENTER,
        });
        shortcutMethodRow.add_prefix(shortcutMethodCheck);
        activationGroup.add(shortcutMethodRow);

        const alwaysVisibleRow = new Adw.ActionRow({
            title: _('Always visible'),
            subtitle: _('Keep the spotlight on screen'),
        });
        const alwaysVisibleCheck = new Gtk.CheckButton({
            valign: Gtk.Align.CENTER,
        });
        alwaysVisibleCheck.set_group(shortcutMethodCheck);
        alwaysVisibleRow.add_prefix(alwaysVisibleCheck);
        activationGroup.add(alwaysVisibleRow);

        const shortcutRow = new Adw.ActionRow({
            title: _('Activation Shortcut'),
            subtitle: _('Show the spotlight from the keyboard'),
            activatable: true,
        });
        const shortcutLabel = new Gtk.ShortcutLabel({
            accelerator: this._shortcutAccelerator(settings),
            valign: Gtk.Align.CENTER,
        });
        const shortcutButton = new Gtk.Button({
            label: _('Change…'),
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
                ? _('Unavailable in always visible mode: the spotlight is already on screen')
                : _('Shortcut and gesture both activate the spotlight; change the shortcut here');
        };

        // Only set the key when a radio becomes active: setting it from the
        // other radio's toggled handler would loop on the changed signal.
        const syncActivationMethod = (): void => {
            const method = settings.get_string('activation-method') || 'shake';
            shortcutMethodCheck.set_active(method !== 'always');
            alwaysVisibleCheck.set_active(method === 'always');
        };
        shortcutMethodCheck.connect('toggled', () => {
            if (shortcutMethodCheck.get_active())
                settings.set_string('activation-method', 'shake');
        });
        alwaysVisibleCheck.connect('toggled', () => {
            if (alwaysVisibleCheck.get_active())
                settings.set_string('activation-method', 'always');
        });
        settings.connect('changed::activation-method', () => {
            syncActivationMethod();
            updateShortcutRow();
        });
        syncActivationMethod();
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
        const generalResetLabel = _('Reset general settings');
        const generalResetRow = new Adw.ActionRow({
            title: generalResetLabel,
            subtitle: _('Restore default values'),
        });
        const generalResetButton = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
        });
        generalResetButton.connect('clicked', () => {
            this._resetWithUndo(
                settings,
                window,
                [
                    'activation-method',
                    'do-not-activate-gamemode',
                    'show-on-all-monitors',
                ],
                () => {
                    settings.set_string('activation-method', 'shake');
                    settings.set_boolean('do-not-activate-gamemode', true);
                    settings.set_boolean('show-on-all-monitors', false);
                },
                generalResetLabel,
            );
        });
        setAccessibleLabel(generalResetButton, generalResetLabel);
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
            title: _('Background color'),
            subtitle: _('Color of the spotlight backdrop'),
        });
        const bgColorButton = new Gtk.ColorButton({
            rgba: this._parseColor(
                settings.get_string('background-color') || '#00000080',
            ),
            use_alpha: true,
        });
        setAccessibleLabel(bgColorButton, _('Background color'));
        bgColorButton.connect('color-set', () => {
            const rgba = bgColorButton.get_rgba();
            const color = this._rgbaToHex(rgba);
            settings.set_string('background-color', color);
        });
        settings.connect('changed::background-color', () => {
            bgColorButton.set_rgba(
                this._parseColor(settings.get_string('background-color')),
            );
        });
        bgColorRow.add_suffix(bgColorButton);
        appearanceGroup.add(bgColorRow);

        const radiusRow = new Adw.SpinRow({
            title: _('Spotlight radius'),
            subtitle: _('Radius of the circle'),
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
            title: _('Initial zoom'),
            subtitle: _('Starts big and shrinks'),
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
            title: _('Ring color'),
            subtitle: _('Color of the ring that outlines the spotlight circle'),
        });
        const spotColorButton = new Gtk.ColorButton({
            rgba: this._parseColor(
                settings.get_string('spotlight-color') || '#FFFFFFCC',
            ),
            use_alpha: true,
        });
        setAccessibleLabel(spotColorButton, _('Ring color'));
        spotColorButton.connect('color-set', () => {
            const rgba = spotColorButton.get_rgba();
            const color = this._rgbaToHex(rgba);
            settings.set_string('spotlight-color', color);
        });
        settings.connect('changed::spotlight-color', () => {
            spotColorButton.set_rgba(
                this._parseColor(settings.get_string('spotlight-color')),
            );
        });
        spotColorRow.add_suffix(spotColorButton);
        ringGroup.add(spotColorRow);

        const ringWidthRow = new Adw.SpinRow({
            title: _('Ring width'),
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
        const appearanceResetLabel = _('Reset appearance settings');
        const appearanceResetRow = new Adw.ActionRow({
            title: appearanceResetLabel,
            subtitle: _('Restore default values'),
        });
        const appearanceResetButton = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
        });
        appearanceResetButton.connect('clicked', () => {
            this._resetWithUndo(
                settings,
                window,
                [
                    'background-color',
                    'spotlight-color',
                    'spotlight-radius',
                    'spotlight-zoom',
                    'spotlight-ring-width',
                ],
                () => {
                    settings.set_string('background-color', '#00000080');
                    settings.set_string('spotlight-color', '#FFFFFFCC');
                    settings.set_int('spotlight-radius', 100);
                    settings.set_double('spotlight-zoom', 9.0);
                    settings.set_int('spotlight-ring-width', 2);
                },
                appearanceResetLabel,
            );
        });
        setAccessibleLabel(appearanceResetButton, appearanceResetLabel);
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
            title: _('Idle timeout'),
            subtitle: _('Wait time after the pointer stops before hiding'),
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
            title: _('Animation duration'),
            subtitle: _('Fade-out animation time'),
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
        const timingResetLabel = _('Reset timing settings');
        const timingResetRow = new Adw.ActionRow({
            title: timingResetLabel,
            subtitle: _('Restore default values'),
        });
        const timingResetButton = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
        });
        timingResetButton.connect('clicked', () => {
            this._resetWithUndo(
                settings,
                window,
                ['idle-timeout', 'animation-duration'],
                () => {
                    settings.set_int('idle-timeout', 1000);
                    settings.set_int('animation-duration', 500);
                },
                timingResetLabel,
            );
        });
        setAccessibleLabel(timingResetButton, timingResetLabel);
        timingResetRow.add_suffix(timingResetButton);
        timingGroup.add(timingResetRow);

        // Mouse Gesture page
        const gesturePage = new Adw.PreferencesPage({
            title: _('Mouse Gesture'),
            icon_name: 'input-mouse-symbolic',
        });
        window.add(gesturePage);

        const gestureGroup = new Adw.PreferencesGroup({
            title: _('Mouse Gesture'),
            description: _(
                'Move the pointer sideways about a hand\'s width, then stop. The spotlight appears when you stop.',
            ),
        });
        gesturePage.add(gestureGroup);

        const effortRow = new Adw.ComboRow({
            title: _('Gesture effort'),
            subtitle: _('Standard is the default'),
            model: Gtk.StringList.new([
                _('Light'),
                _('Standard'),
                _('Firm'),
                _('Custom'),
            ]),
        });
        gestureGroup.add(effortRow);

        let applyingGesturePreset = false;

        const applyGesturePreset = (index: number): void => {
            const preset = GESTURE_PRESETS[index];
            if (!preset) return;
            applyingGesturePreset = true;
            try {
                settings.set_int('gesture-reversals', preset.reversals);
                settings.set_int('gesture-sweep', preset.sweep);
                settings.set_int('gesture-window', preset.window);
                settings.set_int('gesture-settle', preset.settle);
                settings.set_int('gesture-cooldown', preset.cooldown);
                effortRow.selected = index;
            } finally {
                applyingGesturePreset = false;
            }
        };

        const syncGesturePreset = (): void => {
            const match = GESTURE_PRESETS.findIndex((preset) => (
                preset.reversals === settings.get_int('gesture-reversals') &&
                preset.sweep === settings.get_int('gesture-sweep') &&
                preset.window === settings.get_int('gesture-window') &&
                preset.settle === settings.get_int('gesture-settle') &&
                preset.cooldown === settings.get_int('gesture-cooldown')
            ));
            applyingGesturePreset = true;
            effortRow.selected = match === -1 ? CUSTOM_GESTURE_PRESET : match;
            applyingGesturePreset = false;
        };

        effortRow.connect('notify::selected', () => {
            if (applyingGesturePreset) return;
            const index = effortRow.selected;
            // Custom is a display-only state driven by the fine-tune rows.
            if (index === CUSTOM_GESTURE_PRESET) {
                syncGesturePreset();
                return;
            }
            if (index >= 0) applyGesturePreset(index);
        });
        for (const key of GESTURE_NUMERIC_KEYS) {
            settings.connect(`changed::${key}`, () => {
                if (!applyingGesturePreset) syncGesturePreset();
            });
        }
        syncGesturePreset();

        const fineTuneRow = new Adw.ExpanderRow({
            title: _('Fine-tune gesture'),
            subtitle: _('Adjust each threshold individually'),
        });
        gestureGroup.add(fineTuneRow);

        const reversalsRow = new Adw.SpinRow({
            title: _('Direction changes'),
            subtitle: _('Direction changes required'),
            adjustment: new Gtk.Adjustment({
                lower: 2,
                upper: 6,
                step_increment: 1,
            }),
        });
        settings.bind(
            'gesture-reversals',
            reversalsRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT,
        );
        fineTuneRow.add_row(reversalsRow);

        const sweepRow = new Adw.SpinRow({
            title: _('Sweep distance'),
            subtitle: _('Minimum travel per sweep'),
            adjustment: new Gtk.Adjustment({
                lower: 40,
                upper: 300,
                step_increment: 10,
            }),
        });
        settings.bind(
            'gesture-sweep',
            sweepRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT,
        );
        fineTuneRow.add_row(sweepRow);

        const windowRow = new Adw.SpinRow({
            title: _('Gesture window'),
            subtitle: _('Time allowed for the whole gesture'),
            adjustment: new Gtk.Adjustment({
                lower: 400,
                upper: 1500,
                step_increment: 50,
            }),
        });
        settings.bind(
            'gesture-window',
            windowRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT,
        );
        fineTuneRow.add_row(windowRow);

        const settleRow = new Adw.SpinRow({
            title: _('Settle time'),
            subtitle: _('Time allowed to stop after the last change'),
            adjustment: new Gtk.Adjustment({
                lower: 80,
                upper: 400,
                step_increment: 20,
            }),
        });
        settings.bind(
            'gesture-settle',
            settleRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT,
        );
        fineTuneRow.add_row(settleRow);

        const cooldownRow = new Adw.SpinRow({
            title: _('Cooldown'),
            subtitle: _('Ignore further gestures after activation'),
            adjustment: new Gtk.Adjustment({
                lower: 500,
                upper: 4000,
                step_increment: 100,
            }),
        });
        settings.bind(
            'gesture-cooldown',
            cooldownRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT,
        );
        fineTuneRow.add_row(cooldownRow);

        const ignoreButtonsRow = new Adw.SwitchRow({
            title: _('Ignore Mouse Buttons'),
            subtitle: _('Skip gestures while a mouse button is held down'),
        });
        settings.bind(
            'gesture-ignore-buttons',
            ignoreButtonsRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT,
        );
        gestureGroup.add(ignoreButtonsRow);

        const ignoreFullscreenRow = new Adw.SwitchRow({
            title: _('Ignore Fullscreen Apps'),
            subtitle: _('Skip gestures in fullscreen apps such as games'),
        });
        settings.bind(
            'gesture-ignore-fullscreen',
            ignoreFullscreenRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT,
        );
        gestureGroup.add(ignoreFullscreenRow);

        const soundRow = new Adw.SwitchRow({
            title: _('Confirmation Sound'),
            subtitle: _('Play a short sound when the spotlight appears'),
        });
        settings.bind(
            'gesture-sound',
            soundRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT,
        );
        gestureGroup.add(soundRow);

        const practiceInstructions = (): string => [
            formatSetting(
                _('Wave the pointer sideways with %s direction changes.'),
                settings.get_int('gesture-reversals'),
            ),
            formatSetting(
                _('Cover at least %s px on each sweep.'),
                settings.get_int('gesture-sweep'),
            ),
            formatSetting(
                _('Stop within %s ms after the last change.'),
                settings.get_int('gesture-settle'),
            ),
            formatSetting(
                _('Finish the whole gesture within %s ms.'),
                settings.get_int('gesture-window'),
            ),
        ].join('\n');

        const offlineStepsMessage = _(
            'Live practice is not available right now, so nothing is being detected. Follow these steps at your own pace.',
        );
        const chosenStepsMessage = _(
            'Live detection has stopped. Follow these steps at your own pace.',
        );

        const showTextOnlySteps = (reason: string): void => {
            const instructions = new Gtk.Label({
                label: practiceInstructions(),
                wrap: true,
                xalign: 0,
                margin_top: 12,
                margin_bottom: 12,
            });
            const dialog = new Adw.AlertDialog({
                heading: _('Try the Gesture'),
                body: reason,
                extra_child: instructions,
            });
            dialog.add_response('close', _('_Close'));
            dialog.set_default_response('close');
            dialog.set_close_response('close');
            dialog.connect('response', () => dialog.close());
            dialog.present(window);
            dialog.grab_focus();
        };

        const showPracticeDialog = (): void => {
            const client = new PracticeClient();
            let active = true;
            let starting = false;

            const status = new Gtk.Label({
                label: _('Connecting to the shell extension…'),
                wrap: true,
                xalign: 0,
                margin_top: 12,
            });
            const hints = new Gtk.Label({
                label: practiceInstructions(),
                wrap: true,
                xalign: 0,
                margin_bottom: 6,
            });
            const content = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 6,
            });
            content.append(status);
            content.append(hints);

            const dialog = new Adw.AlertDialog({
                heading: _('Try the Gesture'),
                body: _(
                    'Gesture detection is live. The spotlight itself will not appear during practice — watch the progress ring near the pointer. Text-only steps are available below.',
                ),
                extra_child: content,
            });
            dialog.add_response('cancel', _('_Cancel'));
            dialog.add_response('retry', _('_Retry'));
            dialog.add_response('text', _('_Show text-only steps…'));
            dialog.set_default_response('cancel');
            dialog.set_close_response('cancel');

            const setStatus = (message: string, outcome: string | null = null): void => {
                if (!active)
                    return;
                status.label = message;
                for (const cssClass of ['success', 'warning']) {
                    if (cssClass === outcome)
                        status.add_css_class(cssClass);
                    else
                        status.remove_css_class(cssClass);
                }
                status.update_property(
                    [Gtk.AccessibleProperty.LABEL],
                    [message],
                );
                status.announce(message, Gtk.AccessibleAnnouncementPriority.MEDIUM);
            };

            const closeLive = (): void => {
                if (!active)
                    return;
                active = false;
                client.cancel();
                client.destroy();
                dialog.close();
            };

            const useTextOnly = (reason: string): void => {
                if (!active)
                    return;
                closeLive();
                showTextOnlySteps(reason);
            };

            const startAttempt = async (): Promise<void> => {
                if (!active || starting)
                    return;
                starting = true;
                setStatus(_('Starting practice…'));
                try {
                    const started = await client.start();
                    if (!active)
                        return;
                    if (started) {
                        setStatus(_('Waiting for the gesture…'));
                    } else {
                        useTextOnly(offlineStepsMessage);
                    }
                } catch (_error) {
                    useTextOnly(offlineStepsMessage);
                } finally {
                    starting = false;
                }
            };

            client.onProgress((progress) => {
                if (!active)
                    return;
                if (progress.event === 'armed') {
                    setStatus(_('Started — now wave'));
                } else if (progress.event === 'progress') {
                    setStatus(
                        _('%s/%s direction changes').format(
                            progress.progress,
                            progress.total,
                        ),
                    );
                } else if (progress.event === 'ready') {
                    setStatus(_('Now stop'));
                }
            });
            client.onResult((result) => {
                if (!active)
                    return;
                if (result.success) {
                    setStatus(
                        _("That's the gesture — press Super+F or wave to reveal the pointer."),
                        'success',
                    );
                } else {
                    setStatus(
                        _('Stay horizontal, move faster, cover enough distance, then stop sharply.'),
                        'warning',
                    );
                }
            });

            dialog.connect('response', (_source, response) => {
                if (response === 'retry') {
                    // AlertDialog closes on any response; reopen a fresh session.
                    closeLive();
                    showPracticeDialog();
                } else if (response === 'text') {
                    useTextOnly(chosenStepsMessage);
                } else {
                    closeLive();
                }
            });
            dialog.connect('destroy', closeLive);

            dialog.present(window);
            dialog.grab_focus();

            void (async () => {
                try {
                    // Fall back when the shell service is absent or reloading.
                    if (!await client.setup() || !active) {
                        useTextOnly(offlineStepsMessage);
                        return;
                    }
                } catch (_error) {
                    useTextOnly(offlineStepsMessage);
                    return;
                }
                await startAttempt();
            })();
        };

        const practiceRow = new Adw.ActionRow({
            title: _('Practice'),
            subtitle: _('Try the gesture with live feedback'),
        });
        const practiceButton = new Gtk.Button({
            label: _('Practice gesture…'),
            valign: Gtk.Align.CENTER,
        });
        setAccessibleLabel(practiceButton, _('Practice gesture…'));
        practiceButton.connect('clicked', showPracticeDialog);
        practiceRow.add_suffix(practiceButton);
        gestureGroup.add(practiceRow);

        // Reset to defaults
        const gestureResetGroup = new Adw.PreferencesGroup();
        gesturePage.add(gestureResetGroup);
        const gestureResetLabel = _('Reset mouse gesture settings');
        const gestureResetRow = new Adw.ActionRow({
            title: gestureResetLabel,
            subtitle: _('Restore default values'),
        });
        const gestureResetButton = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
        });
        gestureResetButton.connect('clicked', () => {
            this._resetWithUndo(
                settings,
                window,
                [
                    ...GESTURE_NUMERIC_KEYS,
                    'gesture-ignore-buttons',
                    'gesture-ignore-fullscreen',
                    'gesture-sound',
                ],
                () => {
                    applyGesturePreset(DEFAULT_GESTURE_PRESET);
                    settings.set_boolean('gesture-ignore-buttons', true);
                    settings.set_boolean('gesture-ignore-fullscreen', true);
                    settings.set_boolean('gesture-sound', false);
                    syncGesturePreset();
                },
                gestureResetLabel,
            );
        });
        setAccessibleLabel(gestureResetButton, gestureResetLabel);
        gestureResetRow.add_suffix(gestureResetButton);
        gestureResetGroup.add(gestureResetRow);

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
            activatable: false,
        });
        aboutGroup.add(versionRow);

        const websiteRow = new Adw.ActionRow({
            title: _('Website'),
            subtitle: _('GitHub project'),
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
            title: _('Log level'),
            subtitle: _('Set the maximum log level to display'),
            model: Gtk.StringList.new([
                _('Errors only'),
                _('Warnings and errors'),
                _('Info and above'),
                _('Debug (verbose)'),
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
        settings.connect('changed::log-level', () => {
            setLogLevel(settings.get_int('log-level'));
        });

        logGroup.add(logLevelRow);

        // Inline reset for logging settings
        const logResetLabel = _('Reset logging');
        const logResetRow = new Adw.ActionRow({
            title: logResetLabel,
            subtitle: _('Restore the default log level'),
        });
        const logResetButton = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
        });
        logResetButton.connect('clicked', () => {
            this._resetWithUndo(
                settings,
                window,
                ['log-level'],
                () => {
                    settings.set_int('log-level', 2);
                    setLogLevel(LogLevel.INFO);
                },
                logResetLabel,
            );
        });
        setAccessibleLabel(logResetButton, logResetLabel);
        logResetRow.add_suffix(logResetButton);
        logGroup.add(logResetRow);
    }

    /**
     * Reset keys with an Undo toast. Older libadwaita releases do not expose
     * add_toast() on PreferencesWindow, so fall back to a confirmation dialog.
     */
    private _resetWithUndo(
        settings: Gio.Settings,
        window: Adw.PreferencesWindow,
        snapshotKeys: readonly string[],
        applyDefaults: () => void,
        label: string,
    ): void {
        // GVariant preserves the type of every key, including string arrays.
        const snapshot = snapshotKeys.map(
            (key) => [key, settings.get_value(key)] as const,
        );
        const restore = (): void => {
            for (const [key, value] of snapshot)
                settings.set_value(key, value);
        };

        if (typeof window.add_toast !== 'function') {
            const dialog = new Adw.AlertDialog({
                heading: label,
                body: _('Your current values will be replaced with the defaults.'),
            });
            dialog.add_response('cancel', _('_Cancel'));
            dialog.add_response('reset', _('_Reset'));
            dialog.set_default_response('cancel');
            dialog.set_close_response('cancel');
            dialog.connect('response', (_source, response) => {
                if (response === 'reset')
                    applyDefaults();
            });
            dialog.present(window);
            return;
        }

        applyDefaults();
        this._undoToast?.dismiss();
        const toast = new Adw.Toast({
            title: label,
            button_label: _('_Undo'),
        });
        toast.connect('button-clicked', () => {
            restore();
            this._undoToast = null;
        });
        toast.connect('dismissed', () => {
            if (this._undoToast === toast)
                this._undoToast = null;
        });
        window.add_toast(toast);
        this._undoToast = toast;
    }

    private _shortcutAccelerator(settings: Gio.Settings): string {
        return settings.get_strv('find-my-mouse-activation')[0] ?? '';
    }

    /** GTK4 has no public shortcut entry widget, so capture the key with an EventControllerKey. */
    private _showShortcutDialog(
        parent: Gtk.Window,
        settings: Gio.Settings,
    ): void {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
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
            label: _('Escape cancels, BackSpace clears the pending shortcut'),
            wrap: true,
        }));

        const dialog = new Adw.AlertDialog({
            heading: _('Set Activation Shortcut'),
            extra_child: box,
        });
        dialog.add_response('cancel', _('_Cancel'));
        dialog.add_response('set', _('_Set'));
        dialog.set_default_response('set');
        dialog.set_close_response('cancel');
        dialog.set_response_enabled('set', false);

        const pressedModifiers = new Set<Gdk.ModifierType>();
        // null means no valid pending value; '' means "clear the shortcut".
        let pending: string | null = null;
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
                dialog.close();
                return true;
            }
            if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter)
                return false; // Adw.AlertDialog activates its default response.
            if (keyval === Gdk.KEY_BackSpace) {
                pressedModifiers.clear();
                pending = '';
                preview.set_accelerator('');
                status.label = _('Shortcut cleared — press Set to apply');
                dialog.set_response_enabled('set', true);
                return true;
            }
            const modifier = MODIFIER_KEY_MAP.find(([key]) => key === keyval);
            if (modifier) {
                pressedModifiers.add(modifier[1]);
                updatePreview(
                    0,
                    [...pressedModifiers].reduce((mask, flag) => mask | flag, 0),
                );
                pending = null;
                status.label = '';
                dialog.set_response_enabled('set', false);
                return true;
            }
            if (LOCK_KEYS.includes(keyval))
                return true;
            const mask = state & Gtk.accelerator_get_default_mod_mask();
            if (mask === 0) {
                status.label = _('Include at least one modifier key');
                pending = null;
                dialog.set_response_enabled('set', false);
                return true;
            }
            const accelerator = Gtk.accelerator_name(keyval, mask);
            if (!accelerator) {
                status.label = _('That key cannot be used as a shortcut');
                pending = null;
                dialog.set_response_enabled('set', false);
                return true;
            }
            updatePreview(keyval, mask);
            pending = accelerator;
            status.label = '';
            dialog.set_response_enabled('set', true);
            return true;
        });
        controller.connect('key-released', (
            _controller: Gtk.EventControllerKey,
            keyval: number,
            _keycode: number,
            _state: Gdk.ModifierType,
        ) => {
            const modifier = MODIFIER_KEY_MAP.find(([key]) => key === keyval);
            if (!modifier)
                return true;
            pressedModifiers.delete(modifier[1]);
            if (pending === null) {
                updatePreview(
                    0,
                    [...pressedModifiers].reduce((mask, flag) => mask | flag, 0),
                );
            }
            return true;
        });
        dialog.add_controller(controller);
        dialog.connect('response', (_source, response) => {
            if (response === 'set' && pending !== null)
                settings.set_strv(
                    'find-my-mouse-activation',
                    pending ? [pending] : [],
                );
        });
        dialog.present(parent);
        dialog.grab_focus();
    }

    _showAboutDialog(parent: Gtk.Window): void {
        const iconPath = this.dir
            .get_child('assets')
            .get_child('find-my-mouse.svg')
            .get_path();
        const dialog = new Adw.AboutWindow({
            transient_for: parent,
            modal: true,
            application_name: _('Find My Mouse'),
            application_icon: iconPath ?? 'input-mouse-symbolic',
            version: String(this.metadata['version-name'] ?? '1.0.0'),
            developer_name: 'Hervé Brun',
            copyright: '© 2026 Hervé Brun',
            license_type: 3, // Gtk.License.GTK_LICENSE_GPL_3_0,
            website: 'https://github.com/herve-brun/find-my-mouse-example.com',
            developers: ['Hervé Brun'],
            // Translators: replace this with your name and email, if you wish.
            translator_credits: _('translator-credits'),
            comments: _(
                'A GNOME Shell extension that helps you locate your mouse cursor by creating a spotlight effect around it. Inspired by Microsoft PowerToys Find My Mouse feature.',
            ),
            release_notes_version: String(this.metadata['version-name'] ?? '1.0.0'),
            release_notes: `<p>${_('What is new:')}</p>
                <ul>
                    <li>${_('Wave-and-stop mouse gesture: move the pointer sideways, then pause to reveal it.')}</li>
                    <li>${_('The keyboard shortcut is always available alongside the gesture.')}</li>
                    <li>${_('A small progress ring follows the pointer while a gesture is in progress.')}</li>
                    <li>${_('Light, Standard, and Firm presets, plus fine-grained controls for each threshold.')}</li>
                    <li>${_('Practice mode uses real gesture detection with live feedback in the preferences dialog.')}</li>
                    <li>${_('A text-only fallback explains the gesture when live practice is unavailable.')}</li>
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
