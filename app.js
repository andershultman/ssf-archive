/* SSF Scenario Archive — shared logic (used by index.html and embed.html)
   Data: scenarios.json in the same folder. No dependencies. */
(() => {
'use strict';

const FEATHER = 'https://scenariofestival.se/wp-content/uploads/2017/06/fjacc88der.jpg';
const $ = id => document.getElementById(id);
const FILTER_IDS = ['filter-year', 'filter-duration', 'filter-players', 'filter-format'];

let DATA = [];

// ── helpers ──────────────────────────────────────────────────────────────────
const safeUrl = u => { if (!u || !String(u).trim()) return ''; try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const svg = path => { const t = document.createElement('template'); t.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${path}</svg>`; return t.content.firstChild; };
const ICON = {
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  people: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
};
const years = s => (s.years && s.years.length ? s.years : [s.year]);
const sortKey = s => s.sort_title || s.title;   // sort_title lets us pin a title (e.g. "~" sorts last)

// Highlight search words with <mark>, building DOM nodes (never innerHTML, so data can't inject markup).
function setText(node, text, words) {
  text = text || '';
  if (!words.length) { node.textContent = text; return node; }
  const re = new RegExp('(' + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  text.split(re).forEach((part, i) => {
    if (i % 2) node.appendChild(el('mark', '', part)); else if (part) node.appendChild(document.createTextNode(part));
  });
  return node;
}

// ── filters ──────────────────────────────────────────────────────────────────
function matchQ(s, words) {
  if (!words.length) return true;
  const hay = [s.title, s.authors, s.format, ...(s.tags || []), s.description].join(' ').toLowerCase();
  return words.every(w => hay.includes(w));
}
function matchDur(s, d) {
  if (!d) return true;
  const raw = s.duration || '';
  let n = parseFloat((raw.match(/\d+(?:[.,]\d+)?/) || [0])[0].toString().replace(',', '.'));
  if (!n) return false;
  if (/min/i.test(raw)) n /= 60;
  return d === '4+' ? n >= 4 : Math.round(n) === parseInt(d, 10);
}
function matchPl(s, b) {
  if (!b) return true;
  const nums = (s.players || '').replace(/\s/g, '').match(/\d+/g);
  if (!nums) return false;
  const lo = parseInt(nums[0], 10), hi = nums[1] ? parseInt(nums[1], 10) : lo;
  switch (b) {
    case '1':    return lo === 1 && hi === 1;
    case '2-3':  return lo <= 3 && hi >= 2;
    case '4-5':  return lo <= 5 && hi >= 4;
    case '6-10': return lo <= 10 && hi >= 6;
    case '11+':  return hi >= 11;
    default:     return true;
  }
}

function state() {
  return {
    words: $('search').value.trim().toLowerCase().split(/\s+/).filter(Boolean),
    year: $('filter-year').value, dur: $('filter-duration').value,
    pl: $('filter-players').value, fmt: $('filter-format').value, sort: $('sort').value,
    dl: $('filter-download').checked,
  };
}

function apply() {
  const st = state();
  const out = DATA.filter(s =>
    matchQ(s, st.words) &&
    (!st.year || years(s).map(String).includes(st.year)) &&
    matchDur(s, st.dur) && matchPl(s, st.pl) &&
    (!st.fmt || s.format === st.fmt) &&
    (!st.dl || !!safeUrl(s.download)));
  // Titles starting with a letter first; digits/symbols (e.g. "10% More Unique") sort after Z.
  const rank = s => (/^\p{L}/u.test(sortKey(s).trim()) ? 0 : 1);
  const byTitle = (a, b) => rank(a) - rank(b) || sortKey(a).localeCompare(sortKey(b), 'en', { sensitivity: 'base' });
  if (st.sort === 'year-asc') out.sort((a, b) => a.year - b.year || byTitle(a, b));
  else if (st.sort === 'title') out.sort(byTitle);
  else out.sort((a, b) => b.year - a.year || byTitle(a, b));
  $('result-count').textContent = out.length;
  render(out, st.words);
}

// ── render ───────────────────────────────────────────────────────────────────
function card(s, words) {
  const art = el('article', 'card');

  const wrap = el('div', 'card-img-wrap');
  const img = el('img');
  img.alt = ''; img.loading = 'lazy';
  const src = safeUrl(s.image);
  if (src) img.src = src; else { img.src = FEATHER; img.className = 'placeholder'; }
  img.addEventListener('error', () => { if (img.src !== FEATHER) { img.src = FEATHER; img.className = 'placeholder'; } });
  wrap.append(img, el('span', 'year-badge', years(s).join(' · ')));

  const body = el('div', 'card-body');
  const h = el('h3', 'card-title');
  const a = el('a', 'card-link');
  const href = safeUrl(s.url);
  if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener'; }
  setText(a, s.title, words);
  h.appendChild(a);
  body.appendChild(h);

  if (s.authors) body.appendChild(setText(el('div', 'card-authors'), s.authors, words));
  if (s.tags && s.tags.length) {
    const tags = el('div', 'tags');
    s.tags.forEach(t => { const b = el('button', 'tag'); b.type = 'button'; b.dataset.tag = t; b.title = 'Search for "' + t + '"'; setText(b, t, words); tags.appendChild(b); });
    body.appendChild(tags);
  }
  if (s.description) body.appendChild(setText(el('div', 'card-desc'), s.description, words));

  const foot = el('div', 'card-footer');
  if (s.duration) { const m = el('span', 'meta-item'); m.append(svg(ICON.clock), setText(el('span'), s.duration, words)); foot.appendChild(m); }
  if (s.players)  { const m = el('span', 'meta-item'); m.append(svg(ICON.people), setText(el('span'), s.players, words)); foot.appendChild(m); }
  if (s.format)   foot.appendChild(setText(el('span', 'fmt-badge'), s.format, words));
  if (safeUrl(s.download)) { const d = el('span', 'dl-btn'); d.append(svg(ICON.download), 'Download'); foot.appendChild(d); }
  body.appendChild(foot);

  art.append(wrap, body);
  return art;
}

function render(list, words) {
  const grid = $('grid');
  const frag = document.createDocumentFragment();
  if (!list.length) {
    const m = el('div', 'message'); m.append(el('h3', '', 'No scenarios found'), el('p', '', 'Try different keywords or remove a filter.'));
    frag.appendChild(m);
  } else list.forEach(s => frag.appendChild(card(s, words)));
  grid.replaceChildren(frag);
}

// ── init ─────────────────────────────────────────────────────────────────────
function populateFilters() {
  const add = (id, opts) => opts.forEach(([l, v]) => $(id).append(new Option(l, v)));
  const ys = [...new Set(DATA.flatMap(years).filter(Boolean))].sort((a, b) => b - a);
  add('filter-year', ys.map(y => [y, y]));
  add('filter-duration', [['1 hour', '1'], ['2 hours', '2'], ['3 hours', '3'], ['4+ hours', '4+']]);
  add('filter-players', [['Solo (1)', '1'], ['2–3 players', '2-3'], ['4–5 players', '4-5'], ['6–10 players', '6-10'], ['11+ players', '11+']]);
  add('filter-format', [...new Set(DATA.map(s => s.format).filter(Boolean))].sort().map(f => [f, f]));
  $('total-count').textContent = DATA.length;
  document.querySelectorAll('[data-year-range]').forEach(n => { n.textContent = ys.length ? `${ys[ys.length - 1]} to ${ys[0]}` : ''; });
}

function clearAll() {
  $('search').value = '';
  FILTER_IDS.forEach(id => { $(id).value = ''; });
  $('sort').value = 'year-desc';
  $('filter-download').checked = false;
  apply();
}

function showError() {
  const m = el('div', 'message');
  const b = el('button', 'clear-btn', 'Try again'); b.type = 'button'; b.addEventListener('click', load);
  m.append(el('h3', '', 'Could not load the archive'), el('p', '', 'Please check your connection and try again.'), b);
  $('grid').replaceChildren(m);
}

async function load() {
  try {
    const r = await fetch('scenarios.json', { cache: 'no-cache' });   // revalidates, so updates show up at once
    if (!r.ok) throw new Error(r.status);
    DATA = (await r.json()).filter(s => s && s.title);
  } catch { showError(); return; }
  FILTER_IDS.forEach(id => { $(id).length = 1; });
  populateFilters();
  apply();
}

function bind() {
  $('search').addEventListener('input', debounce(apply, 180));
  [...FILTER_IDS, 'sort', 'filter-download'].forEach(id => $(id).addEventListener('change', apply));
  $('clear').addEventListener('click', clearAll);
  $('grid').addEventListener('click', e => {
    const b = e.target.closest('.tag');
    if (!b) return;
    $('search').value = b.dataset.tag;
    apply();
    $('search').focus({ preventScroll: true });
    parent.postMessage({ type: 'ssf-scroll-top' }, '*');   // optional: parent page may scroll to the iframe top
  });
}

// ── auto-resize when embedded in an iframe ──────────────────────────────────
function autoResize() {
  if (window.parent === window) return;
  const wrap = $('embed-wrap');
  let last = 0;
  const send = () => {
    const h = Math.ceil(wrap.getBoundingClientRect().height) + 20;
    if (h !== last) { last = h; parent.postMessage({ type: 'ssf-height', height: h }, '*'); }
  };
  new ResizeObserver(send).observe(wrap);   // fires on render, image/font load, window resize
  send();
}

bind();
load();
autoResize();
})();
