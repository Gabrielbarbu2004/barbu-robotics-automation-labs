import { WIDTH, HEIGHT, DEFAULTS, evaluate as evaluateBatch, toCSV } from './engine.mjs';

const $ = id => document.getElementById(id);
const controls = Object.keys(DEFAULTS);
let snapshot = null, selected = 0, mode = 'calibration', runSettings = { ...DEFAULTS };
const settings = () => Object.fromEntries(controls.map(key => [key, Number($(key).value)]));

function updateControlLabels() {
  for (const key of controls) $(key + '-value').textContent = key === 'widthTolerance' ? `±${$(key).value} px` : key === 'centreTolerance' ? `${$(key).value} px` : $(key).value;
}

function markChanged() {
  updateControlLabels();
  $('status').textContent = 'Settings changed. Run a batch to apply them. Results still show the previous run.';
  $('status').className = 'status warning';
}

function draw(canvas, sample, result, binary = false) {
  const temporary = document.createElement('canvas'); temporary.width = WIDTH; temporary.height = HEIGHT;
  const context = temporary.getContext('2d'), frame = context.createImageData(WIDTH, HEIGHT);
  for (let p = 0; p < sample.pixels.length; p++) {
    const intensity = binary ? (result.mask[p] ? 225 : 20) : sample.pixels[p];
    frame.data[p * 4] = intensity; frame.data[p * 4 + 1] = intensity; frame.data[p * 4 + 2] = intensity; frame.data[p * 4 + 3] = 255;
  }
  context.putImageData(frame, 0, 0);
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(temporary, 0, 0, canvas.width, canvas.height);
  if (!binary && result.body) {
    ctx.save(); ctx.scale(canvas.width / WIDTH, canvas.height / HEIGHT); ctx.strokeStyle = result.prediction === 'good' ? '#d4f86b' : '#ff9a9e'; ctx.lineWidth = 1;
    const b = result.body; ctx.strokeRect(b.minX - 1, b.minY - 1, b.maxX - b.minX + 2, b.maxY - b.minY + 2);
    if (result.hole) { const h = result.hole; ctx.beginPath(); ctx.arc(h.cx, h.cy, result.measurements.radius + 2, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(h.cx - 4, h.cy); ctx.lineTo(h.cx + 4, h.cy); ctx.moveTo(h.cx, h.cy - 4); ctx.lineTo(h.cx, h.cy + 4); ctx.stroke(); }
    ctx.restore();
  }
}

function showSample() {
  const { sample, result } = snapshot.rows[selected];
  $('sample-title').textContent = `Sample ${String(selected + 1).padStart(2, '0')}`;
  $('sample-position').textContent = `${selected + 1} / ${snapshot.rows.length}`;
  $('prediction').textContent = result.prediction === 'good' ? 'ACCEPT / Geometry within limits' : 'REJECT / Inspection rule triggered';
  $('prediction').className = result.prediction === 'good' ? '' : 'rejected';
  $('truth').textContent = `Truth: ${sample.label}${sample.defect !== 'none' ? ` · ${sample.defect.replaceAll('-', ' ')}` : ''}`;
  const m = result.measurements;
  $('measurement').textContent = m ? `Body ${m.width} × ${m.height} px · Hole offset ${m.offset === null ? '—' : m.offset.toFixed(1) + ' px'} · Radius ${m.radius === null ? '—' : m.radius.toFixed(1) + ' px'}` : 'No measurable component found.';
  $('reasons').textContent = result.reasons.length ? result.reasons.join(' · ') : 'Width, height, hole size and hole position passed.';
  draw($('source-canvas'), sample, result); draw($('mask-canvas'), sample, result, true);
  $('source-canvas').setAttribute('aria-label', `Synthetic ${sample.label} part, ${sample.defect.replaceAll('-', ' ')}. Inspection ${result.prediction === 'good' ? 'accepts' : 'rejects'} it. Measurements are listed below.`);
  for (const [index, button] of [...$('sample-strip').children].entries()) { button.classList.toggle('selected', index === selected); button.setAttribute('aria-pressed', String(index === selected)); }
}

function showBatch() {
  const { matrix, rows } = snapshot;
  $('batch-label').textContent = `${mode.toUpperCase()} · ${snapshot.seed}`;
  $('correct').textContent = `${matrix.goodAccepted + matrix.defectRejected}/${rows.length}`;
  $('false-accepts').textContent = matrix.defectAccepted;
  $('false-rejects').textContent = matrix.goodRejected;
  $('false-accepts').classList.toggle('error', matrix.defectAccepted > 0);
  $('false-rejects').classList.toggle('error', matrix.goodRejected > 0);
  for (const [id, key] of [['good-accepted', 'goodAccepted'], ['good-rejected', 'goodRejected'], ['defect-accepted', 'defectAccepted'], ['defect-rejected', 'defectRejected']]) {
    $(id).textContent = matrix[key]; $(id).classList.toggle('error', (key === 'goodRejected' || key === 'defectAccepted') && matrix[key] > 0);
  }
  $('sample-strip').replaceChildren();
  rows.forEach(({ sample, result }, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'sample-dot' + (sample.label !== result.prediction ? ' mismatch' : ''); button.textContent = index + 1;
    button.setAttribute('aria-label', `Sample ${index + 1}: actual ${sample.label}, predicted ${result.prediction}${sample.label !== result.prediction ? ', incorrect decision' : ''}`);
    button.title = `Sample ${index + 1} · ${sample.defect} · ${sample.label === result.prediction ? 'correct' : 'incorrect'}`;
    button.addEventListener('click', () => { selected = index; showSample(); }); $('sample-strip').append(button);
  });
  showSample();
}

async function run(nextMode) {
  const calibration = $('calibrationSeed'), evaluation = $('evaluationSeed');
  for (const input of [calibration, evaluation]) if (!input.checkValidity() || input.value === '') { input.reportValidity(); $('status').textContent = 'Enter whole-number seeds from 0 to 999999.'; return; }
  if (Number(calibration.value) === Number(evaluation.value)) { $('status').textContent = 'Choose different calibration and evaluation seeds to keep the batches separate.'; $('status').className = 'status warning'; evaluation.focus(); return; }
  $('calibrate').disabled = true; $('evaluate').disabled = true; $('export').disabled = true;
  $('status').className = 'status'; $('status').textContent = 'Generating images and inspecting pixels…';
  await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  try {
    mode = nextMode; runSettings = settings(); selected = 0;
    snapshot = evaluateBatch(String(Number((mode === 'calibration' ? calibration : evaluation).value)), 40, runSettings);
    showBatch(); $('status').textContent = `${mode === 'calibration' ? 'Calibration' : 'Evaluation'} complete. Seed ${snapshot.seed}; 40 synthetic samples. Export preserves these settings.`;
  } catch (error) { $('status').textContent = `The run could not complete: ${error.message}`; $('status').className = 'status warning'; }
  finally { $('calibrate').disabled = false; $('evaluate').disabled = false; $('export').disabled = !snapshot; }
}

for (const key of [...controls, 'calibrationSeed', 'evaluationSeed']) $(key).addEventListener('input', markChanged);
$('calibrate').addEventListener('click', () => run('calibration'));
$('evaluate').addEventListener('click', () => run('evaluation'));
$('reset').addEventListener('click', () => { for (const key of controls) $(key).value = DEFAULTS[key]; $('calibrationSeed').value = 731; $('evaluationSeed').value = 1907; updateControlLabels(); run('calibration'); });
$('previous').addEventListener('click', () => { if (snapshot) { selected = (selected - 1 + snapshot.rows.length) % snapshot.rows.length; showSample(); } });
$('next').addEventListener('click', () => { if (snapshot) { selected = (selected + 1) % snapshot.rows.length; showSample(); } });
$('export').addEventListener('click', () => { if (!snapshot) return; const url = URL.createObjectURL(new Blob([toCSV(snapshot, runSettings, mode)], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `vision-${mode}-seed-${snapshot.seed}.csv`; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
updateControlLabels(); run('calibration');
