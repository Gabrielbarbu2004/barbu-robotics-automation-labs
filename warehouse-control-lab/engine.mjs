/** Deterministic, educational process simulation. Never connect to physical equipment. */
export const SETTINGS = Object.freeze({ queueCapacity: 4, feedEvery: 2, conveyorSeconds: 3, robotSeconds: 5, eventLimit: 200 });

export class WarehouseEngine {
  constructor() {
    this.mode = 'idle';
    this.seconds = 0;
    this.queue = [];
    this.conveyor = null;
    this.robot = null;
    this.guardClosed = true;
    this.emergencyStop = false;
    this.jammed = false;
    this.resetRequired = false;
    this.created = 0;
    this.dispatched = 0;
    this.blockedFeeds = 0;
    this.events = [];
    this.eventSequence = 0;
    this.log('READY', 'Simulation ready. Select Start to begin.');
  }

  get conditions() {
    return [this.emergencyStop && 'Emergency stop engaged', !this.guardClosed && 'Guard open', this.jammed && 'Conveyor jam'].filter(Boolean);
  }

  get canStart() { return !this.conditions.length && !this.resetRequired && this.mode !== 'running'; }

  log(type, message) {
    this.events.push({ sequence: ++this.eventSequence, seconds: this.seconds, type, message });
    if (this.events.length > SETTINGS.eventLimit) this.events.shift();
  }

  start() {
    if (!this.canStart) return false;
    this.mode = 'running';
    this.log('START', 'Explicit start accepted. Automatic flow enabled.');
    return true;
  }

  pause() {
    if (this.mode !== 'running') return false;
    this.mode = 'paused';
    this.log('PAUSE', 'Operator pause. All process movement frozen.');
    return true;
  }

  interlock(message) {
    this.mode = 'interlocked';
    this.resetRequired = true;
    this.log('INTERLOCK', message + ' Movement frozen; reset and explicit Start required.');
  }

  setGuard(closed) {
    closed = Boolean(closed);
    if (closed === this.guardClosed) return;
    this.guardClosed = closed;
    if (!closed) this.interlock('Guard opened.');
    else this.log('GUARD_CLOSED', 'Guard closed. Reset remains required.');
  }

  setEmergencyStop(engaged) {
    engaged = Boolean(engaged);
    if (engaged === this.emergencyStop) return;
    this.emergencyStop = engaged;
    if (engaged) this.interlock('Emergency stop engaged.');
    else this.log('ESTOP_RELEASED', 'Emergency stop released. Reset remains required.');
  }

  setJam(jammed) {
    jammed = Boolean(jammed);
    if (jammed === this.jammed) return;
    this.jammed = jammed;
    if (jammed) this.interlock('Conveyor jam injected.');
    else this.log('JAM_CLEARED', 'Simulated jam cleared. Reset remains required.');
  }

  reset() {
    if (this.conditions.length) {
      this.log('RESET_REJECTED', 'Clear active conditions first: ' + this.conditions.join('; ') + '.');
      return false;
    }
    if (this.mode === 'running') return false;
    this.resetRequired = false;
    this.mode = 'idle';
    this.log('RESET', 'Alarm latch reset. Work in progress preserved. Select Start to resume.');
    return true;
  }

  /** Advance exactly one simulated second. Stops never advance the process clock. */
  step() {
    if (this.mode !== 'running' || this.conditions.length || this.resetRequired) return false;
    this.seconds++;
    if (this.robot && ++this.robot.progress >= SETTINGS.robotSeconds) {
      this.dispatched++;
      this.log('DISPATCH', this.robot.id + ' dispatched.');
      this.robot = null;
    }
    if (this.conveyor) {
      this.conveyor.progress = Math.min(SETTINGS.conveyorSeconds, this.conveyor.progress + 1);
      if (this.conveyor.progress === SETTINGS.conveyorSeconds && !this.robot) {
        this.robot = { id: this.conveyor.id, progress: 0 };
        this.log('ROBOT_PICK', this.conveyor.id + ' transferred to robot.');
        this.conveyor = null;
      }
    }
    if ((this.seconds - 1) % SETTINGS.feedEvery === 0) {
      if (this.queue.length < SETTINGS.queueCapacity) {
        const id = 'P' + String(++this.created).padStart(4, '0');
        this.queue.push(id);
        this.log('ARRIVAL', id + ' entered queue.');
      } else {
        this.blockedFeeds++;
        this.log('FEED_HELD', 'Input queue full. New arrival held upstream; no part created.');
      }
    }
    if (!this.conveyor && this.queue.length) {
      this.conveyor = { id: this.queue.shift(), progress: 0 };
      this.log('CONVEYOR_LOAD', this.conveyor.id + ' loaded onto conveyor.');
    }
    return true;
  }

  snapshot() {
    return {
      mode: this.mode, seconds: this.seconds, queue: [...this.queue],
      conveyor: this.conveyor ? { ...this.conveyor } : null,
      robot: this.robot ? { ...this.robot } : null,
      guardClosed: this.guardClosed, emergencyStop: this.emergencyStop, jammed: this.jammed,
      resetRequired: this.resetRequired, conditions: this.conditions,
      created: this.created, dispatched: this.dispatched, blockedFeeds: this.blockedFeeds,
      throughput: this.seconds ? this.dispatched / this.seconds * 60 : 0,
      events: this.events.map(event => ({ ...event }))
    };
  }
}

export function eventsToCSV(events) {
  const cell = value => '"' + String(value).replaceAll('"', '""') + '"';
  return ['sequence,simulation_seconds,event,message', ...events.map(event => [event.sequence, event.seconds, event.type, event.message].map(cell).join(','))].join('\r\n') + '\r\n';
}
