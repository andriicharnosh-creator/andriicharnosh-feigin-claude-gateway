'use strict';

// Nawigacja: dokładnie jeden aktywny element. Sekcja F specyfikacji.
// - usuwamy 'active' ze WSZYSTKICH pozycji przed ustawieniem bieżącej
// - używamy dokładnego section ID (bez includes())
// - obsługujemy initial load, click, hashchange i popstate

let SECTIONS = [];

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

function currentSectionIdFromHash() {
  const raw = (location.hash || '').replace(/^#/, '');
  const known = SECTIONS.find((s) => s.id === raw);
  return known ? known.id : (SECTIONS[0] && SECTIONS[0].id);
}

function setActiveNav(sectionId) {
  const items = document.querySelectorAll('#nav [data-section-id]');
  items.forEach((el) => el.classList.remove('active'));
  const match = document.querySelector(`#nav [data-section-id="${cssEscape(sectionId)}"]`);
  if (match) match.classList.add('active');
  return document.querySelectorAll('#nav .active').length;
}

function cssEscape(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '');
}

function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  for (const s of SECTIONS) {
    const a = document.createElement('a');
    a.href = `#${s.id}`;
    a.textContent = s.label;
    a.dataset.sectionId = s.id;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (location.hash !== `#${s.id}`) {
        location.hash = s.id;
      } else {
        navigateTo(s.id);
      }
    });
    nav.appendChild(a);
  }
}

async function navigateTo(sectionId) {
  const count = setActiveNav(sectionId);
  if (count !== 1) {
    console.error('ACTIVE_NAV_ITEM_COUNT != 1:', count);
  }
  const content = document.getElementById('content');
  content.innerHTML = '<p>Ładowanie…</p>';
  try {
    const data = await fetchJSON(`/api/${sectionId}`);
    content.innerHTML = renderSection(sectionId, data);
  } catch (err) {
    content.innerHTML = `<p class="error">Błąd ładowania sekcji: ${escapeHtml(err.message)}</p>`;
  }
  await refreshHeaderKpi();
}

async function refreshHeaderKpi() {
  try {
    const c = await fetchJSON('/api/canonical/cases');
    document.getElementById('header-p1').textContent = c.P1_ACTIVE_count;
    document.getElementById('header-approval').textContent = c.APPROVAL_PENDING_count;
  } catch (err) {
    console.error('KPI refresh failed', err);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderSection(id, data) {
  return `<h2>${escapeHtml(SECTIONS.find((s) => s.id === id)?.label || id)}</h2><pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
}

async function boot() {
  const navData = await fetchJSON('/api/nav');
  SECTIONS = navData.sections;
  renderNav();

  window.addEventListener('hashchange', () => navigateTo(currentSectionIdFromHash()));
  window.addEventListener('popstate', () => navigateTo(currentSectionIdFromHash()));

  if (!location.hash) location.hash = SECTIONS[0].id;
  await navigateTo(currentSectionIdFromHash());
}

boot().catch((err) => {
  document.getElementById('content').innerHTML = `<p class="error">Boot error: ${escapeHtml(err.message)}</p>`;
});
