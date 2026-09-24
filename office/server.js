'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');

const { computeCases } = require('./lib/canonical');

const app = express();
const PORT = process.env.OFFICE_PORT || 4000;

const gmailSnapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'gmail-snapshot.json'), 'utf8'));
const driveSnapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'drive-snapshot.json'), 'utf8'));

const AGENTS = [
  { id: 'lead-priority-agent', name: 'Lead Priority Agent', last_run: '2026-09-22T05:30:20Z', status: 'ok' },
  { id: 'stale-lead-followup-agent', name: 'Stale Lead Followup Agent', last_run: '2026-09-24T06:42:39Z', status: 'ok' },
  { id: 'client-meeting-prep-agent', name: 'Client Meeting Prep Agent', last_run: '2026-09-22T05:12:16Z', status: 'ok' },
  { id: 'energy-regulation-watch-agent', name: 'Energy Regulation Watch Agent', last_run: '2026-09-21T06:40:57Z', status: 'ok' },
  { id: 'pipeline-refresh-agent', name: 'Pipeline Refresh Agent', last_run: null, status: 'NOT_INSTRUMENTED' },
];

const NAV_SECTIONS = [
  { id: 'overview', label: 'Przegląd' },
  { id: 'ewa', label: 'EWA / Komunikacja' },
  { id: 'control-room', label: 'Control Room' },
  { id: 'control-intelligence', label: 'Control Intelligence' },
  { id: 'ems', label: 'EMS' },
  { id: 'knowledge-base', label: 'Baza Wiedzy' },
  { id: 'virtual-office', label: 'Virtual Office' },
];

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/nav', (_req, res) => res.json({ sections: NAV_SECTIONS }));

app.get('/api/canonical/cases', (_req, res) => {
  res.json(computeCases(gmailSnapshot.threads));
});

app.get('/api/overview', (_req, res) => {
  const c = computeCases(gmailSnapshot.threads);
  res.json({
    header_p1: c.P1_ACTIVE_count,
    priorities_today: c.P1_ACTIVE.slice(0, 5).map(toActionItem),
    pending_ceo_decisions: c.APPROVAL_PENDING.map(toActionItem),
    active_projects: c.cases.filter((x) => x.category === 'BUSINESS_SIGNAL' || x.category === 'CASE_CANDIDATE').map(toActionItem),
    kpi: {
      p1_active: c.P1_ACTIVE_count,
      approval_pending: c.APPROVAL_PENDING_count,
      ems: 'TELEMETRY_UNAVAILABLE',
    },
  });
});

app.get('/api/ewa', (_req, res) => {
  const qualified = gmailSnapshot.threads.map((t) => require('./lib/classify').qualify(t));
  res.json({
    messages: qualified.map((q) => ({
      thread_id: q.thread_id, subject: q.subject, sender: q.sender, date: q.date,
      category: q.category, stopgap_blocked: q.stopgap_blocked,
    })),
    drafts: [],
    auto_send_enabled: false,
  });
});

app.get('/api/control-room', (_req, res) => {
  res.json({
    system_health: 'DEGRADED',
    connectivity: { gmail: 'connected', google_drive: 'connected', ems_pipeline: 'UNKNOWN — see EMS section' },
    source_freshness: {
      gmail_snapshot_age_s: Math.round((Date.now() - new Date(gmailSnapshot.fetched_at)) / 1000),
      drive_snapshot_age_s: Math.round((Date.now() - new Date(driveSnapshot.fetched_at)) / 1000),
    },
    last_successful_sync: gmailSnapshot.fetched_at,
    jobs_schedulers: AGENTS.map((a) => ({ id: a.id, last_run: a.last_run, status: a.status })),
    incidents: [
      { id: 'INC-001', summary: 'EMS telemetry pipeline not diagnosed — no data source reachable from this environment', severity: 'P1' },
    ],
    restart_rollback_ready: false,
  });
});

app.get('/api/control-intelligence', (_req, res) => {
  const c = computeCases(gmailSnapshot.threads);
  res.json({
    header_p1: c.P1_ACTIVE_count,
    decisions: c.APPROVAL_PENDING.map(toActionItem),
    risks: [
      { summary: 'EMS telemetry unavailable — production cutover risk if launched on stale/fake data', confidence: 'high' },
    ],
    anomalies: [],
    conflicts: [],
  });
});

app.get('/api/ems', (_req, res) => {
  res.json({
    status: 'TELEMETRY_UNAVAILABLE',
    reason: 'No EMS connector, ingest worker, or PostgreSQL connection reachable from this environment (no OVH/SSH access). See CHECKPOINT report.',
    meters: [],
    registry_updated_at: null,
    last_measurement_at: null,
  });
});

app.get('/api/knowledge-base', (_req, res) => {
  res.json({
    source_connected: true,
    source_indexed: false,
    documents_indexed: driveSnapshot.files.filter((f) => f.kind === 'procedure_or_reference').length,
    semantic_search_ready: false,
    telemetry_available: false,
    approved_documents: driveSnapshot.files.filter((f) => f.kind === 'procedure_or_reference'),
    communication_materials: driveSnapshot.files.filter((f) => f.kind === 'agent_output_log'),
    procedure_usage_history: 'NOT_INSTRUMENTED',
  });
});

app.get('/api/virtual-office', (_req, res) => {
  res.json({ agents: AGENTS });
});

function toActionItem(q) {
  return {
    case_name: q.client_or_project || q.subject,
    meaning: q.subject,
    owner: q.owner,
    deadline: q.deadline_or_trigger,
    status: q.category,
    next_action: q.next_step,
    _audit: { thread_id: q.thread_id, message_id: q.message_id, evidence: q.evidence, confidence: q.confidence },
  };
}

if (require.main === module) {
  app.listen(PORT, () => console.log(JSON.stringify({ event: 'start', service: 'feigin-office-panel', port: PORT })));
}

module.exports = app;
