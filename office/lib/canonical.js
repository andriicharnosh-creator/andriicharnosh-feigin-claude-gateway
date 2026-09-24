'use strict';

const { qualify } = require('./classify');
const { dedupe } = require('./dedupe');

/**
 * Jedno, kanoniczne źródło prawdy dla P1_ACTIVE i APPROVAL_PENDING.
 * Header, Przegląd, Control Intelligence i Approval Queue MUSZĄ wołać
 * dokładnie tę funkcję — nigdy nie liczyć niezależnie.
 */
function computeCases(gmailThreads) {
  const deduped = dedupe(gmailThreads);
  const qualified = deduped.map(qualify);

  const cases = qualified.filter((q) => q.category === 'VERIFIED_CASE' || q.category === 'CASE_CANDIDATE');

  const P1_ACTIVE = qualified.filter((q) => q.category === 'VERIFIED_CASE' && q.priority === 'P1');
  const APPROVAL_PENDING = qualified.filter((q) => q.category === 'VERIFIED_CASE');

  return {
    all_qualified: qualified,
    cases,
    P1_ACTIVE,
    P1_ACTIVE_count: P1_ACTIVE.length,
    APPROVAL_PENDING,
    APPROVAL_PENDING_count: APPROVAL_PENDING.length,
    LEGACY_UNQUALIFIED_count: 0, // brak dostępu do starego modelu danych w tej sesji — patrz README
  };
}

module.exports = { computeCases };
