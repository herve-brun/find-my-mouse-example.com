import St from 'gi://St';
import Cairo from 'gi://cairo';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { debugLog, LogLevel } from './utils.js';

const SIZE = 40;
const HALF_SIZE = SIZE / 2;
const ACTOR_OPACITY = 153; // 60% — visible without masking the desktop
const RING_RADIUS = 16;
const SEGMENT_OUTER_RADIUS = 12.5;
const SEGMENT_INNER_RADIUS = 8.5;
const DEFAULT_SEGMENTS = 3;
const GAP = 0.28; // radians between arc segments
const TAU = Math.PI * 2;
const CONFIRMATION_SOUND = 'canberra-gtk-play -i message-new-instant';

type RingColor = [number, number, number, number];

interface RingPalette {
    outline: RingColor;
    readyOutline: RingColor;
    progress: RingColor;
    ready: RingColor;
    empty: RingColor;
}

/** The original palette, kept verbatim for standard contrast. */
const STANDARD_PALETTE: RingPalette = {
    outline: [1, 1, 1, 0.65],
    readyOutline: [1, 1, 1, 1],
    progress: [0.35, 0.8, 1, 1],
    ready: [0.55, 1, 0.65, 1],
    empty: [1, 1, 1, 0.18],
};

/**
 * Cairo cannot read CSS theme variables. These explicit opaque colors stay
 * legible on high-contrast desktops while keeping the hue/shape distinction.
 */
const HIGH_CONTRAST_PALETTE: RingPalette = {
    outline: [1, 1, 1, 1],
    readyOutline: [1, 1, 1, 1],
    progress: [0, 1, 1, 1], // cyan for in-progress arcs
    ready: [1, 1, 0, 1], // yellow for the "stop now" state
    empty: [0.5, 0.5, 0.5, 1],
};

/**
 * A tiny pointer-local progress ring, shown only while a gesture is being
 * attempted. It never dims the screen and disappears as soon as the real
 * spotlight takes over.
 */
export class GestureFeedback {
    private _area: St.DrawingArea | null = null;
    private _segments = DEFAULT_SEGMENTS;
    private _filled = 0;
    private _ready = false;
    private _a11ySettings: Gio.Settings | null;

    constructor() {
        // GSettings is the only long-lived resource; drawing actors are
        // created in show() and destroyed in hide().
        try {
            this._a11ySettings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.a11y.interface',
            });
        } catch (e) {
            this._a11ySettings = null;
            debugLog(`Cannot read accessibility settings: ${e}`, LogLevel.WARN);
        }
    }

    show(): void {
        this.hide();

        this._segments = DEFAULT_SEGMENTS;
        this._filled = 0;
        this._ready = false;

        const [x, y] = global.get_pointer();
        const area = new St.DrawingArea({
            x: x - HALF_SIZE,
            y: y - HALF_SIZE,
            width: SIZE,
            height: SIZE,
            opacity: ACTOR_OPACITY,
        });
        area.connect('repaint', (source: St.DrawingArea) =>
            this._onRepaint(source),
        );

        Main.uiGroup.add_child(area);
        area.show();
        this._area = area;
        area.queue_repaint();
    }

    setPosition(x: number, y: number): void {
        if (!this._area) return;
        this._area.x = x - HALF_SIZE;
        this._area.y = y - HALF_SIZE;
    }

    setProgress(count: number, total: number): void {
        if (total <= 0) return;
        this._segments = Math.max(1, Math.floor(total));
        this._filled = Math.max(0, Math.min(Math.floor(count), this._segments));
        this._ready = false;
        this._area?.queue_repaint();
    }

    setReady(): void {
        this._ready = true;
        this._filled = this._segments;
        this._area?.queue_repaint();
    }

    hide(): void {
        const area = this._area;
        this._area = null;
        if (!area) return;

        // Cancel transitions first so a stale callback cannot touch a dead actor.
        const actor: Clutter.Actor = area;
        actor.remove_all_transitions();
        area.destroy();
    }

    destroy(): void {
        this.hide();
        this._a11ySettings = null;
    }

    playConfirmation(): void {
        try {
            GLib.spawn_command_line_async(CONFIRMATION_SOUND);
        } catch (_error) {
            // Sound is optional; a missing canberra-gtk-play must not break activation.
        }
    }

    /** Missing schema or key falls back to standard contrast. */
    private _highContrastEnabled(): boolean {
        if (!this._a11ySettings) return false;
        try {
            return this._a11ySettings.get_boolean('high-contrast');
        } catch (_error) {
            return false;
        }
    }

    private _palette(): RingPalette {
        return this._highContrastEnabled() ? HIGH_CONTRAST_PALETTE : STANDARD_PALETTE;
    }

    private _onRepaint(area: St.DrawingArea): void {
        const cr = area.get_context();
        if (!cr) return;

        const palette = this._palette();

        cr.setOperator(Cairo.Operator.CLEAR);
        cr.rectangle(0, 0, SIZE, SIZE);
        cr.fill();
        cr.setOperator(Cairo.Operator.OVER);

        const cx = HALF_SIZE;
        const cy = HALF_SIZE;

        // Hollow outline: the pointer stays visible through the middle.
        // The ready state also thickens the outline (3 px vs 2 px).
        cr.setSourceRGBA(...(this._ready ? palette.readyOutline : palette.outline));
        cr.setLineWidth(this._ready ? 3 : 2);
        cr.arc(cx, cy, RING_RADIUS, 0, TAU);
        cr.stroke();

        const step = TAU / this._segments;
        for (let i = 0; i < this._segments; i++) {
            const start = -Math.PI / 2 + i * step + GAP / 2;
            const end = -Math.PI / 2 + (i + 1) * step - GAP / 2;
            const filled = this._ready || i < this._filled;

            if (filled) {
                cr.setSourceRGBA(...(this._ready ? palette.ready : palette.progress));
            } else {
                cr.setSourceRGBA(...palette.empty);
            }

            cr.arc(cx, cy, SEGMENT_OUTER_RADIUS, start, end);
            cr.arcNegative(cx, cy, SEGMENT_INNER_RADIUS, end, start);
            cr.closePath();
            cr.fill();
        }

        cr.$dispose();
    }
}
