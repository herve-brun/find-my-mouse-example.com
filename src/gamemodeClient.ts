import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { debugLog, LogLevel } from './utils.js';

type StateChangeHandler = (active: boolean) => void;

const GAMEMODE_CLIENT_INTERFACE = '<node>' +
    '  <interface name="com.feralinteractive.GameMode">' +
    '    <property name="ClientCount" type="i" access="read"/>' +
    '  </interface>' +
    '</node>';
const GAMEMODE_DBUS_NAME = 'com.feralinteractive.GameMode';
const GAMEMODE_DBUS_PATH = '/com/feralinteractive/GameMode';
const GAMEMODE_DBUS_IFACE = 'com.feralinteractive.GameMode';

export class GameModeClient {
    _proxy: Gio.DBusProxy | null;
    private _propertiesChangedId: number;
    private _clientCount: number;
    private _stateChangedHandlers: StateChangeHandler[];
    private _retryCount: number;
    private _retryTimerId: ReturnType<typeof setTimeout> | null;
    private _destroyed: boolean;

    constructor() {
        this._proxy = null;
        this._propertiesChangedId = 0;
        this._clientCount = 0;
        this._stateChangedHandlers = [];
        this._retryCount = 0;
        this._retryTimerId = null;
        this._destroyed = false;
    }

    setup() {
        if (this._destroyed) return;
        if (this._retryTimerId !== null) {
            clearTimeout(this._retryTimerId);
            this._retryTimerId = null;
        }
        const nodeInfo = Gio.DBusNodeInfo.new_for_xml(GAMEMODE_CLIENT_INTERFACE);

        Gio.DBusProxy.new(
            Gio.DBus.session,
            Gio.DBusProxyFlags.DO_NOT_AUTO_START,
            nodeInfo.lookup_interface(GAMEMODE_DBUS_IFACE),
            GAMEMODE_DBUS_NAME,
            GAMEMODE_DBUS_PATH,
            GAMEMODE_DBUS_IFACE,
            null,
            (o, res) => {
                try {
                    const proxy = Gio.DBusProxy.new_finish(res);
                    if (this._destroyed) {
                        // Shutdown already happened: drop the proxy before
                        // connecting any signal so GJS can reclaim it.
                        return;
                    }
                    this._proxy = proxy;
                    this._propertiesChangedId = this._proxy.connect(
                        'g-properties-changed',
                        this._onPropertiesChanged.bind(this),
                    );
                    this._clientCount = this._proxy.ClientCount;
                    debugLog(
                        `GameMode initialized, ClientCount: ${this._clientCount}`,
                        LogLevel.INFO,
                    );

                    // Emit initial state
                    this._emitStateChanged(this._clientCount > 0);
                } catch (e) {
                    if (this._destroyed)
                        return;
                    this._retryCount++;
                    debugLog(
                        `Error initializing GameMode: ${(e as Error).message}`,
                        LogLevel.ERROR,
                    );

                    if (this._retryCount >= 3) {
                        debugLog(
                            'Max retries reached for GameMode DBus initialization.',
                            LogLevel.ERROR,
                        );
                        return;
                    }

                    const delay = Math.min(
                        5000 * Math.pow(2, this._retryCount - 1),
                        20000,
                    );
                    debugLog(
                        `GameMode service not available, retrying in ${delay / 1000} seconds...`,
                        LogLevel.WARN,
                    );
                    this._retryTimerId = setTimeout(() => {
                        this._retryTimerId = null;
                        this.setup();
                    }, delay);
                }
            }
        );
    }

    _onPropertiesChanged(
        _proxy: Gio.DBusProxy,
        changedProperties: GLib.Variant,
        _invalidatedProperties: string[],
    ) {
        const clientCountVariant = changedProperties.lookup_value('ClientCount', null);
        if (clientCountVariant) {
            this._clientCount = clientCountVariant.unpack() as number;
            const active = this._clientCount > 0;
            debugLog(`GameMode state changed: ${active}`, LogLevel.INFO);
            this._emitStateChanged(active);
        }
    }

    _emitStateChanged(active: boolean): void {
        this._stateChangedHandlers.forEach(handler => handler(active));
    }

    onStateChanged(handler: StateChangeHandler): void {
        this._stateChangedHandlers.push(handler);
    }
    
    offStateChanged(handler: StateChangeHandler): void {
        this._stateChangedHandlers = this._stateChangedHandlers.filter(h => h !== handler);
    }
    
    clearStateChangedHandlers() {
        this._stateChangedHandlers = [];
    }

    /** Cancel pending D-Bus retries and release the proxy on extension disable. */
    destroy(): void {
        this._destroyed = true;
        if (this._retryTimerId !== null) {
            clearTimeout(this._retryTimerId);
            this._retryTimerId = null;
        }
        this.clearStateChangedHandlers();
        if (this._proxy && this._propertiesChangedId)
            this._proxy.disconnect(this._propertiesChangedId);
        this._propertiesChangedId = 0;
        this._proxy = null;
    }

    get isActive() {
        return this._clientCount > 0;
    }
}