export const RULE_VERSION = 'rules-v1';
export const CATEGORIES = ['billing', 'support', 'operations'];
export const REQUIRED_HEADERS = ['request_id', 'customer', 'email', 'subject', 'description'];

export const SAMPLE_CSV = `request_id,customer,email,subject,description,priority
REQ-1001,Avery Lane,avery@example.com,Invoice copy,Please send a copy of my invoice.,normal
REQ-1002,Sam Rivera,sam@example.com,Login error,I cannot access my account after a password reset.,normal
REQ-1003,Jordan Blake,jordan@example.com,Delivery update,Please update the delivery schedule.,low
REQ-1004,Casey Morgan,casey@example.com,Invoice and login issue,"My invoice is incorrect, and I cannot login.",normal
REQ-1005,Alex Quinn,alex@example.com,General question,"Hello team,
Could someone explain the next steps?",normal
REQ-1006,Riley Park,riley@example.com,Urgent payment question,Please check this payment today.,urgent
REQ-1002,Sam Rivera,sam@example.com,Login error,I cannot access my account after a password reset.,normal
REQ-1007,Taylor Reed,not-an-email,Shipment address,Please change my shipment address.,normal`;

export class CSVError extends Error {
  constructor(message, line) { super(`${message} (line ${line})`); this.name = 'CSVError'; this.line = line; }
}

/** Strict CSV reader: comma delimiter, escaped quotes, CRLF/LF and quoted newlines. */
export function parseCSV(input) {
  const text = String(input).replace(/^\uFEFF/, '');
  if (!text.trim()) return [];
  const records = [];
  let cells = [], cell = '', state = 'start', line = 1, startLine = 1;
  const finishCell = () => { cells.push(cell); cell = ''; state = 'start'; };
  const finishRow = () => {
    finishCell();
    if (cells.some(value => value.trim())) records.push({ cells, line: startLine });
    cells = [];
  };
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    const newline = character === '\n' || character === '\r';
    if (state === 'quoted') {
      if (character === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else state = 'closed';
      } else if (newline) {
        if (character === '\r' && text[i + 1] === '\n') i++;
        cell += '\n'; line++;
      } else cell += character;
      continue;
    }
    if (character === ',') { finishCell(); continue; }
    if (newline) {
      finishRow();
      if (character === '\r' && text[i + 1] === '\n') i++;
      line++; startLine = line; continue;
    }
    if (state === 'closed') throw new CSVError('Unexpected character after closing quote', line);
    if (character === '"') {
      if (state !== 'start') throw new CSVError('Quote inside an unquoted field', line);
      state = 'quoted';
    } else { cell += character; state = 'unquoted'; }
  }
  if (state === 'quoted') throw new CSVError('Unclosed quoted field', line);
  if (cells.length || cell.length || state === 'closed') finishRow();
  return records;
}

function stableId(requestId) {
  // The supplied request ID is the identity, rather than an order-dependent row number.
  return `request:${requestId.trim().toLowerCase()}`;
}

export function readRequests(csv) {
  const records = parseCSV(csv);
  if (!records.length) throw new CSVError('Enter a CSV header and at least one request', 1);
  const headers = records[0].cells.map(value => value.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new CSVError('Duplicate column headers', records[0].line);
  const missing = REQUIRED_HEADERS.filter(header => !headers.includes(header));
  if (missing.length) throw new CSVError(`Missing columns: ${missing.join(', ')}`, records[0].line);
  if (records.length < 2) throw new CSVError('Add at least one request after the header', records[0].line);
  const items = [], invalidRows = [], duplicateRows = [], seen = new Map();
  for (const record of records.slice(1)) {
    const row = Object.fromEntries(headers.map((header, index) => [header, (record.cells[index] ?? '').trim()]));
    const errors = [];
    if (record.cells.length !== headers.length) errors.push(`Expected ${headers.length} fields; found ${record.cells.length}`);
    for (const name of REQUIRED_HEADERS) if (!row[name]) errors.push(`${name} is required`);
    if (row.request_id && !/^[a-z\d][a-z\d._-]{0,63}$/i.test(row.request_id)) errors.push('request_id must be 1–64 letters, numbers, dots, dashes or underscores');
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push('email is invalid');
    row.priority = (row.priority || 'normal').toLowerCase();
    if (!['low', 'normal', 'high', 'urgent'].includes(row.priority)) errors.push('priority must be low, normal, high or urgent');
    if (errors.length) { invalidRows.push({ line: record.line, requestId: row.request_id, errors }); continue; }
    const id = stableId(row.request_id);
    const canonical = JSON.stringify([row.customer, row.email.toLowerCase(), row.subject, row.description, row.priority]);
    if (seen.has(id)) {
      const conflict = seen.get(id).canonical !== canonical;
      duplicateRows.push({ line: record.line, requestId: row.request_id, conflict, message: conflict ? 'Conflicting duplicate ID; all rows with this ID are blocked' : 'Identical duplicate skipped' });
      if (conflict) seen.get(id).item.blocked = true;
      continue;
    }
    const item = { ...row, id, line: record.line, blocked: false, category: null, reason: 'Awaiting classification', status: 'unclassified', approved: false };
    seen.set(id, { canonical, item }); items.push(item);
  }
  for (const item of items) if (item.blocked) { item.status = 'blocked'; item.reason = 'Conflicting duplicate ID; correct the source data and import again'; }
  return { items, invalidRows, duplicateRows, inputRows: records.length - 1 };
}

const RULES = {
  billing: /\b(invoice|payment|refund|billing|charge|receipt)\b/i,
  support: /\b(login|password|error|bug|broken|access|technical)\b/i,
  operations: /\b(delivery|shipment|shipping|schedule|booking|inventory|dispatch)\b/i,
};

export function classifyRequest(item) {
  const text = `${item.subject}\n${item.description}`;
  const matches = CATEGORIES.filter(category => RULES[category].test(text));
  if (item.priority === 'urgent' || /\b(legal|security|fraud|complaint|breach)\b/i.test(text)) {
    return { category: 'needs-review', reason: 'Urgent priority or sensitive keyword requires human review' };
  }
  if (matches.length > 1) return { category: 'needs-review', reason: `Multiple rule matches: ${matches.join(', ')}` };
  if (!matches.length) return { category: 'needs-review', reason: 'No routing keyword matched' };
  return { category: matches[0], reason: `Matched ${matches[0]} keyword rule` };
}

export function executionId(item) {
  // One simulated dispatch per identity and rule version, including after a route change.
  return `${RULE_VERSION}:dispatch:${item.id}`;
}

export class Workbench {
  constructor({ now = () => new Date().toISOString() } = {}) {
    this.now = now; this.items = []; this.invalidRows = []; this.duplicateRows = [];
    this.inputRows = 0; this.audit = []; this.executions = new Map();
  }
  log(event, requestId = '', detail = '', execution = '') {
    this.audit.push({ eventId: `event-${this.audit.length + 1}`, time: this.now(), event, requestId, detail, executionId: execution });
  }
  import(csv) {
    const data = readRequests(csv); // A malformed import preserves the last successful batch.
    Object.assign(this, data);
    this.log('imported', '', `${data.inputRows} input rows; ${data.items.length} unique valid IDs; ${data.invalidRows.length} invalid rows; ${data.duplicateRows.length} duplicates`);
    for (const row of data.invalidRows) this.log('validation-failed', row.requestId, `Line ${row.line}: ${row.errors.join('; ')}`);
    for (const row of data.duplicateRows) this.log('duplicate-detected', row.requestId, `Line ${row.line}: ${row.message}`);
    return data;
  }
  classify() {
    for (const item of this.items) {
      if (item.blocked || item.status !== 'unclassified') continue;
      Object.assign(item, classifyRequest(item));
      item.status = item.category === 'needs-review' ? 'pending-review' : 'ready';
      this.log('classified', item.request_id, `${item.category}: ${item.reason}`);
    }
  }
  approve(id, category) {
    const item = this.items.find(request => request.id === id);
    if (!item || item.status !== 'pending-review') throw new Error('Only pending review items can be approved');
    if (!CATEGORIES.includes(category)) throw new Error('Choose billing, support or operations');
    item.category = category; item.status = 'ready'; item.approved = true;
    item.reason = `Human approved routing to ${category}`;
    this.log('human-approved', item.request_id, `Demo operator chose ${category}`);
  }
  process() {
    let processed = 0, skipped = 0;
    for (const item of this.items) {
      if (!['ready', 'processed', 'replay-skipped'].includes(item.status)) continue;
      const key = executionId(item);
      if (this.executions.has(key)) {
        if (item.status !== 'replay-skipped') this.log('replay-skipped', item.request_id, 'Execution ID already recorded in this tab session', key);
        item.status = 'replay-skipped'; skipped++; continue;
      }
      const entry = { executionId: key, requestId: item.request_id, category: item.category, action: `Simulated dispatch to ${item.category} queue`, time: this.now() };
      this.executions.set(key, entry); item.status = 'processed'; processed++;
      this.log('simulated-dispatch', item.request_id, entry.action, key);
    }
    return { processed, skipped };
  }
  metrics() {
    return {
      input: this.inputRows,
      valid: this.items.filter(item => !item.blocked).length,
      invalid: this.invalidRows.length,
      duplicates: this.duplicateRows.length,
      review: this.items.filter(item => item.status === 'pending-review').length,
      executions: this.executions.size,
    };
  }
  resultsCSV() {
    return toCSV(['request_id', 'category', 'status', 'human_approved', 'reason', 'execution_id'], this.items.map(item => [item.request_id, item.category || '', item.status, item.approved, item.reason, this.executions.has(executionId(item)) ? executionId(item) : '']));
  }
  auditCSV() {
    const headers = ['eventId', 'time', 'event', 'requestId', 'detail', 'executionId'];
    return toCSV(headers, this.audit.map(entry => headers.map(key => entry[key])));
  }
}

export function toCSV(headers, rows) {
  const encode = value => {
    let text = String(value ?? '');
    // Prevent exported user content being interpreted as a spreadsheet formula.
    if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [headers, ...rows].map(row => row.map(encode).join(',')).join('\r\n');
}
