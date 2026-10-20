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
  const html = `<div class="hd">${ICON[t.kind] || ICON.cowork}<span class="t">${esc(t.title)}</span>${status(t)}${EMBED ? '<button class="open" data-open>Open</button>' : ''}</div>${ex}`;
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
  card.addEventListener('click', (e) => { if (e.target.closest('[data-open]') && slots[i]) openInMonodesk(slots[i]); });
  card.addEventListener('touchmove', (e) => { if (holding) e.preventDefault(); }, { passive: false });

  function show(html) { card.innerHTML = html; card.dataset.html = ''; }
  function done() { held = null; holding = false; card.classList.remove('live'); drawCard(i); }

  function begin() {
    timer = null;
    const key = slots[i];
    if (!Rec) { start = null; return openThread(key); }
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
  showView(`<div class="top"><button class="back" aria-label="Back">‹</button><span class="hdk"></span><span class="t"></span><span class="st"></span>${EMBED ? '<button class="openbtn" data-open>Open</button>' : ''}</div>
    <div class="body"></div>${composerHTML()}`);
  $('.back', view).onclick = closeThread;
  if (EMBED) $('[data-open]', view).onclick = () => openInMonodesk(openKey);
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
      base = ta.value ? ta.value.replace(/\s*$/, ' ') : '';
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
