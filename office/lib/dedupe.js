'use strict';

function normalizeSubject(subject) {
  return (subject || '')
    .toLowerCase()
    .replace(/^(re:|fwd:|odp:)\s*/i, '')
    .replace(/\(resent\)/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Klucze kandydackie do dopasowania duplikatu — zgodność na
 * KTÓRYMKOLWIEK z nich (message_id, thread_id, normalized subject,
 * case_id, source fingerprint) kwalifikuje wpis jako duplikat.
 */
function fingerprintKeys(item) {
  const keys = [];
  if (item.thread_id) keys.push(`thread:${item.thread_id}`);
  if (item.message_id) keys.push(`msg:${item.message_id}`);
  if (item.case_id) keys.push(`case:${item.case_id}`);
  const subj = normalizeSubject(item.subject);
  if (subj) keys.push(`subj:${subj}`);
  return keys;
}

/**
 * Deduplikacja wg message_id / thread_id / normalized subject / case_id /
 * source fingerprint (sekcja B). Dopasowanie na dowolnym z tych kluczy
 * kwalifikuje jako duplikat. Zachowuje pierwsze wystąpienie.
 */
function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const keys = fingerprintKeys(item);
    const isDuplicate = keys.some((k) => seen.has(k));
    if (isDuplicate) continue;
    keys.forEach((k) => seen.add(k));
    out.push(item);
  }
  return out;
}

module.exports = { dedupe, normalizeSubject, fingerprintKeys };
