/** A rectangle in actor-local coordinates (relative to the overlay group). */
export interface LayoutRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface MonitorBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface SpotlightLayout {
    /** Small Cairo mask: dark corners, transparent disc, spotlight ring. */
    mask: LayoutRect;
    /** Top, bottom, left, right solid dim rectangles around the mask. */
    dims: [LayoutRect, LayoutRect, LayoutRect, LayoutRect];
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Split the monitor overlay into four static solid rectangles plus one small
 * moving mask. The mask is sized to the circle (including half the ring and a
 * one-pixel antialiasing margin), so only that area is rasterised by Cairo on
 * a pointer move; the rest is plain actor composition handled by Clutter/GPU.
 *
 * All output coordinates are local to the overlay group positioned at
 * `monitor.x/y`. Both the mask and the dim rectangles are clipped to the
 * monitor bounds; the circle centre can therefore lie outside the mask when
 * the pointer is at an edge or the zoom circle is larger than the monitor.
 */
export function computeSpotlightLayout(
    monitor: MonitorBox,
    pointerX: number,
    pointerY: number,
    radius: number,
    ringWidth: number,
): SpotlightLayout {
    const centerX = pointerX - monitor.x;
    const centerY = pointerY - monitor.y;
    const half = Math.max(1, Math.ceil(radius + Math.abs(ringWidth) / 2 + 1));

    const left = Math.round(centerX - half);
    const top = Math.round(centerY - half);
    const right = left + 2 * half;
    const bottom = top + 2 * half;

    // Clip the mask to the monitor so Cairo never rasterises pixels outside
    // the visible area (notably when the zoom circle is larger than the screen).
    const topEdge = clamp(top, 0, monitor.height);
    const bottomEdge = clamp(bottom, topEdge, monitor.height);
    const leftEdge = clamp(left, 0, monitor.width);
    const rightEdge = clamp(right, leftEdge, monitor.width);

    return {
        mask: {
            x: leftEdge,
            y: topEdge,
            width: rightEdge - leftEdge,
            height: bottomEdge - topEdge,
        },
        dims: [
            { x: 0, y: 0, width: monitor.width, height: topEdge },
            {
                x: 0,
                y: bottomEdge,
                width: monitor.width,
                height: monitor.height - bottomEdge,
            },
            {
                x: 0,
                y: topEdge,
                width: leftEdge,
                height: bottomEdge - topEdge,
            },
            {
                x: rightEdge,
                y: topEdge,
                width: monitor.width - rightEdge,
                height: bottomEdge - topEdge,
            },
        ],
    };
}
