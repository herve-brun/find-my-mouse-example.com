import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export type PracticeProgress = { event: string; progress: number; total: number };
export type PracticeResult = { success: boolean; detail: string };

type ProgressHandler = (progress: PracticeProgress) => void;
type ResultHandler = (result: PracticeResult) => void;

const PRACTICE_INTERFACE_XML = '<node><interface name="org.gnome.shell.extensions.find_my_mouse.Practice">' +
    '  <method name="Start"/>' +
    '  <method name="Cancel"/>' +
    '  <signal name="Progress"><arg name="event" type="s"/><arg name="progress" type="i"/><arg name="total" type="i"/></signal>' +
    '  <signal name="Result"><arg name="success" type="b"/><arg name="detail" type="s"/></signal>' +
    '</interface></node>';
const PRACTICE_DBUS_NAME = 'org.gnome.shell.extensions.find_my_mouse.Practice';
const PRACTICE_DBUS_PATH = '/org/gnome/shell/extensions/find_my_mouse/Practice';
const PRACTICE_DBUS_IFACE = 'org.gnome.shell.extensions.find_my_mouse.Practice';
const MAX_SETUP_ATTEMPTS = 10;
const RETRY_INTERVAL_MS = 500;

/** Duplicate @girs GLib typings need an explicit cast at the D-Bus boundary. */
function emptyCallParameters(): Parameters<Gio.DBusProxy['call']>[1] {
    return new GLib.Variant('()', []) as unknown as Parameters<Gio.DBusProxy['call']>[1];
}

/**
 * Client for the shell-side practice service. Every operation is best effort:
 * Preferences must keep working when the extension is disabled or reloaded.
 */
export class PracticeClient {
    private _proxy: Gio.DBusProxy | null = null;
    private _progressHandlers: ProgressHandler[] = [];
    private _resultHandlers: ResultHandler[] = [];
    private _retryTimerId: number | null = null;
    private _signalId = 0;
    private _attempts = 0;
    private _setupPromise: Promise<boolean> | null = null;
    private _resolveSetup: ((available: boolean) => void) | null = null;
    private _destroyed = false;

    get available(): boolean {
        return !this._destroyed && this._proxy !== null;
    }

    /**
     * Create the proxy asynchronously. Resolves to false when the service is
     * unavailable after a short retry window; it never rejects or throws.
     */
    setup(): Promise<boolean> {
        if (this._destroyed)
            return Promise.resolve(false);
        if (this._setupPromise)
            return this._setupPromise;

        this._setupPromise = new Promise<boolean>((resolve) => {
            this._resolveSetup = resolve;
            this._attemptSetup();
        });
        return this._setupPromise;
    }

    /** Ask the shell to start a fresh attempt. Resolves false if it cannot. */
    async start(): Promise<boolean> {
        if (this._destroyed)
            return false;

        if (!this._proxy) {
            if (!await this.setup() || this._destroyed || !this._proxy)
                return false;
        }

        const proxy = this._proxy;
        try {
            await proxy.call(
                'Start',
                emptyCallParameters(),
                Gio.DBusCallFlags.NONE,
                -1,
                null,
            );
            return !this._destroyed;
        } catch (_error) {
            return false;
        }
    }

    /** Best-effort cancellation; errors are intentionally ignored. */
    cancel(): void {
        const proxy = this._proxy;
        if (this._destroyed || !proxy)
            return;
        try {
            proxy.call(
                'Cancel',
                emptyCallParameters(),
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                (_source, res) => {
                    try {
                        proxy.call_finish(res);
                    } catch (_error) {
                        // The service may have vanished; the dialog closes regardless.
                    }
                },
            );
        } catch (_error) {
            // The service may have vanished; the dialog closes regardless.
        }
    }

    onProgress(handler: ProgressHandler): void {
        if (!this._destroyed)
            this._progressHandlers.push(handler);
    }

    onResult(handler: ResultHandler): void {
        if (!this._destroyed)
            this._resultHandlers.push(handler);
    }

    destroy(): void {
        if (this._destroyed)
            return;
        this._destroyed = true;

        if (this._retryTimerId !== null) {
            GLib.source_remove(this._retryTimerId);
            this._retryTimerId = null;
        }
        if (this._proxy && this._signalId !== 0) {
            try {
                this._proxy.disconnect(this._signalId);
            } catch (_error) {
                // The proxy may already be gone after an extension reload.
            }
        }
        this._signalId = 0;
        this._proxy = null;
        this._progressHandlers = [];
        this._resultHandlers = [];
        this._finishSetup(false);
    }

    private _attemptSetup(): void {
        if (this._destroyed)
            return;

        this._attempts += 1;
        try {
            const nodeInfo = Gio.DBusNodeInfo.new_for_xml(PRACTICE_INTERFACE_XML);
            Gio.DBusProxy.new(
                Gio.DBus.session,
                Gio.DBusProxyFlags.DO_NOT_AUTO_START,
                nodeInfo.lookup_interface(PRACTICE_DBUS_IFACE),
                PRACTICE_DBUS_NAME,
                PRACTICE_DBUS_PATH,
                PRACTICE_DBUS_IFACE,
                null,
                (_source, res) => {
                    if (this._destroyed)
                        return;
                    try {
                        const proxy = Gio.DBusProxy.new_finish(res);
                        this._proxy = proxy;
                        this._signalId = proxy.connect(
                            'g-signal',
                            this._onSignal.bind(this),
                        );
                        this._finishSetup(true);
                    } catch (_error) {
                        this._scheduleRetry();
                    }
                },
            );
        } catch (_error) {
            this._scheduleRetry();
        }
    }

    private _scheduleRetry(): void {
        if (this._destroyed)
            return;
        if (this._attempts >= MAX_SETUP_ATTEMPTS) {
            this._finishSetup(false);
            return;
        }
        this._retryTimerId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            RETRY_INTERVAL_MS,
            () => {
                this._retryTimerId = null;
                this._attemptSetup();
                return GLib.SOURCE_REMOVE;
            },
        );
    }

    private _finishSetup(available: boolean): void {
        const resolve = this._resolveSetup;
        this._resolveSetup = null;
        if (resolve)
            resolve(available);
    }

    private _onSignal(
        _proxy: Gio.DBusProxy,
        _sender: string,
        signalName: string,
        parameters: GLib.Variant,
    ): void {
        if (this._destroyed)
            return;

        let values: unknown[];
        try {
            const unpacked = parameters.deepUnpack();
            if (!Array.isArray(unpacked))
                return;
            values = unpacked;
        } catch (_error) {
            return;
        }

        if (signalName === 'Progress') {
            const [event, progress, total] = values;
            if (typeof event !== 'string')
                return;
            const update: PracticeProgress = {
                event,
                progress: typeof progress === 'number' ? progress : 0,
                total: typeof total === 'number' ? total : 0,
            };
            for (const handler of [...this._progressHandlers]) {
                try {
                    handler(update);
                } catch (_error) {
                    // One bad listener must not break the practice session.
                }
            }
        } else if (signalName === 'Result') {
            const [success, detail] = values;
            const result: PracticeResult = {
                success: success === true,
                detail: typeof detail === 'string' ? detail : '',
            };
            for (const handler of [...this._resultHandlers]) {
                try {
                    handler(result);
                } catch (_error) {
                    // Keep the remaining listeners working.
                }
            }
        }
    }
}
