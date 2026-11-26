import assert from 'node:assert/strict';
import { test } from 'node:test';

// Works from dist/ and from a standalone compile into /tmp.
const modulePath = process.env.DETECTOR_MODULE ?? '../dist/gestureDetector.js';
const { GestureDetector } = await import(modulePath);

const defaultConfig = {
    reversals: 3,
    sweepPx: 90,
    windowMs: 900,
    settleMs: 180,
    cooldownMs: 1500,
    minTravelPx: 300,
    maxJumpPx: 250,
    armSpeedPxPerSec: 400,
    settleSpeedPxPerSec: 150,
    axisDominance: 2,
    pauseMs: 400,
};

const STEP_MS = 16;

function* horizontalWave(startT, durationMs, amplitude = 100, freqHz = 3) {
    const omega = (2 * Math.PI * freqHz) / 1000;
    const count = Math.floor(durationMs / STEP_MS);
    for (let i = 0; i < count; i++) {
        const phase = i * STEP_MS;
        const x = amplitude * Math.sin(omega * phase);
        const prevX = amplitude * Math.sin(omega * (phase - STEP_MS));
        yield { dx: x - prevX, dy: 0, tMs: startT + phase };
    }
}

function stationaryTicks(startT, count) {
    return Array.from({ length: count }, (_, i) => ({ dx: 0, dy: 0, tMs: startT + i * STEP_MS }));
}

function feedAll(detector, samples) {
    return Array.from(samples, sample => detector.feed(sample));
}

// Slow, small pointer steps: three ~30 px steps, 1500 ms apart.
function slowSmallStepSamples() {
    const samples = [];
    for (let step = 0; step < 3; step++) {
        const direction = step % 2 === 0 ? 1 : -1;
        for (let i = 0; i < 3; i++) {
            samples.push({
                dx: direction * 10,
                dy: 0,
                tMs: step * 1500 + i * STEP_MS,
            });
        }
    }
    return samples;
}

// Discrete 100 px sweeps (5 × 20 px) with a zero-speed dip before each reversal.
function* squareWaveSweeps(sweepCount, sweepPx = 100) {
    let tMs = 0;
    for (let i = 0; i < sweepCount; i++) {
        const direction = i % 2 === 0 ? 1 : -1;
        for (let j = 0; j < 5; j++) {
            yield { dx: (direction * sweepPx) / 5, dy: 0, tMs };
            tMs += STEP_MS;
        }
        yield { dx: 0, dy: 0, tMs };
        tMs += STEP_MS;
    }
}

function jitterSamples(durationMs) {
    const samples = [];
    for (let i = 0; i * STEP_MS < durationMs; i++) {
        samples.push({ dx: i % 2 === 0 ? 10 : -10, dy: 0, tMs: i * STEP_MS });
    }
    return samples;
}

function circleSamples(durationMs, radius = 60, freqHz = 2) {
    const omega = (2 * Math.PI * freqHz) / 1000;
    const samples = [];
    for (let i = 0; i * STEP_MS < durationMs; i++) {
        const phase = i * STEP_MS;
        const theta = omega * phase;
        const prev = omega * (phase - STEP_MS);
        samples.push({
            dx: radius * (Math.cos(theta) - Math.cos(prev)),
            dy: radius * (Math.sin(theta) - Math.sin(prev)),
            tMs: i * STEP_MS,
        });
    }
    return samples;
}

test('3 Hz horizontal wave followed by a stop activates', () => {
    const detector = new GestureDetector(defaultConfig);
    const events = feedAll(detector, horizontalWave(0, 800));
    events.push(...feedAll(detector, stationaryTicks(800, 14)));

    assert.ok(events.includes('armed'), 'expected arming');
    assert.ok(events.includes('ready'), 'expected ready');
    assert.ok(events.includes('activated'), `expected activation, got ${events.join(',')}`);
    assert.equal(detector.phase, 'cooldown');
});

test('small alternating jitter never activates', () => {
    const detector = new GestureDetector(defaultConfig);
    const events = feedAll(detector, jitterSamples(600));
    events.push(...feedAll(detector, stationaryTicks(608, 14)));

    assert.ok(!events.includes('activated'), `unexpected activation: ${events.join(',')}`);
    assert.ok(!events.includes('ready'));
});

test('circular motion is rejected by axis dominance', () => {
    const detector = new GestureDetector(defaultConfig);
    const events = feedAll(detector, circleSamples(800));
    events.push(...feedAll(detector, stationaryTicks(800, 14)));

    assert.ok(!events.includes('armed'), `unexpected arming: ${events.join(',')}`);
    assert.ok(!events.includes('activated'));
});

test('a monotonic fast drag never activates', () => {
    const detector = new GestureDetector(defaultConfig);
    const samples = Array.from({ length: 38 }, (_, i) => ({ dx: 20, dy: 0, tMs: i * STEP_MS }));
    const events = feedAll(detector, samples);
    events.push(...feedAll(detector, stationaryTicks(608, 14)));

    assert.ok(events.includes('armed'));
    assert.ok(!events.includes('activated'), `unexpected activation: ${events.join(',')}`);
});

test('a single large jump aborts', () => {
    const detector = new GestureDetector(defaultConfig);
    assert.equal(detector.feed({ dx: 500, dy: 0, tMs: 0 }), 'aborted');
    assert.equal(detector.phase, 'idle');

    const events = feedAll(detector, horizontalWave(16, 800));
    assert.ok(!events.includes('activated'));
});

test('cooldown blocks an immediate second gesture', () => {
    const detector = new GestureDetector(defaultConfig);
    const first = feedAll(detector, horizontalWave(0, 800));
    first.push(...feedAll(detector, stationaryTicks(800, 14)));
    assert.ok(first.includes('activated'));

    const duringCooldown = feedAll(detector, horizontalWave(1010, 800));
    assert.ok(!duringCooldown.includes('activated'), 'activated during cooldown');
    assert.ok(duringCooldown.every(event => event === 'none'));

    const afterCooldown = feedAll(detector, horizontalWave(2400, 800));
    afterCooldown.push(...feedAll(detector, stationaryTicks(3200, 14)));
    assert.ok(afterCooldown.includes('activated'), 'did not activate after cooldown');
});

test('a pause longer than pauseMs aborts mid-gesture', () => {
    const detector = new GestureDetector(defaultConfig);
    const events = feedAll(detector, horizontalWave(0, 240));
    events.push(detector.feed({ dx: 0, dy: 0, tMs: 720 }));

    assert.ok(events.includes('armed'));
    assert.equal(events[events.length - 1], 'aborted');
    assert.equal(detector.phase, 'idle');
});

test('setConfig resets progress and phase', () => {
    const detector = new GestureDetector(defaultConfig);
    feedAll(detector, horizontalWave(0, 450));
    assert.ok(detector.progress > 0, 'expected at least one reversal');
    assert.equal(detector.phase, 'tracking');

    detector.setConfig({ ...defaultConfig, reversals: 4 });
    assert.equal(detector.progress, 0);
    assert.equal(detector.phase, 'idle');
});

test('slow, small pointer steps never activate', () => {
    const detector = new GestureDetector(defaultConfig);
    const events = feedAll(detector, slowSmallStepSamples());
    events.push(...feedAll(detector, stationaryTicks(3048, 12)));

    // Too little travel for the 300 px amplitude floor, and 1500 ms gaps
    // exceed the 400 ms pause guard, so the detector never arms.
    assert.ok(!events.includes('armed'), `unexpected arming: ${events.join(',')}`);
    assert.ok(!events.includes('ready'));
    assert.ok(!events.includes('activated'), `unexpected activation: ${events.join(',')}`);
    assert.equal(detector.phase, 'idle');
    assert.equal(detector.progress, 0);
});

test('a 900 ms window with a 180 ms settle still activates', () => {
    const detector = new GestureDetector(defaultConfig);
    // ~96 ms per sweep: three reversals land inside windowMs, then the
    // pointer stops inside settleMs.
    const events = feedAll(detector, squareWaveSweeps(7));
    events.push(...feedAll(detector, stationaryTicks(736, 12)));

    assert.ok(events.includes('armed'), 'expected arming');
    assert.ok(events.includes('ready'), 'expected ready');
    assert.ok(events.includes('activated'), `expected activation, got ${events.join(',')}`);
    assert.equal(detector.phase, 'cooldown');
});
