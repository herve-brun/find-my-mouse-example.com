import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import type { GestureEventInfo } from './mouseTracking.js';
import { debugLog, LogLevel } from './utils.js';

export const PRACTICE_BUS_NAME = 'org.gnome.shell.extensions.find_my_mouse.Practice';
export const PRACTICE_OBJECT_PATH = '/org/gnome/shell/extensions/find_my_mouse/Practice';
export const PRACTICE_INTERFACE = 'org.gnome.shell.extensions.find_my_mouse.Practice';

const PRACTICE_XML = `<node>
  <interface name="${PRACTICE_INTERFACE}">
    <method name="Start"/>
    <method name="Cancel"/>
    <signal name="Progress">
      <arg name="event" type="s"/>
      <arg name="progress" type="i"/>
      <arg name="total" type="i"/>
    </signal>
    <signal name="Result">
      <arg name="success" type="b"/>
      <arg name="detail" type="s"/>
    </signal>
  </interface>
</node>`;

/** Stop a forgotten practice session even if the preferences process dies. */
const WATCHDOG_MS = 10000;

/**
 * Shell-side practice session. It reuses the real gesture pipeline but routes
 * its terminal event to the preferences dialog instead of the activation path.
 */
export class PracticeService {
    private _onStart: () => void;
    private _onEnd: () => void;
    private _connection: Gio.DBusConnection | null;
    private _registrationId: number;
    private _ownerId: number;
    private _watchdogId: number;
    private _active: boolean;
    private _destroyed: boolean;

    constructor(onStart: () => void, onEnd: () => void) {
        this._onStart = onStart;
        this._onEnd = onEnd;
        this._connection = Gio.DBus.session;
        this._registrationId = 0;
        this._ownerId = 0;
        this._watchdogId = 0;
        this._active = false;
        this._destroyed = false;

        try {
            const nodeInfo = Gio.DBusNodeInfo.new_for_xml(PRACTICE_XML);
            const iface = nodeInfo.lookup_interface(PRACTICE_INTERFACE);
            if (!iface)
                throw new Error('Practice D-Bus interface not found');
            this._registrationId = Gio.DBus.session.register_object(
                PRACTICE_OBJECT_PATH,
                iface,
                this._onMethodCall.bind(this),
                null,
                null,
            );
            this._ownerId = Gio.DBus.session.own_name(
                PRACTICE_BUS_NAME,
                Gio.BusNameOwnerFlags.NONE,
                (connection) => {
                    this._connection = connection;
                },
                () => this._finish(false, 'bus-name-lost'),
            );
            debugLog('Practice D-Bus service registered', LogLevel.DEBUG);
        } catch (e) {
            debugLog(`Cannot register practice service: ${e}`, LogLevel.WARN);
        }
    }

    get isActive(): boolean {
        return this._active && !this._destroyed;
    }

    start(): boolean {
        if (this._destroyed)
            return false;
        if (this._active) {
            this._clearWatchdog();
            this._startWatchdog();
            return true;
        }
        this._active = true;
        this._onStart();
        this._startWatchdog();
        debugLog('Practice session started', LogLevel.INFO);
        return true;
    }

    cancel(): void {
        this._finish(false, 'cancelled');
    }

    /** Called by the extension for every gesture event while practice is active. */
    reportEvent(info: GestureEventInfo): void {
        if (!this.isActive)
            return;

        this._emit('Progress', new GLib.Variant('(sii)', [
            info.event,
            info.progress,
            info.total,
        ]));

        if (info.event === 'activated')
            this._finish(true, 'gesture-completed');
        else if (info.event === 'aborted')
            this._finish(false, 'gesture-aborted');
    }

    destroy(): void {
        if (this._destroyed)
            return;
        this._finish(false, 'service-destroyed');
        this._destroyed = true;
        if (this._registrationId) {
            Gio.DBus.session.unregister_object(this._registrationId);
            this._registrationId = 0;
        }
        if (this._ownerId) {
            Gio.DBus.session.unown_name(this._ownerId);
            this._ownerId = 0;
        }
        this._connection = null;
    }

    private _onMethodCall(
        connection: Gio.DBusConnection,
        _sender: string,
        _objectPath: string,
        _interfaceName: string,
        methodName: string,
        _parameters: GLib.Variant | null,
        invocation: Gio.DBusMethodInvocation,
    ): void {
        this._connection = connection;
        switch (methodName) {
        case 'Start':
            this.start();
            invocation.return_value(null);
            break;
        case 'Cancel':
            this.cancel();
            invocation.return_value(null);
            break;
        default:
            invocation.return_dbus_error(
                'org.freedesktop.DBus.Error.UnknownMethod',
                `Unknown method: ${methodName}`,
            );
            break;
        }
    }

    private _emit(signal: 'Progress' | 'Result', value: GLib.Variant): void {
        if (!this._connection)
            return;
        try {
            // The GIR packages ship two GLib.Variant declarations; cast away the
            // nominal mismatch without weakening the rest of the service.
            type SignalParameters = Parameters<Gio.DBusConnection['emit_signal']>;
            this._connection.emit_signal(
                null,
                PRACTICE_OBJECT_PATH,
                PRACTICE_INTERFACE,
                signal,
                value as unknown as SignalParameters[4],
            );
        } catch (e) {
            debugLog(`Cannot emit practice signal ${signal}: ${e}`, LogLevel.WARN);
        }
    }

    private _finish(success: boolean, detail: string): void {
        if (!this._active || this._destroyed)
            return;
        this._active = false;
        this._clearWatchdog();
        this._emit('Result', new GLib.Variant('(bs)', [success, detail]));
        debugLog(`Practice session finished: ${detail}`, LogLevel.INFO);
        this._onEnd();
    }

    private _startWatchdog(): void {
        this._clearWatchdog();
        this._watchdogId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            WATCHDOG_MS,
            () => {
                this._watchdogId = 0;
                this._finish(false, 'timeout');
                return GLib.SOURCE_REMOVE;
            },
        );
    }

    private _clearWatchdog(): void {
        if (this._watchdogId) {
            GLib.source_remove(this._watchdogId);
            this._watchdogId = 0;
        }
    }
}
