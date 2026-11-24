import assert from 'node:assert/strict';
import { test } from 'node:test';

// Pure layout helper: no GNOME Shell or GJS required.
const { computeSpotlightLayout } = await import('../dist/spotlightLayout.js');

function rectArea(rect) {
    return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function overlap(a, b) {
    const left = Math.max(a.x, b.x);
    const top = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function assertTilesMonitor(layout, monitor) {
    const screen = { x: 0, y: 0, width: monitor.width, height: monitor.height };
    const total =
        layout.dims.reduce((sum, rect) => sum + rectArea(rect), 0) +
        overlap(layout.mask, screen);
    assert.equal(total, monitor.width * monitor.height, 'dim rects + clipped mask must tile the monitor');
    for (const rect of [...layout.dims, layout.mask]) {
        assert.ok(Number.isInteger(rect.x) && Number.isInteger(rect.y));
        assert.ok(Number.isInteger(rect.width) && Number.isInteger(rect.height));
        assert.ok(rect.width >= 0 && rect.height >= 0);
    }
    for (const rect of layout.dims) {
        assert.ok(rect.x >= 0 && rect.y >= 0);
        assert.ok(rect.x + rect.width <= monitor.width);
        assert.ok(rect.y + rect.height <= monitor.height);
    }
}

test('centred pointer: small mask, four dim rects, exact tiling', () => {
    const monitor = { x: 0, y: 0, width: 1920, height: 1080 };
    const layout = computeSpotlightLayout(monitor, 960, 540, 100, 2);

    // half = ceil(100 + 1 + 1) = 102
    assert.deepEqual(layout.mask, { x: 858, y: 438, width: 204, height: 204 });
    assert.deepEqual(layout.dims, [
        { x: 0, y: 0, width: 1920, height: 438 },
        { x: 0, y: 642, width: 1920, height: 438 },
        { x: 0, y: 438, width: 858, height: 204 },
        { x: 1062, y: 438, width: 858, height: 204 },
    ]);
    assertTilesMonitor(layout, monitor);
});

test('negative monitor origin keeps coordinates local to the overlay group', () => {
    const monitor = { x: -1920, y: -200, width: 1920, height: 1080 };
    const layout = computeSpotlightLayout(monitor, -1000, 340, 100, 2);

    // Pointer is at local (920, 540), same mask as the centred 1920x1080 case.
    assert.deepEqual(layout.mask, { x: 818, y: 438, width: 204, height: 204 });
    assertTilesMonitor(layout, monitor);
});

test('pointer at a monitor corner: no negative dim rectangles', () => {
    const monitor = { x: 0, y: 0, width: 800, height: 600 };
    const layout = computeSpotlightLayout(monitor, 10, 10, 100, 2);

    // The mask is clipped to the monitor; the circle centre stays at (10, 10).
    assert.deepEqual(layout.mask, { x: 0, y: 0, width: 112, height: 112 });
    assert.equal(layout.dims[0].height, 0);
    assert.equal(layout.dims[2].width, 0);
    assert.ok(layout.dims[1].height > 0 && layout.dims[3].width > 0);
    assertTilesMonitor(layout, monitor);
});

test('zoom larger than the monitor: mask is clipped, dim rectangles collapse', () => {
    const monitor = { x: 0, y: 0, width: 800, height: 600 };
    const layout = computeSpotlightLayout(monitor, 400, 300, 900, 4);

    assert.deepEqual(layout.mask, { x: 0, y: 0, width: 800, height: 600 });
    assert.ok(layout.dims.every(rect => rectArea(rect) === 0));
    assertTilesMonitor(layout, monitor);
});

test('fractional radius and zero ring width stay finite and integral', () => {
    const monitor = { x: 3840, y: 0, width: 3840, height: 2160 };
    const layout = computeSpotlightLayout(monitor, 5500, 1000, 100.4 * 3.7, 0);

    assert.ok(layout.mask.width > 0);
    assert.ok(layout.mask.width % 2 === 0);
    assertTilesMonitor(layout, monitor);
});
