/* ============ Sezione Cardio: HIIT a intervalli, continuo, cronometro ============ */
'use strict';

/* ---------- voce (conteggio e annunci fasi) ---------- */
function cardioVoiceOn() { return !state.settings || state.settings.cardioVoice !== false; }
function say(text) {
  try {
    if (!cardioVoiceOn() || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'it-IT'; u.rate = 1.1; u.volume = 1;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (e) {}
}

/* ---------- audio (indipendente dal timer pesi) ---------- */
let cardioAudio = null;
function cTone(freq, dur, when, vol) {
  try {
    if (!cardioAudio) cardioAudio = new (window.AudioContext || window.webkitAudioContext)();
    if (cardioAudio.state === 'suspended') cardioAudio.resume();
    const o = cardioAudio.createOscillator(), g = cardioAudio.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    o.connect(g); g.connect(cardioAudio.destination);
    const t = cardioAudio.currentTime + (when || 0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.4, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}
function cSweep(f1, f2, dur, when, vol) {
  try {
    if (!cardioAudio) cardioAudio = new (window.AudioContext || window.webkitAudioContext)();
    if (cardioAudio.state === 'suspended') cardioAudio.resume();
    const o = cardioAudio.createOscillator(), g = cardioAudio.createGain();
    o.type = 'sawtooth'; o.connect(g); g.connect(cardioAudio.destination);
    const t = cardioAudio.currentTime + (when || 0);
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}
function vibr(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
// PASSAGGIO → LAVORO: sweep in salita "vai!" + tripla nota alta
function beepWork() { cSweep(300, 900, 0.18, 0, 0.4); cTone(1000, 0.16, 0.2); cTone(1250, 0.30, 0.4, 0.5); vibr([60, 40, 160]); }
// PASSAGGIO → RIPOSO: sweep in discesa "stop" + due note basse
function beepRest() { cSweep(700, 300, 0.22, 0, 0.4); cTone(430, 0.28, 0.24); vibr([220]); }
function beepEnd() { for (let i = 0; i < 5; i++) cTone(700 + i * 120, 0.22, i * 0.26, 0.5); vibr([300, 120, 300, 120, 500]); } // fine sessione
function beepCount() { cTone(760, 0.09, 0, 0.3); vibr(70); }                                    // ultimi 3 secondi

/* =================== VISTA CARDIO =================== */
/* Testo di progressione mostrato sulla card: cosa ti aspetta e come cresce. */
function cardioGoalText(c) {
  if (c.type === 'interval' && c.mode === 'fixedtime') {
    if (c.restSec <= 0) return { big: fmtClock(c.totalSec), unit: 'continuo', sub: 'Completalo e il tempo sale di 1 min' };
    return { big: c.workSec + 's / ' + c.restSec + 's', unit: '× ' + cardioRounds(c), sub: fmtClock(c.totalSec) + ' fissi · completali e il lavoro sale di ' + (c.stepSec || 5) + 's' };
  }
  if (c.type === 'interval') return { big: String(c.rounds), unit: 'round', sub: c.workSec + 's lavoro / ' + c.restSec + 's riposo' };
  if (c.type === 'steady') {
    const sub = c.pendingTarget
      ? 'Settimana completata ✓ · da lunedì ' + c.pendingTarget + ' min'
      : 'Completalo questa settimana: da lunedì ' + nextWeeklyTarget(c.targetMin) + ' min';
    return { big: String(c.targetMin), unit: 'min', sub: c.autoProgress ? sub : 'Obiettivo fisso' };
  }
  return { big: '—', unit: '', sub: 'Cronometro libero' };
}

function renderCardio() {
  let changed = false;
  for (const c of (state.cardio || [])) if (applyCardioWeek(c)) changed = true;
  if (changed) saveState();
  if (!state.cardio || !state.cardio.length) {
    return `<div class="card"><p class="muted">Nessuna attività cardio.</p></div>
      <button class="btn full" data-action="add-cardio">Aggiungi attività</button>`;
  }
  const cards = state.cardio.map(c => {
    const last = cardioLastText(c);
    const g = cardioGoalText(c);
    return `<div class="card cardio-card" style="--day:${c.color}">
      <div class="row-between">
        <div class="cardio-name"><span class="dot"></span>${esc(c.name)}</div>
        <button class="icon-btn" data-action="edit-cardio" data-cid="${c.id}" aria-label="Modifica">⋯</button>
      </div>
      <div class="cardio-goal"><span class="big">${esc(g.big)}</span><span class="unit">${esc(g.unit)}</span></div>
      <div class="muted">${esc(g.sub)}</div>
      ${last ? `<div class="cardio-last">Ultima volta · ${esc(last)}</div>` : ''}
      <div id="cardio-chart-${c.id}" class="cardio-chart"></div>
      <button class="btn full" style="background:${c.color}" data-action="start-cardio" data-cid="${c.id}">Avvia</button>
    </div>`;
  }).join('');
  return cards + `<button class="btn secondary full" data-action="add-cardio">Aggiungi attività</button>`;
}

function cardioSeries(c) {
  const log = (c.log || []).filter(Boolean).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  if (c.type === 'interval') return { pts: log.map(l => ({ x: l.date, y: l.roundsDone })), unit: 'round' };
  if (c.type === 'steady') return { pts: log.map(l => ({ x: l.date, y: Math.round((l.durationSec / 60) * 10) / 10 })), unit: 'min' };
  return { pts: log.map(l => ({ x: l.date, y: Math.round((l.durationSec / 60) * 10) / 10 })), unit: 'min' };
}

function mountCardioCharts() {
  for (const c of (state.cardio || [])) {
    const el = document.getElementById('cardio-chart-' + c.id);
    if (!el) continue;
    const s = cardioSeries(c);
    if (!s.pts.length) { el.innerHTML = ''; continue; }
    lineChart(el, [{ name: s.unit, color: c.color, points: s.pts }], { unit: s.unit, height: 150 });
  }
}

/* =================== RUNNER (overlay a tutto schermo) =================== */
let cardioTimer = { interval: null };

function openFullscreen(html) {
  const el = document.createElement('div');
  el.className = 'cardio-fs';
  el.innerHTML = html;
  document.getElementById('modal-root').appendChild(el);
  return el;
}
function closeFullscreen(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

function startCardioRunner(cid) {
  const c = getCardio(cid);
  if (!c) return;
  if (applyCardioWeek(c)) saveState();
  // sblocca l'audio col tocco dell'utente
  try { if (!cardioAudio) cardioAudio = new (window.AudioContext || window.webkitAudioContext)(); if (cardioAudio.state === 'suspended') cardioAudio.resume(); } catch (e) {}
  if (c.type === 'interval') runInterval(c);
  else runStopwatch(c);
}

function runInterval(c) {
  const rounds = (typeof cardioRounds === 'function') ? cardioRounds(c) : c.rounds;
  const continuous = c.restSec <= 0;               // riposo 0 = lavoro continuo
  const contTotal = (c.mode === 'fixedtime') ? c.totalSec : c.workSec * rounds;
  const fs = openFullscreen(`
    <button class="ci-x" id="ci-x" aria-label="Chiudi">✕</button>
    <div class="ci-top">
      <div class="ci-round" id="ci-round">${continuous ? 'Continuo' : 'Round 1 / ' + rounds}</div>
      <div class="ci-phase" id="ci-phase">PRONTO</div>
      <div class="ci-time" id="ci-time">${continuous ? fmtClock(contTotal) : c.workSec}</div>
      <div class="ci-next" id="ci-next">Preparati…</div>
    </div>
    <div class="ci-dots" id="ci-dots"></div>
    <div class="ci-actions">
      <button class="btn" id="ci-pause" style="background:rgba(255,255,255,0.22)">Pausa</button>
      <button class="btn" id="ci-stop" style="background:rgba(0,0,0,0.28)">Termina</button>
    </div>
  `);
  const phaseEl = fs.querySelector('#ci-phase');
  const timeEl = fs.querySelector('#ci-time');
  const roundEl = fs.querySelector('#ci-round');
  const nextEl = fs.querySelector('#ci-next');
  const dotsEl = fs.querySelector('#ci-dots');

  const st = {
    round: 1, phase: 'prep', // prep | work | rest
    phaseEnd: Date.now() + 3000, // 3s di preparazione
    roundsDone: 0, startedAt: Date.now(), paused: false, pausedRemain: 0,
    lastCountBeep: null,
  };
  if (typeof acquireWakeLock === 'function') acquireWakeLock();
  cTone(600, 0.15, 0);

  const setPhaseUI = () => {
    fs.className = 'cardio-fs ci-' + st.phase;
    if (st.phase === 'prep') { phaseEl.textContent = 'PRONTO'; nextEl.textContent = 'Si comincia…'; }
    else if (st.phase === 'work') { phaseEl.textContent = continuous ? 'SALTA!' : 'LAVORO'; nextEl.textContent = continuous ? 'in continuo, non fermarti' : ('poi RIPOSO ' + c.restSec + 's'); }
    else if (st.phase === 'rest') { phaseEl.textContent = 'RIPOSO'; nextEl.textContent = st.round < rounds ? 'poi LAVORO — round ' + (st.round + 1) : 'ultimo riposo'; }
    if (continuous) { roundEl.textContent = 'Continuo ' + fmtClock(contTotal); dotsEl.innerHTML = ''; }
    else {
      roundEl.textContent = 'Round ' + Math.min(st.round, rounds) + ' / ' + rounds;
      dotsEl.innerHTML = Array.from({ length: rounds }, (_, i) => `<span class="ci-dot ${i < st.roundsDone ? 'done' : ''}"></span>`).join('');
    }
  };
  setPhaseUI();

  const finish = () => {
    clearInterval(cardioTimer.interval);
    if (typeof releaseWakeLock === 'function') releaseWakeLock();
    beepEnd();
    const totalSec = Math.round((Date.now() - st.startedAt) / 1000);
    const tip = logCardio(c.id, { roundsDone: st.roundsDone, rounds, workSec: c.workSec, restSec: c.restSec, totalSec });
    closeFullscreen(fs);
    showCardioSummary(c, st.roundsDone, totalSec, tip);
  };
  const quit = () => { clearInterval(cardioTimer.interval); if (typeof releaseWakeLock === 'function') releaseWakeLock(); closeFullscreen(fs); };

  const tick = () => {
    if (st.paused) return;
    const remainMs = st.phaseEnd - Date.now();
    const remain = Math.max(0, Math.ceil(remainMs / 1000));
    timeEl.textContent = continuous && st.phase === 'work' ? fmtClock(remain) : remain;
    if (remain <= 3 && remain >= 1 && st.lastCountBeep !== remain) { st.lastCountBeep = remain; beepCount(); say(String(remain)); }
    if (remainMs > 0) return;
    if (st.phase === 'prep') {
      st.phase = 'work'; beepWork(); say(continuous ? 'Via!' : 'Lavoro');
      st.phaseEnd = Date.now() + (continuous ? contTotal : c.workSec) * 1000;
    }
    else if (st.phase === 'work') {
      if (continuous) { st.roundsDone = rounds; finish(); return; }
      st.roundsDone += 1; st.phase = 'rest'; st.phaseEnd = Date.now() + c.restSec * 1000; beepRest(); say('Riposo');
    }
    else if (st.phase === 'rest') {
      if (st.round >= rounds) { finish(); return; }
      st.round += 1; st.phase = 'work'; st.phaseEnd = Date.now() + c.workSec * 1000; beepWork(); say('Lavoro');
    }
    st.lastCountBeep = null;
    setPhaseUI();
  };
  cardioTimer.interval = setInterval(tick, 200);

  fs.querySelector('#ci-pause').addEventListener('click', e => {
    st.paused = !st.paused;
    if (st.paused) { st.pausedRemain = st.phaseEnd - Date.now(); e.target.textContent = 'Riprendi'; }
    else { st.phaseEnd = Date.now() + st.pausedRemain; e.target.textContent = 'Pausa'; }
  });
  const stopEarly = () => {
    // nel continuo i round "fatti" si contano dal tempo saltato
    if (continuous && st.phase === 'work') {
      const left = st.paused ? st.pausedRemain : (st.phaseEnd - Date.now());
      const workedSec = Math.max(0, contTotal - Math.max(0, left) / 1000);
      st.roundsDone = Math.floor(workedSec / Math.max(1, c.workSec));
    }
    if (st.roundsDone > 0) finish(); else quit();
  };
  fs.querySelector('#ci-stop').addEventListener('click', stopEarly);
  fs.querySelector('#ci-x').addEventListener('click', stopEarly);
}

/* =================== RUNNER CONTINUO / CRONOMETRO =================== */
function runStopwatch(c) {
  const target = c.type === 'steady' ? c.targetMin * 60 : 0;
  const fs = openFullscreen(`
    <button class="ci-x" id="cs-x" aria-label="Chiudi">✕</button>
    <div class="ci-top">
      <div class="ci-phase">${c.type === 'steady' ? 'CARDIO' : 'CRONOMETRO'}</div>
      <div class="ci-time" id="cs-time">0:00</div>
      ${target ? `<div class="ci-next" id="cs-target">Obiettivo ${fmtClock(target)}</div>` : ''}
    </div>
    <div class="ci-actions">
      <button class="btn" id="cs-pause" style="background:rgba(255,255,255,0.22)">Pausa</button>
      <button class="btn" id="cs-stop" style="background:rgba(0,0,0,0.28)">Termina</button>
    </div>
  `);
  fs.classList.add('ci-steady');
  const timeEl = fs.querySelector('#cs-time');
  let startedAt = Date.now(), paused = false, pausedAcc = 0, pauseStart = 0, reached = false;
  if (typeof acquireWakeLock === 'function') acquireWakeLock();
  const elapsed = () => Math.round((Date.now() - startedAt - pausedAcc) / 1000);
  const tick = () => {
    const s = elapsed();
    timeEl.textContent = fmtClock(s);
    if (target && !reached && s >= target) { reached = true; beepEnd(); const t = fs.querySelector('#cs-target'); if (t) { t.textContent = '✓ Obiettivo raggiunto!'; t.style.color = '#fff'; t.style.fontWeight = '700'; } }
  };
  cardioTimer.interval = setInterval(tick, 250);

  fs.querySelector('#cs-pause').addEventListener('click', e => {
    paused = !paused;
    if (paused) { pauseStart = Date.now(); clearInterval(cardioTimer.interval); e.target.textContent = 'Riprendi'; }
    else { pausedAcc += Date.now() - pauseStart; cardioTimer.interval = setInterval(tick, 250); e.target.textContent = 'Pausa'; }
  });
  const stop = () => {
    clearInterval(cardioTimer.interval);
    if (typeof releaseWakeLock === 'function') releaseWakeLock();
    if (paused) { pausedAcc += Date.now() - pauseStart; paused = false; } // non contare la pausa in corso
    const durationSec = elapsed();
    closeFullscreen(fs);
    if (durationSec < 3) return;
    if (c.type === 'steady' && c.trackDistance) askDistanceThenLog(c, durationSec);
    else { const tip = logCardio(c.id, { durationSec }); showCardioSummary(c, null, durationSec, tip); }
  };
  fs.querySelector('#cs-stop').addEventListener('click', stop);
  fs.querySelector('#cs-x').addEventListener('click', stop);
}

function askDistanceThenLog(c, durationSec) {
  const modal = openModal(`
    <h2>${esc(c.name)}</h2>
    <p class="muted small">Durata: ${fmtClock(durationSec)}</p>
    <div class="form-row"><label>Distanza (km) — opzionale</label><input id="cd-dist" type="text" inputmode="decimal" placeholder="es. 3,5"></div>
    <div class="modal-actions"><button class="btn secondary" id="cd-skip">Salta</button><button class="btn" id="cd-save">Salva</button></div>
  `);
  const save = (dist) => {
    const tip = logCardio(c.id, { durationSec, distanceKm: dist });
    closeModal(); showCardioSummary(c, null, durationSec, tip);
  };
  modal.querySelector('#cd-skip').addEventListener('click', () => save(null));
  modal.querySelector('#cd-save').addEventListener('click', () => save(parseNum(modal.querySelector('#cd-dist').value)));
}

function showCardioSummary(c, roundsDone, totalSec, tip) {
  const rounds = (typeof cardioRounds === 'function') ? cardioRounds(c) : c.rounds;
  const body = c.type === 'interval'
    ? `<div class="progress-change"><span>${c.restSec <= 0 ? 'Continuo completato' : 'Round completati'}</span><span class="up">${c.restSec <= 0 ? '✓' : roundsDone + ' / ' + rounds}</span></div>
       <div class="progress-change"><span>Tempo totale</span><span>${fmtClock(totalSec)}</span></div>`
    : `<div class="progress-change"><span>Durata</span><span class="up">${fmtClock(totalSec)}</span></div>`;
  openModal(`
    <h2>Cardio completato</h2>
    ${body}
    ${tip ? `<p class="suggestion-note" style="margin-top:10px">${esc(tip)}</p>` : ''}
    <div class="modal-actions"><button class="btn" data-close>OK</button></div>
  `);
  render();
}

/* =================== MODIFICA / AGGIUNGI ATTIVITÀ =================== */
function editCardioModal(cid) {
  const isNew = !cid;
  const c = isNew ? cardioActivity('Nuova attività', 'steady', { color: '#0a84ff', autoProgress: true, trackDistance: true }) : getCardio(cid);
  const modal = openModal(`
    <h2>${isNew ? 'Nuova attività' : 'Modifica attività'}</h2>
    <div class="form-grid-2">
      <div class="form-row"><label>Nome</label><input id="cc-name" value="${escAttr2(c.name)}"></div>
      <div class="form-row"><label>Colore</label><input id="cc-color" type="color" value="${c.color}"></div>
    </div>
    <div class="form-row"><label>Nota</label><input id="cc-note" value="${escAttr2(c.note || '')}"></div>
    <div class="form-row"><label>Tipo</label>
      <select id="cc-type">
        <option value="interval" ${c.type === 'interval' ? 'selected' : ''}>HIIT a intervalli (on/off)</option>
        <option value="steady" ${c.type === 'steady' ? 'selected' : ''}>Continuo (durata/distanza)</option>
        <option value="stopwatch" ${c.type === 'stopwatch' ? 'selected' : ''}>Cronometro libero</option>
      </select>
    </div>
    <div id="cc-intwrap" style="${c.type !== 'interval' ? 'display:none' : ''}">
      <div class="form-row"><label>Progressione intervalli</label>
        <select id="cc-mode">
          <option value="rounds" ${c.mode !== 'fixedtime' ? 'selected' : ''}>Aumenta i round (tempo cresce)</option>
          <option value="fixedtime" ${c.mode === 'fixedtime' ? 'selected' : ''}>Tempo fisso: cresce il lavoro fino al continuo</option>
        </select>
      </div>
      <div class="form-grid-3">
        <div class="form-row"><label>Lavoro (s)</label><input id="cc-work" type="number" inputmode="numeric" value="${c.workSec}"></div>
        <div class="form-row"><label>Riposo (s)</label><input id="cc-rest" type="number" inputmode="numeric" value="${c.restSec}"></div>
        <div class="form-row" id="cc-rounds-wrap" style="${c.mode === 'fixedtime' ? 'display:none' : ''}"><label>Round</label><input id="cc-rounds" type="number" inputmode="numeric" value="${c.rounds}"></div>
        <div class="form-row" id="cc-total-wrap" style="${c.mode !== 'fixedtime' ? 'display:none' : ''}"><label>Tempo tot. (min)</label><input id="cc-total" type="number" inputmode="numeric" value="${Math.round((c.totalSec || 600) / 60)}"></div>
      </div>
      <p class="muted small" id="cc-fixhint" style="${c.mode !== 'fixedtime' ? 'display:none' : ''}">Il round dura lavoro+riposo (${(c.workSec + c.restSec)}s). A ogni completamento ${c.stepSec || 5}s passano dal riposo al lavoro, a tempo totale fisso, fino al continuo. Poi, a ogni continuo completato, il tempo totale sale di 1 minuto.</p>
    </div>
    <div id="cc-steady" class="form-grid-2" style="${c.type !== 'steady' ? 'display:none' : ''}">
      <div class="form-row"><label>Obiettivo attuale (min)</label><input id="cc-target" type="number" inputmode="numeric" value="${c.targetMin}"></div>
      <div class="form-row"><label class="check" style="margin-top:22px"><input id="cc-dist" type="checkbox" ${c.trackDistance ? 'checked' : ''}> Chiedi i km</label></div>
    </div>
    <div class="form-row"><label class="check"><input id="cc-auto" type="checkbox" ${c.autoProgress ? 'checked' : ''}> Progressione automatica</label><p class="muted small" style="margin-top:4px">Continuo: +10% a settimana quando completi l'obiettivo. Intervalli: cresce il lavoro (o i round) quando completi.</p></div>
    <div class="modal-actions">
      ${!isNew ? `<button class="btn danger" id="cc-del">Elimina</button>` : ''}
      <button class="btn secondary" data-close>Annulla</button>
      <button class="btn" id="cc-save">Salva</button>
    </div>
  `);
  const typeSel = modal.querySelector('#cc-type');
  const modeSel = modal.querySelector('#cc-mode');
  typeSel.addEventListener('change', () => {
    modal.querySelector('#cc-intwrap').style.display = typeSel.value === 'interval' ? '' : 'none';
    modal.querySelector('#cc-steady').style.display = typeSel.value === 'steady' ? '' : 'none';
  });
  modeSel.addEventListener('change', () => {
    const fx = modeSel.value === 'fixedtime';
    modal.querySelector('#cc-rounds-wrap').style.display = fx ? 'none' : '';
    modal.querySelector('#cc-total-wrap').style.display = fx ? '' : 'none';
    modal.querySelector('#cc-fixhint').style.display = fx ? '' : 'none';
  });
  if (!isNew) {
    const del = modal.querySelector('#cc-del');
    if (del) del.addEventListener('click', () => {
      if (!confirm('Eliminare "' + c.name + '"? Lo storico di questa attività si perde.')) return;
      state.cardio = state.cardio.filter(x => x.id !== c.id);
      saveState(); closeModal(); render();
    });
  }
  modal.querySelector('#cc-save').addEventListener('click', () => {
    c.name = modal.querySelector('#cc-name').value.trim() || 'Cardio';
    c.color = modal.querySelector('#cc-color').value;
    c.note = modal.querySelector('#cc-note').value.trim();
    c.type = typeSel.value;
    c.mode = modeSel.value;
    c.workSec = Math.max(1, parseInt(modal.querySelector('#cc-work').value) || 20);
    const restVal = parseInt(modal.querySelector('#cc-rest').value);
    c.restSec = Math.max(0, isNaN(restVal) ? 10 : restVal); // 0 è valido (= continuo)
    c.roundSec = c.workSec + c.restSec;
    if (c.mode === 'fixedtime') {
      c.totalSec = Math.max(60, (parseInt(modal.querySelector('#cc-total').value) || 10) * 60);
      c.rounds = cardioRounds(c);
    } else {
      c.rounds = Math.max(1, parseInt(modal.querySelector('#cc-rounds').value) || 8);
    }
    const newTarget = Math.max(1, parseInt(modal.querySelector('#cc-target').value) || 20);
    if (newTarget !== c.targetMin) { c.pendingTarget = null; c.progressWeek = null; }
    c.targetMin = newTarget;
    c.trackDistance = modal.querySelector('#cc-dist').checked;
    c.autoProgress = modal.querySelector('#cc-auto').checked;
    if (isNew) state.cardio.push(c);
    saveState(); closeModal(); render();
  });
}
