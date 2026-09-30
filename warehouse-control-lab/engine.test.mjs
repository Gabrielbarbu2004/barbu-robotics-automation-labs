import test from 'node:test';
import assert from 'node:assert/strict';
import { WarehouseEngine, SETTINGS, eventsToCSV } from './engine.mjs';

function advance(engine, seconds) { for (let i = 0; i < seconds; i++) engine.step(); }
function motion(engine) {
  const { seconds, queue, conveyor, robot, created, dispatched, blockedFeeds } = engine.snapshot();
  return { seconds, queue, conveyor, robot, created, dispatched, blockedFeeds };
}
function activeEngine() { const engine = new WarehouseEngine(); engine.start(); advance(engine, 12); return engine; }

test('normal flow is deterministic, bounded, FIFO and conserves parts', () => {
  const a = new WarehouseEngine();
  const b = new WarehouseEngine();
  assert.equal(a.step(), false);
  a.start(); b.start();
  for (let i = 0; i < 90; i++) {
    a.step(); b.step();
    assert.ok(a.queue.length <= SETTINGS.queueCapacity);
    assert.equal(a.created, a.dispatched + a.queue.length + Number(Boolean(a.conveyor)) + Number(Boolean(a.robot)));
  }
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.equal(a.dispatched, 17);
  assert.ok(a.blockedFeeds > 0);
  const dispatchedIds = a.events.filter(event => event.type === 'DISPATCH').map(event => event.message.split(' ')[0]);
  assert.deepEqual(dispatchedIds, Array.from({ length: 17 }, (_, i) => 'P' + String(i + 1).padStart(4, '0')));
  assert.equal(a.snapshot().throughput, 17 / 90 * 60);
});

test('pause freezes time, part positions and counters until explicit start', () => {
  const engine = activeEngine();
  engine.pause();
  const before = motion(engine);
  advance(engine, 30);
  assert.deepEqual(motion(engine), before);
  assert.equal(engine.start(), true);
  assert.equal(engine.step(), true);
  assert.equal(engine.seconds, before.seconds + 1);
});

test('emergency stop holds movement through release and reset until explicit start', () => {
  const engine = activeEngine();
  const before = motion(engine);
  engine.setEmergencyStop(true);
  assert.equal(engine.start(), false);
  assert.equal(engine.reset(), false);
  advance(engine, 20);
  assert.deepEqual(motion(engine), before);
  engine.setEmergencyStop(false);
  assert.equal(engine.start(), false);
  advance(engine, 20);
  assert.deepEqual(motion(engine), before);
  assert.equal(engine.reset(), true);
  advance(engine, 20);
  assert.deepEqual(motion(engine), before);
  assert.equal(engine.start(), true);
  assert.equal(engine.step(), true);
});

test('guard closing does not restart; reopening after reset latches a new stop', () => {
  const engine = activeEngine();
  const before = motion(engine);
  engine.setGuard(false);
  advance(engine, 10);
  assert.deepEqual(motion(engine), before);
  assert.equal(engine.reset(), false);
  engine.setGuard(true);
  assert.equal(engine.start(), false);
  assert.equal(engine.reset(), true);
  assert.equal(engine.mode, 'idle');
  engine.setGuard(false);
  assert.equal(engine.resetRequired, true);
  assert.equal(engine.start(), false);
  engine.setGuard(true);
  assert.equal(engine.start(), false);
  advance(engine, 10);
  assert.deepEqual(motion(engine), before);
  engine.reset(); engine.start(); engine.step();
  assert.equal(engine.seconds, before.seconds + 1);
});

test('jam recovery preserves work in progress and enforces clear-reset-start order', () => {
  const engine = activeEngine();
  const before = motion(engine);
  engine.setJam(true);
  assert.equal(engine.reset(), false);
  assert.equal(engine.start(), false);
  advance(engine, 50);
  assert.deepEqual(motion(engine), before);
  engine.setJam(false);
  assert.equal(engine.start(), false);
  advance(engine, 10);
  assert.deepEqual(motion(engine), before);
  engine.reset();
  advance(engine, 10);
  assert.deepEqual(motion(engine), before);
  engine.start(); advance(engine, 10);
  assert.ok(engine.dispatched > before.dispatched);
});

test('multiple active conditions must all clear before reset', () => {
  const engine = activeEngine();
  engine.setJam(true); engine.setGuard(false); engine.setEmergencyStop(true);
  engine.setJam(false); engine.setGuard(true);
  assert.equal(engine.conditions.length, 1);
  assert.equal(engine.reset(), false);
  engine.setEmergencyStop(false);
  assert.equal(engine.reset(), true);
  assert.equal(engine.mode, 'idle');
});

test('retained events are bounded and CSV quotes messages correctly', () => {
  const engine = new WarehouseEngine(); engine.start(); advance(engine, 3000);
  assert.equal(engine.events.length, SETTINGS.eventLimit);
  assert.ok(engine.events[0].sequence > 1);
  const csv = eventsToCSV([{ sequence: 1, seconds: 2, type: 'TEST', message: 'Part "A", ready' }]);
  assert.equal(csv, 'sequence,simulation_seconds,event,message\r\n"1","2","TEST","Part ""A"", ready"\r\n');
});

test('snapshot cannot mutate live parts, queues or event records', () => {
  const engine = activeEngine();
  const snapshot = engine.snapshot();
  snapshot.queue.length = 0;
  snapshot.robot.id = 'CHANGED';
  snapshot.events[0].message = 'CHANGED';
  assert.ok(engine.queue.length > 0);
  assert.notEqual(engine.robot.id, 'CHANGED');
  assert.notEqual(engine.events[0].message, 'CHANGED');
});
