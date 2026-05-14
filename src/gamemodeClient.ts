import Gio from 'gi://Gio';
import { debugLog, LogLevel } from './utils.js';

type StateChangeHandler = (active: boolean) => void;

export class GameModeClient {
    _proxy: Gio.DBusProxy | null;
    private _clientCount: number;
    private _stateChangedHandlers: StateChangeHandler[];
    private _retryCount: number;

    constructor() {
        this._proxy = null;
        this._clientCount = 0;
        this._stateChangedHandlers = [];
        this._retryCount = 0;
    }

    setup() {
        const GameModeClientInterface = '<node>' +
            '  <interface name="com.feralinteractive.GameMode">' +
            '    <property name="ClientCount" type="i" access="read"/>' +
            '  </interface>' +
            '</node>';

        const nodeInfo = Gio.DBusNodeInfo.new_for_xml(GameModeClientInterface);
        const GAMEMODE_DBUS_NAME = 'com.feralinteractive.GameMode';
        const GAMEMODE_DBUS_PATH = '/com/feralinteractive/GameMode';
        const GAMEMODE_DBUS_IFACE = 'com.feralinteractive.GameMode';

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
                      this._proxy = Gio.DBusProxy.new_finish(res);
                      this._proxy.connect('g-properties-changed', this._onPropertiesChanged.bind(this));
                      this._clientCount = this._proxy.ClientCount;
                      debugLog(`GameMode initialized, ClientCount: ${this._clientCount}`, LogLevel.INFO);
                      
                      // Emit initial state
                      this._emitStateChanged(this._clientCount > 0);
                 } catch (e) {
                      this._retryCount++;
                      debugLog(`Error initializing GameMode: ${e.message}`, LogLevel.ERROR);
                      
                      // Notify extension that GameMode is unavailable
                      if (typeof globalThis !== 'undefined') {
                          globalThis.FindMyMouseGameModeAvailable = false;
                      }
                      
                      if (this._retryCount >= 3) {
                          debugLog('Max retries reached for GameMode DBus initialization.', LogLevel.ERROR);
                          return;
                      }
                      
                      const delay = Math.min(5000 * Math.pow(2, this._retryCount - 1), 20000);
                      debugLog(`GameMode service not available, retrying in ${delay/1000} seconds...`, LogLevel.WARN);
                      setTimeout(() => this.setup(), delay);
                 }
            }
        );
    }

    _onPropertiesChanged(proxy: Gio.DBusProxy, changedProperties: any, _invalidatedProperties: string[]) {
        const clientCountVariant = changedProperties.lookup_value('ClientCount', null);
        if (clientCountVariant) {
            this._clientCount = clientCountVariant.unpack();
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

    get isActive() {
        return this._clientCount > 0;
    }
}