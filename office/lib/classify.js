'use strict';

// TYMCZASOWY STOPGAP: proste słowa kluczowe blokujące automatyczne tworzenie
// spraw P1/P2 z oczywistych newsletterów/spamu. Ma zostać zastąpiony pełnym
// modelem kwalifikacji (patrz qualify() poniżej), nie jest stanem docelowym.
const STOPGAP_SENDER_PATTERNS = [
  /newsletter\./i,
  /^no-?reply@/i,
  /mailer-daemon@/i,
  /messages-noreply@linkedin\.com$/i,
  /@mail\.apollo\.io$/i,
  /^support@apollo\.io$/i,
  /allegropay\.pl$/i,
];

const STOPGAP_TEXT_KEYWORDS = [
  'newsletter', 'unsubscribe', 'wypisz się', 'promocyjny', 'promotional',
  'marketing', 'kupon', 'rabat', 'zniżka', 'discount code', 'save your seat',
  'rsvp today', 'upgrade now', 'is popular in your network',
];

function isStopgapNewsletterOrSpam(thread) {
  const sender = (thread.sender || '').toLowerCase();
  const text = `${thread.subject || ''} ${thread.snippet || ''}`.toLowerCase();
  if (STOPGAP_SENDER_PATTERNS.some((rx) => rx.test(sender))) return true;
  if (STOPGAP_TEXT_KEYWORDS.some((kw) => text.includes(kw))) return true;
  return false;
}

// --- Pełny model kwalifikacji (sekcja B specyfikacji) ---------------------
// EMAIL_ONLY | INFORMATION | BUSINESS_SIGNAL | ACTION_REQUIRED |
// CASE_CANDIDATE | VERIFIED_CASE

const AUTOMATED_ALERT_PATTERNS = [
  { rx: /feigin mac guardian/i, source: 'mac_guardian' },
];

const TRANSACTIONAL_SENDER_PATTERNS = [
  /noreply@tm\.openai\.com$/i,
  /no-reply@frompersona\.com$/i,
  /@stripe\.com$/i,
];

const INTERNAL_DIGEST_PATTERNS = [/^daily feigin leads/i];

const URGENCY_KEYWORDS = [
  'pilne', 'urgent', 'critical', 'as soon as possible', 'asap',
  'overdue', 'outstanding invoice', 'reminder', 'herinnering',
];

const ACTION_ASK_KEYWORDS = [
  'proszę o', 'prośba o', 'please', 'kindly', 'any update', 'update wrt',
  'do jakiej daty', 'termin', 'kiedy', 'czy moglibyśmy',
];

const KNOWN_INTERNAL_DOMAINS = ['feiginelectric.com', 'feiginelectric.pl'];

function isInternalSender(address) {
  const a = (address || '').toLowerCase();
  return KNOWN_INTERNAL_DOMAINS.some((d) => a.endsWith('@' + d));
}

function containsAny(text, keywords) {
  const t = text.toLowerCase();
  return keywords.some((k) => t.includes(k));
}

/**
 * Klasyfikuje pojedynczy wątek e-mail wg modelu z sekcji B.
 * Zwraca { category, priority, owner, next_step, deadline_or_trigger,
 *          client_or_project, evidence, confidence, stopgap_blocked }
 */
function qualify(thread) {
  const text = `${thread.subject || ''} ${thread.snippet || ''}`;
  const senderIsAutomated = AUTOMATED_ALERT_PATTERNS.find((p) => p.rx.test(thread.subject || ''));
  const senderIsTransactional = TRANSACTIONAL_SENDER_PATTERNS.some((rx) => rx.test(thread.sender || ''));
  const senderIsInternalDigest = INTERNAL_DIGEST_PATTERNS.some((rx) => rx.test(thread.subject || ''));
  const stopgapBlocked = isStopgapNewsletterOrSpam(thread);

  const base = {
    thread_id: thread.thread_id,
    message_id: thread.message_id,
    subject: thread.subject,
    sender: thread.sender,
    date: thread.date,
    stopgap_blocked: stopgapBlocked,
  };

  if (stopgapBlocked) {
    return { ...base, category: 'EMAIL_ONLY', priority: null, owner: null,
      next_step: null, deadline_or_trigger: null, client_or_project: null,
      evidence: 'stopgap keyword/sender filter', confidence: 'high' };
  }

  if (senderIsAutomated) {
    return { ...base, category: 'INFORMATION', priority: null, owner: null,
      next_step: null, deadline_or_trigger: null, client_or_project: null,
      evidence: `automated system alert (${senderIsAutomated.source})`, confidence: 'high' };
  }

  if (senderIsTransactional) {
    return { ...base, category: 'INFORMATION', priority: null, owner: null,
      next_step: null, deadline_or_trigger: null, client_or_project: null,
      evidence: 'transactional/system sender', confidence: 'high' };
  }

  if (senderIsInternalDigest) {
    return { ...base, category: 'INFORMATION', priority: null, owner: null,
      next_step: null, deadline_or_trigger: null, client_or_project: null,
      evidence: 'internal digest, not a new signal', confidence: 'high' };
  }

  const outboundByUs = (thread.labels || []).includes('SENT') && isInternalSender(thread.sender);
  const fromExternalKnownContact = !isInternalSender(thread.sender) && !stopgapBlocked;
  const hasActionAsk = containsAny(text, ACTION_ASK_KEYWORDS);
  const hasUrgency = containsAny(text, URGENCY_KEYWORDS);
  const hasDeadlineWord = /do jakiej daty|termin|deadline|by \d|by end of/i.test(text);

  if (outboundByUs) {
    // Wysłaliśmy ofertę/propozycję — aktywna negocjacja, nie automatyczna sprawa.
    return { ...base, category: 'BUSINESS_SIGNAL', priority: null, owner: 'office@feiginelectric.com',
      next_step: 'awaiting client response', deadline_or_trigger: null,
      client_or_project: guessClientOrProject(thread), evidence: 'outbound proposal/negotiation email',
      confidence: 'medium' };
  }

  if (fromExternalKnownContact && (hasActionAsk || hasDeadlineWord)) {
    const owner = (thread.to || [])[0] || 'office@feiginelectric.com';
    const client = guessClientOrProject(thread);
    const hasAllFourCaseFields = Boolean(owner && client && (hasDeadlineWord || hasUrgency));
    const category = hasAllFourCaseFields ? 'VERIFIED_CASE' : 'CASE_CANDIDATE';
    return { ...base, category, priority: hasUrgency ? 'P1' : 'P2', owner,
      next_step: 'respond with concrete update/date', deadline_or_trigger: hasDeadlineWord ? 'explicit date requested' : (hasUrgency ? 'overdue / urgent' : null),
      client_or_project: client, evidence: 'external sender requesting action/deadline',
      confidence: hasAllFourCaseFields ? 'medium' : 'low' };
  }

  if (fromExternalKnownContact) {
    return { ...base, category: 'ACTION_REQUIRED', priority: 'P2', owner: 'office@feiginelectric.com',
      next_step: 'triage — inbound external message, no explicit deadline detected',
      deadline_or_trigger: null, client_or_project: guessClientOrProject(thread),
      evidence: 'external sender, no clear ask/deadline keywords', confidence: 'low' };
  }

  return { ...base, category: 'INFORMATION', priority: null, owner: null,
    next_step: null, deadline_or_trigger: null, client_or_project: null,
    evidence: 'default — no rule matched', confidence: 'low' };
}

function guessClientOrProject(thread) {
  const KNOWN = ['ZWiK Tczew', 'Burger King Spain', 'Nando\'s', 'DINO', 'Greenstrides', 'Wierzejki', 'Pol-Owoc', 'Sokpol'];
  const text = `${thread.subject || ''} ${thread.snippet || ''}`;
  const hit = KNOWN.find((k) => text.toLowerCase().includes(k.toLowerCase()));
  return hit || null;
}

module.exports = { qualify, isStopgapNewsletterOrSpam };
