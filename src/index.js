/**
 * Feigin Electric — Claude API Gateway v1.0.0
 * Deploy: Railway → feigin-claude-gateway
 * ENV: ANTHROPIC_API_KEY, GATEWAY_AUTH_KEY
 */

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

const app  = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-gateway-key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

const FEIGIN_SYSTEM = `You are Claude, an AI assistant integrated into the Feigin Electric operational system.

## FEIGIN ELECTRIC
Company: FEIGIN ELECTRIC SP. Z O.O. | NIP: 9512603226
ul. Bekasow 74, 02-803 Warszawa | office@feiginelectric.com
CEO: Andrew Charnosh, Vice Prezes Zarzadu

## Core Doctrine
Measure → Understand → Decide → Optimise → Verify.
Never promise guaranteed % savings without PRE/POST EMS measurement.
Facts separated from interpretations and hypotheses.

## Business
- ECOD Smart Optimizer (voltage optimisation, power quality)
- EMS: 722 meters, 120 clients, 120 projects (Railway live API)
- Zabka pilot: 3 stores (Z9022/Z8027/Z7448), ECOD ML-35-50, Normal
- Warehouse: 122 free ECOD, 63 sold | PZU LAB Cert Nr 1/EP/2025 → 30.10.2027

## ICP Lead Scoring
High-value: refrigeration, frozen food, cold chain, poultry, meat, dairy, mushrooms, bakery
PV >= 50kW +25 | kWh >= 50k/mth +30 | >= 100 employees +15
>= 70 GO | 45-69 MEASURE | 25-44 WATCH | <25 SKIP
HUMAN_REVIEW required before contact. No automated calls.

## EMS Alarms SOP v1.0
Overvoltage Critical: Umax >= 260V/15min → UR+OSD immediate
Overvoltage Major: Umax >= 250V/15min → OSD
Low PF Major: cosf < 0.85/30min → analysis
Confirmed Load Step: kW + I spike → most reliable signal

## Jan Karaszewski Gate
Consult before: strategic contracts, investments >50k PLN, Energy SA decisions.

## Guardrails
No tokens in frontend | No private data in public HTML
automatic_control = false | No guaranteed % savings without measurement

## Email Policy
OSINT/Scout leads GO → auto-send | Client/partner/contract → Andrew approval required

## Brand: FEIGIN red #cc0000 | ELECTRIC green #3aaa35 | .tech purple #8b5cf6

## Systems
Railway: feigin-claude-gateway, feigin-mcp-server, feigin-mission-control-api
Drive: FEIGIN_SHARED_STATE.json | office.feiginelectric.tech | ems.feiginelectric.tech

## Response Format
Always: facts → conclusions → plan → risks → leverage.
Case IDs: FE-CASE-YYYYMMDD-NNN. Save outputs to Drive.`;

function auth(req, res, next) {
  if (!process.env.GATEWAY_AUTH_KEY) return next();
  const key = req.headers['x-gateway-key'] || (req.headers['authorization'] || '').replace('Bearer ', '');
  if (key !== process.env.GATEWAY_AUTH_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function log(caller, inputLen, outputLen, ms) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), caller, inputLen, outputLen, ms }));
}

app.get('/health', (_, res) => res.json({
  status: 'ok', service: 'feigin-claude-gateway', version: '1.0.0', model: MODEL,
  endpoints: ['/health', '/context', '/claude', '/claude/stream', '/openai', '/google', '/feigin'],
  ts: new Date().toISOString()
}));

app.get('/context', auth, (_, res) => res.json({
  model: MODEL, company: 'Feigin Electric Sp. z o.o.',
  shared_state: 'Drive: FEIGIN_SHARED_STATE.json (Feigin Claude Outputs 2026-07)',
  mcp_server: 'https://feigin-mcp-server-production.up.railway.app/mcp'
}));

// POST /claude — główny endpoint
app.post('/claude', auth, async (req, res) => {
  const { message, system, history = [], max_tokens = 2048, caller = 'unknown', json_response = false } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  const t0 = Date.now();
  try {
    let sys = FEIGIN_SYSTEM;
    if (system) sys += `\n\n## Context from ${caller}:\n${system}`;
    if (json_response) sys += '\n\nRespond ONLY with valid JSON. No preamble.';
    const messages = [...history.map(h => ({ role: h.role, content: h.content })), { role: 'user', content: message }];
    const resp = await anthropic.messages.create({ model: MODEL, max_tokens, system: sys, messages });
    const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    log(caller, message.length, text.length, Date.now() - t0);
    if (json_response) { try { return res.json({ response: JSON.parse(text.replace(/```json|```/g,'').trim()), model: MODEL, tokens: resp.usage, ts: new Date().toISOString() }); } catch {} }
    res.json({ response: text, model: MODEL, tokens: { input: resp.usage.input_tokens, output: resp.usage.output_tokens }, duration_ms: Date.now() - t0, ts: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /claude/stream — SSE streaming
app.post('/claude/stream', auth, async (req, res) => {
  const { message, system, history = [], max_tokens = 2048, caller = 'unknown' } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  try {
    let sys = FEIGIN_SYSTEM;
    if (system) sys += `\n\n## Context:\n${system}`;
    const messages = [...history.map(h => ({ role: h.role, content: h.content })), { role: 'user', content: message }];
    const stream = anthropic.messages.stream({ model: MODEL, max_tokens, system: sys, messages });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) res.write(`data: ${JSON.stringify({ delta: event.delta.text })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) { res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); }
});

// POST /openai — kompatybilny z OpenAI API (dla ChatGPT Actions)
app.post('/openai', auth, async (req, res) => {
  const { messages = [], max_tokens = 2048 } = req.body;
  if (!messages.length) return res.status(400).json({ error: 'messages required' });
  const t0 = Date.now();
  try {
    let sys = FEIGIN_SYSTEM;
    const chat = [];
    for (const m of messages) {
      if (m.role === 'system') { sys += `\n\n## ChatGPT context:\n${m.content}`; }
      else chat.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
    }
    if (!chat.length) chat.push({ role: 'user', content: 'Hello' });
    const resp = await anthropic.messages.create({ model: MODEL, max_tokens, system: sys, messages: chat });
    const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    log('chatgpt', JSON.stringify(messages).length, text.length, Date.now() - t0);
    res.json({
      id: `chatcmpl-feigin-${Date.now()}`, object: 'chat.completion',
      created: Math.floor(Date.now() / 1000), model: 'claude-sonnet-4-6',
      choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: resp.usage.input_tokens, completion_tokens: resp.usage.output_tokens, total_tokens: resp.usage.input_tokens + resp.usage.output_tokens }
    });
  } catch (err) { res.status(500).json({ error: { message: err.message, type: 'api_error' } }); }
});

// POST /google — kompatybilny z Google Gemini API (dla Gemini Extensions)
app.post('/google', auth, async (req, res) => {
  const { contents = [], generationConfig = {} } = req.body;
  if (!contents.length) return res.status(400).json({ error: 'contents required' });
  const t0 = Date.now();
  try {
    const max_tokens = generationConfig.maxOutputTokens || 2048;
    const messages = contents.map(c => ({ role: c.role === 'model' ? 'assistant' : 'user', content: (c.parts||[]).map(p=>p.text||'').join('') })).filter(m=>m.content);
    const resp = await anthropic.messages.create({ model: MODEL, max_tokens, system: FEIGIN_SYSTEM, messages });
    const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    log('gemini', JSON.stringify(contents).length, text.length, Date.now() - t0);
    res.json({
      candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
      usageMetadata: { promptTokenCount: resp.usage.input_tokens, candidatesTokenCount: resp.usage.output_tokens, totalTokenCount: resp.usage.input_tokens + resp.usage.output_tokens }
    });
  } catch (err) { res.status(500).json({ error: { code: 500, message: err.message, status: 'INTERNAL' } }); }
});

// POST /feigin — najprostszy unified endpoint
app.post('/feigin', auth, async (req, res) => {
  const { q, caller = 'unknown', json = false } = req.body;
  if (!q) return res.status(400).json({ error: 'q required' });
  const t0 = Date.now();
  try {
    let sys = FEIGIN_SYSTEM;
    if (json) sys += '\n\nRespond ONLY with valid JSON.';
    const resp = await anthropic.messages.create({ model: MODEL, max_tokens: 2048, system: sys, messages: [{ role: 'user', content: q }] });
    const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
    log(caller, q.length, text.length, Date.now() - t0);
    if (json) { try { return res.json({ answer: JSON.parse(text.replace(/```json|```/g,'').trim()), caller, ts: new Date().toISOString() }); } catch {} }
    res.json({ answer: text, caller, tokens: resp.usage, ts: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'start', port: PORT, service: 'feigin-claude-gateway', model: MODEL })));
