import St from 'gi://St';
import Cairo from 'gi://cairo';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type { SettingsManager } from './settings.js';
import { computeSpotlightLayout, type LayoutRect, type MonitorBox } from './spotlightLayout.js';
import { debugLog, isLogLevelEnabled, LogLevel } from './utils.js';

/** EASE_OUT_QUAD: t * (2 - t) — Clutter.get_progress() is linear, so we apply easing manually. */
function easeOutQuad(t: number): number {
    return t * (2 - t);
}

type MonitorGeometry = MonitorBox;
type Rgba = [number, number, number, number];

/** Normalized schema defaults (#00000080 and #FFFFFFCC). */
const DEFAULT_DIM_COLOR: Rgba = [0, 0, 0, 128 / 255];
const DEFAULT_RING_COLOR: Rgba = [1, 1, 1, 204 / 255];

/** Only used in high-contrast mode when the user has not chosen custom colors. */
const HIGH_CONTRAST_DIM_COLOR: Rgba = [0, 0, 0, 1];
const HIGH_CONTRAST_RING_COLOR: Rgba = [1, 1, 1, 1];

function isDefaultColor(color: Rgba, defaultValue: Rgba): boolean {
    return color.every((channel, i) => Math.abs(channel - defaultValue[i]) < 0.001);
}

interface FadeParams {
    opacity: number;
    duration: number;
    mode: Clutter.AnimationMode;
    onComplete: () => void;
}

/** ease() exists on Clutter.Actor at runtime but is missing from the st-14 types. */
type FadeableActor = Clutter.Actor & { ease(params: FadeParams): void };

export class SpotlightManager {
    private _settingsManager: SettingsManager;
    /** Root group: four solid dim actors plus the small Cairo mask. */
    private _spotlight: Clutter.Actor | null;
    private _mask: St.DrawingArea | null;
    private _dimRects: St.Widget[];
    private _geometry: MonitorGeometry | null;
    private _dimColorStyle: string;
    private _spotlightVisible: boolean;
    private _zoomTimeline: Clutter.Timeline | null;
    private _currentZoom: number;
    private _lastRepaintTime: number = 0;
    private _repaintCount: number = 0;
    private _fpsTimer: number = 0;
    private _lastMouseX: number = -1;
    private _lastMouseY: number = -1;
    private _interfaceSettings: Gio.Settings | null;
    private _a11ySettings: Gio.Settings | null;
    private _a11yChangedId: number;

    constructor(settingsManager: SettingsManager) {
        this._settingsManager = settingsManager;
        try {
            this._interfaceSettings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.interface',
            });
        } catch (e) {
            this._interfaceSettings = null;
            debugLog(`Cannot read interface settings: ${e}`, LogLevel.WARN);
        }
        try {
            this._a11ySettings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.a11y.interface',
            });
        } catch (e) {
            this._a11ySettings = null;
            debugLog(`Cannot read accessibility settings: ${e}`, LogLevel.WARN);
        }
        this._a11yChangedId = 0;
        if (this._a11ySettings) {
            this._a11yChangedId = this._a11ySettings.connect(
                'changed::high-contrast',
                () => this._onHighContrastChanged(),
            );
        }
        this._spotlight = null;
        this._mask = null;
        this._dimRects = [];
        this._geometry = null;
        this._dimColorStyle = '';
        this._spotlightVisible = false;
        this._zoomTimeline = null;
        this._currentZoom = 1;
    }

    get isVisible() {
        return this._spotlightVisible;
    }

    /** Honour the system-wide "reduce animation" accessibility setting. */
    private _animationsEnabled(): boolean {
        return this._interfaceSettings?.get_boolean('enable-animations') ?? true;
    }

    /** Missing schema or key means standard contrast. */
    private _highContrastEnabled(): boolean {
        if (!this._a11ySettings) return false;
        try {
            return this._a11ySettings.get_boolean('high-contrast');
        } catch (_error) {
            return false;
        }
    }

    /**
     * Fallback only for untouched defaults: explicit user color choices always win,
     * including while high contrast is active.
     */
    private _dimColor(): Rgba {
        const color = this._settingsManager.cachedBgColorNormalized;
        if (this._highContrastEnabled() && isDefaultColor(color, DEFAULT_DIM_COLOR))
            return HIGH_CONTRAST_DIM_COLOR;
        return color;
    }

    private _ringColor(): Rgba {
        const color = this._settingsManager.cachedSpotlightColorNormalized;
        if (this._highContrastEnabled() && isDefaultColor(color, DEFAULT_RING_COLOR))
            return HIGH_CONTRAST_RING_COLOR;
        return color;
    }

    private _onHighContrastChanged(): void {
        // Force _updateDimColor() to restyle the four dim actors, then repaint
        // the pointer-local mask so the ring also switches immediately.
        this._dimColorStyle = '';
        if (this._spotlight && this._mask) {
            this._layoutOverlay();
            this._mask.queue_repaint();
        }
    }

    _getMonitorGeometry(showOnAllMonitors: boolean): MonitorGeometry {
        if (showOnAllMonitors) {
            // Calculate combined geometry for all monitors
            let x = 0,
                y = 0,
                width = 0,
                height = 0;
            const monitors = global.display.get_n_monitors();
            for (let i = 0; i < monitors; i++) {
                const geom = global.display.get_monitor_geometry(i);
                x = Math.min(x, geom.x);
                y = Math.min(y, geom.y);
                width = Math.max(width, geom.x + geom.width) - x;
                height = Math.max(height, geom.y + geom.height) - y;
            }
            return { x, y, width, height };
        } else {
            // Use current monitor geometry
            const monitor = global.display.get_current_monitor();
            return global.display.get_monitor_geometry(monitor);
        }
    }

    show(showOnAllMonitors: boolean): void {
        // Cancel any in-progress fade-out and destroy old actors synchronously.
        // This prevents a stale ease onComplete from destroying the new overlay.
        if (this._spotlight) {
            this._spotlight.remove_all_transitions();
            this._destroySpotlightActor();
        }

        const geometry = this._getMonitorGeometry(showOnAllMonitors);
        this._geometry = geometry;

        // Never reuse a stale position from a previous display: anchor the
        // mask to the current cursor before the first repaint.
        const [pointerX, pointerY] = global.get_pointer();
        this._lastMouseX = pointerX;
        this._lastMouseY = pointerY;

        // Only the small mask is rasterised by Cairo. The dim area is four
        // plain-colour actors, so moving the pointer never repaints the whole
        // monitor through Cairo or uploads a full-size texture.
        const group = new Clutter.Actor({
            x: geometry.x,
            y: geometry.y,
            width: geometry.width,
            height: geometry.height,
            opacity: 255,
            clip_to_allocation: true,
            reactive: false,
        });
        this._spotlight = group;

        // St.Widget with an inline CSS colour avoids Clutter.Color, whose
        // constructor/boxed type changed across GNOME Shell versions.
        this._dimRects = Array.from({ length: 4 }, () => new St.Widget({
            reactive: false,
        }));
        for (const rect of this._dimRects)
            group.add_child(rect);

        this._mask = new St.DrawingArea({ reactive: false });
        this._mask.connect('repaint', this._onMaskRepaint.bind(this));
        group.add_child(this._mask);

        Main.uiGroup.add_child(group);
        group.show();
        this._spotlightVisible = true;

        this._layoutOverlay();

        // Start zoom-in animation: large circle shrinks to final radius
        this._startZoomAnimation();
    }

    updateMousePosition(x: number, y: number): void {
        // The pointer watcher only fires on position changes. Keep this guard so
        // duplicate coordinates never trigger a mask repaint.
        if (x === this._lastMouseX && y === this._lastMouseY) return;
        this._lastMouseX = x;
        this._lastMouseY = y;

        if (isLogLevelEnabled(LogLevel.DEBUG)) {
            debugLog(`Spotlight updateMousePosition: (${x}, ${y})`, LogLevel.DEBUG);
        }
        if (this._mask) {
            this._layoutOverlay();
            this._mask.queue_repaint();
        }
    }

    queueRepaint(): void {
        if (isLogLevelEnabled(LogLevel.DEBUG)) {
            debugLog('Spotlight queueRepaint called', LogLevel.DEBUG);
        }

        if (this._spotlight && this._mask) {
            // If a fade-out ease is running, mouse activity should cancel it and re-show
            if (this._spotlight.get_transition('opacity')) {
                this._spotlight.remove_all_transitions();
                this._spotlight.opacity = 255;
                this._spotlightVisible = true;
            }
            this._layoutOverlay();
            this._mask.queue_repaint();
        }
    }

    private _startZoomAnimation(): void {
        const duration = this._settingsManager.cachedAnimationDuration;
        const initialZoom = this._settingsManager.cachedZoom;

        // Cancel any in-progress zoom
        if (this._zoomTimeline) {
            this._zoomTimeline.stop();
            this._zoomTimeline = null;
        }

        if (!this._spotlight || !this._mask) return;

        if (!this._animationsEnabled()) {
            this._currentZoom = 1;
            this._layoutOverlay();
            this._mask.queue_repaint();
            return;
        }

        // Start at the large zoom value
        this._currentZoom = initialZoom;
        this._layoutOverlay();
        this._mask.queue_repaint();

        this._zoomTimeline = new Clutter.Timeline({ duration });
        this._zoomTimeline.set_actor(this._spotlight);

        this._zoomTimeline.connect('new-frame', () => {
            if (!this._zoomTimeline) return; // Safety: stopped during frame callback
            // get_progress() returns linear [0,1]; apply easing manually
            const progress = this._zoomTimeline.get_progress();
            const eased = easeOutQuad(progress);
            this._currentZoom = 1 + (initialZoom - 1) * (1 - eased);
            if (this._mask) {
                this._layoutOverlay();
                this._mask.queue_repaint();
            }
        });

        this._zoomTimeline.connect('stopped', (_timeline: Clutter.Timeline, isFinished: boolean) => {
            this._zoomTimeline = null;
            if (isFinished) {
                this._currentZoom = 1;
                if (this._mask) {
                    this._layoutOverlay();
                    this._mask.queue_repaint();
                }
            }
        });

        this._zoomTimeline.start();
    }

    private _destroySpotlightActor(): void {
        if (this._spotlight) {
            // Destroying the group destroys its four dim actors and the mask.
            this._spotlight.destroy();
            this._spotlight = null;
        }
        this._mask = null;
        this._dimRects = [];
        this._geometry = null;
        // New rects are created by show(): force _updateDimColor() to style them.
        this._dimColorStyle = '';
        this._spotlightVisible = false;
    }

    hide(): void {
        // Cancel any in-progress zoom animation
        if (this._zoomTimeline) {
            this._zoomTimeline.stop();
            this._zoomTimeline = null;
        }
        this._currentZoom = 1;

        if (this._spotlight) {
            if (!this._animationsEnabled()) {
                this._destroySpotlightActor();
                return;
            }

            // Fade the whole group out, then destroy all overlay actors.
            const group = this._spotlight as unknown as FadeableActor;
            group.remove_all_transitions();
            group.ease({
                opacity: 0,
                duration: this._settingsManager.cachedAnimationDuration,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this._destroySpotlightActor();
                },
            });
        } else {
            this._spotlightVisible = false;
        }
    }

    /**
     * Synchronous immediate teardown — no animation.
     * Used by disable() to avoid async races during extension shutdown.
     */
    destroyImmediately(): void {
        if (this._zoomTimeline) {
            this._zoomTimeline.stop();
            this._zoomTimeline = null;
        }
        this._currentZoom = 1;
        this._spotlight?.remove_all_transitions();
        this._destroySpotlightActor();
        if (this._a11ySettings && this._a11yChangedId) {
            this._a11ySettings.disconnect(this._a11yChangedId);
            this._a11yChangedId = 0;
        }
        this._a11ySettings = null;
        this._interfaceSettings = null;
    }

    private _pointerPosition(): [number, number] {
        // The pointer watcher already supplies coordinates; avoid a GI round-trip
        // on every repaint. Fall back once before the first position update.
        return this._lastMouseX >= 0
            ? [this._lastMouseX, this._lastMouseY]
            : global.get_pointer();
    }

    private _updateDimColor(): void {
        const [r, g, b, a] = this._dimColor();
        const style =
            `background-color: rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ` +
            `${Math.round(b * 255)}, ${a});`;
        if (style === this._dimColorStyle) return;

        this._dimColorStyle = style;
        for (const rect of this._dimRects)
            rect.style = style;
    }

    private _layoutOverlay(): void {
        if (!this._spotlight || !this._mask || !this._geometry) return;

        const [mx, my] = this._pointerPosition();
        const layout = computeSpotlightLayout(
            this._geometry,
            mx,
            my,
            this._settingsManager.cachedRadius * this._currentZoom,
            this._settingsManager.cachedRingWidth,
        );

        this._updateDimColor();
        const dims: LayoutRect[] = layout.dims;
        for (let i = 0; i < dims.length; i++) {
            const rect: LayoutRect = dims[i];
            this._dimRects[i].set_position(rect.x, rect.y);
            this._dimRects[i].set_size(rect.width, rect.height);
        }
        this._mask.set_position(layout.mask.x, layout.mask.y);
        this._mask.set_size(layout.mask.width, layout.mask.height);
    }

    private _onMaskRepaint(area: St.DrawingArea): void {
        const now = GLib.get_monotonic_time();
        if (this._lastRepaintTime > 0 && isLogLevelEnabled(LogLevel.DEBUG)) {
            const deltaMs = (now - this._lastRepaintTime) / 1000;
            debugLog(`Mask repaint delta: ${deltaMs.toFixed(2)}ms`, LogLevel.DEBUG);
        }
        this._lastRepaintTime = now;
        this._repaintCount++;

        if ((now - this._fpsTimer) / 1000000 >= 1.0) {
            if (isLogLevelEnabled(LogLevel.DEBUG)) {
                debugLog(`Mask FPS: ${this._repaintCount.toFixed(1)}`, LogLevel.DEBUG);
            }
            this._repaintCount = 0;
            this._fpsTimer = now;
        }

        const cr = area.get_context();
        if (!cr) return;

        const radius = this._settingsManager.cachedRadius * this._currentZoom;
        const [mx, my] = this._pointerPosition();
        const originX = this._geometry?.x ?? 0;
        const originY = this._geometry?.y ?? 0;
        const centerX = mx - originX - area.x;
        const centerY = my - originY - area.y;

        // Dark corners inside the small square; the four surrounding dim actors
        // cover the rest of the monitor.
        const bgColor = this._dimColor();
        cr.setOperator(Cairo.Operator.SOURCE);
        cr.setSourceRGBA(bgColor[0], bgColor[1], bgColor[2], bgColor[3]);
        cr.paint();

        // Clear circle
        cr.setOperator(Cairo.Operator.CLEAR);
        cr.arc(centerX, centerY, radius, 0, Math.PI * 2);
        cr.fill();

        // Spotlight ring
        cr.setOperator(Cairo.Operator.OVER);
        const spotlightColor = this._ringColor();
        cr.setSourceRGBA(
            spotlightColor[0],
            spotlightColor[1],
            spotlightColor[2],
            spotlightColor[3],
        );
        cr.setLineWidth(this._settingsManager.cachedRingWidth);
        cr.arc(centerX, centerY, radius, 0, Math.PI * 2);
        cr.stroke();

        cr.$dispose();
    }
}
