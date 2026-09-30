# Warehouse Control Lab

An independent Barbu Robotics demonstration of material-handling control logic. It is an educational software simulation, not a customer deployment, physical robot integration, PLC runtime or safety-certified system. Do not connect it to real equipment.

## Run

No dependencies or build step. Serve this directory over HTTP so the browser can load ES modules:

```sh
python -m http.server 8080
```

Open `http://localhost:8080`. Any static web server works. Opening `index.html` directly with `file://` is not supported by browsers that restrict module loading.

Run the deterministic engine tests with Node.js 18 or newer:

```sh
node --test engine.test.mjs
```

## Model

The flow is an input queue (maximum four parts), a single conveyor (three-second transfer), one robot (five-second cycle) and unlimited dispatch. A new arrival is requested every two simulated running seconds. If the queue is full, the request is held upstream and no new part is created. This is a backpressure count, not a lost-part count. The conveyor waits at transfer if the robot is occupied. Parts maintain their identity and FIFO order.

Each `step()` advances exactly one simulated second. Processing order is robot completion, conveyor progress/transfer, arrival admission, then conveyor loading. Newly loaded parts start progressing on the next step. The same inputs and step sequence always produce the same result. Playback at 1×, 2× or 4× changes the wall-clock interval, not the process model. Browser scheduling is approximate; backgrounding the page pauses the simulation.

Average throughput is dispatched parts divided by total running seconds, multiplied by 60. Stopped time is excluded. Idealized cycle times, perfect transfer, instantaneous stop and recovery, and unlimited dispatch are modelling assumptions. There is no physics, inertia, collision checking, communications failure model, electrical I/O, safety assessment or validated industrial control design.

## Controls and recovery

- **Start flow** explicitly enables movement when no active condition or reset latch remains.
- **Pause** freezes all parts, counters and the simulation clock. Start resumes.
- Opening the guard, engaging emergency stop or injecting a jam freezes all movement and latches an interlock.
- Clear **all** active conditions, select **Reset alarms**, then explicitly select **Start flow**. Closing the guard, releasing emergency stop, clearing the jam or resetting alone never restarts movement.
- Reset preserves work in progress and counters. Reload the page for a fresh simulation.

The history keeps the most recent 200 events. **Export CSV** downloads those retained events in chronological order, with sequence numbers and simulated running seconds. The visible table shows newest first. No data is sent to a server or retained after page reload.

## Project structure

- `engine.mjs`: browser-independent deterministic state machine and CSV formatter.
- `app.mjs`: DOM rendering, controls, timing and client-side export.
- `index.html` / `styles.css`: responsive, keyboard-accessible HMI-style interface with visible stop status and recovery guidance.
- `engine.test.mjs`: normal FIFO flow, bounded queue, conservation, determinism, pause, emergency stop, guard reopening, jam recovery, combined faults, event limits, CSV escaping and snapshot isolation.

## Suggested demonstration

1. Start at 2× and observe the queue fill behind the robot bottleneck.
2. Inject a conveyor jam and confirm every part position freezes.
3. Clear the jam and observe that Start is still unavailable.
4. Reset alarms and observe that movement is still stopped.
5. Start explicitly and confirm the existing parts continue.
6. Repeat with the guard and emergency stop; try overlapping active conditions.
7. Export the event history to examine sequencing and recovery.

## Portfolio description

**Warehouse Control Lab — independent simulation.** A browser-based material-handling demo with deterministic part sequencing, bounded input buffering, backpressure, event export and latched fault recovery. Tests verify part conservation and deliberate restart after interlocks. No commercial performance or client outcome is claimed.
