/* ============ Palestra — UI e logica ============ */
'use strict';

loadState();

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

/* Tema: 'auto' segue l'impostazione dell'iPhone (chiaro/scuro), altrimenti forzato. */
const darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function resolvedTheme() {
  const t = state.settings && state.settings.theme;
  if (t === 'light' || t === 'dark') return t;
  return darkMQ && darkMQ.matches ? 'dark' : 'light';
}
function applyTheme() {
  const t = resolvedTheme();
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'light' ? '#f2f2f7' : '#000000');
  const sb = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (sb) sb.setAttribute('content', t === 'light' ? 'default' : 'black-translucent');
}
applyTheme();
if (darkMQ) {
  const onScheme = () => { if (!state.settings || state.settings.theme === 'auto') applyTheme(); };
  if (darkMQ.addEventListener) darkMQ.addEventListener('change', onScheme);
  else if (darkMQ.addListener) darkMQ.addListener(onScheme);
}

let currentView = 'home';
let selectedDayId = state.uiSelectedDay || 'A';
let editMode = false;
let profileTab = 'profilo'; // sotto-sezione del Profilo: 'profilo' | 'allenamento' | 'backup'
let chartRange = '6'; // periodo grafici: '6' (ultimi 6 allenamenti) | '90' (3 mesi) | 'all'
let progressTab = 'grafici'; // sotto-sezione di Progressi: 'grafici' | 'muscoli'
let chartExRowId = null;
let chartVolumeDay = state.days[0] ? state.days[0].id : 'A';
let muscleDaysOn = state.days.map(d => d.id); // tutti i giorni attivi di default

/* Icone SVG semplici (stile iOS), colore = colore del testo */
const ICON_HISTORY = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>';
const ICON_INFO = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r=".6" fill="currentColor"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
const ICON_EDIT = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg>';
const ICON_MORE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';

// la barra in alto diventa visibile (sfocata, con bordo) solo quando la pagina scorre: come nelle app Apple
function updateScrolled() {
  const y = window.scrollY;
  document.body.classList.toggle('scrolled', y > 4);       // barra sfocata con bordo
  document.body.classList.toggle('title-hidden', y > 38);  // titolo grande uscito → titolo piccolo in alto
}
window.addEventListener('scroll', updateScrolled, { passive: true });

// tastiera aperta: su iPhone le barre fisse "salgono" sopra la tastiera e coprono i campi → le nascondo
document.addEventListener('focusin', e => {
  if (e.target.matches('input:not([type="checkbox"]):not([type="color"]):not([type="file"]), select, textarea')) document.body.classList.add('kb-open');
});
document.addEventListener('focusout', () => {
  setTimeout(() => { if (!document.activeElement || !document.activeElement.matches('input, select, textarea')) document.body.classList.remove('kb-open'); }, 80);
});

/* =================== TIMER =================== */
const timer = { endAt: null, total: 0, label: '', interval: null, fired: false };
let wakeLock = null;

// usato da index.html: non ricaricare l'app (aggiornamento SW) mentre c'è un timer o un cardio in corso
window.__busyNow = () => !!(timer.endAt && !timer.fired) || !!document.querySelector('.cardio-fs') || !!activeSession();

async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* non supportato o negato */ }
}
function releaseWakeLock() {
  try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {}
}
// iOS rilascia il wake lock quando l'app va in background: lo riprendo al ritorno
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && timer.endAt && !timer.fired) {
    acquireWakeLock();
    tickTimer(); // riallinea il conteggio dopo il background
  }
});

function startTimer(label, seconds) {
  timer.label = label;
  timer.total = seconds;
  timer.endAt = Date.now() + seconds * 1000;
  timer.fired = false;
  timer.lastBeep = null;
  clearInterval(timer.interval);
  $('#timerbar').classList.remove('hidden', 'done');
  document.body.classList.add('has-timer');
  acquireWakeLock();
  ensureNotifyPermission();
  timer.interval = setInterval(tickTimer, 250);
  tickTimer();
}

// bip breve (conto alla rovescia ultimi secondi del recupero)
function tickBeep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = 760; o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.start(t); o.stop(t + 0.14);
  } catch (e) {}
}

function tickTimer() {
  const remain = Math.max(0, Math.round((timer.endAt - Date.now()) / 1000));
  $('#timer-label').textContent = timer.label;
  $('#timer-remaining').textContent = fmtTime(remain);
  const pct = timer.total > 0 ? (1 - remain / timer.total) * 100 : 100;
  $('#timer-fill').style.width = pct + '%';
  // conto alla rovescia sonoro negli ultimi 3 secondi
  if (remain <= 3 && remain >= 1 && timer.lastBeep !== remain) {
    timer.lastBeep = remain;
    tickBeep();
    if (navigator.vibrate) navigator.vibrate(80);
  }
  if (remain <= 0 && !timer.fired) {
    timer.fired = true;
    clearInterval(timer.interval);
    $('#timerbar').classList.add('done');
    $('#timer-label').textContent = timer.label + ' — FINITO!';
    alarm();
    if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400, 150, 600]);
    notifyDone(timer.label);
    releaseWakeLock();
    setTimeout(() => { if (timer.fired) hideTimer(); }, 10000);
  }
}

function hideTimer() {
  clearInterval(timer.interval);
  timer.endAt = null;
  timer.fired = false;
  releaseWakeLock();
  $('#timerbar').classList.add('hidden');
  $('#timerbar').classList.remove('done');
  document.body.classList.remove('has-timer');
}

/* ---- notifiche (best-effort: su iPhone NON partono ad app chiusa) ---- */
function ensureNotifyPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  } catch (e) {}
}
function notifyDone(label) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const body = 'Recupero terminato, torna alla serie.';
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(reg => reg.showNotification('⏱ ' + label + ' finito', { body, tag: 'palestra-timer', renotify: true, vibrate: [400,150,400] })).catch(() => new Notification('⏱ ' + label + ' finito', { body }));
    } else {
      new Notification('⏱ ' + label + ' finito', { body });
    }
  } catch (e) {}
}

function fmtTime(s) {
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

let audioCtx = null;
function alarm() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    // 6 bip che salgono di tono: allarme più deciso
    for (let i = 0; i < 6; i++) {
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 740 + i * 90;
      o.connect(gain); gain.connect(audioCtx.destination);
      const t = now + i * 0.32;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      o.start(t); o.stop(t + 0.28);
    }
  } catch (e) { /* audio non disponibile */ }
}

$('#timer-stop').addEventListener('click', hideTimer);
$('#timer-plus').addEventListener('click', () => {
  if (timer.endAt) { timer.endAt += 30000; timer.total += 30; timer.fired = false; $('#timerbar').classList.remove('done'); clearInterval(timer.interval); acquireWakeLock(); timer.interval = setInterval(tickTimer, 250); tickTimer(); }
});
$('#timer-minus').addEventListener('click', () => {
  if (!timer.endAt || timer.fired) return;
  timer.endAt = Math.max(Date.now() + 1000, timer.endAt - 30000); // mai sotto 1s: niente scatti immediati
  timer.total = Math.max(1, timer.total - 30);
  tickTimer();
});

// sblocca l'audio al primo tocco (richiesto da iOS)
document.addEventListener('touchstart', function unlock() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
}, { once: true, passive: true });

/* =================== NAVIGAZIONE =================== */
$$('.tab').forEach(t => t.addEventListener('click', () => {
  if (currentView === t.dataset.view) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  currentView = t.dataset.view;
  syncTabs();
  render();
  window.scrollTo(0, 0);
}));
// evidenzia la tab attiva in base a currentView (per la navigazione da codice)
function syncTabs() {
  $$('.tab').forEach(x => x.classList.toggle('active', x.dataset.view === currentView));
}

const VIEW_TITLES = { home: 'Palestra', workout: 'Allenamento', progress: 'Progressi', cardio: 'Cardio', profile: 'Profilo' };

function render() {
  const name = (state.profile.name || '').trim();
  const title = currentView === 'home' ? (name ? 'Ciao ' + name : 'Palestra') : VIEW_TITLES[currentView];
  $('#topbar-title').textContent = title;
  const action = $('#topbar-action');
  action.classList.add('hidden');
  if (currentView === 'workout') {
    action.textContent = editMode ? 'Fine' : 'Modifica';
    action.classList.remove('hidden');
  }
  const v = $('#view');
  if (currentView === 'home') { v.innerHTML = renderHome(); animateRings(); }
  else if (currentView === 'workout') v.innerHTML = renderWorkout();
  else if (currentView === 'progress') {
    const seg = `<div class="seg"><button data-action="prtab" data-prtab="grafici" class="${progressTab === 'grafici' ? 'on' : ''}">Grafici</button><button data-action="prtab" data-prtab="muscoli" class="${progressTab === 'muscoli' ? 'on' : ''}">Muscoli</button></div>`;
    if (progressTab === 'muscoli') v.innerHTML = seg + renderMuscles();
    else { v.innerHTML = seg + renderCharts(); mountCharts(); }
  }
  else if (currentView === 'cardio') { v.innerHTML = renderCardio(); mountCardioCharts(); }
  else { v.innerHTML = renderProfile(); syncRenderStatus(); }
  // titolo grande in stile iOS: scorre via con la pagina, poi compare piccolo nella barra
  v.insertAdjacentHTML('afterbegin', `<h1 class="large-title">${esc(title)}</h1>`);
  updateScrolled();
  // dissolvenza morbida solo al cambio di vista (non ad ogni aggiornamento interno)
  if (currentView !== lastRenderedView) {
    lastRenderedView = currentView;
    v.classList.remove('fade-in'); void v.offsetWidth; v.classList.add('fade-in');
  }
  bindView();
}
let lastRenderedView = null;

$('#topbar-action').addEventListener('click', () => {
  editMode = !editMode;
  render();
});

/* =================== SESSIONE ATTIVA =================== */
function activeSession() {
  return state.sessions.find(s => s.id === state.activeSessionId && !s.completed) || null;
}

function startSession(dayId) {
  const day = getDay(dayId);
  if (!day) return;
  const entries = {};
  for (const ex of day.exercises) {
    for (const r of ex.rows) {
      // rep pre-compilate col target: nel caso tipico basta un tap sul ✓
      let n, defReps;
      if (r.type === 'russo') {
        const sch = RUSSO_SCHEME[Math.min(r.schemeIndex || 0, RUSSO_SCHEME.length - 1)];
        n = sch[0]; defReps = sch[1];
      } else if (r.type === 'reps' || r.type === 'tempo') {
        // a cedimento: parto dal record precedente, così basta ritoccare in su
        n = r.sets || 1; defReps = bestRepsFor(r.id) || null;
      } else {
        n = r.sets || 1; defReps = r.repMax || null;
      }
      entries[r.id] = Array.from({ length: n }, () => ({ kg: effectiveWeight(r.weight), reps: defReps, done: false }));
    }
  }
  const session = { id: uid(), date: todayISO(), dayId, entries, completed: false };
  state.sessions.push(session);
  state.activeSessionId = session.id;
  saveState();
  render();
  window.scrollTo(0, 0);
}

function finishSession() {
  const s = activeSession();
  if (!s) return;
  const anyDone = Object.values(s.entries).some(arr => arr.some(e => e.done));
  if (!anyDone) { toast('Nessuna serie completata: segna almeno una serie con ✓.'); return; }
  const prs = detectPRs(s); // record personali (prima di segnare la seduta come completata)
  s.completed = true;
  const changes = applyProgression(s);
  state.activeSessionId = null;
  saveState();
  hideTimer();
  showSummaryModal(changes, prs);
}

/* Record personali: kg più alto mai registrato per una riga (serie fatte, con rep) */
function detectPRs(session) {
  const prs = [];
  const day = getDay(session.dayId);
  if (!day) return prs;
  for (const ex of day.exercises) {
    for (const r of ex.rows) {
      const nowEntries = (session.entries[r.id] || []).filter(e => e.done && e.kg != null && e.reps);
      if (!nowEntries.length) continue;
      const nowBest = Math.max(...nowEntries.map(e => e.kg));
      if (nowBest <= 0) continue;
      let prevBest = 0;
      for (const old of state.sessions) {
        if (!old.completed || old.id === session.id) continue;
        for (const e of (old.entries[r.id] || [])) {
          if (e.done && e.kg != null && e.reps && e.kg > prevBest) prevBest = e.kg;
        }
      }
      if (nowBest > prevBest && prevBest > 0) prs.push({ ex: ex.name, row: r.label, kg: nowBest, prev: prevBest });
    }
  }
  return prs;
}

function cancelSession() {
  const s = activeSession();
  if (!s) return;
  state.sessions = state.sessions.filter(x => x.id !== s.id);
  state.activeSessionId = null;
  saveState();
  hideTimer();
  render();
  toast('Seduta annullata.', { undo: () => {
    state.sessions.push(s);
    state.activeSessionId = s.id;
    saveState(); render();
  } });
}

function showSummaryModal(changes, prs) {
  const prRows = (prs && prs.length)
    ? `<div class="pr-box">${prs.map(p => `<div class="pr-row"><strong>Nuovo record</strong> ${esc(p.ex)} <span class="muted">${esc(p.row)}</span> — ${fmtWeight(p.kg)} <span class="muted">(prima ${fmtWeight(p.prev)})</span></div>`).join('')}</div>`
    : '';
  const rows = changes.length
    ? changes.map(c => `<div class="progress-change">
        <span>${esc(c.ex)} <span class="muted">${esc(c.row)}</span></span>
        <span class="${c.kind}">${c.kind === 'up' ? '▲ ' : c.kind === 'down' ? '▼ ' : ''}${esc(c.text)}</span>
      </div>${c.boost ? `<div class="boost-box">
        <span>Hai fatto ${c.boost.reps} rep (obiettivo ${c.boost.repMax}): il peso è leggero. Vuoi un passo doppio?</span>
        <button class="btn-mini" data-boost="${c.boost.rowId}" data-kg="${c.boost.kg}">Sali a ${fmtWeight(c.boost.kg)}</button>
      </div>` : ''}`).join('')
    : '<p class="muted">Nessuna variazione calcolata.</p>';
  openModal(`
    <h2>Seduta completata</h2>
    ${prRows}
    <p class="muted small" style="margin-bottom:10px">${state.settings.autoProgress
      ? 'Pesi e schemi aggiornati automaticamente per la prossima volta (modificabili sempre con "Modifica").'
      : 'Progressione suggerita (aggiornamento automatico disattivato):'}</p>
    ${rows}
    <div class="modal-actions"><button class="btn" data-close>OK</button></div>
  `).querySelectorAll('[data-boost]').forEach(b => b.addEventListener('click', () => {
    const f = findRow(b.dataset.boost);
    if (!f) return;
    f.row.weight = parseFloat(b.dataset.kg);
    saveState(); render();
    b.disabled = true; b.textContent = '✓ ' + fmtWeight(f.row.weight);
  }));
  render();
}

/* =================== VISTA: HOME / DASHBOARD =================== */
function lastCompletedSession() {
  return state.sessions.filter(s => s.completed).sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null;
}
function nextSuggestedDayId() {
  const last = lastCompletedSession();
  if (!last || !state.days.length) return state.days[0] ? state.days[0].id : null;
  const i = state.days.findIndex(d => d.id === last.dayId);
  if (i < 0) return state.days[0].id;
  return state.days[(i + 1) % state.days.length].id;
}
function sessionsThisWeek() {
  const wk = isoWeekKey(todayISO());
  return state.sessions.filter(s => s.completed && isoWeekKey(s.date) === wk).length;
}
function weekStreak() {
  const weeks = new Set(state.sessions.filter(s => s.completed).map(s => isoWeekKey(s.date)));
  if (!weeks.size) return 0;
  let streak = 0;
  const cur = new Date(isoWeekKey(todayISO()) + 'T00:00:00');
  // se questa settimana è vuota, parti dalla scorsa (streak non si azzera a metà settimana)
  if (!weeks.has(isoWeekKey(todayISO()))) cur.setDate(cur.getDate() - 7);
  for (;;) {
    const key = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0') + '-' + String(cur.getDate()).padStart(2, '0');
    if (weeks.has(key)) { streak++; cur.setDate(cur.getDate() - 7); } else break;
  }
  return streak;
}
function lastCardioAny() {
  let best = null;
  for (const c of (state.cardio || [])) {
    const l = cardioLast(c);
    if (l && (!best || l.date > best.entry.date)) best = { c, entry: l };
  }
  return best;
}

/* Anello di progresso SVG (obiettivo settimanale). Parte "vuoto" e si riempie:
   l'offset finale è in data-off, applicato da animateRings() al frame dopo il render. */
function progressRing(done, goal, color) {
  const g = Math.max(1, goal || 1);
  const pct = Math.max(0, Math.min(1, done / g));
  const r = 41, c = 2 * Math.PI * r;
  const off = c * (1 - pct);
  const reached = done >= g;
  const col = reached ? 'var(--good)' : (color || 'var(--accent)');
  return `<div class="ring-wrap">
    <svg class="ring animate" viewBox="0 0 104 104" aria-hidden="true">
      <circle class="ring-track" cx="52" cy="52" r="${r}"></circle>
      <circle class="ring-fg" cx="52" cy="52" r="${r}" stroke="${col}"
        style="stroke-dasharray:${c.toFixed(1)};stroke-dashoffset:${c.toFixed(1)}" data-off="${off.toFixed(1)}"></circle>
    </svg>
    <div class="ring-center ${reached ? 'ring-done' : ''}">
      <div class="rc-n">${done}<span class="rc-of">/${g}</span></div>
      <div class="rc-l">${reached ? '✓ fatto' : (color ? 'sessioni' : 'sedute')}</div>
    </div>
  </div>`;
}
function animateRings() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('.ring-fg[data-off]').forEach(el => { el.style.strokeDashoffset = el.dataset.off; });
  }));
}

/* Celebrazione nuovo record: flash sulla card, coriandoli, vibrazione, toast. */
function celebratePR(anchorEl) {
  if (navigator.vibrate) { try { navigator.vibrate([120, 60, 120, 60, 240]); } catch (e) {} }
  const card = anchorEl && anchorEl.closest('.ex-card');
  if (card) { card.classList.add('pr-flash'); setTimeout(() => card.classList.remove('pr-flash'), 1200); }
  confettiBurst(anchorEl);
  toast('Nuovo record!');
}
function confettiBurst(anchorEl) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = anchorEl ? anchorEl.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const layer = document.createElement('div');
  layer.className = 'conf-layer';
  const bits = ['🎉', '⭐', '💪', '🔥', '🏅'];
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('span');
    s.className = 'conf';
    s.textContent = bits[i % bits.length];
    s.style.left = (cx + (Math.random() * 120 - 60)) + 'px';
    s.style.top = cy + 'px';
    s.style.animationDelay = (Math.random() * 0.12) + 's';
    layer.appendChild(s);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1200);
}

function renderHome() {
  const nextId = nextSuggestedDayId();
  const nextDay = getDay(nextId);
  const totale = state.sessions.filter(s => s.completed).length;
  const settimana = sessionsThisWeek();
  const streak = weekStreak();
  const dl = deloadInfo();
  const activeSess = activeSession();

  const goal = state.settings.weeklyGoal || 3;

  let html = '';

  if (dl.enabled && dl.active) {
    html += `<div class="deload-banner"><strong>Settimana di scarico</strong> — pesi dimezzati, recupera bene.</div>`;
  }

  // ---- Bento grid: azione principale + anello obiettivo + streak/totali ----
  let primaryTile;
  if (activeSess) {
    const d = getDay(activeSess.dayId);
    primaryTile = `<div class="tile span2 accent" style="--day:${d ? d.color : 'var(--accent)'}">
      <div class="tile-kick">Seduta in corso</div>
      <div class="tile-title">${esc(d ? d.name : 'Allenamento')}</div>
      <button class="btn full" style="margin-top:12px" data-action="go-workout">Riprendi</button>
    </div>`;
  } else if (nextDay) {
    primaryTile = `<div class="tile span2 accent" style="--day:${nextDay.color}">
      <div class="tile-kick">Prossimo allenamento</div>
      <div class="tile-title">${esc(nextDay.name)}</div>
      <div class="tile-sub">${esc(dayMusclesShort(nextDay)) || 'Nessun muscolo assegnato'}</div>
      <button class="btn full" style="background:${nextDay.color};margin-top:12px" data-action="start-suggested" data-day="${nextDay.id}">Inizia ${esc(nextDay.name)}</button>
    </div>`;
  } else {
    primaryTile = `<div class="tile span2"><div class="tile-kick">Allenamento</div><div class="tile-title">Nessun giorno</div><button class="btn full" style="margin-top:12px" data-action="go-workout">Crea la scheda</button></div>`;
  }

  // 1) prossimo allenamento
  html += `<div class="bento">${primaryTile}</div>`;

  // 2) cardio: ogni attività con l'obiettivo di oggi e avvio diretto
  const cardioList = state.cardio || [];
  if (cardioList.length) {
    let changed = false;
    for (const c of cardioList) if (applyCardioWeek(c)) changed = true;
    if (changed) saveState();
    html += `<div class="home-card home-cardio">
      <div class="row-between"><div class="home-kick">Cardio</div><button class="btn-ghost" data-action="go-cardio">Dettagli</button></div>
      ${cardioList.map(c => {
        const g = cardioGoalText(c);
        const last = cardioLast(c);
        return `<div class="hc-row" style="--day:${c.color}">
          <span class="dot"></span>
          <div class="hc-main">
            <div class="hc-name">${esc(c.name)}</div>
            <div class="muted">${esc(g.big + (g.unit ? ' ' + g.unit : ''))}${last ? ' · ultima ' + fmtDate(last.date) : ''}</div>
          </div>
          <button class="hc-go" style="--day:${c.color}" data-action="start-cardio" data-cid="${c.id}" aria-label="Avvia ${escAttr2(c.name)}">${ICON_PLAY}</button>
        </div>`;
      }).join('')}
    </div>`;
  } else {
    html += `<div class="home-card"><div class="home-kick">Cardio</div><div class="muted small" style="margin-bottom:10px">Salto corda, tapis roulant o cyclette.</div><button class="btn secondary full" data-action="go-cardio">Vai al cardio</button></div>`;
  }

  // 3) anelli della settimana e sedute
  html += `<div class="bento">
    <div class="tile tile-ring" data-action="go-workout">
      <div class="tile-kick">Pesi · settimana</div>
      ${progressRing(settimana, goal)}
    </div>
    <div class="tile tile-ring" data-action="go-cardio">
      <div class="tile-kick">Cardio · settimana</div>
      ${progressRing(cardioWeekStats().count, state.settings.weeklyCardioGoal || 2, 'var(--red)')}
    </div>
    <div class="tile span2 ring-split row">
      <div class="ring-mini"><span class="n">${streak}</span><span class="l">settimane<br>di fila</span></div>
      <div class="ring-mini"><span class="n">${totale}</span><span class="l">sedute<br>totali</span></div>
      <div class="ring-mini"><span class="n">${cardioWeekStats().minutes}</span><span class="l">min cardio<br>settimana</span></div>
    </div>
  </div>`;

  if (totale === 0) {
    html += `<p class="muted small" style="text-align:center;margin-top:8px">Suggerimento: tocca "Inizia" qui sopra, segna le serie fatte con ✓ e l'app aggiorna i pesi da sola.</p>`;
  }
  return html;
}

/* =================== VISTA: ALLENAMENTO =================== */
function renderWorkout() {
  const session = activeSession();
  if (!state.days.length) return `<div class="card"><p class="muted">Nessun giorno.</p><button class="btn full" data-action="add-day">+ Aggiungi giorno</button></div>`;
  let dayId = session ? session.dayId : selectedDayId;
  let day = getDay(dayId);
  if (!day) { day = state.days[0]; dayId = day.id; selectedDayId = dayId; }

  let html = '';

  const nSets = day.exercises.reduce((n, ex) => n + ex.rows.reduce((m, r) => m + (r.type === 'russo' ? RUSSO_SCHEME[Math.min(r.schemeIndex || 0, RUSSO_SCHEME.length - 1)][0] : (r.sets || 1)), 0), 0);
  // minuti stimati: per ogni serie ~45s di lavoro + il recupero della sua categoria
  const estMin = Math.round(day.exercises.reduce((t, ex) => {
    const rest = (state.settings.rest[ex.restCat] || state.settings.rest.normale).seconds;
    const sets = ex.rows.reduce((m, r) => m + (r.type === 'russo' ? RUSSO_SCHEME[Math.min(r.schemeIndex || 0, RUSSO_SCHEME.length - 1)][0] : (r.sets || 1)), 0);
    return t + sets * (45 + rest);
  }, 0) / 60);
  if (!session) {
    html += `<div class="day-seg ${state.days.length > 4 ? 'scroll' : ''}">` + state.days.map(d => `
      <button class="day-seg-item ${d.id === dayId ? 'on' : ''}" data-day="${d.id}" style="--day:${d.color}">
        <span class="day-letter">${dayLetter(d.id)}</span>
        <span class="day-seg-name">${esc(d.name)}</span>
      </button>`).join('') + `</div>`;
    const muscles = [...new Set(day.exercises.flatMap(e => e.muscles || []))];
    html += `<div class="card day-hero" style="--day:${day.color}">
      <div class="day-hero-name">${esc(day.name)}</div>
      ${muscles.length ? `<details class="day-muscles"><summary>Muscoli allenati (${muscles.length})</summary><div class="chip-wrap center">${muscles.map(m => `<span class="chip static">${esc((MUSCLES[m] || m).split(' ')[0])}</span>`).join('')}</div></details>` : ''}
      <div class="day-stats">
        <div><span class="n">${day.exercises.length}</span><span class="l">esercizi</span></div>
        <div><span class="n">${nSets}</span><span class="l">serie</span></div>
        <div><span class="n">~${estMin}</span><span class="l">minuti</span></div>
      </div>
      ${day.exercises.length ? `<button class="btn full" style="background:${day.color}" data-action="start-session" data-day="${day.id}">${ICON_PLAY}<span>Inizia ${esc(day.name)}</span></button>` : `<p class="muted small center-text">Tocca "Modifica" in alto per aggiungere esercizi.</p>`}
      <button class="btn-ghost day-hero-manage" data-action="manage-days">Gestisci giorni</button>
    </div>`;
  } else {
    const all = Object.values(session.entries).flat();
    const done = all.filter(e => e.done).length;
    const pct = all.length ? Math.round((done / all.length) * 100) : 0;
    // barra della seduta: resta in alto mentre scorri, con "Termina" sempre a portata di pollice
    html += `<div class="session-bar" style="--day:${day.color}">
      <div class="session-bar-top">
        <div style="min-width:0">
          <div class="card-title">${esc(day.name)}</div>
          <div class="muted">${done}/${all.length} serie · ${pct}%</div>
        </div>
        <div class="row-gap">
          <button class="btn-mini danger" data-action="cancel-session">Annulla</button>
          <button class="btn-mini good" data-action="finish-session">Termina</button>
        </div>
      </div>
      <div class="session-progress"><div style="width:${pct}%;background:${day.color}"></div></div>
    </div>`;
  }

  // banner settimana di scarico (deload)
  const dl = deloadInfo();
  if (dl.enabled && dl.active) {
    html += `<div class="deload-banner"><strong>Settimana di scarico</strong> · pesi dimezzati (${Math.round((dl.factor || 0.5) * 100)}%) questa settimana. Recupera, poi si riparte più forti.</div>`;
  } else if (dl.enabled && dl.weeksToDeload === 1) {
    html += `<div class="deload-soon">La prossima settimana è di scarico (pesi dimezzati).</div>`;
  }

  // riscaldamento iniziale (nome e tempo modificabili)
  html += `<div class="cardio-banner">
    <div><div class="strong">Riscaldamento</div><div class="muted">${esc(state.settings.warmupName || 'Riscaldamento')} · ${fmtTime(state.settings.cardioSeconds)}</div></div>
    <div class="row-gap">
      <button class="icon-btn" data-action="edit-warmup" title="Modifica" aria-label="Modifica riscaldamento">${ICON_MORE}</button>
      <button class="btn-mini primary" data-action="cardio-timer">Avvia</button>
    </div>
  </div>`;

  // esercizi
  html += day.exercises.map((ex, i) => renderExercise(ex, i, day, session)).join('');

  if (editMode) {
    html += `<button class="btn secondary full" data-action="add-exercise" data-day="${day.id}">+ Aggiungi esercizio</button>`;
  }

  if (session) {
    html += `<button class="btn full good" style="margin-top:10px" data-action="finish-session">Termina seduta</button>`;
  }

  return html;
}

function dayMusclesShort(day) {
  const ms = [...new Set(day.exercises.flatMap(e => e.muscles || []))];
  return ms.slice(0, 3).map(m => MUSCLES[m] ? MUSCLES[m].split(' ')[0] : m).join(', ') + (ms.length > 3 ? '…' : '');
}

function renderExercise(ex, index, day, session) {
  const rest = state.settings.rest[ex.restCat] || state.settings.rest.normale;
  const thumb = ex.dsMedia
    ? `<button class="ex-thumb" data-action="show-how" data-ex="${ex.id}" title="Come si fa" aria-label="Come si fa" data-initial="${escAttr2((ex.name || '?').trim().charAt(0).toUpperCase())}"><img src="${exImg(ex.dsMedia)}" alt="" loading="lazy" decoding="async"></button>`
    : '';
  // esercizio completato → card attenuata con spunta
  let exDone = false;
  if (session) {
    const all = ex.rows.flatMap(r => session.entries[r.id] || []);
    exDone = all.length > 0 && all.every(e => e.done);
  }
  const restShort = (rest.label.match(/\(([^)]+)\)/) || [])[1] || fmtTime(rest.seconds);
  let html = `<div class="ex-card ${exDone ? 'ex-done' : ''}" data-ex="${ex.id}">
    <div class="ex-index">${index + 1} / ${day.exercises.length}</div>
    <div class="ex-head">
      <div class="ex-head-main">
        ${thumb}
        <div style="min-width:0">
          <div class="ex-name">${esc(ex.name)}</div>
          ${session ? `<div class="ex-meta">${esc(rest.label)}${ex.note ? ' · ' + esc(ex.note) : ''}</div>` : (ex.note ? `<div class="ex-meta">${esc(ex.note)}</div>` : '')}
        </div>
      </div>
      <div class="ex-tools">
        ${editMode ? `
          <button class="icon-btn" data-action="move-ex" data-dir="-1" data-day="${day.id}" data-ex="${ex.id}" title="Su" aria-label="Sposta su">↑</button>
          <button class="icon-btn" data-action="move-ex" data-dir="1" data-day="${day.id}" data-ex="${ex.id}" title="Giù" aria-label="Sposta giù">↓</button>
        ` : ''}
        <button class="icon-btn" data-action="ex-menu" data-day="${day.id}" data-ex="${ex.id}" title="Opzioni" aria-label="Opzioni esercizio">${ICON_MORE}</button>
      </div>
    </div>
    <div class="ex-body">`;

  // riscaldamento
  if (ex.warmup && ex.warmup !== 'none') {
    const s1 = ex.rows[0] ? effectiveWeight(ex.rows[0].weight) : 0; // in settimana di scarico: sul peso ridotto
    const steps = warmupSteps(ex.warmup, s1);
    if (steps.length && s1 > 0) {
      html += `<details class="warmup-box">
        <summary class="warmup-title"><span>Riscaldamento ${ex.warmup === 'full' ? 'completo' : 'ridotto'}</span><span class="muted">${steps.map(st => fmtKg(toDisplayWeight(st.kg))).join(' · ')} ${unitLabel()}</span></summary>
        ${steps.map(st => `<div class="wu-row">
          <span>${st.pct}% → <strong>${fmtWeight(st.kg)}</strong> × ${st.reps}</span>
          <button class="btn-mini" data-action="warmup-timer">Rest ${fmtTime(state.settings.warmupRest)}</button>
        </div>`).join('')}
      </details>`;
    }
  }

  // righe serie
  for (const r of ex.rows) {
    html += renderRow(ex, r, session);
  }

  // pulsante recupero (solo durante la seduta)
  if (session) html += `<button class="rest-btn" data-action="rest-timer" data-cat="${ex.restCat}">Recupero ${esc(restShort)} · avvia ${fmtTime(rest.seconds)}</button>`;

  html += `</div></div>`;
  return html;
}

function renderRow(ex, r, session) {
  const prevBest = (r.type === 'reps' || r.type === 'tempo') ? bestRepsFor(r.id) : 0;
  let target;
  if (r.type === 'russo') {
    target = 'Schema russo: ' + russoLabel(r.schemeIndex || 0);
  } else if (r.type === 'reps') {
    target = prevBest ? 'A cedimento · batti ' + prevBest + ' rep' : 'A cedimento · max rep';
  } else if (r.type === 'tempo') {
    target = prevBest ? 'A cedimento · batti ' + prevBest + ' sec' : 'A cedimento · max secondi';
  } else {
    target = r.repMin + '–' + r.repMax + ' rep';
  }

  const dl = deloadInfo();
  const showKg = dl.active ? effectiveWeight(r.weight) : r.weight;
  let kgLabel;
  if (r.type === 'tempo' || (r.type === 'reps' && !r.weight)) {
    kgLabel = r.type === 'tempo' ? 'secondi' : 'corpo libero';
  } else if (dl.active && r.weight) {
    kgLabel = `<span class="warn">${fmtWeight(showKg)} (scarico)</span>`;
  } else {
    kgLabel = fmtWeight(r.weight);
  }
  let lastNote = lastPerformance(r.id);
  if (lastNote) lastNote = esc(lastNote) + lastTrend(r);
  if (!session) {
    // anteprima della giornata: cosa fare, in tre colonne ben allineate
    const rest = state.settings.rest[ex.restCat] || state.settings.rest.normale;
    let repTxt;
    if (r.type === 'russo') repTxt = russoLabel(r.schemeIndex || 0).replace('x', '×');
    else if (r.type === 'reps') repTxt = prevBest ? '> ' + prevBest : 'max';
    else if (r.type === 'tempo') repTxt = prevBest ? '> ' + prevBest + 's' : 'max sec';
    else repTxt = r.repMin + '–' + r.repMax;
    const setsTxt = r.type === 'russo' ? '' : ((r.sets || 1) > 1 ? ' · ' + r.sets + ' serie' : '');
    let pesoTxt;
    if (r.type === 'tempo' || !r.weight) pesoTxt = r.type === 'tempo' ? '—' : 'corpo';
    else pesoTxt = fmtKg(toDisplayWeight(dl.active ? showKg : r.weight)) + ' ' + unitLabel();
    const title = /^S\d+$/.test(r.label) ? 'Serie ' + r.label.slice(1) : r.label;
    const note = r.type === 'russo' ? 'schema russo' : (r.type === 'reps' || r.type === 'tempo') ? 'a cedimento' : '';
    return `<div class="set-plan">
      <div class="set-plan-title">${esc(title)}${setsTxt}${note ? ` <span class="muted">· ${note}</span>` : ''}${dl.active && r.weight ? ' <span class="warn">· scarico</span>' : ''}</div>
      <div class="set-plan-grid">
        <div><span class="l">Rep</span><span class="v">${esc(repTxt)}</span></div>
        <div><span class="l">Peso</span><span class="v">${esc(pesoTxt)}</span></div>
        <div><span class="l">Recupero</span><span class="v">${fmtTime(rest.seconds)}</span></div>
      </div>
      ${lastNote ? `<div class="set-plan-last">${lastNote}</div>` : ''}
    </div>`;
  }
  let html = `<div class="set-block"><div class="set-head"><span class="set-label">${esc(r.label)}</span><span class="set-target">${target} · ${kgLabel}</span></div>`;

  if (lastNote) html += `<div class="suggestion-note">${lastNote}</div>`;

  if (session) {
    const entries = session.entries[r.id] || [];
    html += r.type === 'tempo'
      ? `<div class="set-cols tempo-row"><span>#</span><span>Cronometro</span><span>Secondi</span><span>✓</span></div>`
      : `<div class="set-cols"><span>#</span><span>${unitLabel()}</span><span>Ripetizioni</span><span>✓</span></div>`;
    entries.forEach((e, i) => {
      if (r.type === 'tempo') {
        // plank & co.: cronometro conta-avanti che registra i secondi tenuti
        html += `<div class="set-row tempo-row">
          <span class="set-num">${i + 1}</span>
          <button class="btn-mini tempo-start" data-action="tempo-timer" data-entry="${r.id}" data-i="${i}" data-cat="${ex.restCat}">Cronometra</button>
          <input type="text" inputmode="numeric" placeholder="sec" value="${e.reps != null ? e.reps : ''}"
            data-entry="${r.id}" data-i="${i}" data-field="reps" aria-label="secondi">
          <button class="set-done ${e.done ? 'done' : ''}" data-action="toggle-done" data-entry="${r.id}" data-i="${i}" data-cat="${ex.restCat}" aria-label="Serie completata">✓</button>
        </div>`;
        return;
      }
      html += `<div class="set-row">
        <span class="set-num">${i + 1}</span>
        <input class="kg-input" type="text" inputmode="decimal" placeholder="${unitLabel()}" value="${e.kg != null ? String(toDisplayWeight(e.kg)).replace('.', ',') : ''}"
          data-entry="${r.id}" data-i="${i}" data-field="kg" aria-label="${unitLabel()}">
        <div class="rep-stepper">
          <button class="step-btn" data-action="step-reps" data-entry="${r.id}" data-i="${i}" data-d="-1" aria-label="Meno una rep">−</button>
          <input type="text" inputmode="numeric" placeholder="rep" value="${e.reps != null ? e.reps : ''}"
            data-entry="${r.id}" data-i="${i}" data-field="reps" aria-label="rep">
          <button class="step-btn" data-action="step-reps" data-entry="${r.id}" data-i="${i}" data-d="1" aria-label="Più una rep">+</button>
        </div>
        <button class="set-done ${e.done ? 'done' : ''}" data-action="toggle-done" data-entry="${r.id}" data-i="${i}" data-cat="${ex.restCat}" aria-label="Serie completata">✓</button>
      </div>`;
    });
    html += `<div class="set-more">
      ${entries.length > 1 ? `<button class="btn-mini" data-action="remove-set" data-entry="${r.id}">− serie</button>` : ''}
      <button class="btn-mini" data-action="add-set" data-entry="${r.id}">+ serie</button>
    </div>`;
  }
  return html + '</div>';
}

function lastPerformance(rowId) {
  const sessions = state.sessions
    .filter(s => s.completed && s.entries[rowId] && s.entries[rowId].some(e => e.done))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!sessions.length) return null;
  const entries = sessions[0].entries[rowId].filter(e => e.done);
  const parts = entries.map(e => (e.reps || 0)).join('/');
  const f = findRow(rowId);
  const when = 'Ultima (' + fmtDate(sessions[0].date) + '): ';
  if (f && f.row.type === 'tempo') return when + parts + ' sec';
  if (!entries[0].kg) return when + parts + ' rep'; // corpo libero: niente "0 kg"
  return when + fmtWeight(entries[0].kg) + ' × ' + parts;
}

/* Accanto a "Ultima": come cambia il peso di oggi rispetto all'ultima volta (solo serie con range). */
function lastTrend(r) {
  if (r.type !== 'range') return '';
  const last = state.sessions
    .filter(s => s.completed && (s.entries[r.id] || []).some(e => e.done && e.kg != null))
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!last) return '';
  const lastKg = Math.max(...last.entries[r.id].filter(e => e.done && e.kg != null).map(e => e.kg));
  const diff = Math.round(((r.weight || 0) - lastKg) * 10) / 10;
  if (!diff) return ' <span class="trend same">→ oggi stesso peso</span>';
  const txt = fmtKg(toDisplayWeight(Math.abs(diff))) + ' ' + unitLabel();
  return diff > 0 ? ` <span class="trend up">→ oggi +${txt} ↑</span>` : ` <span class="trend down">→ oggi −${txt} ↓</span>`;
}

/* =================== CONTROLLO DATI =================== */
function dataCheckModal() {
  const is = dataIssues();
  const name = f => esc(f.ex.name) + ' <span class="muted">' + esc(f.row.label) + '</span>';
  let html = '';
  if (is.weights.length) {
    html += `<div class="section-title">Pesi insoliti (${is.weights.length})</div>
      <p class="muted small">Molto diversi dalle sedute vicine: errore di battitura o attrezzo diverso? Correggi il peso oppure conferma.</p>`
      + is.weights.map((w, i) => `<div class="dc-item" data-w="${i}">
        <div class="dc-txt">${name(w.f)}<br><span class="muted">${fmtDate(w.session.date)} · di solito ~${fmtWeight(w.usual)}</span></div>
        <input class="dc-input" type="text" inputmode="decimal" value="${String(toDisplayWeight(w.kg)).replace('.', ',')}" aria-label="Peso">
        <button class="btn-mini" data-dc="fix">Salva</button>
        <button class="btn-mini" data-dc="ok">È giusto</button>
      </div>`).join('');
  }
  if (is.noReps.length) {
    html += `<div class="section-title">Serie senza ripetizioni (${is.noReps.length})</div>`
      + is.noReps.map((n, i) => `<div class="dc-item" data-n="${i}">
        <div class="dc-txt">${name(n.f)}<br><span class="muted">${fmtDate(n.session.date)} · ${n.entry.kg ? fmtWeight(n.entry.kg) : 'corpo'}</span></div>
        <input class="dc-input" type="text" inputmode="numeric" placeholder="rep" aria-label="Ripetizioni">
        <button class="btn-mini" data-dc="reps">Salva</button>
        <button class="btn-mini" data-dc="del">Elimina</button>
      </div>`).join('');
  }
  if (is.dupes.length) {
    html += `<div class="section-title">Due sedute nello stesso giorno (${is.dupes.length})</div>
      <p class="muted small">Se sono due allenamenti veri, correggi la data della seconda. Se è un doppione, eliminala.</p>`
      + is.dupes.map((d, i) => { const day = getDay(d.second.dayId); return `<div class="dc-item" data-d="${i}">
        <div class="dc-txt">${esc(day ? day.name : 'Giorno')}<br><span class="muted">2ª seduta del ${fmtDate(d.second.date)}</span></div>
        <input class="dc-input dc-date" type="date" value="${d.second.date}" max="${todayISO()}" aria-label="Data">
        <button class="btn-mini" data-dc="date">Salva</button>
        <button class="btn-mini" data-dc="deldupe">Elimina</button>
      </div>`; }).join('');
  }
  if (is.orphanSets) {
    html += `<div class="section-title">Esercizi eliminati</div>
      <div class="dc-item"><div class="dc-txt">${is.orphanSets} serie di ${is.orphanRows} esercizi che non sono più nel programma<br><span class="muted">Non compaiono nei grafici. Restano nel backup finché non le rimuovi.</span></div>
      <button class="btn-mini" data-dc="orphans">Rimuovi</button></div>`;
  }
  if (!html) html = '<p class="muted">Tutto in ordine: nessun dato sospetto. ✓</p>';
  const modal = openModal(`
    <h2>Controllo dati</h2>
    ${html}
    <div class="modal-actions"><button class="btn" data-close>Chiudi</button></div>
  `);
  const reopen = () => { removeBackdrop(modal.parentElement); saveState(); render(); dataCheckModal(); };
  modal.addEventListener('click', e => {
    const b = e.target.closest('[data-dc]'); if (!b) return;
    const item = b.closest('.dc-item'); const a = b.dataset.dc;
    const val = item.querySelector('.dc-input') ? parseNum(item.querySelector('.dc-input').value) : null;
    if (a === 'fix' || a === 'ok') {
      const w = is.weights[+item.dataset.w];
      const es = (w.session.entries[w.f.row.id] || []).filter(x => x.done);
      if (a === 'fix') {
        if (val == null || val < 0 || val > 1000) { toast('Inserisci un peso valido'); return; }
        const kg = fromDisplayWeight(val);
        es.forEach(x => { if (x.kg === w.kg) x.kg = kg; });
      }
      es.forEach(x => { x.checked = true; }); // non riproporlo più
      reopen();
    } else if (a === 'reps') {
      if (val == null || val < 0 || val > 9999) { toast('Inserisci le ripetizioni'); return; }
      const n = is.noReps[+item.dataset.n]; n.entry.reps = Math.round(val); reopen();
    } else if (a === 'del') {
      const n = is.noReps[+item.dataset.n];
      const arr = n.session.entries[n.f.row.id]; arr.splice(arr.indexOf(n.entry), 1); reopen();
    } else if (a === 'date') {
      const v = item.querySelector('.dc-date').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v > todayISO()) { toast('Data non valida'); return; }
      is.dupes[+item.dataset.d].second.date = v; reopen();
    } else if (a === 'deldupe') {
      if (!confirm('Eliminare questa seduta?')) return;
      const s = is.dupes[+item.dataset.d].second;
      state.sessions = state.sessions.filter(x => x.id !== s.id); reopen();
    } else if (a === 'orphans') {
      if (!confirm('Rimuovere dallo storico le serie degli esercizi eliminati? Fai prima un backup con "Esporta" se vuoi conservarle.')) return;
      const ids = new Set(); for (const d of state.days) for (const ex of d.exercises) for (const r of ex.rows) ids.add(r.id);
      for (const s of state.sessions) if (s.completed) for (const rid of Object.keys(s.entries)) if (!ids.has(rid)) delete s.entries[rid];
      reopen();
    }
  });
}

/* =================== VISTA: GRAFICI =================== */
function allRowsOptions() {
  const opts = [];
  for (const d of state.days) for (const ex of d.exercises) for (const r of ex.rows) {
    opts.push({ id: r.id, label: dayLetter(d.id) + ' — ' + ex.name + ' (' + r.label + ')' });
  }
  return opts;
}

function renderCharts() {
  const opts = allRowsOptions();
  if (!chartExRowId || !opts.some(o => o.id === chartExRowId)) chartExRowId = opts.length ? opts[0].id : null;
  return `
    <div class="chart-box">
      <h3>Forza per esercizio</h3>
      <div class="sub" id="chart-ex-sub">Peso massimo per seduta · 🪶 = settimana di scarico</div>
      <div class="form-row"><select id="chart-ex-select">
        ${opts.map(o => `<option value="${o.id}" ${o.id === chartExRowId ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
      </select></div>
      <div class="seg seg-sm">${[['6', 'Ultimi 6'], ['90', '3 mesi'], ['all', 'Tutto']].map(([k, l]) => `<button data-action="chart-range" data-range="${k}" class="${chartRange === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="chart-exercise"></div>
    </div>
    <div class="chart-box">
      <h3>Trend 1RM stimato</h3>
      <div class="sub">Massimale stimato (Epley) da serie fino a 12 rep · 🪶 = scarico</div>
      <div id="chart-e1rm"></div>
    </div>
    <div class="chart-box">
      <h3>Volume per seduta</h3>
      <div class="sub">Somma kg × rep · 🪶 = scarico</div>
      <div class="day-select compact" style="margin-bottom:10px">
        ${state.days.map(d => `<button class="day-pill ${d.id === chartVolumeDay ? 'active' : ''}" data-volday="${d.id}" style="--day:${d.color}"><span class="day-letter">${dayLetter(d.id)}</span></button>`).join('')}
      </div>
      <div id="chart-volume"></div>
    </div>
    <div class="chart-box">
      <h3>Costanza</h3>
      <div class="sub">Ultime 16 settimane · ogni quadratino è un giorno</div>
      <div id="cal-heatmap"></div>
    </div>
    <div class="chart-box">
      <h3>Volume per muscolo</h3>
      <div class="sub">Carico (kg × rep) degli ultimi 30 giorni · confronto settimana</div>
      <div id="vol-week"></div>
      <div id="vol-muscle"></div>
    </div>
    <div class="chart-box">
      <h3>Peso corporeo</h3>
      <div class="sub">Aggiorna il peso dalla scheda Profilo</div>
      <div id="chart-bodyweight"></div>
    </div>
  `;
}

/* Heatmap calendario (SVG): ultime `weeks` settimane, colonna = settimana, riga = giorno. */
function calendarHeatmap(weeks) {
  const days = sessionDays();
  const cell = 15, gap = 3, cols = weeks, rows = 7;
  const W = cols * (cell + gap), H = rows * (cell + gap) + 16;
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // lun=0
  // parti dal lunedì di `weeks-1` settimane fa
  const start = new Date(today); start.setDate(start.getDate() - dow - (weeks - 1) * 7);
  let sq = '';
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const d = new Date(start); d.setDate(start.getDate() + c * 7 + r);
      if (d > today) continue;
      const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const on = days.has(iso);
      sq += `<rect x="${c * (cell + gap)}" y="${r * (cell + gap)}" width="${cell}" height="${cell}" rx="3" style="fill:${on ? 'var(--good)' : 'var(--grid)'}"><title>${iso}${on ? ' · allenamento' : ''}</title></rect>`;
    }
  }
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${sq}</svg>`;
}

function mountCharts() {
  // periodo scelto: ultimi 6 allenamenti, ultimi 3 mesi o tutto
  const since = new Date(); since.setDate(since.getDate() - 90);
  const sinceISO = since.toISOString().slice(0, 10);
  const pick = pts => chartRange === '6' ? pts.slice(-6) : chartRange === '90' ? pts.filter(p => p.x >= sinceISO) : pts;
  if (chartExRowId) {
    const found = findRow(chartExRowId);
    const r = found && found.row;
    const wPts = rowWeightHistory(chartExRowId);
    // corpo libero / a cedimento: il peso è sempre 0 → mostro ripetizioni (o secondi)
    const byReps = r && (r.type === 'reps' || r.type === 'tempo' || !wPts.some(p => p.y > 0));
    const sub = $('#chart-ex-sub');
    if (byReps) {
      const unit = r.type === 'tempo' ? 'sec' : 'rep';
      if (sub) sub.textContent = (unit === 'sec' ? 'Secondi migliori' : 'Ripetizioni migliori') + ' per seduta (esercizio senza peso o a cedimento)';
      lineChart($('#chart-exercise'), [{ name: unit, color: '#0a84ff', points: pick(rowRepsHistory(chartExRowId)) }], { unit });
    } else {
      if (sub) sub.textContent = 'Peso massimo per seduta · 🪶 = settimana di scarico';
      lineChart($('#chart-exercise'), [{ name: 'kg', color: '#0a84ff', points: pick(wPts) }], { unit: 'kg' });
    }
    const e1 = $('#chart-e1rm');
    if (e1) {
      if (byReps) e1.innerHTML = '<div class="chart-empty">Il massimale stimato serve per gli esercizi con peso.</div>';
      else lineChart(e1, [{ name: '1RM', color: '#30d158', points: pick(e1RMHistory(chartExRowId)) }], { unit: 'kg' });
    }
  } else {
    $('#chart-exercise').innerHTML = '<div class="chart-empty">Nessun esercizio.</div>';
  }
  if (!getDay(chartVolumeDay) && state.days[0]) chartVolumeDay = state.days[0].id;
  const volColor = (getDay(chartVolumeDay) || {}).color || '#0a84ff';
  lineChart($('#chart-volume'), [{ name: 'volume', color: volColor, points: pick(dayVolumeHistory(chartVolumeDay)) }], { unit: 'kg tot' });
  const bwPts = (state.profile.bodyWeightLog || []).map(e => ({ x: e.date, y: e.kg }));
  lineChart($('#chart-bodyweight'), [{ name: 'peso', color: '#9085e9', points: bwPts }], { unit: 'kg' });

  // calendario costanza
  const cal = $('#cal-heatmap'); if (cal) cal.innerHTML = calendarHeatmap(16);

  // confronto volume settimanale
  const vw = $('#vol-week');
  if (vw) {
    const cur = weekVolume(0), prev = weekVolume(1);
    const diff = prev ? Math.round((cur - prev) / prev * 100) : 0;
    const arrow = cur > prev ? '▲' : cur < prev ? '▼' : '=';
    const cls = cur > prev ? 'up' : cur < prev ? 'down' : 'same';
    vw.innerHTML = `<div class="vol-week-row">
      <div><div class="stat-num">${cur.toLocaleString('it')}</div><div class="muted small">questa sett. (kg·rep)</div></div>
      <div class="${cls} strong">${arrow} ${prev ? Math.abs(diff) + '%' : '—'}</div>
      <div style="text-align:right"><div class="stat-num">${prev.toLocaleString('it')}</div><div class="muted small">scorsa sett.</div></div>
    </div>`;
  }

  // volume per gruppo muscolare (barre orizzontali)
  const vm = $('#vol-muscle');
  if (vm) {
    const data = volumeByMuscle(30);
    if (!data.length) { vm.innerHTML = '<div class="chart-empty">Nessun dato negli ultimi 30 giorni.</div>'; }
    else {
      const max = data[0].volume || 1;
      vm.innerHTML = data.map(d => `<div class="vol-bar-row">
        <span class="vol-bar-lbl">${esc(d.label)}</span>
        <span class="vol-bar-track"><span class="vol-bar-fill" style="width:${Math.max(4, Math.round(d.volume / max * 100))}%"></span></span>
        <span class="vol-bar-val">${d.volume.toLocaleString('it')}</span>
      </div>`).join('');
    }
  }
}

/* =================== VISTA: MUSCOLI =================== */
function renderMuscles() {
  const lit = musclesForDays(muscleDaysOn);
  const dayChips = state.days.map(d => `
    <button class="chip ${muscleDaysOn.includes(d.id) ? 'on' : ''}" data-muscleday="${d.id}" style="--day:${d.color}">
      ${esc(d.name)}
    </button>`).join('');

  const perDay = state.days.map(d => {
    const ms = [...new Set(d.exercises.flatMap(e => e.muscles || []))];
    return `<div class="card">
      <h3 style="color:${d.color}">${esc(d.name)}</h3>
      <div class="chip-wrap">${ms.map(m => `<span class="chip static">${esc(MUSCLES[m] || m)}</span>`).join('') || '<span class="muted">Nessun muscolo assegnato</span>'}</div>
    </div>`;
  }).join('');

  return `
    <div class="chip-wrap" style="justify-content:center;margin-bottom:14px">${dayChips}</div>
    <div class="card">
      <div class="body-wrap">
        ${muscleFigureSVG('front', lit)}
        ${muscleFigureSVG('back', lit)}
      </div>
      <div class="legend-row">
        ${state.days.filter(d => muscleDaysOn.includes(d.id)).map(d =>
          `<span class="legend-item"><span class="legend-dot" style="background:${d.color}"></span>${esc(d.name)}</span>`).join('')}
      </div>
      <p class="muted tiny" style="text-align:center">Se un muscolo è allenato in più giorni, mostra il colore del primo giorno selezionato.</p>
    </div>
    <div class="section-title">Muscoli per giornata</div>
    ${perDay}
    <p class="muted small">Per cambiare i muscoli di un esercizio: Allenamento → ✎ sull'esercizio.</p>
  `;
}

/* =================== VISTA: PROFILO =================== */
function renderProfile() {
  const tabs = [
    { id: 'profilo', label: 'Profilo' },
    { id: 'allenamento', label: 'Allenamento' },
    { id: 'backup', label: 'Backup' },
  ];
  if (!tabs.some(t => t.id === profileTab)) profileTab = 'profilo';
  const seg = `<div class="seg">${tabs.map(t => `<button data-action="ptab" data-ptab="${t.id}" class="${profileTab === t.id ? 'on' : ''}">${t.label}</button>`).join('')}</div>`;
  let body = '';
  if (profileTab === 'profilo') body = renderProfileDati();
  else if (profileTab === 'allenamento') body = renderProfileAllenamento();
  else body = renderProfileBackup();
  return seg + body;
}

/* --- Gruppo 1: dati personali + aspetto/preferenze --- */
function renderProfileDati() {
  const p = state.profile;
  const st = state.settings;
  const theme = st.theme === 'light' || st.theme === 'dark' ? st.theme : 'auto';
  return `
    <div class="card">
      <h3>Dati personali</h3>
      <div class="form-grid-2">
        <div class="form-row"><label>Nome</label><input id="p-name" value="${escAttr2(p.name || '')}" autocomplete="given-name"></div>
        <div class="form-row"><label>Età</label><input id="p-age" type="number" inputmode="numeric" value="${p.age || ''}"></div>
        <div class="form-row"><label>Altezza (cm)</label><input id="p-height" type="number" inputmode="numeric" value="${p.height || ''}"></div>
        <div class="form-row"><label>Peso (kg)</label><input id="p-bw" type="text" inputmode="decimal" value="${p.bodyWeight != null ? String(p.bodyWeight).replace('.', ',') : ''}"></div>
      </div>
      <button class="btn secondary full" data-action="save-profile">Salva profilo e registra peso</button>
      <p class="muted small" style="margin-top:8px">Ogni salvataggio con un peso nuovo aggiunge un punto al grafico del peso corporeo.</p>
    </div>

    <div class="card">
      <h3>Aspetto</h3>
      <div class="form-grid-2">
        <div class="form-row"><label>Tema</label>
          <select id="s-theme">
            <option value="auto" ${theme === 'auto' ? 'selected' : ''}>Automatico (come l'iPhone)</option>
            <option value="dark" ${theme === 'dark' ? 'selected' : ''}>Scuro</option>
            <option value="light" ${theme === 'light' ? 'selected' : ''}>Chiaro</option>
          </select>
        </div>
        <div class="form-row"><label>Unità</label>
          <select id="s-unit"><option value="kg" ${st.unit !== 'lb' ? 'selected' : ''}>kg</option><option value="lb" ${st.unit === 'lb' ? 'selected' : ''}>lb</option></select>
        </div>
      </div>
      <div class="form-row"><label class="check"><input id="s-voice" type="checkbox" ${st.cardioVoice ? 'checked' : ''}> Voce nel cardio (conteggio e fasi)</label></div>
      <button class="btn secondary full" data-action="save-appearance">Salva preferenze</button>
    </div>
  `;
}

/* --- Gruppo 2: timer, scarico, record, storico sedute --- */
function renderProfileAllenamento() {
  const st = state.settings;
  const completedCount = state.sessions.filter(s => s.completed).length;
  const recent = state.sessions.filter(s => s.completed).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
  return `
    <div class="card">
      <h3>Recuperi (secondi)</h3>
      <div class="form-grid-3">
        <div class="form-row"><label>Russo</label><input id="s-rest-russo" type="number" inputmode="numeric" value="${st.rest.russo.seconds}"></div>
        <div class="form-row"><label>Top set</label><input id="s-rest-normale" type="number" inputmode="numeric" value="${st.rest.normale.seconds}"></div>
        <div class="form-row"><label>Isolamento</label><input id="s-rest-isolamento" type="number" inputmode="numeric" value="${st.rest.isolamento.seconds}"></div>
      </div>
      <div class="form-grid-3">
        <div class="form-row"><label>Riscald. (s)</label><input id="s-cardio" type="number" inputmode="numeric" value="${st.cardioSeconds}"></div>
        <div class="form-row"><label>Rest riscald.</label><input id="s-wurest" type="number" inputmode="numeric" value="${st.warmupRest}"></div>
        <div class="form-row"><label>Incr. nuovi es.</label><input id="s-incr" type="text" inputmode="decimal" value="${String(st.smallIncrement).replace('.', ',')}"></div>
      </div>
      <div class="form-row">
        <label class="check"><input id="s-autoprogress" type="checkbox" ${st.autoProgress ? 'checked' : ''}> Aggiorna automaticamente i pesi a fine seduta (progressione)</label>
      </div>
      <div class="form-grid-2">
        <div class="form-row"><label>Sedute pesi a settimana</label><input id="s-weekly-goal" type="number" inputmode="numeric" min="1" max="14" value="${st.weeklyGoal || 3}"></div>
        <div class="form-row"><label>Sessioni cardio a settimana</label><input id="s-weekly-cardio" type="number" inputmode="numeric" min="1" max="14" value="${st.weeklyCardioGoal || 2}"></div>
      </div>
      <button class="btn secondary full" data-action="save-settings">Salva timer</button>
    </div>

    <div class="card">
      <h3>Scarico (deload)</h3>
      <p class="muted" style="margin-bottom:8px">${(() => { const d = deloadInfo(); if (!d.enabled) return 'Disattivato.'; if (d.active) return 'Questa settimana è di SCARICO: pesi dimezzati.'; return 'Sei alla settimana ' + d.weekInCycle + ' di ' + d.cycleLen + '. Scarico tra ' + d.weeksToDeload + ' settimana/e.'; })()}</p>
      <div class="form-row">
        <label class="check"><input id="s-deload-on" type="checkbox" ${st.deload.enabled ? 'checked' : ''}> Attiva scarico automatico</label>
      </div>
      <div class="form-grid-2">
        <div class="form-row"><label>Ogni (settimane)</label><input id="s-deload-weeks" type="number" inputmode="numeric" value="${st.deload.everyWeeks}"></div>
        <div class="form-row"><label>Riduzione %</label><input id="s-deload-factor" type="number" inputmode="numeric" value="${Math.round((st.deload.factor || 0.5) * 100)}"></div>
      </div>
      <div class="row-gap">
        <button class="btn secondary" style="flex:1" data-action="save-deload">Salva</button>
        <button class="btn secondary" style="flex:1" data-action="reset-deload">Riavvia ciclo oggi</button>
      </div>
    </div>

    ${(() => {
      const recs = allRecords().slice(0, 8);
      if (!recs.length) return '';
      return `<div class="card"><h3>Record · 1RM stimato</h3>${recs.map(r => `<div class="hist-item"><span><strong style="color:${r.day.color}">${dayLetter(r.day.id)}</strong> ${esc(r.ex.name)} <span class="muted">${esc(r.row.label)}</span></span><span class="strong">${fmtWeight(r.e1rm)}</span></div>`).join('')}<p class="muted small" style="margin-top:8px">Stima del massimale dai tuoi set (formula di Epley). Vedi il trend nella scheda Grafici.</p></div>`;
    })()}

    <div class="card">
      <h3>Storico sedute (${completedCount})</h3>
      ${recent.length ? recent.map(s => {
        const day = getDay(s.dayId);
        const nSets = Object.values(s.entries).flat().filter(e => e.done).length;
        const dayCol = day ? day.color : 'var(--ink-muted)';
        const dayLbl = day ? dayLetter(day.id) : '•';
        return `<div class="hist-item">
          <span><strong style="color:${dayCol}">${dayLbl}</strong> ${esc(day ? day.name : 'Giorno eliminato')} <span class="muted">· ${nSets} serie</span></span>
          <span class="row-gap"><span class="muted">${fmtDate(s.date)}</span>
          <button class="icon-btn" data-action="delete-session" data-session="${s.id}" aria-label="Elimina seduta">🗑</button></span>
        </div>`;
      }).join('') : '<p class="muted">Nessuna seduta completata.</p>'}
    </div>
  `;
}

/* --- Gruppo 3: sync + backup manuale --- */
function renderProfileBackup() {
  return `
    <div class="card">
      <h3>Sync tra dispositivi</h3>
      <div class="sync-status" id="sync-status"></div>
      ${syncEnabled() ? `
        <p class="muted" style="margin-bottom:8px">Codice di sincronizzazione (segreto: chi lo conosce accede ai tuoi dati):</p>
        <div class="row-gap" style="margin-bottom:10px">
          <code class="code-box">${esc(syncGetCode())}</code>
          <button class="btn-mini" data-action="sync-copy">Copia</button>
        </div>
        <div class="row-gap">
          <button class="btn secondary" style="flex:1" data-action="sync-now">Sincronizza ora</button>
          <button class="btn danger" style="flex:1" data-action="sync-off">Disattiva</button>
        </div>
      ` : `
        <p class="muted" style="margin-bottom:6px">Ora i tuoi dati sono <strong>solo su questo telefono</strong>: se cancelli i dati del browser (o l'app dalla Home) li perdi.</p>
        <p class="muted" style="margin-bottom:10px">Attiva il sync per avere un <strong>backup automatico nel cloud</strong> e i dati uguali su più dispositivi: genera un codice qui e, sull'altro dispositivo, scegli "Ho già un codice".</p>
        <div class="row-gap">
          <button class="btn" style="flex:1" data-action="sync-new">Attiva (nuovo codice)</button>
          <button class="btn secondary" style="flex:1" data-action="sync-join">Ho già un codice</button>
        </div>
      `}
    </div>

    <div class="card">
      <h3>Controllo dati</h3>
      <p class="muted" style="margin-bottom:10px">Cerca nello storico pesi insoliti, sedute doppie e serie incomplete. Non cambia nulla da solo: decidi tu caso per caso.</p>
      <button class="btn secondary full" data-action="data-check">Controlla lo storico</button>
    </div>

    <div class="card">
      <h3>Backup manuale</h3>
      <p class="muted" style="margin-bottom:10px">Esporta un file .json con TUTTO (scheda + storico). Per ripristinarlo su un altro telefono: "Importa" e scegli il file. ${syncEnabled() ? 'Col sync attivo di solito non serve.' : 'Consigliato se non usi il sync.'}</p>
      <div class="row-gap">
        <button class="btn secondary" style="flex:1" data-action="export">Esporta</button>
        <button class="btn secondary" style="flex:1" data-action="import">Importa</button>
      </div>
      <input type="file" id="import-file" accept=".json,application/json" class="hidden">
      <button class="btn danger full" style="margin-top:10px" data-action="reset-all">Azzera tutto</button>
    </div>
    <p class="muted tiny" style="text-align:center">Immagini esercizi © Gym visual — gymvisual.com · Dati: exercises-dataset (MIT)</p>
  `;
}

/* =================== TOAST (con Annulla) =================== */
let toastTimeout = null;
function toast(msg, opts) {
  opts = opts || {};
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.innerHTML = `<span>${esc(msg)}</span>${opts.undo ? '<button id="toast-undo">Annulla</button>' : ''}`;
  el.classList.add('show');
  if (opts.undo) {
    el.querySelector('#toast-undo').addEventListener('click', () => {
      el.classList.remove('show');
      clearTimeout(toastTimeout);
      opts.undo();
    });
  }
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), opts.duration || 4500);
}

function escAttr2(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function parseNum(v) {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

/* =================== MODAL (impilabili) =================== */
function openModal(html) {
  const root = $('#modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-grabber"></div>${html}</div>`;
  root.appendChild(backdrop); // impila sopra le finestre esistenti
  document.body.classList.add('modal-open');
  backdrop.addEventListener('click', e => { if (e.target === backdrop) removeBackdrop(backdrop); });
  backdrop.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => removeBackdrop(backdrop)));
  attachSwipeDismiss(backdrop.querySelector('.modal'), backdrop);
  return backdrop.querySelector('.modal');
}
function removeBackdrop(backdrop) {
  backdrop.remove();
  if (!$('#modal-root').querySelector('.modal-backdrop')) document.body.classList.remove('modal-open');
}

/* Gesto nativo iOS: trascina la scheda verso il basso per chiuderla.
   Si attiva solo quando la modale è in cima allo scroll e non si parte da un campo. */
function attachSwipeDismiss(modal, backdrop) {
  let startY = 0, dy = 0, dragging = false, tracking = false;
  const THRESH = 110;
  modal.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('input, textarea, select, button')) return;
    if (modal.scrollTop > 0) return;
    tracking = true; dragging = false; startY = e.clientY; dy = 0;
    modal.classList.remove('snapback');
  });
  modal.addEventListener('pointermove', e => {
    if (!tracking) return;
    dy = e.clientY - startY;
    if (dy > 6 && modal.scrollTop <= 0) {
      if (!dragging) { dragging = true; modal.classList.add('dragging'); try { modal.setPointerCapture(e.pointerId); } catch (_) {} }
      e.preventDefault();
      modal.style.transform = 'translateY(' + dy + 'px)';
    }
  }, { passive: false });
  const end = () => {
    if (!tracking) return;
    tracking = false;
    modal.classList.remove('dragging');
    if (dragging && dy > THRESH) {
      modal.classList.add('snapback');
      modal.style.transform = 'translateY(100%)';
      setTimeout(() => removeBackdrop(backdrop), 200);
    } else {
      modal.classList.add('snapback');
      modal.style.transform = '';
    }
    dragging = false;
  };
  modal.addEventListener('pointerup', end);
  modal.addEventListener('pointercancel', end);
}
// chiude la finestra in cima (l'ultima aperta)
function closeModal() {
  const backdrops = $('#modal-root').querySelectorAll('.modal-backdrop');
  if (backdrops.length) removeBackdrop(backdrops[backdrops.length - 1]);
}

/* ---------- modal modifica esercizio ---------- */
function editExerciseModal(dayId, exId) {
  const day = getDay(dayId);
  const isNew = !exId;
  const ex = isNew
    ? exercise('Nuovo esercizio', { rows: [row('S1', 'range', { repMin: 8, repMax: 10, weight: 20 })] })
    : day.exercises.find(e => e.id === exId);

  const rowEditor = (r, i) => `
    <div class="card inset" data-rowedit="${i}">
      <div class="form-grid-3">
        <div class="form-row"><label>Etichetta</label><input data-rf="label" value="${escAttr2(r.label)}"></div>
        <div class="form-row"><label>Tipo</label>
          <select data-rf="type">
            <option value="range" ${r.type === 'range' ? 'selected' : ''}>Rep range (cresce il peso)</option>
            <option value="russo" ${r.type === 'russo' ? 'selected' : ''}>Schema russo</option>
            <option value="reps" ${r.type === 'reps' ? 'selected' : ''}>A cedimento — batti le rep</option>
            <option value="tempo" ${r.type === 'tempo' ? 'selected' : ''}>A cedimento — batti i secondi</option>
          </select>
        </div>
        <div class="form-row"><label>Peso (kg)</label><input data-rf="weight" type="text" inputmode="decimal" value="${String(r.weight).replace('.', ',')}"></div>
      </div>
      <div class="form-grid-2 rf-range" style="${(r.type === 'range') ? '' : 'display:none'}">
        <div class="form-row"><label>Rep min</label><input data-rf="repMin" type="number" inputmode="numeric" value="${r.repMin}"></div>
        <div class="form-row"><label>Rep max</label><input data-rf="repMax" type="number" inputmode="numeric" value="${r.repMax}"></div>

      </div>
      <div class="form-grid-2 rf-sets" style="${r.type === 'russo' ? 'display:none' : ''}">
        <div class="form-row"><label>N. serie</label><input data-rf="sets" type="number" inputmode="numeric" value="${r.sets || 1}"></div>
      </div>
      <p class="muted small rf-hint" style="${(r.type === 'reps' || r.type === 'tempo') ? '' : 'display:none'}">Peso fisso: ogni volta l'obiettivo è battere ${r.type === 'tempo' ? 'i secondi' : 'le ripetizioni'} della volta prima.</p>
      <div class="form-grid-2 rf-russo" style="${r.type !== 'russo' ? 'display:none' : ''}">
        <div class="form-row"><label>Passo schema</label>
          <select data-rf="schemeIndex">
            ${RUSSO_SCHEME.map((s, j) => `<option value="${j}" ${j === (r.schemeIndex || 0) ? 'selected' : ''}>${s[0]}x${s[1]}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>+kg dopo 5x5</label><input data-rf="russoIncrement" type="text" inputmode="decimal" value="${String(r.russoIncrement || 5).replace('.', ',')}"></div>
      </div>
      <button class="btn-mini danger" data-delrow="${i}">Elimina riga</button>
    </div>`;

  // stato temporaneo del collegamento al database esercizi
  let tmpDs = { dsId: ex.dsId || null, dsMedia: ex.dsMedia || null, dsName: ex.dsName || null };
  // muscoli allenati: auto-derivati dall'esercizio del DB (non più a selezione manuale)
  let tmpMuscles = (ex.muscles || []).slice();

  const musclesBoxHtml = (list) => (list && list.length)
    ? list.map(m => `<span class="chip static">${esc(MUSCLES[m] || m)}</span>`).join('')
    : '<span class="muted">Collega un esercizio dal database per assegnare i muscoli.</span>';

  const linkBoxHtml = () => tmpDs.dsId
    ? `<div class="link-box">
         <img class="link-thumb" src="${exImg(tmpDs.dsMedia)}" alt="">
         <div style="flex:1;min-width:0"><div class="small strong">${esc(tmpDs.dsName || '')}</div>
           <div class="muted">Immagine e istruzioni collegate</div></div>
         <button type="button" class="btn-mini" id="ee-relink">Cambia</button>
         <button type="button" class="btn-mini danger" id="ee-unlink" aria-label="Scollega">×</button>
       </div>`
    : `<button type="button" class="btn secondary full" id="ee-link">🔎 Collega esercizio dal database</button>`;

  const modal = openModal(`
    <h2>${isNew ? 'Nuovo esercizio' : 'Modifica esercizio'}</h2>
    <div class="form-row"><label>Nome (come vuoi chiamarlo tu)</label><input id="ee-name" value="${escAttr2(ex.name)}"></div>
    <div class="form-row"><label>Esercizio dal database (immagine + come si fa)</label><div id="ee-linkbox">${linkBoxHtml()}</div></div>
    <div class="form-grid-2">
      <div class="form-row"><label>Nota</label><input id="ee-note" value="${escAttr2(ex.note || '')}"></div>
      <div class="form-row"><label>Incremento (kg)</label><input id="ee-inc" type="text" inputmode="decimal" value="${String(ex.incKg || exIncrement(ex)).replace('.', ',')}"></div>
    </div>
    <p class="muted small" style="margin:-4px 0 12px">Quanto sale (o scende) il peso quando arrivi al massimo del range. Su macchine ed esercizi leggeri usa 1 kg o il passo della macchina.</p>
    <div class="form-grid-2">
      <div class="form-row"><label>Recupero</label>
        <select id="ee-rest">
          ${Object.entries(state.settings.rest).map(([k, v]) => `<option value="${k}" ${ex.restCat === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
        </select>
      </div>
      <div class="form-row"><label>Riscaldamento</label>
        <select id="ee-warmup">
          <option value="none" ${ex.warmup === 'none' ? 'selected' : ''}>Nessuno (diretto)</option>
          <option value="full" ${ex.warmup === 'full' ? 'selected' : ''}>Completo (20/50/70%)</option>
          <option value="second" ${ex.warmup === 'second' ? 'selected' : ''}>Ridotto (50/70%)</option>
        </select>
      </div>
    </div>
    <div class="form-row"><label>Muscoli allenati <span class="muted" style="font-weight:400">(automatici dal database)</span></label>
      <div class="chip-wrap" id="ee-muscles">${musclesBoxHtml(tmpMuscles)}</div>
      <p class="muted small" style="margin-top:6px">Assegnati in automatico dall'esercizio collegato dal database. Collega o cambia l'esercizio per aggiornarli.</p>
    </div>
    <div class="section-title">Righe (S1, S2…)</div>
    <div id="ee-rows">${ex.rows.map(rowEditor).join('')}</div>
    <button class="btn-mini" id="ee-addrow">+ Aggiungi riga</button>
    <div class="modal-actions">
      ${!isNew ? `<button class="btn danger" id="ee-delete">Elimina</button>` : ''}
      <button class="btn secondary" data-close>Annulla</button>
      <button class="btn" id="ee-save">Salva</button>
    </div>
  `);

  // stato temporaneo delle righe (copia)
  const tmpRows = ex.rows.map(r => Object.assign({}, r));

  const rerenderRows = () => {
    modal.querySelector('#ee-rows').innerHTML = tmpRows.map(rowEditor).join('');
    bindRowEditors();
  };

  const bindRowEditors = () => {
    modal.querySelectorAll('[data-rowedit]').forEach(box => {
      const i = parseInt(box.dataset.rowedit);
      box.querySelectorAll('[data-rf]').forEach(inp => {
        inp.addEventListener('change', () => {
          const f = inp.dataset.rf;
          if (f === 'label') tmpRows[i].label = inp.value;
          else if (f === 'type') { tmpRows[i].type = inp.value; rerenderRows(); }
          else if (f === 'weight' || f === 'russoIncrement') tmpRows[i][f] = Math.max(0, Math.min(1000, parseNum(inp.value) || 0));
          else if (f === 'schemeIndex') tmpRows[i][f] = Math.max(0, Math.min(RUSSO_SCHEME.length - 1, parseInt(inp.value) || 0));
          else if (f === 'sets') tmpRows[i][f] = Math.max(1, Math.min(20, parseInt(inp.value) || 1));
          else tmpRows[i][f] = Math.max(1, Math.min(100, parseInt(inp.value) || 1)); // repMin / repMax
        });
      });
      const del = box.querySelector('[data-delrow]');
      if (del) del.addEventListener('click', () => {
        if (tmpRows.length <= 1) { toast('Serve almeno una riga.'); return; }
        tmpRows.splice(i, 1); rerenderRows();
      });
    });
  };
  bindRowEditors();

  modal.querySelector('#ee-addrow').addEventListener('click', () => {
    tmpRows.push(row('S' + (tmpRows.length + 1), 'range', { repMin: 8, repMax: 10, weight: 20 }));
    rerenderRows();
  });

  // ---- collegamento al database esercizi ----
  const refreshMusclesBox = () => { modal.querySelector('#ee-muscles').innerHTML = musclesBoxHtml(tmpMuscles); };
  const refreshLinkBox = () => {
    modal.querySelector('#ee-linkbox').innerHTML = linkBoxHtml();
    bindLinkBox();
  };
  const bindLinkBox = () => {
    const linkBtn = modal.querySelector('#ee-link');
    const relinkBtn = modal.querySelector('#ee-relink');
    const unlinkBtn = modal.querySelector('#ee-unlink');
    const openPicker = () => openExercisePicker(picked => {
      tmpDs = { dsId: picked.id, dsMedia: picked.m, dsName: picked.n };
      tmpMuscles = musclesFromDataset(picked); // muscoli automatici dall'esercizio scelto
      refreshMusclesBox();
      const nameInput = modal.querySelector('#ee-name');
      if (!nameInput.value.trim() || nameInput.value.trim() === 'Nuovo esercizio') nameInput.value = picked.n;
      refreshLinkBox();
    });
    if (linkBtn) linkBtn.addEventListener('click', openPicker);
    if (relinkBtn) relinkBtn.addEventListener('click', openPicker);
    if (unlinkBtn) unlinkBtn.addEventListener('click', () => { tmpDs = { dsId: null, dsMedia: null, dsName: null }; tmpMuscles = []; refreshMusclesBox(); refreshLinkBox(); });
  };
  bindLinkBox();

  // se l'esercizio è già collegato al DB, ri-deriva i muscoli dalla scheda (aggiorna anche i vecchi)
  if (tmpDs.dsId) {
    const applyDerived = (rec) => { if (rec) { tmpMuscles = musclesFromDataset(rec); refreshMusclesBox(); } };
    const rec = (typeof exById === 'function') ? exById(tmpDs.dsId) : null;
    if (rec) applyDerived(rec);
    else if (typeof ensureExercises === 'function') ensureExercises().then(() => applyDerived(exById(tmpDs.dsId))).catch(() => {});
  }

  if (!isNew) {
    const delBtn = modal.querySelector('#ee-delete');
    if (delBtn) delBtn.addEventListener('click', () => {
      const idx = day.exercises.findIndex(e => e.id === ex.id);
      day.exercises = day.exercises.filter(e => e.id !== ex.id);
      saveState(); closeModal(); render();
      toast('"' + ex.name + '" eliminato.', { undo: () => {
        day.exercises.splice(Math.min(idx, day.exercises.length), 0, ex);
        saveState(); render();
      } });
    });
  }

  modal.querySelector('#ee-save').addEventListener('click', () => {
    // i campi modificati senza uscirne (iOS non sempre lancia "change") vengono letti qui
    modal.querySelectorAll('[data-rowedit] [data-rf]').forEach(inp => inp.dispatchEvent(new Event('change')));
    ex.name = modal.querySelector('#ee-name').value.trim() || 'Esercizio';
    ex.note = modal.querySelector('#ee-note').value.trim();
    ex.incKg = Math.max(0.25, parseNum(modal.querySelector('#ee-inc').value) || 2.5);
    ex.restCat = modal.querySelector('#ee-rest').value;
    ex.warmup = modal.querySelector('#ee-warmup').value;
    ex.muscles = tmpMuscles;
    tmpRows.forEach(r => { if (r.repMin > r.repMax) [r.repMin, r.repMax] = [r.repMax, r.repMin]; });
    ex.rows = tmpRows;
    ex.dsId = tmpDs.dsId; ex.dsMedia = tmpDs.dsMedia; ex.dsName = tmpDs.dsName;
    if (isNew) day.exercises.push(ex);
    saveState(); closeModal(); render();
  });
}

/* Foglio di azioni dell'esercizio (come il menu "⋯" delle app Apple) */
function exerciseMenu(dayId, exId) {
  const day = getDay(dayId); if (!day) return;
  const ex = day.exercises.find(e => e.id === exId); if (!ex) return;
  const modal = openModal(`
    <div class="sheet-title">${esc(ex.name)}</div>
    <div class="sheet-list">
      ${ex.dsId ? `<button data-go="how">${ICON_INFO}<span>Come si fa</span></button>` : ''}
      <button data-go="history">${ICON_HISTORY}<span>Storico</span></button>
      <button data-go="edit">${ICON_EDIT}<span>Modifica esercizio</span></button>
    </div>
    <button class="btn secondary full" data-close>Annulla</button>
  `);
  modal.classList.add('sheet');
  modal.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    closeModal();
    const go = b.dataset.go;
    if (go === 'how') showHowToModal(exId);
    else if (go === 'history') exerciseHistoryModal(exId);
    else editExerciseModal(dayId, exId);
  }));
}

/* =================== CRONOMETRO PLANK (tipo 'tempo') =================== */
/* Conta-avanti a schermo: allo STOP registra i secondi tenuti nella serie. */
function tempoTimer(entryId, idx, cat) {
  const found = findRow(entryId);
  const prev = bestRepsFor(entryId);
  const fs = document.createElement('div');
  fs.className = 'cardio-fs ci-steady';
  fs.innerHTML = `
    <button class="ci-x" id="tt-x" aria-label="Chiudi">✕</button>
    <div class="ci-top">
      <div class="ci-phase">${found ? esc(found.row.label) : 'PLANK'}</div>
      <div class="ci-time" id="tt-time">0:00</div>
      <div class="ci-next" id="tt-goal">${prev ? 'Batti il record: ' + prev + ' sec' : 'Tieni il più possibile'}</div>
    </div>
    <div class="ci-actions">
      <button class="btn" id="tt-stop" style="background:rgba(0,0,0,0.28)">Stop e registra</button>
    </div>`;
  document.getElementById('modal-root').appendChild(fs);
  if (typeof acquireWakeLock === 'function') acquireWakeLock();
  const startedAt = Date.now();
  let iv = setInterval(() => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    fs.querySelector('#tt-time').textContent = fmtTime(s);
    const goal = fs.querySelector('#tt-goal');
    if (prev && s > prev && !goal.dataset.beat) { goal.dataset.beat = '1'; goal.textContent = '🔥 Record superato!'; goal.style.color = '#fff'; tickBeep(); if (navigator.vibrate) navigator.vibrate(120); }
  }, 250);
  const stop = () => {
    clearInterval(iv);
    if (typeof releaseWakeLock === 'function') releaseWakeLock();
    const sec = Math.round((Date.now() - startedAt) / 1000);
    fs.remove();
    const s = activeSession(); if (!s) return;
    const arr = s.entries[entryId]; if (!arr || !arr[idx]) return;
    arr[idx].reps = sec; arr[idx].done = true;
    saveState(); render();
    const catObj = state.settings.rest[cat] || state.settings.rest.isolamento;
    startTimer('Recupero', catObj.seconds);
    toast('Registrato ' + fmtTime(sec) + (prev && sec > prev ? ' — nuovo record! 🎉' : ''));
  };
  fs.querySelector('#tt-stop').addEventListener('click', stop);
  fs.querySelector('#tt-x').addEventListener('click', () => { clearInterval(iv); if (typeof releaseWakeLock === 'function') releaseWakeLock(); fs.remove(); });
}

/* =================== RISCALDAMENTO INIZIALE =================== */
function warmupModal() {
  const st = state.settings;
  const min = Math.floor(st.cardioSeconds / 60), sec = st.cardioSeconds % 60;
  const modal = openModal(`
    <h2>Riscaldamento iniziale</h2>
    <p class="muted small" style="margin-bottom:10px">Scegli il tipo (salto corda, camminata, bici…) e la durata.</p>
    <div class="form-row"><label>Tipo</label><input id="wu-name" value="${escAttr2(st.warmupName || '')}" placeholder="es. Salto corda, Camminata, Bici" list="wu-suggest">
      <datalist id="wu-suggest"><option value="Salto corda"><option value="Camminata"><option value="Corsa leggera"><option value="Bici"><option value="Cyclette"><option value="Ellittica"><option value="Vogatore"><option value="Mobilità"></datalist>
    </div>
    <div class="form-grid-2">
      <div class="form-row"><label>Minuti</label><input id="wu-min" type="number" inputmode="numeric" value="${min}"></div>
      <div class="form-row"><label>Secondi</label><input id="wu-sec" type="number" inputmode="numeric" value="${sec}"></div>
    </div>
    <div class="modal-actions"><button class="btn secondary" data-close>Annulla</button><button class="btn" id="wu-save">Salva</button></div>
  `);
  modal.querySelector('#wu-save').addEventListener('click', () => {
    st.warmupName = modal.querySelector('#wu-name').value.trim() || 'Riscaldamento';
    const m = Math.max(0, parseInt(modal.querySelector('#wu-min').value) || 0);
    const s = Math.max(0, Math.min(59, parseInt(modal.querySelector('#wu-sec').value) || 0));
    st.cardioSeconds = Math.max(10, m * 60 + s);
    saveState(); closeModal(); render();
  });
}

/* =================== GESTIONE GIORNI =================== */
function manageDaysModal() {
  const modal = openModal(`
    <h2>Gestisci giorni</h2>
    <p class="muted small" style="margin-bottom:10px">Aggiungi, rinomina, riordina o elimina i giorni. Il colore identifica i muscoli nella figura. Lo storico delle sedute resta salvato.</p>
    <div id="md-list"></div>
    <button class="btn secondary full" id="md-add">+ Aggiungi giorno</button>
    <div class="modal-actions"><button class="btn" data-close>Fine</button></div>
  `);
  const listEl = modal.querySelector('#md-list');

  const renderList = () => {
    listEl.innerHTML = state.days.map((d, i) => `
      <div class="md-row" data-day="${d.id}">
        <span class="md-letter" style="background:${d.color}">${dayLetter(d.id)}</span>
        <input class="md-name" value="${escAttr2(d.name)}" data-day="${d.id}">
        <input type="color" class="md-color" value="${d.color}" data-day="${d.id}" title="Colore">
        <button class="icon-btn" data-mdup="${d.id}" ${i === 0 ? 'disabled' : ''} aria-label="Su">↑</button>
        <button class="icon-btn" data-mddown="${d.id}" ${i === state.days.length - 1 ? 'disabled' : ''} aria-label="Giù">↓</button>
        <button class="icon-btn danger-ink" data-mddel="${d.id}" ${state.days.length <= 1 ? 'disabled' : ''} aria-label="Elimina">🗑</button>
      </div>`).join('');
    bindList();
  };
  const bindList = () => {
    listEl.querySelectorAll('.md-name').forEach(inp => inp.addEventListener('change', () => {
      const d = getDay(inp.dataset.day); if (d) { d.name = inp.value.trim() || 'Giorno'; saveState(); render(); }
    }));
    listEl.querySelectorAll('.md-color').forEach(inp => inp.addEventListener('change', () => {
      const d = getDay(inp.dataset.day); if (d) { d.color = inp.value; saveState(); renderList(); render(); }
    }));
    listEl.querySelectorAll('[data-mdup]').forEach(b => b.addEventListener('click', () => { moveDay(b.dataset.mdup, -1); renderList(); render(); }));
    listEl.querySelectorAll('[data-mddown]').forEach(b => b.addEventListener('click', () => { moveDay(b.dataset.mddown, 1); renderList(); render(); }));
    listEl.querySelectorAll('[data-mddel]').forEach(b => b.addEventListener('click', () => {
      const d = getDay(b.dataset.mddel);
      if (!confirm('Eliminare "' + d.name + '"? Gli esercizi del giorno si perdono, ma lo storico delle sedute resta.')) return;
      deleteDay(b.dataset.mddel); renderList(); render();
    }));
  };
  renderList();
  modal.querySelector('#md-add').addEventListener('click', () => { const d = addDay(); selectedDayId = d.id; renderList(); render(); });
}

/* =================== RICERCA / SCHEDA ESERCIZIO =================== */
function openExercisePicker(onPick) {
  const modal = openModal(`
    <h2>Cerca esercizio</h2>
    <div class="form-row"><input id="exp-q" type="search" placeholder="Es. pull up, squat, alzate laterali, curl…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></div>
    <p class="muted small" style="margin-bottom:8px">Nomi in inglese (capisce anche parole italiane); istruzioni in italiano. 1324 esercizi.</p>
    <div id="exp-results" class="exp-results"></div>
    <div class="modal-actions"><button class="btn secondary" data-close>Chiudi</button></div>
  `);
  const input = modal.querySelector('#exp-q');
  const box = modal.querySelector('#exp-results');
  let dsReady = false;

  const renderResults = (q) => {
    if (!dsReady) { box.innerHTML = '<p class="muted small">Caricamento database esercizi…</p>'; return; }
    if (!q || q.length < 2) { box.innerHTML = '<p class="muted small">Scrivi almeno 2 lettere…</p>'; return; }
    const res = exSearch(q, 40);
    if (!res.length) { box.innerHTML = '<p class="muted small">Nessun risultato.</p>'; return; }
    box.innerHTML = res.map(e => `
      <button class="exp-row" data-pick="${e.id}">
        <img src="${exImg(e.m)}" alt="" loading="lazy" decoding="async">
        <div style="min-width:0;text-align:left">
          <div class="small strong">${esc(e.n)}</div>
          <div class="muted">${esc(tMusc(e.tg))} · ${esc(tEquip(e.eq))}</div>
        </div>
      </button>`).join('');
  };
  renderResults('');
  ensureExercises()
    .then(() => { dsReady = true; renderResults(input.value.trim()); })
    .catch(() => { box.innerHTML = '<p class="muted small">Database non disponibile (serve la connessione la prima volta).</p>'; });

  let t = null;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => renderResults(input.value.trim()), 180); });
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    const picked = exById(b.dataset.pick);
    if (picked) { onPick(picked); closeModal(); }
  });
  setTimeout(() => input.focus(), 60);
}

/* Storico completo di un esercizio: tutte le sedute passate, riga per riga. */
function exerciseHistoryModal(exId) {
  let ex = null;
  for (const d of state.days) { const f = d.exercises.find(e => e.id === exId); if (f) { ex = f; break; } }
  if (!ex) return;
  const unit = unitLabel();
  const sections = ex.rows.map(r => {
    const hist = rowFullHistory(r.id);
    const isTime = r.type === 'tempo';
    const isReps = r.type === 'reps';
    const rowsHtml = hist.length ? hist.map(h => {
      const sets = h.sets.map(s => {
        if (isTime) return (s.reps || 0) + 's';
        if (isReps || !s.kg) return (s.reps || 0) + ' rep';
        return fmtKg(toDisplayWeight(s.kg)) + '×' + (s.reps || 0);
      }).join(' · ');
      const extra = (!isTime && !isReps && h.e1rm) ? ` <span class="muted">· 1RM ${fmtKg(toDisplayWeight(h.e1rm))}</span>` : '';
      return `<div class="hist-item"><span class="muted">${fmtDate(h.date)}</span><span style="text-align:right">${sets}${extra}</span></div>`;
    }).join('') : '<p class="muted small">Ancora nessuna seduta registrata.</p>';
    return `<div class="section-title">${esc(r.label)} <span class="muted" style="text-transform:none;letter-spacing:0">(${hist.length})</span></div>${rowsHtml}`;
  }).join('');
  openModal(`
    <h2>${esc(ex.name)} — storico</h2>
    <p class="muted small" style="margin-bottom:10px">Tutte le tue sedute passate${unit === 'lb' ? ' (pesi in lb)' : ''}, più recenti in alto.</p>
    ${sections}
    <div class="modal-actions"><button class="btn" data-close>Chiudi</button></div>
  `);
}

async function showHowToModal(exId) {
  let ex = null;
  for (const d of state.days) { const f = d.exercises.find(e => e.id === exId); if (f) { ex = f; break; } }
  if (!ex || !ex.dsId) return;
  try { await ensureExercises(); } catch (e) { /* offline senza cache: uso i dati salvati nell'esercizio */ }
  const ds = exById(ex.dsId) || { n: ex.dsName, m: ex.dsMedia, it: '', tg: '', mg: '', sec: [], eq: '' };
  const muscles = [ds.tg, ds.mg, ...(ds.sec || [])].filter(Boolean).map(tMusc);
  const uniqMuscles = [...new Set(muscles)];
  const modal = openModal(`
    <h2>${esc(ex.name)}</h2>
    ${ex.name !== ds.n ? `<p class="muted small" style="margin-top:-8px;margin-bottom:10px">${esc(ds.n)}</p>` : ''}
    <div class="how-media">
      <img id="how-img" src="${exImg(ds.m)}" alt="${esc(ds.n)}">
      <button class="btn-mini" id="how-anim">▶ Guarda il movimento</button>
    </div>
    <div class="chip-wrap" style="margin:12px 0">
      ${ds.eq ? `<span class="chip static">${esc(tEquip(ds.eq))}</span>` : ''}
      ${uniqMuscles.map(m => `<span class="chip static">${esc(m)}</span>`).join('')}
    </div>
    ${ds.it ? `<div class="section-title">Come si fa</div><p class="small" style="line-height:1.55">${esc(ds.it)}</p>` : ''}
    <p class="muted tiny" style="margin-top:12px">Immagine © Gym visual — gymvisual.com</p>
    <div class="modal-actions"><button class="btn" data-close>Chiudi</button></div>
  `);
  const animBtn = modal.querySelector('#how-anim');
  const img = modal.querySelector('#how-img');
  let animOn = false;
  if (animBtn) animBtn.addEventListener('click', () => {
    animOn = !animOn;
    img.src = animOn ? exGif(ds.m) : exImg(ds.m);
    animBtn.textContent = animOn ? '❚❚ Immagine fissa' : '▶ Guarda il movimento';
  });
}

/* =================== EVENTI VISTA =================== */
/* bindView: listener per-elemento (ricreati a ogni render perché gli elementi sono nuovi) */
function bindView() {
  const v = $('#view');

  const sel = v.querySelector('#chart-ex-select');
  if (sel) sel.addEventListener('change', () => { chartExRowId = sel.value; mountCharts(); });

  // input serie (kg / rep)
  v.querySelectorAll('input[data-entry]').forEach(inp => {
    inp.addEventListener('change', () => {
      const s = activeSession(); if (!s) return;
      const arr = s.entries[inp.dataset.entry]; if (!arr) return;
      const e = arr[parseInt(inp.dataset.i)]; if (!e) return;
      const val = parseNum(inp.value);
      // numeri non validi o negativi non vengono accettati (es. "-5")
      const ok = val != null && isFinite(val) && val >= 0;
      if (inp.dataset.field === 'kg') e.kg = ok ? Math.min(1000, fromDisplayWeight(val)) : (inp.value.trim() === '' ? null : e.kg);
      else e.reps = ok ? Math.min(9999, Math.round(val)) : (inp.value.trim() === '' ? null : e.reps);
      // peso molto diverso da quello previsto: avviso (non blocca), per evitare errori di battitura
      if (ok && inp.dataset.field === 'kg') {
        const f = findRow(inp.dataset.entry);
        const plan = f && f.row.type !== 'tempo' ? effectiveWeight(f.row.weight || 0) : 0;
        if (plan > 0 && e.kg > 0 && (e.kg / plan > 1.4 || e.kg / plan < 0.6) && Math.abs(e.kg - plan) >= 10) {
          toast('Peso insolito: ' + fmtWeight(e.kg) + ' (previsto ' + fmtWeight(plan) + '). Controlla di aver scritto giusto.', { duration: 6000 });
        }
      }
      if (!ok && inp.value.trim() !== '') { inp.value = inp.dataset.field === 'kg' ? (e.kg != null ? String(toDisplayWeight(e.kg)).replace('.', ',') : '') : (e.reps != null ? e.reps : ''); toast('Inserisci un numero positivo'); }
      saveState();
    });
  });
}

/* Prima di un tap su un pulsante, salva il campo che si sta modificando:
   su iPhone l'evento "change" a volte arriva DOPO il click (es. tap diretto sul ✓). */
function commitFocusedInput() {
  const a = document.activeElement;
  if (a && a.matches && a.matches('#view input[data-entry]')) a.dispatchEvent(new Event('change'));
}

/* Listener delegato: agganciato UNA sola volta (il nodo #view persiste tra i render) */
$('#view').addEventListener('click', e => {
  commitFocusedInput();
  const dayBtn = e.target.closest('[data-day]');
  if (dayBtn && !dayBtn.dataset.action) {
    selectedDayId = dayBtn.dataset.day;
    state.uiSelectedDay = selectedDayId;
    saveState(); render(); return;
  }
  const volBtn = e.target.closest('[data-volday]');
  if (volBtn) { chartVolumeDay = volBtn.dataset.volday; render(); return; }
  const mdBtn = e.target.closest('[data-muscleday]');
  if (mdBtn) {
    const id = mdBtn.dataset.muscleday;
    if (muscleDaysOn.includes(id)) muscleDaysOn = muscleDaysOn.filter(x => x !== id);
    else muscleDaysOn.push(id);
    render(); return;
  }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const a = btn.dataset.action;
  handleAction(a, btn);
});

function handleAction(a, btn) {

    if (a === 'start-session') startSession(btn.dataset.day);
    else if (a === 'manage-days') manageDaysModal();
    else if (a === 'add-day') { const d = addDay(); selectedDayId = d.id; render(); }
    else if (a === 'start-suggested') { selectedDayId = btn.dataset.day; startSession(btn.dataset.day); currentView = 'workout'; syncTabs(); render(); window.scrollTo(0, 0); }
    else if (a === 'go-workout') { currentView = 'workout'; syncTabs(); render(); window.scrollTo(0, 0); }
    else if (a === 'go-charts') { currentView = 'progress'; progressTab = 'grafici'; syncTabs(); render(); window.scrollTo(0, 0); }
    else if (a === 'go-cardio') { currentView = 'cardio'; syncTabs(); render(); window.scrollTo(0, 0); }
    else if (a === 'start-cardio') startCardioRunner(btn.dataset.cid);
    else if (a === 'edit-cardio') editCardioModal(btn.dataset.cid);
    else if (a === 'cardio-history') cardioHistoryModal(btn.dataset.cid);
    else if (a === 'add-cardio') editCardioModal(null);
    else if (a === 'show-how') showHowToModal(btn.dataset.ex);
    else if (a === 'ex-history') exerciseHistoryModal(btn.dataset.ex);
    else if (a === 'ex-menu') exerciseMenu(btn.dataset.day, btn.dataset.ex);
    else if (a === 'finish-session') finishSession();
    else if (a === 'cancel-session') cancelSession();
    else if (a === 'cardio-timer') startTimer(state.settings.warmupName || 'Riscaldamento', state.settings.cardioSeconds);
    else if (a === 'edit-warmup') warmupModal();
    else if (a === 'tempo-timer') {
      const s = activeSession(); if (!s) { toast('Prima premi "Inizia seduta".'); return; }
      tempoTimer(btn.dataset.entry, parseInt(btn.dataset.i), btn.dataset.cat);
    }
    else if (a === 'warmup-timer') startTimer('Rest riscaldamento', state.settings.warmupRest);
    else if (a === 'rest-timer') {
      const cat = state.settings.rest[btn.dataset.cat] || state.settings.rest.normale;
      startTimer('Recupero', cat.seconds);
    }
    else if (a === 'step-reps') {
      const s = activeSession(); if (!s) return;
      const arr = s.entries[btn.dataset.entry]; if (!arr) return;
      const entry = arr[parseInt(btn.dataset.i)]; if (!entry) return;
      entry.reps = Math.max(0, (entry.reps || 0) + parseInt(btn.dataset.d));
      saveState();
      // aggiornamento mirato dell'input (niente re-render: più fluido e non perde lo scroll)
      const inp = $('#view').querySelector(`input[data-entry="${btn.dataset.entry}"][data-i="${btn.dataset.i}"][data-field="reps"]`);
      if (inp) inp.value = entry.reps;
    }
    else if (a === 'toggle-done') {
      const s = activeSession(); if (!s) { toast('Prima premi "Inizia seduta".'); return; }
      const arr = s.entries[btn.dataset.entry]; if (!arr) return;
      const entry = arr[parseInt(btn.dataset.i)]; if (!entry) return;
      const rowId = btn.dataset.entry, iIdx = btn.dataset.i;
      entry.done = !entry.done;
      // rilevamento nuovo record (solo alla marcatura, batte il best delle sedute PASSATE)
      let isPR = false;
      if (entry.done) {
        if (entry.kg != null && entry.reps) {
          const prev = bestE1RM(rowId);
          if (prev > 0 && e1RM(entry.kg, entry.reps) > prev + 0.05) isPR = true;
        } else if (entry.reps) {
          const prevR = bestRepsFor(rowId);
          if (prevR > 0 && entry.reps > prevR) isPR = true;
        }
      }
      saveState();
      if (entry.done) {
        const cat = state.settings.rest[btn.dataset.cat] || state.settings.rest.normale;
        startTimer('Recupero', cat.seconds);
      }
      render();
      // micro-animazione sul ✓ appena renderizzato (+ celebrazione se è un record)
      const doneBtn = $('#view').querySelector(`button[data-action="toggle-done"][data-entry="${rowId}"][data-i="${iIdx}"]`);
      if (entry.done && doneBtn) {
        doneBtn.classList.add('pop');
        setTimeout(() => doneBtn.classList.remove('pop'), 450);
        if (isPR) celebratePR(doneBtn);
      }
    }
    else if (a === 'add-set') {
      const s = activeSession(); if (!s) return;
      const arr = s.entries[btn.dataset.entry]; if (!arr) return;
      const last = arr[arr.length - 1] || { kg: null };
      arr.push({ kg: last.kg, reps: null, done: false });
      saveState(); render();
    }
    else if (a === 'remove-set') {
      const s = activeSession(); if (!s) return;
      const arr = s.entries[btn.dataset.entry]; if (!arr) return;
      if (arr.length > 1) { arr.pop(); saveState(); render(); }
    }
    else if (a === 'edit-exercise') editExerciseModal(btn.dataset.day, btn.dataset.ex);
    else if (a === 'add-exercise') editExerciseModal(btn.dataset.day, null);
    else if (a === 'move-ex') {
      const day = getDay(btn.dataset.day);
      const i = day.exercises.findIndex(x => x.id === btn.dataset.ex);
      const j = i + parseInt(btn.dataset.dir);
      if (i >= 0 && j >= 0 && j < day.exercises.length) {
        const [m] = day.exercises.splice(i, 1);
        day.exercises.splice(j, 0, m);
        saveState(); render();
      }
    }
    else if (a === 'chart-range') { chartRange = btn.dataset.range || '6'; render(); }
    else if (a === 'prtab') { progressTab = btn.dataset.prtab || 'grafici'; render(); }
    else if (a === 'ptab') {
      profileTab = btn.dataset.ptab || 'profilo';
      render();
    }
    else if (a === 'save-profile') {
      state.profile.name = $('#p-name').value.trim();
      const age = parseNum($('#p-age').value), h = parseNum($('#p-height').value);
      state.profile.age = age != null && age > 0 && age < 120 ? Math.round(age) : null;
      state.profile.height = h != null && h > 50 && h < 260 ? h : null;
      let bw = parseNum($('#p-bw').value);
      if (bw != null && !(bw > 20 && bw < 400)) { toast('Peso corporeo non valido'); bw = null; }
      if (bw != null) {
        state.profile.bodyWeight = bw;
        const log = state.profile.bodyWeightLog || (state.profile.bodyWeightLog = []);
        const today = todayISO();
        const existing = log.find(x => x.date === today);
        if (existing) existing.kg = bw; else log.push({ date: today, kg: bw });
      }
      saveState(); toast('Profilo salvato ✓');
    }
    else if (a === 'save-appearance') {
      const st = state.settings;
      const th = $('#s-theme').value;
      st.theme = (th === 'light' || th === 'dark') ? th : 'auto';
      st.unit = $('#s-unit').value === 'lb' ? 'lb' : 'kg';
      st.cardioVoice = $('#s-voice').checked;
      applyTheme();
      saveState(); render(); toast('Preferenze salvate ✓');
    }
    else if (a === 'save-settings') {
      const st = state.settings;
      st.rest.russo.seconds = Math.max(10, parseInt($('#s-rest-russo').value) || DEFAULT_REST.russo.seconds);
      st.rest.normale.seconds = Math.max(10, parseInt($('#s-rest-normale').value) || DEFAULT_REST.normale.seconds);
      st.rest.isolamento.seconds = Math.max(10, parseInt($('#s-rest-isolamento').value) || DEFAULT_REST.isolamento.seconds);
      st.cardioSeconds = Math.max(10, parseInt($('#s-cardio').value) || 180);
      st.warmupRest = Math.max(10, parseInt($('#s-wurest').value) || 60);
      st.smallIncrement = parseNum($('#s-incr').value) || 2.5;
      st.autoProgress = $('#s-autoprogress').checked;
      st.weeklyGoal = Math.min(14, Math.max(1, parseInt($('#s-weekly-goal').value) || 3));
      st.weeklyCardioGoal = Math.min(14, Math.max(1, parseInt($('#s-weekly-cardio').value) || 2));
      saveState(); render(); toast('Timer salvati ✓');
    }
    else if (a === 'save-deload') {
      const d = state.settings.deload;
      d.enabled = $('#s-deload-on').checked;
      d.everyWeeks = Math.max(1, parseInt($('#s-deload-weeks').value) || 6);
      d.factor = Math.min(1, Math.max(0.1, (parseInt($('#s-deload-factor').value) || 50) / 100));
      if (!d.startDate) d.startDate = todayISO();
      saveState(); render(); toast('Scarico aggiornato ✓');
    }
    else if (a === 'reset-deload') {
      state.settings.deload.startDate = todayISO();
      saveState(); render(); toast('Ciclo di scarico riavviato da oggi ✓');
    }
    else if (a === 'delete-session') {
      const sess = state.sessions.find(x => x.id === btn.dataset.session);
      if (!sess) return;
      state.sessions = state.sessions.filter(x => x.id !== sess.id);
      saveState(); render();
      toast('Seduta eliminata.', { undo: () => { state.sessions.push(sess); saveState(); render(); } });
    }
    else if (a === 'sync-new') {
      const code = syncNewCode();
      syncEnable(code).then(() => render());
      toast('Sync attivato ✓ Copia il codice per gli altri dispositivi.');
      render();
    }
    else if (a === 'sync-join') {
      const modal = openModal(`
        <h2>Inserisci il codice</h2>
        <p class="muted small" style="margin-bottom:10px">Il codice generato sull'altro dispositivo. Le sedute dei due dispositivi vengono unite; per la scheda vince la versione più recente.</p>
        <div class="form-row"><input id="sj-code" placeholder="es. K3F9…" autocomplete="off" autocorrect="off" spellcheck="false" style="text-transform:uppercase"></div>
        <div class="modal-actions"><button class="btn secondary" data-close>Annulla</button><button class="btn" id="sj-ok">Collega</button></div>
      `);
      modal.querySelector('#sj-ok').addEventListener('click', () => {
        const code = modal.querySelector('#sj-code').value.trim().toUpperCase();
        if (code.length < 16) { toast('Codice troppo corto.'); return; }
        closeModal();
        syncEnable(code).then(() => render());
      });
    }
    else if (a === 'sync-now') syncPull();
    else if (a === 'sync-copy') {
      const code = syncGetCode();
      if (code && navigator.clipboard) navigator.clipboard.writeText(code).then(() => toast('Codice copiato ✓')).catch(() => toast('Copia non riuscita: tieni premuto il codice per copiarlo.'));
    }
    else if (a === 'sync-off') {
      syncDisable(); render();
      toast('Sync disattivato. I dati restano su questo dispositivo e nel cloud.');
    }
    else if (a === 'data-check') dataCheckModal();
    else if (a === 'export') exportData();
    else if (a === 'import') {
      const fi = $('#import-file');
      fi.onchange = () => {
        const f = fi.files[0]; if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            importData(reader.result);
            applyTheme();
            selectedDayId = state.uiSelectedDay || (state.days[0] && state.days[0].id) || 'A';
            muscleDaysOn = state.days.map(d => d.id);
            chartVolumeDay = state.days[0] ? state.days[0].id : 'A';
            toast('Dati importati ✓'); render();
          }
          catch (err) { toast('Import fallito: ' + err.message, { duration: 6000 }); }
          fi.value = ''; // permette di reimportare lo stesso file
        };
        reader.readAsText(f);
      };
      fi.click();
    }
    else if (a === 'reset-all') {
      if (!confirm('Azzerare TUTTI i dati (programma, sedute, profilo)? Operazione irreversibile.')) return;
      if (!confirm('Sei davvero sicuro? Fai prima un backup con "Esporta".')) return;
      localStorage.removeItem(STORAGE_KEY);
      state = null; loadState(); applyTheme(); render();
    }
}

/* Immagini esercizi non caricate (es. offline): niente icona "rotta" */
document.addEventListener('error', e => {
  const img = e.target;
  if (img && img.tagName === 'IMG' && !img.dataset.failed) { img.dataset.failed = '1'; img.style.visibility = 'hidden'; img.closest('.ex-thumb, .how-media, .exp-row, .link-box')?.classList.add('img-missing'); }
}, true);

/* =================== AVVIO =================== */
render();
syncInit(); // sync cloud in background (se attivato)

/* Onboarding al primo avvio: nome, unità, e invito ad attivare il backup cloud o importare. */
function onboardingModal() {
  const modal = openModal(`
    <h2>Benvenuto in Palestra</h2>
    <p class="muted small" style="margin-bottom:12px">Due cose veloci e sei pronto.</p>
    <div class="form-grid-2">
      <div class="form-row"><label>Come ti chiami?</label><input id="ob-name" placeholder="Il tuo nome"></div>
      <div class="form-row"><label>Unità</label><select id="ob-unit"><option value="kg">kg</option><option value="lb">lb</option></select></div>
    </div>
    <div class="card inset">
      <div class="strong small">Backup nel cloud (consigliato)</div>
      <p class="muted small" style="margin:6px 0 10px">Senza, i dati stanno solo su questo telefono e si perdono se cancelli l'app. Attivalo: ottieni un codice per ritrovarli ovunque.</p>
      <button class="btn full" id="ob-sync">Attiva backup cloud</button>
    </div>
    <p class="muted small">Hai già un backup .json? Saltare qui, poi Profilo → Backup → Importa.</p>
    <div class="modal-actions"><button class="btn secondary" id="ob-skip">Salta</button><button class="btn" id="ob-done">Inizia</button></div>
  `);
  const finish = () => {
    state.profile.name = modal.querySelector('#ob-name').value.trim();
    state.settings.unit = modal.querySelector('#ob-unit').value === 'lb' ? 'lb' : 'kg';
    state.onboarded = true;
    saveState(); closeModal(); render();
  };
  modal.querySelector('#ob-done').addEventListener('click', finish);
  modal.querySelector('#ob-skip').addEventListener('click', () => { state.onboarded = true; saveState(); closeModal(); });
  modal.querySelector('#ob-sync').addEventListener('click', () => {
    state.profile.name = modal.querySelector('#ob-name').value.trim();
    state.settings.unit = modal.querySelector('#ob-unit').value === 'lb' ? 'lb' : 'kg';
    state.onboarded = true; saveState();
    const code = syncNewCode();
    syncEnable(code).then(() => render());
    closeModal();
    currentView = 'profile'; profileTab = 'backup'; syncTabs(); render();
    toast('Backup attivato ✓ Copia il codice per gli altri dispositivi.');
  });
}
if (!state.onboarded) setTimeout(onboardingModal, 300);
else setTimeout(checkStaleSession, 300);

/* Seduta rimasta aperta da un giorno precedente: chiedi cosa farne. */
function checkStaleSession() {
  const s = activeSession();
  if (!s || s.date >= todayISO()) return;
  const day = getDay(s.dayId);
  const done = Object.values(s.entries).flat().filter(e => e.done).length;
  const modal = openModal(`
    <h2>Seduta ancora aperta</h2>
    <p class="muted" style="margin-bottom:12px">La seduta <strong>${esc(day ? day.name : '')}</strong> del ${fmtDate(s.date)} non è stata terminata (${done} serie segnate).</p>
    <div class="modal-actions" style="flex-direction:column">
      ${done ? `<button class="btn full" id="st-finish">Salvala e chiudi</button>` : ''}
      <button class="btn secondary full" id="st-resume">Continuala oggi</button>
      <button class="btn danger full" id="st-discard">Scartala</button>
    </div>
  `);
  const f = modal.querySelector('#st-finish');
  if (f) f.addEventListener('click', () => { closeModal(); finishSession(); });
  modal.querySelector('#st-resume').addEventListener('click', () => { s.date = todayISO(); saveState(); closeModal(); render(); });
  modal.querySelector('#st-discard').addEventListener('click', () => { closeModal(); cancelSession(); });
}
