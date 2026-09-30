import { WarehouseEngine, SETTINGS, eventsToCSV } from './engine.mjs';

const engine = new WarehouseEngine();
const $ = id => document.getElementById(id);
const time = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
let timer;
let renderedEventSequence = -1;

function render() {
  const state = engine.snapshot();
  $('state').textContent = state.mode === 'idle' ? 'READY' : state.mode.toUpperCase();
  $('state').dataset.mode = state.mode;
  $('start').disabled = !engine.canStart;
  $('start').textContent = state.seconds ? 'Start / resume flow' : 'Start flow';
  $('pause').disabled = state.mode !== 'running';
  $('reset').disabled = state.mode === 'running' || state.conditions.length > 0;
  const status = state.conditions.length
    ? `Stopped: ${state.conditions.join(' · ')}. Clear all active conditions, then Reset alarms, then Start flow.`
    : state.resetRequired ? 'Conditions clear. Select Reset alarms, then Start flow. Movement remains stopped.'
    : state.mode === 'running' ? 'Flow running. Input is admitted only when the queue has capacity.'
    : state.mode === 'paused' ? 'Operator pause. Select Start / resume flow to continue.'
    : 'Ready. Select Start flow to begin or resume.';
  if ($('status').textContent !== status) $('status').textContent = status;
  $('dispatched').textContent = state.dispatched;
  $('throughput').textContent = state.throughput.toFixed(1);
  $('queue-count').textContent = `${state.queue.length} / ${SETTINGS.queueCapacity}`;
  $('elapsed').textContent = time(state.seconds);
  $('queue').replaceChildren(...Array.from({ length: SETTINGS.queueCapacity }, (_, index) => {
    const box = document.createElement('span');
    box.className = state.queue[index] ? 'queue-slot occupied' : 'queue-slot';
    box.textContent = state.queue[index] || '—';
    box.setAttribute('aria-label', state.queue[index] || 'Empty queue slot');
    return box;
  }));
  $('queue-description').textContent = state.queue.length === SETTINGS.queueCapacity ? 'Buffer full. New arrival requests held upstream.' : `${SETTINGS.queueCapacity - state.queue.length} queue slots available.`;
  $('conveyor-part').textContent = state.conveyor?.id || 'Empty';
  $('conveyor-progress').value = state.conveyor?.progress || 0;
  $('conveyor-description').textContent = !state.conveyor ? 'Ready for a part.' : state.conveyor.progress === SETTINGS.conveyorSeconds ? 'Transfer ready; waiting for robot.' : `${state.conveyor.progress} / ${SETTINGS.conveyorSeconds} cycle seconds`;
  $('robot-part').textContent = state.robot?.id || 'Empty';
  $('robot-progress').value = state.robot?.progress || 0;
  $('robot-description').textContent = state.robot ? `${state.robot.progress} / ${SETTINGS.robotSeconds} cycle seconds` : 'Ready to pick.';
  $('dispatch-station').textContent = `${state.dispatched} parts`;
  const wip = state.queue.length + Number(Boolean(state.conveyor)) + Number(Boolean(state.robot));
  $('flow-summary').textContent = `${state.created} parts created · ${wip} in process · ${state.blockedFeeds} arrival requests held upstream`;
  $('guard').checked = state.guardClosed;
  $('estop').textContent = state.emergencyStop ? 'Release emergency stop' : 'Engage emergency stop';
  $('estop').setAttribute('aria-pressed', String(state.emergencyStop));
  $('jam').textContent = state.jammed ? 'Clear conveyor jam' : 'Inject conveyor jam';
  $('jam').setAttribute('aria-pressed', String(state.jammed));
  if (renderedEventSequence !== engine.eventSequence) {
    renderedEventSequence = engine.eventSequence;
    $('event-count').textContent = `Latest ${state.events.length} of ${engine.eventSequence} events · timestamps use simulated running time · CSV contains retained events`;
    $('events').replaceChildren(...[...state.events].reverse().map(event => {
      const row = document.createElement('tr');
      [event.sequence, time(event.seconds), event.type.replaceAll('_', ' '), event.message].forEach(value => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      });
      return row;
    }));
  }
}

function act(action) { action(); render(); }
function setTimer() {
  clearInterval(timer);
  timer = setInterval(() => { if (engine.step()) render(); }, Number($('speed').value));
}
$('start').addEventListener('click', () => act(() => engine.start()));
$('pause').addEventListener('click', () => act(() => engine.pause()));
$('reset').addEventListener('click', () => act(() => engine.reset()));
$('guard').addEventListener('change', event => act(() => engine.setGuard(event.target.checked)));
$('estop').addEventListener('click', () => act(() => engine.setEmergencyStop(!engine.emergencyStop)));
$('jam').addEventListener('click', () => act(() => engine.setJam(!engine.jammed)));
$('speed').addEventListener('change', setTimer);
$('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([eventsToCSV(engine.events)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'barbu-robotics-warehouse-events.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
// Background tabs pause rather than silently alter the apparent simulation rate.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && engine.mode === 'running') act(() => engine.pause());
});
render();
setTimer();
