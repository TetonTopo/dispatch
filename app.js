// Dispatch: your three most recent Claude threads (Co-work or Claude Code) and a new-chat corner, in landscape.
// Tap a card to open the whole thread. Hold a card to talk: it lights up, and when you let go your words are sent.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stage = $('#stage');
const grid = $('#grid');
const view = $('#thread');
const SLOTS = 3;
const POLL = 4000;
const HOLD_MS = 350;
const SEND_DELAY = 1800;

// The 2×2 always reads landscape; when the phone turns, CSS flips the stage, and it fades back in instead of jumping.
// Full-screen pages (a thread, the list) are "free": they follow the phone, so portrait works there.
const root = document.documentElement;
const upright = matchMedia('(orientation: portrait)');
function turn() {
  stage.classList.add('turning');
  clearTimeout(turn.t);
  turn.t = setTimeout(() => stage.classList.remove('turning'), 60); // a timer, not rAF: it always fires
}
// ?embed=monodesk: Dispatch inside Monodesk's Home panel. No turning, hover Open buttons, and Monodesk can start chats here.
const EMBED = new URLSearchParams(location.search).get('embed') === 'monodesk';
if (EMBED) root.classList.add('free', 'embed');
const toMonodesk = (msg) => { if (EMBED) parent.postMessage({ from: 'dispatch', ...msg }, '*'); };
function setFree(on) {
  if (EMBED || root.classList.contains('free') === on) return;
  if (upright.matches) turn();
  root.classList.toggle('free', on);
}
upright.addEventListener('change', () => { if (!root.classList.contains('free')) turn(); });

const ICON = {
  cowork: '<svg class="k" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>',
  code: '<svg class="k code" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-5-6-5M12 19h8"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  speak: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
  voice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
};

/* ---------- API ---------- */
// ?demo shows made-up threads, for trying the layout without Claude.
const DEMO = new URLSearchParams(location.search).has('demo') && [
  { key: 'cowork:a', kind: 'cowork', title: 'Trailer pivot deck notes', updated: Date.now() - 120e3, busy: true, messages: [{ role: 'assistant', text: 'Here is a tighter version of slide 4. It leads with the trailer and keeps one idea per line.\n\n- **One line** per idea\n- Lead with the trailer' }, { role: 'user', text: 'Great, apply it to slides 5 and 6 too.' }] },
  { key: 'code:b', kind: 'code', title: 'monodesk: phone bridge', updated: Date.now() - 900e3, busy: false, messages: [{ role: 'user', text: 'Add a /api/threads endpoint' }, { role: 'assistant', text: 'Done, it lives in `bridge.js` and returns the four newest threads. I also added a demo mode.\n\n```js\nserver.listen(47800)\n```' }] },
  { key: 'cowork:c', kind: 'cowork', title: 'Inbox triage', updated: Date.now() - 4e6, busy: false, messages: [{ role: 'assistant', text: 'Three emails need you today! First, Sam wants to confirm Thursday.' }] },
];
const DEMO_OLD = DEMO && ['Character reference letter', 'Notion hours table cleanup', 'Trailer budget v3', 'Squamish rental search', 'Fix the WhatsApp pin', 'Gmail filters'].map((title, i) => ({ key: (i % 3 ? 'cowork:o' : 'code:o') + i, kind: i % 3 ? 'cowork' : 'code', title, updated: Date.now() - (i + 2) * 864e5, busy: false, messages: [{ role: 'user', text: 'Can you help with ' + title.toLowerCase() + '?' }, { role: 'assistant', text: 'Sure. Here is where I would start.' }] }));
async function api(path, body) {
  if (DEMO) {
    if (path === '/api/new') return { key: 'cowork:a' };
    if (body) return { ok: true };
    if (path.startsWith('/api/history')) return { threads: [...DEMO, ...DEMO_OLD] };
    if (path.startsWith('/api/threads/')) return [...DEMO, ...DEMO_OLD].find((t) => t.key === decodeURIComponent(path.slice(13)));
    return path.startsWith('/api/environments') ? { envs: [{ id: 'env_a', label: 'project', where: 'My PC · C:\\Users\\me\\project' }, { id: 'env_b', label: 'Default', where: 'Anthropic cloud' }] } : { threads: DEMO };
  }
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Monodesk': '1' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Monodesk didn’t answer');
  return j;
}

/* ---------- text ---------- */
// Light markdown: escape first, then a few safe patterns.
function md(src) {
  return String(src || '').split(/```/).map((part, i) => {
    if (i % 2) return `<pre><code>${esc(part.replace(/^[^\n]*\n/, ''))}</code></pre>`;
    return part.trim().split(/\n{2,}/).map((p) => {
      const inline = (s) => esc(s)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
        .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      const lines = p.split('\n');
      if (lines.every((l) => /^\s*[-*•]\s/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s/, ''))}</li>`).join('')}</ul>`;
      if (lines.every((l) => /^\s*\d+[.)]\s/.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s/, ''))}</li>`).join('')}</ol>`;
      const h = /^(#{1,3})\s+(.*)$/.exec(p);
      if (h && lines.length === 1) return `<h3>${inline(h[2])}</h3>`;
      return p ? `<p>${lines.map(inline).join('<br>')}</p>` : '';
    }).join('');
  }).join('');
}

// The first sentence, as plain text.
function firstSentence(text) {
  const plain = String(text || '')
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/^\s*(#{1,6}|>|[-*•]|\d+[.)])\s+/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  const m = /^(.{1,240}?[.!?])(\s|$)/.exec(plain);
  if (m) return m[1];
  return plain.length > 180 ? plain.slice(0, 180).replace(/\s\S*$/, '') + '…' : plain;
}

// The card's one line from Claude's reply: what's needed from you next.
// Claude ends with the next step, so look in the last two paragraphs for a sentence aimed at you
// ("Let me know…", "Want me to…", "…if you want", a question); otherwise the last real sentence.
const ASK = /\?$|^(let me know|tell me|once you|when you|if you|want me|should i|shall i|do you|can you|could you|would you|say the word|reply|pick|choose|send me|paste|check|try|open|sign in|run)\b|\b(if you want|if you'd like|your call|needs? (you|your)|your ok|confirm|up to you|let me know)\b/i;
function sentences(par) {
  const plain = par
    .replace(/^\s*(#{1,6}|>|[-*•]|\d+[.)])\s+/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  // Split after . ! ? only when a new sentence starts, so "config.js" or "v0.2.0" stay whole.
  return plain.split(/(?<=[.!?])\s+(?=["“(\[A-Z0-9])/).map((s) => s.trim()).filter(Boolean);
}
function preview(text) {
  const pars = String(text || '')
    .replace(/```[\s\S]*?(```|$)/g, '\n\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !/^\|/.test(p) && !/^#{1,6}\s/.test(p));
  const tail = pars.slice(-2).flatMap(sentences);
  const real = (s) => !/:$/.test(s) && s.split(/\s+/).length >= 5;
  const pick = [...tail].reverse().find((s) => real(s) && ASK.test(s))
    || [...sentences(pars.at(-1) || '')].reverse().find(real)
    || firstSentence(text);
  return pick.length > 220 ? pick.slice(0, 220).replace(/\s\S*$/, '') + '…' : pick;
}
// "Search Notion" → "Search Notion…"
const working = (t) => esc(String(t.status || 'Claude is working').replace(/[.…\s]+$/, '')) + '…';

const ago = (t) => {
  const s = (Date.now() - t) / 1000;
  if (!t || s < 0) return '';
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
};
const status = (t) => (t.busy ? '<span class="dots"><i></i><i></i><i></i></span>' : `<span class="w">${ago(t.updated)}</span>`);

/* ---------- the grid: three thread corners; the fourth is half new chat, half the list of all threads ---------- */
const slots = Array(SLOTS).fill(null); // thread keys
const cards = [];
let threads = new Map();
let held = null; // slot index while talking or about to send

for (let i = 0; i < SLOTS; i++) {
  const c = document.createElement('section');
  c.className = 'card empty';
  grid.appendChild(c);
  cards.push(c);
  wireCard(c, i);
}
const newCard = document.createElement('section');
newCard.className = 'card new';
newCard.innerHTML = `<button class="half" data-new><div class="plus">+</div><span>New chat</span></button>
  <button class="half" data-all><div class="plus">${ICON.list}</div><span>All threads</span></button>`;
$('[data-new]', newCard).addEventListener('click', pickKind);
$('[data-all]', newCard).addEventListener('click', () => openList());
grid.appendChild(newCard);

function placeThreads(list) {
  threads = new Map(list.map((t) => [t.key, t]));
  const keys = list.slice(0, SLOTS).map((t) => t.key);
  const arriving = keys.filter((k) => !slots.includes(k));
  for (let i = 0; i < SLOTS; i++) {
    if (slots[i] && keys.includes(slots[i])) { drawCard(i); continue; }
    if (held === i) continue; // never swap a card out from under your thumb
    const incoming = arriving.shift() || null;
    if (incoming === slots[i]) { drawCard(i); continue; }
    swap(i, incoming);
  }
  if (openKey) drawThread();
}

function swap(i, key) {
  const c = cards[i];
  const had = !!slots[i];
  slots[i] = key;
  if (!had) { drawCard(i); return; }
  c.classList.add('out');
  setTimeout(() => { drawCard(i); setTimeout(() => c.classList.remove('out'), 30); }, 350);
}

function drawCard(i) {
  const c = cards[i];
  if (held === i) return; // the card is showing what you're saying
  const t = threads.get(slots[i]);
  if (!t) { c.className = 'card empty' + (c.classList.contains('out') ? ' out' : ''); c.innerHTML = ''; return; }
  c.classList.remove('empty');
  const last = t.messages.at(-1);
  const lastReply = [...t.messages].reverse().find((m) => m.role === 'assistant');
  const lastYou = [...t.messages].reverse().find((m) => m.role === 'user');
  let ex;
  // While Claude works: what you asked, then what it's doing right now (the line claude.ai shows in grey).
  if (t.busy) ex = `${lastYou ? `<div class="ex you">You: ${esc(firstSentence(lastYou.text))}</div>` : ''}<div class="ex dim">${working(t)}</div>`;
  else if (!last) ex = '<div class="ex dim">No messages yet.</div>';
  else if (last.role === 'user') ex = `<div class="ex you">You: ${esc(firstSentence(last.text))}</div>`;
  else ex = `<div class="ex">${esc(preview(lastReply.text))}</div>`;
  const html = `<div class="hd">${ICON[t.kind] || ICON.cowork}<span class="t">${esc(t.title)}</span>${status(t)}${lastReply && !t.busy ? sayButton(t.key) : ''}${EMBED ? '<button class="open" data-open>Open</button>' : ''}</div>${ex}`;
  if (c.dataset.html !== html) { c.innerHTML = html; c.dataset.html = html; }
}

/* ---------- tap to open, hold to talk ---------- */
// Monodesk (Electron) has no speech service, so there holding a card just opens it.
const Rec = EMBED ? null : window.SpeechRecognition || window.webkitSpeechRecognition;

function dictate({ onText, onEnd }) {
  if (!Rec) return null;
  const r = new Rec();
  r.lang = navigator.language || 'en-US';
  r.continuous = true;
  r.interimResults = true;
  let text = '', failed = null;
  r.onresult = (e) => {
    let fin = '', live = '';
    for (const res of e.results) (res.isFinal ? (fin += res[0].transcript) : (live += res[0].transcript));
    text = (fin + live).trim();
    onText(text);
  };
  r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') failed = 'Allow the microphone for Dispatch to talk.'; };
  r.onend = () => onEnd(text, failed);
  try { r.start(); } catch { return null; }
  return r;
}

function wireCard(card, i) {
  let timer = null, start = null, holding = false, rec = null, pendingSend = null;
  card.addEventListener('pointerdown', (e) => {
    if (!slots[i] || e.target.closest('button')) return;
    start = { x: e.clientX, y: e.clientY };
    holding = false;
    timer = setTimeout(begin, HOLD_MS);
  });
  card.addEventListener('pointermove', (e) => {
    if (timer && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) { clearTimeout(timer); timer = null; start = null; }
  });
  card.addEventListener('pointerup', (e) => {
    if (timer) { clearTimeout(timer); timer = null; if (start && !e.target.closest('button')) openThread(slots[i]); start = null; return; }
    if (holding && rec) rec.stop();
  });
  card.addEventListener('pointercancel', () => { clearTimeout(timer); timer = null; if (holding && rec) rec.stop(); });
  card.addEventListener('contextmenu', (e) => e.preventDefault());
  card.addEventListener('click', (e) => {
    if (e.target.closest('[data-open]') && slots[i]) openInMonodesk(slots[i]);
    if (e.target.closest('[data-say]') && slots[i]) readAloud(slots[i]);
  });
  card.addEventListener('touchmove', (e) => { if (holding) e.preventDefault(); }, { passive: false });

  function show(html) { card.innerHTML = html; card.dataset.html = ''; }
  function done() { held = null; holding = false; card.classList.remove('live'); drawCard(i); }

  function begin() {
    timer = null;
    const key = slots[i];
    if (!Rec) { start = null; return openThread(key); }
    hush(); // the mic shouldn't hear Claude
    clearTimeout(pendingSend);
    holding = true;
    held = i;
    const t = threads.get(key);
    card.classList.add('live');
    const head = `<div class="hd">${ICON[t?.kind] || ICON.cowork}<span class="t">${esc(t?.title || '')}</span></div>`;
    show(`${head}<div class="ex dim">Listening… let go to send</div>`);
    rec = dictate({
      onText: (words) => show(`${head}<div class="ex">${esc(words)}</div>`),
      onEnd: (words, err) => {
        rec = null;
        holding = false;
        if (err) { done(); toast(err); return openThread(key); }
        if (!words) return done();
        // Still lit while it waits to send, so you can cancel or fix it.
        show(`${head}<div class="ex">${esc(words)}</div><div class="bar"><span>Sending…</span><button data-edit>Edit</button><button data-cancel>Cancel</button></div>`);
        $('[data-cancel]', card).onclick = () => { clearTimeout(pendingSend); done(); };
        $('[data-edit]', card).onclick = () => { clearTimeout(pendingSend); done(); openThread(key, words); };
        pendingSend = setTimeout(async () => {
          done();
          try { await api(`/api/threads/${encodeURIComponent(key)}/reply`, { text: words }); toast('Sent'); poll(true); } catch (e) { toast(e.message); openThread(key, words); }
        }, SEND_DELAY);
      },
    });
    if (!rec) { done(); openThread(key); }
  }
}

/* ---------- full-screen thread with a composer ---------- */
let openKey = null, pendingNew = null;
let opened = null; // the open thread's own copy, for threads that aren't in the top three
let fromList = null; // the list's search text, when the open thread came from the list (Back returns there)

function showView(html) {
  view.hidden = false;
  view.innerHTML = html;
  setFree(true);
}

function openThread(key, draft, listQuery) {
  openKey = key;
  pendingNew = null;
  opened = null;
  fromList = listQuery ?? null;
  showView(`<div class="top"><button class="back" aria-label="Back">‹</button><span class="hdk"></span><span class="t"></span><span class="st"></span>${synth || xi?.enabled ? `<span class="saybox"></span><button class="tbtn" data-voice aria-label="Pick a voice">${ICON.voice}</button>` : ''}${EMBED ? '<button class="openbtn" data-open>Open</button>' : ''}</div>
    <div class="body"></div>${composerHTML()}`);
  $('.back', view).onclick = closeThread;
  if (EMBED) $('[data-open]', view).onclick = () => openInMonodesk(openKey);
  if ($('.saybox', view)) {
    $('.saybox', view).onclick = (e) => { if (e.target.closest('[data-say]')) readAloud(openKey); };
    $('[data-voice]', view).onclick = pickVoice;
  }
  wireComposer(draft, async (text) => {
    await api(`/api/threads/${encodeURIComponent(openKey)}/reply`, { text });
    poll(true);
  });
  drawThread(true);
  if (!threads.has(key)) loadOpened();
}

async function loadOpened() {
  const key = openKey;
  try {
    const t = await api('/api/threads/' + encodeURIComponent(key));
    if (openKey === key && t) { opened = t; drawThread(); }
  } catch (e) { if (openKey === key) toast(e.message); }
}

/* ---------- inside Monodesk ---------- */
// Open: the thread in Monodesk's own Co-work or Claude Code tab.
function openInMonodesk(key) {
  const [kind, id] = key.split(':');
  const url = (threads.get(key) || opened)?.url || `https://claude.ai/${kind === 'code' ? 'code' : 'chat'}/${id}`;
  toMonodesk({ type: 'open', kind, url });
}

// Monodesk's Run inbox triage: start a chat right here, then show it.
async function startNow(kind, text, title) {
  closeSheet();
  openKey = null; pendingNew = null; fromList = null;
  showView(`<div class="top"><button class="back" aria-label="Back">‹</button>${ICON[kind] || ICON.cowork}<span class="t">${esc(title || 'New chat')}</span></div>
    <div class="body"><div class="m now">Starting…</div></div>`);
  $('.back', view).onclick = closeThread;
  try {
    const r = await api('/api/new', { kind, text });
    poll(true);
    if (r.key) openThread(r.key);
  } catch (e) { toast(e.message); }
}
if (EMBED) addEventListener('message', (e) => {
  if (e.source !== parent || !e.data || e.data.to !== 'dispatch') return;
  if (e.data.type === 'new' && e.data.text) startNow(e.data.kind || 'cowork', String(e.data.text), e.data.title);
});

/* ---------- every recent thread, searchable ---------- */
let allThreads = [];

function openList(query = '') {
  openKey = null;
  pendingNew = null;
  fromList = null;
  showView(`<div class="top"><button class="back" aria-label="Back">‹</button>
    <label class="search">${ICON.search}<input type="search" placeholder="Search threads" enterkeyhint="search" autocomplete="off"></label></div>
    <div class="body list"></div>`);
  $('.back', view).onclick = closeThread;
  const input = $('input', view);
  input.value = query;
  input.addEventListener('input', drawList);
  drawList();
  api('/api/history').then((r) => { allThreads = r.threads || []; if (!openKey && !view.hidden && $('.list', view)) drawList(); }).catch((e) => toast(e.message));
}

function drawList() {
  const body = $('.list', view), input = $('input', view);
  if (!body) return;
  const q = input.value.trim().toLowerCase();
  const rows = allThreads.filter((t) => !q || t.title.toLowerCase().includes(q));
  body.innerHTML = rows.length
    ? rows.map((t) => `<button class="row" data-key="${esc(t.key)}">${ICON[t.kind] || ICON.cowork}<span class="t">${esc(t.title)}</span><span class="w">${ago(t.updated)}</span></button>`).join('')
    : `<div class="none">${allThreads.length ? 'No threads match.' : 'Loading…'}</div>`;
  body.querySelectorAll('[data-key]').forEach((b) => b.addEventListener('click', () => openThread(b.dataset.key, '', input.value)));
}

// A brand-new thread: the same screen, empty until the first message goes.
function openNew(kind, env, label) {
  openKey = null;
  pendingNew = { kind, env };
  fromList = null;
  showView(`<div class="top"><button class="back" aria-label="Back">‹</button>${ICON[kind]}<span class="t">${kind === 'code' ? 'New Claude Code session' + (label ? ' · ' + esc(label) : '') : 'New Co-work chat'}</span></div>
    <div class="body"></div>${composerHTML()}`);
  $('.back', view).onclick = closeThread;
  wireComposer('', async (text) => {
    const r = await api('/api/new', { kind, text, env });
    toast('Started');
    poll(true);
    if (r.key) openThread(r.key);
  });
}

function closeThread() {
  if (fromList !== null) return openList(fromList);
  openKey = null; pendingNew = null; opened = null;
  view.hidden = true; view.innerHTML = '';
  setFree(false);
}

function drawThread(fresh) {
  if (!openKey || view.hidden) return;
  const t = threads.get(openKey) || opened;
  const body = $('.body', view);
  if (!t) { if (fresh) body.innerHTML = '<div class="m assistant"><p style="color:var(--faint)">Starting…</p></div>'; return; }
  $('.hdk', view).innerHTML = ICON[t.kind] || ICON.cowork;
  $('.top .t', view).textContent = t.title;
  $('.st', view).innerHTML = status(t);
  drawThreadSay(t);
  const html = (t.messages.map((m) => `<div class="m ${m.role}">${m.role === 'user' ? esc(m.text) : md(m.text)}</div>`).join('') || '<div class="m assistant"><p style="color:var(--faint)">No messages yet.</p></div>')
    + (t.busy ? `<div class="m now">${working(t)}</div>` : '');
  if (body.dataset.html === html) return;
  const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
  body.innerHTML = html;
  body.dataset.html = html;
  if (fresh || nearBottom) body.scrollTop = body.scrollHeight;
}

function composerHTML() {
  return `<div class="compose"><textarea rows="1" placeholder="Message Claude" enterkeyhint="send"></textarea>
    ${Rec ? `<button class="icbtn" data-mic aria-label="Dictate">${ICON.mic}</button>` : ''}<button class="icbtn send" data-send aria-label="Send">${ICON.send}</button></div>`;
}

function wireComposer(initial, onSend) {
  const ta = $('textarea', view), send = $('[data-send]', view), mic = $('[data-mic]', view);
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; send.disabled = !ta.value.trim(); };
  ta.value = initial || '';
  ta.addEventListener('input', grow);
  grow();
  if (initial || pendingNew) setTimeout(() => ta.focus(), 60);
  const go = async () => {
    const text = ta.value.trim();
    if (!text) return;
    send.disabled = true;
    try { await onSend(text); ta.value = ''; grow(); } catch (e) { toast(e.message); send.disabled = false; }
  };
  send.onclick = go;
  // A hardware keyboard's Enter sends; Shift+Enter makes a new line.
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(hover: hover)').matches) { e.preventDefault(); go(); } });
  if (mic) {
    let rec = null, base = '';
    mic.onclick = () => {
      if (rec) return rec.stop();
      hush();
      base =ta.value ? ta.value.replace(/\s*$/, ' ') : '';
      mic.classList.add('on');
      rec = dictate({ onText: (t) => { ta.value = base + t; grow(); }, onEnd: (_t, err) => { rec = null; mic.classList.remove('on'); if (err) toast(err); } });
      if (!rec) mic.classList.remove('on');
    };
  }
}

/* ---------- new chat: Co-work or Code, then where ---------- */
function sheet(html) {
  closeSheet();
  $('#layer').innerHTML = `<div class="ov" data-ov><div class="sheet">${html}</div></div>`;
  $('[data-ov]').addEventListener('pointerdown', (e) => { if (e.target.matches('[data-ov]')) closeSheet(); });
  return $('.sheet');
}
function closeSheet() { $('#layer').innerHTML = ''; }

function pickKind() {
  const sh = sheet(`<h2>New chat</h2><div class="choices">
    <button class="choice" data-kind="cowork">${ICON.cowork}<span>Co-work<small>A regular Claude chat</small></span></button>
    <button class="choice" data-kind="code">${ICON.code}<span>Claude Code<small>A coding session in an environment</small></span></button></div>`);
  sh.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.kind === 'code') return pickEnv();
    closeSheet();
    openNew('cowork');
  }));
}

async function pickEnv() {
  const sh = sheet('<h2>Which environment?</h2><div class="choices" id="envs"><div class="choice" style="color:var(--faint)">Loading…</div></div>');
  let envs = [];
  try { ({ envs } = await api('/api/environments')); } catch (e) { toast(e.message); }
  const box = $('#envs', sh);
  if (!box) return;
  box.innerHTML = envs.length
    ? envs.map((e) => `<button class="choice" data-env="${esc(e.id)}" data-label="${esc(e.label)}">${ICON.code}<span>${esc(e.label)}<small>${esc(e.where)}</small></span></button>`).join('')
    : '<div class="choice" style="color:var(--faint)">No environments found. Set one up in Claude Code on the computer.</div>';
  box.querySelectorAll('[data-env]').forEach((b) => b.addEventListener('click', () => { closeSheet(); openNew('code', b.dataset.env, b.dataset.label); }));
}

/* ---------- read aloud ---------- */
// The speaker reads Claude's latest reply in an ElevenLabs voice when Monodesk has a key (see "ElevenLabs" below),
// else in one of the device's own voices (speechSynthesis: iOS voices on the iPhone, Windows voices in Monodesk). iOS only lets a page talk in answer to a tap, so speech always starts inside
// a click handler, with every piece queued right there. Tap again to stop.
const synth = window.speechSynthesis && window.SpeechSynthesisUtterance ? speechSynthesis : null;
const store = {
  get: (k) => { try { return localStorage.getItem('dispatch.' + k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem('dispatch.' + k) : localStorage.setItem('dispatch.' + k, v); } catch {} },
};
let saying = null; // the thread key being read
let voices = [];
const loadVoices = () => (voices = synth ? synth.getVoices() : []);
if (synth) {
  synth.cancel(); // a reload (Monodesk live-reloads) shouldn't leave the last reply talking
  loadVoices();
  synth.onvoiceschanged = () => { loadVoices(); drawVoices(); };
}
// The voice: the one picked in the voice picker, else the best one installed (a Premium or Enhanced voice you
// downloaded in iOS Settings beats the built-in default, which is what a web app gets otherwise).
// Picks are kept under "voicePick"; an older "voice" pick is dropped, so new downloads take over.
store.set('voice', null);
const myVoice = () => {
  const list = voices.length ? voices : loadVoices();
  const uri = store.get('voicePick');
  return (uri && list.find((v) => v.voiceURI === uri)) || bestVoice(list);
};
// DK's favourite, used whenever it's installed (Matilda Premium, Australian English) unless another voice is picked.
const FAVOURITE = /^Matilda\b/i;
function bestVoice(list) {
  const want = (navigator.language || 'en-US').toLowerCase(), mine = want.slice(0, 2);
  return list
    .filter((v) => v.lang.slice(0, 2).toLowerCase() === mine && !NOVELTY.test(v.name))
    .sort((a, b) => FAVOURITE.test(b.name) - FAVOURITE.test(a.name) || RANK[quality(a)] - RANK[quality(b)] || (b.lang.toLowerCase() === want) - (a.lang.toLowerCase() === want) || b.default - a.default || b.localService - a.localService)[0] || null;
}
// Speed and pitch (1 = the voice's own), and the pause between sentences in ms. A web app can't read the
// iPhone's Spoken Content settings, so these are Dispatch's own, kept on the device.
const myRate = () => +store.get('rate') || 1;
const myPitch = () => +store.get('pitch') || 1;
const myPause = () => +store.get('pause') || 0;
const PAUSES = [[0, 'None'], [250, 'Short'], [500, 'Medium'], [900, 'Long']];

// ElevenLabs: when Monodesk has a key in its config.js, the bridge turns the reply into an MP3 and the page plays it.
// Without a key, or when it fails, the device's own voice reads instead. The key never comes to the phone.
// xi is what /api/voices said: { enabled, voices, library, default, models, model, credits }.
let xi = null, xiDown = 0; // xiDown: when ElevenLabs last failed; the device voice is used for 5 minutes after
const loadXi = (fresh) => (DEMO ? Promise.resolve() : api('/api/voices' + (fresh ? '?now=1' : '')).then((r) => { xi = r; drawVoices(); }).catch(() => {}));
loadXi();
const useXi = () => xi?.enabled && store.get('engine') !== 'device' && Date.now() - xiDown > 5 * 6e4;
const xiModel = () => (xi?.models.some((m) => m.id === store.get('xiModel')) ? store.get('xiModel') : xi?.model);
const xiPer = () => xi?.models.find((m) => m.id === xiModel())?.per ?? 1;
const xiVoice = () => {
  const id = store.get('xiVoice');
  const all = xi ? [...xi.voices, ...xi.library] : [];
  return (id && all.find((v) => v.id === id)) || all.find((v) => v.id === xi?.default?.id) || xi?.default || null;
};
const n0 = (n) => Math.round(n).toLocaleString();
// One <audio> for everything. iOS only lets it play from a tap, so each tap first starts it on a moment of silence;
// the MP3 that arrives a second later then plays on the same element.
const player = new Audio();
player.setAttribute('playsinline', '');
const SILENT = 'data:audio/mpeg;base64,//MkxAAAAANIAAAAAExBTUUzLjEwMSAoYmV0YSAzKVVVVVVVVVVMQU1FMy4xMDEg//MkxCMAAANIAAAAAChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDEg//MkxEYAAANIAAAAAChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDEg//MkxGkAAANIAAAAAChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDEg//MkxIwAAANIAAAAAChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDEg//MkxK8AAANIAAAAAChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDEg//MkxNIAAANIAAAAAChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDEg//MkxNwAAANIAAAAAChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDEg//MkxNwAAANIAAAAAChiZXRhIDMpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxNwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxNwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxNwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxNwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxNwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MkxNwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
function unlock() {
  player.src = SILENT;
  player.play().catch(() => {});
  // The same for the device voice, so it can take over if ElevenLabs fails after the tap.
  if (synth) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); }
}
// Plays a URL on the shared player at your speed. onDone runs once, when it ends, fails or is stopped.
function playUrl(url, onDone) {
  const me = run;
  let over = false;
  const finish = (ok) => { if (over) return; over = true; player.onended = player.onerror = null; if (me === run) onDone?.(ok); };
  player.onended = () => finish(true);
  player.onerror = () => finish(false);
  player.src = url;
  player.defaultPlaybackRate = player.playbackRate = myRate();
  player.preservesPitch = true;
  return player.play().then(() => { player.playbackRate = myRate(); }, () => { finish(false); throw new Error('play'); });
}

// The MP3 for a reply, from the bridge. Each one is kept here too, so hearing it again is free and instant.
const mp3s = new Map();
let fetching = null;
async function xiAudio(text) {
  const v = xiVoice();
  const body = { text, voice: v?.id, owner: v && !v.mine ? v.owner : undefined, model: xiModel(), pause: myPause() };
  const k = JSON.stringify([body.voice, body.model, body.pause, text]);
  if (mp3s.has(k)) return { url: mp3s.get(k), credits: 0 };
  fetching = new AbortController();
  const r = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Monodesk': '1' }, body: JSON.stringify(body), signal: fetching.signal });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'ElevenLabs didn’t answer');
  const url = URL.createObjectURL(await r.blob());
  mp3s.set(k, url);
  // A library voice was just added to your ElevenLabs voices: from now on it's one of yours.
  const now = r.headers.get('X-Voice');
  if (v && !v.mine && now) { store.set('xiVoice', now); loadXi(true); }
  const left = r.headers.get('X-Credits-Left');
  if (xi?.credits && left !== '' && left != null) xi.credits.used = xi.credits.limit - +left;
  return { url, credits: +r.headers.get('X-Credits') || 0, cached: r.headers.get('X-Cached') === '1', left: left === '' ? null : +left };
}

// Called from the tap. Falls back to the device voice if ElevenLabs fails.
function sayXi(text, key, done) {
  const me = ++run;
  synth?.cancel();
  unlock();
  xiAudio(text).then((a) => {
    if (me !== run) return;
    const cost = a.credits ? `${n0(a.credits)} credits` + (a.left != null ? ` · ${n0(a.left)} left` : '') : 'Already paid for: free';
    playUrl(a.url, done).then(() => toast(cost), () => { toast('Tap the speaker again to play it.'); });
  }).catch((e) => {
    if (me !== run || e.name === 'AbortError') return;
    xiDown = Date.now();
    toast(e.message.replace(/\.$/, '') + '. Using the phone’s voice.');
    if (synth) speak(text, { onDone: done }); else done();
  });
}

const sayButton = (key) => `<button class="say${saying === key ? ' on' : ''}" data-say aria-label="${saying === key ? 'Stop reading' : 'Read aloud'}">${saying === key ? ICON.stop : ICON.speak}</button>`;
function drawThreadSay(t) {
  const box = $('.saybox', view);
  if (!box) return;
  const html = t && t.messages.some((m) => m.role === 'assistant') ? sayButton(t.key) : '';
  if (box.innerHTML !== html) box.innerHTML = html;
}
function drawSay() {
  for (let i = 0; i < SLOTS; i++) drawCard(i);
  if (openKey && !view.hidden) drawThreadSay(threads.get(openKey) || opened);
}

// Claude's latest reply: everything it said since your last message (or its last message, if you've spoken since).
function latestReply(t) {
  const msgs = t?.messages || [];
  const lastYou = msgs.map((m) => m.role).lastIndexOf('user');
  const after = msgs.slice(lastYou + 1).filter((m) => m.role === 'assistant');
  return (after.length ? after : [...msgs].reverse().filter((m) => m.role === 'assistant').slice(0, 1)).map((m) => m.text).join('\n\n');
}

// Markdown → what a person would say: no code blocks, no symbols, links by their words, a pause after each line.
function spoken(src) {
  return String(src || '')
    .replace(/```[\s\S]*?(```|$)/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^\|?\s*:?-{3,}/.test(l) && !/^([-*_]\s*){3,}$/.test(l)) // table rules, horizontal rules
    .map((l) => l
      .replace(/^(#{1,6}|>+|[-*+•]|\d+[.)])\s+/, '')
      .replace(/^\||\|$/g, '').replace(/\s*\|\s*/g, ', ')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<?https?:\/\/(www\.)?([^\/\s>]+)[^\s>]*>?/g, '$2')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
      .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
      .replace(/\s*(→|->|⇒)\s*/g, ' to ')
      .replace(/\s+[·•]\s+/g, ', ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
    .map((l) => (/[.!?:;,]$/.test(l) ? l : l + '.'))
    .join('\n');
}

// Short pieces, a sentence or a few: long utterances get cut off in some browsers, and short ones stop at once.
// With a sentence pause, every sentence is its own piece.
function pieces(text, bySentence) {
  const out = [];
  for (const line of text.split('\n')) {
    let cur = '';
    for (const s of line.split(/(?<=[.!?;:])\s+/)) {
      if (cur && (bySentence || (cur + ' ' + s).length > 220)) { out.push(cur); cur = ''; }
      cur = cur ? cur + ' ' + s : s;
    }
    if (cur) out.push(cur);
  }
  return out.flatMap((p) => (p.length <= 260 ? [p] : p.match(/.{1,220}(\s|$)|\S+/g))).map((p) => p.trim()).filter(Boolean);
}

// Speak text now (call from a tap). onDone runs once, when it finishes or is stopped.
let run = 0, queued = [], watch = null, gap = null;
function speak(text, { voice = myVoice(), rate = myRate(), pitch = myPitch(), pause = myPause(), onDone } = {}) {
  const me = ++run;
  synth.cancel();
  clearInterval(watch);
  clearTimeout(gap);
  let over = false;
  const finish = () => { if (over || me !== run) return; over = true; clearInterval(watch); clearTimeout(gap); queued = []; onDone?.(); };
  const lang = voice?.lang || navigator.language || 'en-US';
  queued = pieces(text, pause > 0).map((p) => {
    const u = new SpeechSynthesisUtterance(p);
    if (voice) u.voice = voice;
    u.lang = lang;
    u.rate = rate;
    u.pitch = pitch;
    return u; // kept in queued: Safari drops events for utterances it has garbage-collected
  });
  if (!queued.length) return finish();
  queued.at(-1).onend = finish;
  queued.forEach((u) => (u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') finish(); }));
  synth.resume(); // Chrome can be stuck paused
  let waiting = false;
  if (pause > 0) {
    // One sentence at a time, with the pause between. The first starts inside the tap, which is what iOS needs;
    // after that the page may keep talking.
    queued.slice(0, -1).forEach((u, i) => (u.onend = () => {
      if (me !== run) return;
      waiting = true;
      gap = setTimeout(() => { waiting = false; if (me === run) synth.speak(queued[i + 1]); }, pause);
    }));
    synth.speak(queued[0]);
  } else {
    queued.forEach((u) => synth.speak(u));
  }
  // Some engines never send the last "end"; if nothing is speaking or queued for a while, it's over.
  let quiet = 0, t0 = Date.now();
  watch = setInterval(() => {
    if (me !== run) return clearInterval(watch);
    quiet = synth.speaking || synth.pending || waiting ? 0 : quiet + 1;
    if (quiet >= 3 && Date.now() - t0 > 1500) finish();
  }, 500);
}

function readAloud(key) {
  if (!synth && !useXi()) return toast('This browser can’t read aloud.');
  if (saying === key) return hush();
  const t = threads.get(key) || (opened?.key === key ? opened : null);
  const text = spoken(latestReply(t));
  if (!text) return toast('Nothing to read yet.');
  saying = key;
  const done = () => { if (saying === key) { saying = null; drawSay(); } };
  if (useXi()) sayXi(text, key, done);
  else speak(text, { onDone: done });
  drawSay();
}
function hush() {
  run++;
  fetching?.abort();
  player.pause();
  clearInterval(watch);
  clearTimeout(gap);
  synth?.cancel();
  if (saying) { saying = null; drawSay(); }
}

/* ---------- voice picker: ElevenLabs voices (when Monodesk has a key) or the device's own ---------- */
const SAMPLE = 'Done. I pushed the fix to the dispatch repo, and the cards now read aloud. Want me to bump the Monodesk version too?';
// Apple's joke voices, kept out of the list unless "Show all" is on.
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Jester|Organ|Pipe Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph|Princess|Grandma|Grandpa|Rocko|Shelley|Flo|Eddy|Reed|Sandy)\b/;
const quality = (v) => (/premium/i.test(v.voiceURI + v.name) ? 'Premium' : /enhanced/i.test(v.voiceURI + v.name) ? 'Enhanced' : /natural|neural/i.test(v.name) ? 'Natural' : v.localService === false ? 'Online' : '');
const RANK = { Premium: 0, Natural: 1, Enhanced: 2, Online: 3, '': 4 };
const TYPICAL = 800; // characters in a typical spoken reply, for the cost line
const aussie = (v) => /austral/i.test(v.accent || '');

// An ElevenLabs voice's free sample (its preview clip costs no credits).
function hearXi(v) {
  hush();
  if (!v?.preview) return toast('This voice has no sample. Read a reply to hear it.');
  playUrl(v.preview).catch(() => {});
}

function pickVoice() {
  if (!synth && !xi?.enabled) return toast('This browser can’t read aloud.');
  hush();
  loadVoices();
  if (xi?.enabled) loadXi(true); // fresh voices and credit balance
  const eleven = !!xi?.enabled && store.get('engine') !== 'device';
  const sh = sheet(`<h2>Voice <small>${eleven ? 'Tap a voice to hear its sample (free). The last one you tap reads your replies.' : 'Tap one to hear it. The last one you tap is used.'}</small></h2>
    ${xi?.enabled ? `<div class="vctl"><span>From</span><div class="seg" data-engine><button data-e="xi">ElevenLabs</button><button data-e="device">This device</button></div></div>` : ''}
    ${eleven ? `<div class="vctl"><span>Model</span><div class="seg" data-model>${xi.models.map((m) => `<button data-m="${esc(m.id)}">${esc(m.name)}</button>`).join('')}</div></div><div class="credits"></div>` : ''}
    <div class="vctl"><label><span>Speed</span><input type="range" min="0.6" max="1.6" step="0.05" data-k="rate"></label><b data-v="rate"></b></div>
    ${eleven ? '' : '<div class="vctl"><label><span>Pitch</span><input type="range" min="0.6" max="1.4" step="0.05" data-k="pitch"></label><b data-v="pitch"></b></div>'}
    <div class="vctl"><span>Pause</span><div class="seg" data-pause>${PAUSES.map(([ms, name]) => `<button data-ms="${ms}">${name}</button>`).join('')}</div>
      ${eleven ? '' : '<label class="chk"><input type="checkbox" data-all> Show all</label>'}</div>
    <div class="voices" data-mode="${eleven ? 'xi' : 'device'}"></div>`);
  const sample = () => (eleven ? hearXi(xiVoice()) : speak(SAMPLE));
  const engine = $('[data-engine]', sh);
  if (engine) {
    engine.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b.dataset.e === 'xi') === eleven));
    engine.onclick = (e) => { const b = e.target.closest('[data-e]'); if (b) { store.set('engine', b.dataset.e === 'device' ? 'device' : null); xiDown = 0; pickVoice(); } };
  }
  const model = $('[data-model]', sh);
  if (model) {
    const light = () => model.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === xiModel()));
    model.onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) { store.set('xiModel', b.dataset.m); light(); drawCredits(); } };
    light();
  }
  const now = { rate: myRate, pitch: myPitch };
  sh.querySelectorAll('[data-k]').forEach((r) => {
    const k = r.dataset.k, label = $(`[data-v="${k}"]`, sh);
    const show = () => (label.textContent = (+r.value).toFixed(2) + (k === 'rate' ? '×' : ''));
    r.value = now[k]();
    show();
    r.oninput = () => { store.set(k, r.value); show(); };
    r.onchange = sample; // hear it when you let go
  });
  const seg = $('[data-pause]', sh);
  const lightPause = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.ms === myPause()));
  // With ElevenLabs the pause goes between lines (not every sentence), and you hear it on the next reply.
  seg.onclick = (e) => { const b = e.target.closest('[data-ms]'); if (!b) return; store.set('pause', b.dataset.ms); lightPause(); if (!eleven) speak(SAMPLE); };
  lightPause();
  const all = $('[data-all]', sh);
  if (all) all.onchange = drawVoices;
  $('.voices', sh).onclick = (e) => {
    const x = e.target.closest('[data-xi]');
    if (x) {
      store.set('xiVoice', x.dataset.xi);
      hearXi([...xi.voices, ...xi.library].find((v) => v.id === x.dataset.xi));
      return drawVoices();
    }
    const b = e.target.closest('[data-uri]');
    if (!b) return;
    store.set('voicePick', b.dataset.uri || null);
    speak(SAMPLE);
    drawVoices();
  };
  drawVoices();
}

// Credits left, and what a reply costs on the chosen model.
function drawCredits() {
  const box = $('#layer .credits');
  if (!box || !xi?.enabled) return;
  const per = xiPer(), m = xi.models.find((x) => x.id === xiModel());
  const c = xi.credits;
  const left = c ? `<b>${n0(c.limit - c.used)}</b> of ${n0(c.limit)} credits left${c.reset ? ' · resets ' + new Date(c.reset).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}. ` : '';
  const more = xi.limited ? ' <span class="warn">Your key can only make speech. To see your own voices, Australian library voices and credits left, give it Voices (read and write) and User (read) access at elevenlabs.io → Developers → API Keys.</span>' : '';
  box.innerHTML = `${left}${esc(m?.name || '')} (${esc(m?.about || '')}) costs ${per} credit${per === 1 ? '' : 's'} per character: a typical ${TYPICAL}-character reply is about <b>${n0(TYPICAL * per)}</b>. Hearing one again is free.${more}`;
}

function drawVoices() {
  const box = $('#layer .voices');
  if (!box) return;
  if (box.dataset.mode === 'xi') return drawXiVoices(box);
  const showAll = $('#layer [data-all]')?.checked;
  const mine = (navigator.language || 'en').slice(0, 2).toLowerCase();
  const seen = new Set();
  const list = voices
    .filter((v) => !seen.has(v.voiceURI) && seen.add(v.voiceURI))
    .filter((v) => showAll || (v.lang.slice(0, 2).toLowerCase() === mine && !NOVELTY.test(v.name)))
    .sort((a, b) => RANK[quality(a)] - RANK[quality(b)] || (b.lang.slice(0, 2).toLowerCase() === mine) - (a.lang.slice(0, 2).toLowerCase() === mine) || a.name.localeCompare(b.name));
  const picked = store.get('voicePick') && myVoice()?.voiceURI === store.get('voicePick') ? store.get('voicePick') : '';
  const short = (v) => v.name.replace(/^Microsoft\s+/, '').replace(/\s+-\s+.*$/, '').replace(/\s*\((Premium|Enhanced)\)/i, '');
  const best = bestVoice(voices);
  const row = (uri, name, sub, q) => `<button class="vrow${uri === picked ? ' on' : ''}" data-uri="${esc(uri)}"><span>${esc(name)}<small>${esc(sub)}</small></span>${q ? `<em>${q}</em>` : ''}</button>`;
  box.innerHTML = row('', 'Automatic', best ? `Best installed: ${short(best)}${quality(best) ? ' (' + quality(best) + ')' : ''}` : 'The device’s own choice', '')
    + list.map((v) => row(v.voiceURI, short(v), v.lang, quality(v))).join('')
    + (list.length ? '' : `<div class="none">${voices.length ? 'No voices in your language. Turn on Show all.' : 'No voices yet…'}</div>`);
}

// Your ElevenLabs voices (Australian first), then Australian voices from the library, which join your voices
// the first time one reads a reply.
function drawXiVoices(box) {
  drawCredits();
  if (!xi?.enabled) { box.innerHTML = '<div class="none">Loading…</div>'; return; }
  const picked = xiVoice()?.id;
  const label = (v) => [v.accent && v.accent[0].toUpperCase() + v.accent.slice(1), v.gender, v.about].filter(Boolean).join(' · ');
  const row = (v) => `<button class="vrow${v.id === picked ? ' on' : ''}" data-xi="${esc(v.id)}"><span>${esc(v.name.replace(/\s+-\s+.*$/, ''))}<small>${esc(label(v) || 'ElevenLabs')}</small></span>${aussie(v) ? '<em>AU</em>' : ''}</button>`;
  const mine = [...xi.voices].sort((a, b) => aussie(b) - aussie(a) || a.name.localeCompare(b.name));
  box.innerHTML = `<div class="vhead">Your voices</div>${mine.map(row).join('') || '<div class="none">None yet.</div>'}`
    + (xi.library.length ? `<div class="vhead">Australian voices from the ElevenLabs library <small>Picking one adds it to your voices when it first reads.</small></div>${xi.library.map(row).join('')}` : '');
}

/* ---------- polling ---------- */
let pollTimer, inFlight = false;
async function poll(now) {
  clearTimeout(pollTimer);
  if (inFlight) { pollTimer = setTimeout(poll, 800); return; }
  inFlight = true;
  let r;
  try { r = await api('/api/threads' + (now ? '?now=1' : '')); } catch {}
  if (!r) notice('Can’t reach Monodesk. Is it running on your computer, with Tailscale on here?');
  else if (r.error === 'signed-out') notice('Sign in to Claude in Monodesk on your computer, then come back.');
  else if (r.error && !(r.threads || []).length) notice('Monodesk can’t read Claude right now (' + r.error + ').');
  else { clearNotice(); placeThreads(r.threads || []); }
  // A thread opened from the list isn't in the top three, so it's fetched on its own.
  if (openKey && r && !threads.has(openKey)) await loadOpened();
  inFlight = false;
  if (!document.hidden) pollTimer = setTimeout(poll, POLL);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

function notice(msg) {
  let n = $('.notice', stage);
  if (!n) { grid.style.visibility = 'hidden'; n = document.createElement('div'); n.className = 'notice'; stage.appendChild(n); }
  n.textContent = msg;
}
function clearNotice() { $('.notice', stage)?.remove(); grid.style.visibility = ''; }

let toastTimer;
function toast(msg) {
  $('.toast', stage)?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  stage.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2400);
}

poll();
