import { Workbench, SAMPLE_CSV, CATEGORIES } from './engine.mjs';

const bench = new Workbench();
const byId = id => document.getElementById(id);
const MAX_BYTES = 250_000;
const label = text => text.replaceAll('-', ' ');
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
function announce(text, error = false) {
  byId('status').textContent = text;
  byId('status').classList.toggle('error', error);
}
function run(action) {
  try { action(); render(); } catch (error) { announce(error.message, true); }
}
function validate() {
  const text = byId('csv-input').value;
  if (new Blob([text]).size > MAX_BYTES) throw new Error('This demo accepts CSV files up to 250 KB. Please use a smaller batch.');
  const batch = bench.import(text);
  announce(`Validated ${batch.inputRows} rows. ${bench.metrics().valid} unique IDs can be classified; ${batch.invalidRows.length} invalid rows and ${batch.duplicateRows.length} duplicate rows are flagged.`);
}
function renderValidation() {
  const container = byId('validation'); container.replaceChildren();
  const issues = [
    ...bench.invalidRows.map(row => `Line ${row.line}${row.requestId ? ` (${row.requestId})` : ''}: ${row.errors.join('; ')}`),
    ...bench.duplicateRows.map(row => `Line ${row.line} (${row.requestId}): ${row.message}`),
  ];
  if (!issues.length) return;
  container.append(element('h3', `${issues.length} input issue${issues.length === 1 ? '' : 's'} found`));
  const list = element('ul');
  issues.forEach(issue => list.append(element('li', issue)));
  container.append(list);
}
function renderReview() {
  const queue = byId('review-queue'); queue.replaceChildren();
  const pending = bench.items.filter(item => item.status === 'pending-review');
  byId('review-count').textContent = `${pending.length} pending`;
  if (!pending.length) {
    queue.append(element('p', bench.items.some(item => item.status === 'unclassified') ? 'Classify the batch to find requests that need a human decision.' : 'No requests are awaiting human approval.', 'empty'));
    return;
  }
  pending.forEach((item, index) => {
    const card = element('article', undefined, 'review-card');
    const copy = element('div');
    copy.append(element('h3', `${item.request_id} · ${item.subject}`), element('p', item.description, 'description'), element('p', item.reason, 'reason'));
    const controls = element('div');
    const select = element('select'); select.id = `route-${index}`;
    const routeLabel = element('label', 'Choose destination'); routeLabel.htmlFor = select.id;
    const placeholder = element('option', 'Select a queue'); placeholder.value = ''; placeholder.disabled = true; placeholder.selected = true;
    select.append(placeholder);
    CATEGORIES.forEach(category => { const option = element('option', category[0].toUpperCase() + category.slice(1)); option.value = category; select.append(option); });
    const button = element('button', 'Approve routing', 'primary'); button.disabled = true;
    button.setAttribute('aria-label', `Approve routing for ${item.request_id}`);
    select.addEventListener('change', () => { button.disabled = !select.value; });
    button.addEventListener('click', () => run(() => {
      bench.approve(item.id, select.value);
      announce(`${item.request_id} approved for the ${select.value} queue. It is ready to simulate.`);
    }));
    controls.append(routeLabel, select, button); card.append(copy, controls); queue.append(card);
  });
}
function renderResults() {
  const body = byId('results-body'); body.replaceChildren();
  if (!bench.items.length) {
    const row = element('tr'); const cell = element('td', 'No valid requests in this batch. Fix the flagged input rows and validate again.'); cell.colSpan = 4; row.append(cell); body.append(row); return;
  }
  bench.items.forEach(item => {
    const row = element('tr');
    const request = element('td', item.request_id); request.append(element('small', item.subject));
    const route = element('td'); route.append(element('span', item.category ? label(item.category) : '—', `badge ${item.category || ''}`));
    const status = element('td'); status.append(element('span', label(item.status), `badge ${item.status}`));
    const reason = element('td', item.reason);
    row.append(request, route, status, reason); body.append(row);
  });
}
function renderAudit() {
  const body = byId('audit-body'); body.replaceChildren();
  bench.audit.slice(-30).reverse().forEach(entry => {
    const row = element('tr');
    const time = element('td', new Date(entry.time).toLocaleTimeString());
    time.title = entry.time;
    const event = element('td', label(entry.event)); event.append(element('small', entry.requestId || 'Batch'));
    const detail = element('td', entry.detail);
    if (entry.executionId) detail.append(element('small', entry.executionId));
    row.append(time, event, detail); body.append(row);
  });
}
function render() {
  const metrics = bench.metrics();
  Object.entries(metrics).forEach(([name, value]) => { byId(`metric-${name}`).textContent = value; });
  byId('classify').disabled = !bench.items.some(item => item.status === 'unclassified');
  byId('process').disabled = !bench.items.some(item => ['ready', 'processed', 'replay-skipped'].includes(item.status));
  byId('export-results').disabled = !bench.items.length;
  byId('export-audit').disabled = !bench.audit.length;
  renderValidation(); renderReview(); renderResults(); renderAudit();
}
function download(name, contents) {
  const url = URL.createObjectURL(new Blob(['\uFEFF', contents], { type: 'text/csv;charset=utf-8' }));
  const anchor = element('a'); anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
byId('validate').addEventListener('click', () => run(validate));
byId('load-sample').addEventListener('click', () => run(() => { byId('csv-input').value = SAMPLE_CSV; validate(); }));
byId('classify').addEventListener('click', () => run(() => {
  bench.classify();
  announce(`Rules applied. ${bench.items.filter(item => item.status === 'ready').length} ready to simulate; ${bench.metrics().review} require human approval.`);
}));
byId('process').addEventListener('click', () => run(() => {
  const result = bench.process();
  announce(`${result.processed} simulated dispatch${result.processed === 1 ? '' : 'es'} recorded. ${result.skipped} replay${result.skipped === 1 ? '' : 's'} skipped. ${bench.metrics().review} requests remain in review.`);
}));
byId('export-results').addEventListener('click', () => download('barbu-workflow-results.csv', bench.resultsCSV()));
byId('export-audit').addEventListener('click', () => download('barbu-workflow-audit.csv', bench.auditCSV()));
byId('csv-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > MAX_BYTES) throw new Error('This demo accepts CSV files up to 250 KB. Please use a smaller batch.');
    byId('csv-input').value = await file.text();
    announce('File loaded into the editor. Select Validate CSV to import it as the current batch.');
  } catch (error) { announce(error.message, true); }
  event.target.value = '';
});
byId('csv-input').value = SAMPLE_CSV;
run(() => { bench.import(SAMPLE_CSV); announce('Fictional sample loaded and validated. Classify the batch to start the demonstration.'); });
