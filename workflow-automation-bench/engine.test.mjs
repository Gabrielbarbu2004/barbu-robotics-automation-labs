import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, readRequests, classifyRequest, Workbench, SAMPLE_CSV, executionId, toCSV } from './engine.mjs';

const header = 'request_id,customer,email,subject,description,priority\n';
const row = 'R-1,Avery,avery@example.com,Invoice,Please check my invoice.,normal';
const fixed = () => '2026-01-01T12:00:00.000Z';

test('CSV handles quoted commas, escaped quotes, multiline fields and CRLF', () => {
  const parsed = parseCSV('a,b,c\r\n"x,y","said ""hello""","first\r\nsecond"\r\nnext,last,\r\n');
  assert.deepEqual(parsed, [
    { cells: ['a', 'b', 'c'], line: 1 },
    { cells: ['x,y', 'said "hello"', 'first\nsecond'], line: 2 },
    { cells: ['next', 'last', ''], line: 4 },
  ]);
});

test('CSV refuses malformed quoting instead of silently corrupting fields', () => {
  assert.throws(() => parseCSV('a,b\n"unfinished'), /Unclosed quoted field/);
  assert.throws(() => parseCSV('a,b\nabc"def,z'), /Quote inside an unquoted field/);
  assert.throws(() => parseCSV('a,b\n"value"oops,z'), /Unexpected character after closing quote/);
});

test('CSV accepts BOM, case-insensitive headers, blank lines and optional priority', () => {
  const batch = readRequests('\uFEFFREQUEST_ID,Customer,email,subject,description\n\nR-1,Avery,avery@example.com,Invoice,Invoice copy\n');
  assert.equal(batch.items[0].priority, 'normal');
  assert.equal(batch.items[0].line, 3);
  assert.equal(batch.inputRows, 1);
});

test('CSV requires all expected columns and rejects repeated headers', () => {
  assert.throws(() => readRequests('request_id,subject\nR1,test'), /Missing columns/);
  assert.throws(() => readRequests('request_id,request_id\nR1,R1'), /Duplicate column headers/);
  assert.throws(() => readRequests(header), /at least one request/);
});

test('invalid email, empty fields, bad priority, bad IDs and wrong field counts are quarantined', () => {
  const batch = readRequests(header + [row,
    'R-2,Avery,invalid,Invoice,Copy,normal',
    'R-3,,avery@example.com,Invoice,Copy,normal',
    'R-4,Avery,avery@example.com,Invoice,Copy,extreme',
    'BAD ID,Avery,avery@example.com,Invoice,Copy,normal',
    'R-6,Avery,avery@example.com,Invoice,Copy,normal,extra',
  ].join('\n'));
  assert.equal(batch.items.length, 1);
  assert.equal(batch.invalidRows.length, 5);
  assert.match(batch.invalidRows[0].errors.join(), /email is invalid/);
  assert.match(batch.invalidRows[1].errors.join(), /customer is required/);
  assert.match(batch.invalidRows[2].errors.join(), /priority must/);
  assert.match(batch.invalidRows[3].errors.join(), /request_id must/);
  assert.match(batch.invalidRows[4].errors.join(), /Expected 6 fields/);
});

test('duplicate IDs are case-insensitive and an exact duplicate is skipped', () => {
  const batch = readRequests(header + row + '\n' + row.replace('R-1', 'r-1'));
  assert.equal(batch.items.length, 1);
  assert.equal(batch.duplicateRows.length, 1);
  assert.equal(batch.duplicateRows[0].conflict, false);
  assert.equal(batch.items[0].blocked, false);
});

test('an extra id column cannot override the stable request identity', () => {
  const batch = readRequests('request_id,customer,email,subject,description,id\nR-1,Avery,avery@example.com,Invoice,Copy,override');
  assert.equal(batch.items[0].id, 'request:r-1');
});

test('a conflicting duplicate blocks the original so no version is silently dispatched', () => {
  const bench = new Workbench({ now: fixed });
  bench.import(header + row + '\n' + row.replace('Please check my invoice.', 'Please refund my payment.'));
  bench.classify();
  assert.equal(bench.items[0].status, 'blocked');
  assert.equal(bench.metrics().valid, 0);
  assert.deepEqual(bench.process(), { processed: 0, skipped: 0 });
  assert.equal(bench.duplicateRows[0].conflict, true);
});

test('rules route one category and send ambiguous, unmatched or sensitive requests to review', () => {
  const classify = (subject, description = 'Please help', priority = 'normal') => classifyRequest({ subject, description, priority });
  assert.equal(classify('Invoice copy').category, 'billing');
  assert.equal(classify('Login problem').category, 'support');
  assert.equal(classify('Delivery date').category, 'operations');
  assert.equal(classify('Invoice and login').category, 'needs-review');
  assert.equal(classify('General question').category, 'needs-review');
  assert.equal(classify('Payment', 'Please help', 'urgent').category, 'needs-review');
  assert.equal(classify('Security and invoice').category, 'needs-review');
  assert.equal(classify('Invoice', 'Fraud concern').category, 'needs-review');
});

test('classification uses whole words rather than accidental substrings', () => {
  assert.equal(classifyRequest({ subject: 'discharge', description: 'accessory', priority: 'normal' }).category, 'needs-review');
});

test('human review cannot execute until an explicit valid route is approved', () => {
  const bench = new Workbench({ now: fixed });
  bench.import(header + row.replace('Invoice,Please check my invoice.', 'Question,Please help.'));
  bench.classify();
  assert.equal(bench.items[0].status, 'pending-review');
  assert.deepEqual(bench.process(), { processed: 0, skipped: 0 });
  assert.throws(() => bench.approve(bench.items[0].id, 'other'), /Choose billing/);
  bench.approve(bench.items[0].id, 'operations');
  assert.equal(bench.items[0].approved, true);
  assert.deepEqual(bench.process(), { processed: 1, skipped: 0 });
  assert.throws(() => bench.approve(bench.items[0].id, 'billing'), /Only pending/);
  assert.equal(bench.audit.filter(event => event.event === 'human-approved').length, 1);
});

test('processing is replay-safe within a batch and across reimport with changed ordering or route', () => {
  const bench = new Workbench({ now: fixed });
  const second = 'R-2,Sam,sam@example.com,Login issue,Please reset my password.,normal';
  bench.import(header + row + '\n' + second); bench.classify();
  const key = executionId(bench.items[0]);
  assert.deepEqual(bench.process(), { processed: 2, skipped: 0 });
  assert.deepEqual(bench.process(), { processed: 0, skipped: 2 });
  bench.import(header + second + '\n' + row.replace('Invoice,Please check my invoice.', 'Delivery,Please check my delivery.'));
  bench.classify();
  assert.equal(executionId(bench.items[1]), key);
  assert.deepEqual(bench.process(), { processed: 0, skipped: 2 });
  assert.equal(bench.executions.size, 2);
  assert.equal(bench.audit.filter(event => event.event === 'simulated-dispatch').length, 2);
});

test('failed import preserves existing validated batch and ledger', () => {
  const bench = new Workbench({ now: fixed }); bench.import(header + row); bench.classify(); bench.process();
  assert.throws(() => bench.import('bad,data'), /Missing columns/);
  assert.equal(bench.items[0].request_id, 'R-1');
  assert.equal(bench.executions.size, 1);
});

test('sample metrics are computed from input and audit has predictable trace records', () => {
  const bench = new Workbench({ now: fixed }); bench.import(SAMPLE_CSV); bench.classify();
  assert.deepEqual(bench.metrics(), { input: 8, valid: 6, invalid: 1, duplicates: 1, review: 3, executions: 0 });
  assert.deepEqual(bench.process(), { processed: 3, skipped: 0 });
  assert.equal(bench.metrics().executions, 3);
  assert.match(bench.auditCSV(), /validation-failed/);
  assert.match(bench.auditCSV(), /duplicate-detected/);
  assert.match(bench.auditCSV(), /rules-v1:dispatch:request:req-1001/);
  assert.equal(parseCSV(bench.resultsCSV()).length, 7);
});

test('CSV exports escape commas, quotes and multiline values and neutralize formula cells', () => {
  const csv = toCSV(['value'], [['comma, here'], ['say "hello"'], ['two\nlines'], ['=HYPERLINK("unsafe")'], ['  +SUM(1,2)']]);
  const records = parseCSV(csv);
  assert.equal(records[1].cells[0], 'comma, here');
  assert.equal(records[2].cells[0], 'say "hello"');
  assert.equal(records[3].cells[0], 'two\nlines');
  assert.equal(records[4].cells[0], '\'=HYPERLINK("unsafe")');
  assert.equal(records[5].cells[0], "'  +SUM(1,2)");
});
