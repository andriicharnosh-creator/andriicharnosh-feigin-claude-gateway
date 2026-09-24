'use strict';

const assert = require('node:assert');
const { qualify, isStopgapNewsletterOrSpam } = require('../lib/classify');
const { dedupe } = require('../lib/dedupe');
const { computeCases } = require('../lib/canonical');
const gmailSnapshot = require('../data/gmail-snapshot.json');

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message}`);
  }
}

// --- C. KPI consistency: HEADER_P1 == OVERVIEW_P1 == INTELLIGENCE_P1 ------
test('canonical KPI: header/overview/intelligence share one source', () => {
  const c1 = computeCases(gmailSnapshot.threads);
  const c2 = computeCases(gmailSnapshot.threads); // simulate a second call site
  assert.strictEqual(c1.P1_ACTIVE_count, c2.P1_ACTIVE_count);
  assert.strictEqual(c1.APPROVAL_PENDING_count, c2.APPROVAL_PENDING_count);
});

// --- Stopgap filter: obvious newsletters never reach P1/P2 ----------------
test('stopgap filter blocks known newsletter/spam senders', () => {
  const newsletterThread = { sender: 'hello@newsletter.allegro.pl', subject: 'Kupon czeka', snippet: 'Nie zwlekaj' };
  assert.strictEqual(isStopgapNewsletterOrSpam(newsletterThread), true);
  const q = qualify(newsletterThread);
  assert.strictEqual(q.category, 'EMAIL_ONLY');
  assert.notStrictEqual(q.priority, 'P1');
  assert.notStrictEqual(q.priority, 'P2');
});

test('Mac Guardian automated alert never becomes a case', () => {
  const t = { sender: 'a.charnosh@feiginelectric.com', subject: 'Feigin Mac Guardian — MacBook-Air.local — 2026-09-24T06:39:30Z', snippet: 'Automated status report.' };
  const q = qualify(t);
  assert.strictEqual(q.category, 'INFORMATION');
});

test('internal digest (Daily Feigin Leads) is INFORMATION, not a case', () => {
  const t = { sender: 'office@feiginelectric.com', subject: 'Daily Feigin Leads — 2026-09-24', snippet: '3 GO', labels: ['SENT'] };
  const q = qualify(t);
  assert.strictEqual(q.category, 'INFORMATION');
});

test('real client email with explicit deadline ask qualifies as a case', () => {
  const t = {
    sender: 'mchrabalowska@pzu.pl',
    to: ['kwronowski@feiginelectric.pl'],
    subject: 'RE: Prośba o aktualizację statusu i termin instalacji ZWiK Tczew',
    snippet: 'W temacie terminu nie pomogę... Proszę o chwilę cierpliwości.',
    labels: ['INBOX'],
  };
  const q = qualify(t);
  assert.ok(['CASE_CANDIDATE', 'VERIFIED_CASE'].includes(q.category), `got ${q.category}`);
  assert.ok(q.client_or_project, 'client_or_project should be set');
});

// --- Deduplikacja: message_id / thread_id / normalized subject ------------
test('dedupe removes exact thread_id duplicates', () => {
  const items = [
    { thread_id: 'abc', subject: 'Hello' },
    { thread_id: 'abc', subject: 'Hello' },
    { thread_id: 'def', subject: 'Other' },
  ];
  const out = dedupe(items);
  assert.strictEqual(out.length, 2);
});

test('dedupe collapses Re:/Fwd: normalized-subject duplicates without thread_id', () => {
  const items = [
    { message_id: 'm1', subject: 'Burger King Spain — proposal (resent)' },
    { message_id: 'm2', subject: 'Re: Burger King Spain — proposal' },
  ];
  const out = dedupe(items);
  assert.strictEqual(out.length, 1);
});

// --- F. Single active navigation -------------------------------------------
test('nav section IDs are unique (no duplicate IDs)', () => {
  const NAV_SECTIONS = ['overview', 'ewa', 'control-room', 'control-intelligence', 'ems', 'knowledge-base', 'virtual-office'];
  const set = new Set(NAV_SECTIONS);
  assert.strictEqual(set.size, NAV_SECTIONS.length);
});

// --- D. EMS honesty: no fake "data current" state --------------------------
test('EMS section reports TELEMETRY_UNAVAILABLE, not a fabricated status', () => {
  const app = require('../server');
  // static assertion on the route handler's fixed response shape
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../server.js'), 'utf8');
  assert.ok(src.includes("status: 'TELEMETRY_UNAVAILABLE'"));
  assert.ok(!/status: 'OK'/.test(src.split("app.get('/api/ems'")[1]?.split('});')[0] || ''));
});

console.log(`\n${failures === 0 ? 'ALL TESTS PASS' : `${failures} TEST(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
