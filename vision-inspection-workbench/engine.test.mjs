import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSample, inspect, evaluate, toCSV } from './engine.mjs';

test('seeded images are reproducible, and separate seeds change the pixels', () => {
  const first = generateSample(731, 0), repeated = generateSample(731, 0), independent = generateSample(1907, 0);
  assert.deepEqual(first.pixels, repeated.pixels); assert.notDeepEqual(first.pixels, independent.pixels);
});

test('normal geometric parts pass across two independent batches', () => {
  for (const seed of [731, 1907]) {
    const batch = evaluate(seed);
    assert.deepEqual(batch.matrix, { goodAccepted: 20, goodRejected: 0, defectAccepted: 0, defectRejected: 20 });
  }
});

test('all three generated defect types are rejected for the correct reason', () => {
  const expected = { 'missing-hole': 'Hole not detected', 'offset-hole': 'Hole centre outside tolerance', 'narrow-body': 'Body width outside tolerance' };
  for (const [defect, reason] of Object.entries(expected)) {
    const result = inspect(generateSample(731, 2, {}, defect));
    assert.equal(result.prediction, 'defect'); assert.ok(result.reasons.includes(reason));
  }
});

test('inspection depends on raster pixels, not synthetic ground-truth metadata', () => {
  const sample = generateSample(731, 0);
  const changedLabel = { ...sample, label: 'defect', defect: 'missing-hole' };
  assert.equal(inspect(changedLabel).prediction, 'good');
});

test('relaxed tolerances cause measurable false accepts', () => {
  const batch = evaluate(1907, 40, { widthTolerance: 24, centreTolerance: 24 });
  assert.ok(batch.matrix.defectAccepted > 0);
  assert.equal(batch.matrix.goodRejected, 0);
  assert.equal(inspect(generateSample(731, 2, {}, 'offset-hole'), { centreTolerance: 24 }).prediction, 'good');
});

test('low exposure causes rejects and adjusted threshold recovers the same images', () => {
  const sample = generateSample(731, 0, { exposure: -110, noise: 0 });
  assert.equal(inspect(sample).prediction, 'defect');
  assert.equal(inspect(sample, { threshold: 80 }).prediction, 'good');
});

test('blank and saturated images do not pass', () => {
  const sample = generateSample(731, 0);
  for (const value of [0, 255]) {
    const pixels = new Uint8ClampedArray(sample.pixels.length).fill(value);
    assert.equal(inspect({ ...sample, pixels }).prediction, 'defect');
  }
});

test('CSV contains settings, truth, measurements and one row per sample', () => {
  const csv = toCSV(evaluate(1907, 4), { threshold: 123 }, 'evaluation');
  assert.equal(csv.split('\r\n').length, 5);
  assert.ok(csv.includes('"ground_truth"')); assert.ok(csv.includes('"hole_offset_px"'));
  assert.ok(csv.includes('"evaluation","1907"')); assert.ok(csv.includes('"123"'));
});

test('invalid batch sizes and unknown generator defects are rejected', () => {
  for (const count of [0, 1.2, 201]) assert.throws(() => evaluate(731, count));
  assert.throws(() => generateSample(731, 0, {}, 'unknown'));
});
