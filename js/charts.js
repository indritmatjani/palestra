/* ============ Grafici SVG (nessuna libreria, funziona offline) ============ */
'use strict';

/*
 lineChart(container, series, opts)
 series: [{ name, color, points: [{x: 'YYYY-MM-DD', y: number, label }] }]
 opts: { unit: 'kg', height }
 Un solo asse Y. Tooltip su tap/hover.
 I colori di griglia/testo usano le variabili CSS: si adattano a tema chiaro e scuro.
*/
function lineChart(container, series, opts) {
  opts = opts || {};
  const unit = opts.unit || '';
  const W = 560, H = opts.height || 260;
  const padL = 54, padR = 16, padT = 16, padB = 38;

  const allPts = series.flatMap(s => s.points);
  if (!allPts.length) {
    container.innerHTML = '<div class="chart-empty">Nessun dato ancora.<br>Completa una seduta per vedere i progressi.</div>';
    return;
  }

  // asse X: date ordinate uniche
  const dates = [...new Set(allPts.map(p => p.x))].sort();
  const xPos = d => {
    if (dates.length === 1) return padL + (W - padL - padR) / 2;
    return padL + (dates.indexOf(d) / (dates.length - 1)) * (W - padL - padR);
  };
  // settimane di scarico: date da evidenziare con una banda 🪶
  const deloadDates = [...new Set(allPts.filter(p => p.deload).map(p => p.x))];
  const spacing = dates.length > 1 ? (W - padL - padR) / (dates.length - 1) : (W - padL - padR);
  const bandW = Math.min(spacing * 0.62, 24);

  let yMin = Math.min(...allPts.map(p => p.y));
  let yMax = Math.max(...allPts.map(p => p.y));
  if (yMin === yMax) { yMin -= 5; yMax += 5; }
  const span = yMax - yMin;
  yMin = Math.max(0, yMin - span * 0.15);
  yMax = yMax + span * 0.15;
  const yPos = v => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);

  // tick Y (4 livelli, valori "belli")
  const ticks = [];
  const rawStep = (yMax - yMin) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
  const step = Math.max(mag * Math.ceil(rawStep / mag), 0.5);
  for (let v = Math.ceil(yMin / step) * step; v <= yMax + 0.001; v += step) ticks.push(v);

  let g = '';
  // bande settimana di scarico (dietro la griglia)
  for (const d of deloadDates) {
    const x = xPos(d);
    g += `<rect x="${(x - bandW / 2).toFixed(1)}" y="${padT}" width="${bandW.toFixed(1)}" height="${(H - padT - padB).toFixed(1)}" fill="rgba(201,133,0,0.16)"/>`;
    g += `<text x="${x.toFixed(1)}" y="${padT + 14}" text-anchor="middle" font-size="16">🪶</text>`;
  }
  // griglia + etichette Y
  for (const t of ticks) {
    const y = yPos(t);
    g += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" style="stroke:var(--grid)" stroke-width="1"/>`;
    g += `<text x="${padL - 8}" y="${y + 5.5}" text-anchor="end" style="fill:var(--ink-muted)" font-size="16">${fmtKg(Math.round(t * 10) / 10)}</text>`;
  }
  // etichette X (max ~5)
  const xEvery = Math.max(1, Math.ceil(dates.length / 4));
  dates.forEach((d, i) => {
    if (i % xEvery === 0 || i === dates.length - 1) {
      const anchor = dates.length > 1 && i === 0 ? 'start' : (dates.length > 1 && i === dates.length - 1 ? 'end' : 'middle');
      g += `<text x="${xPos(d)}" y="${H - 10}" text-anchor="${anchor}" style="fill:var(--ink-muted)" font-size="15">${fmtDate(d)}</text>`;
    }
  });
  // baseline
  g += `<line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" style="stroke:var(--border)" stroke-width="1"/>`;

  // serie
  series.forEach(s => {
    const pts = [...s.points].sort((a, b) => (a.x < b.x ? -1 : 1));
    if (!pts.length) return;
    const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + xPos(p.x).toFixed(1) + ',' + yPos(p.y).toFixed(1)).join(' ');
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    pts.forEach(p => {
      const dotColor = p.deload ? '#c98500' : s.color;
      const tip = (p.label ? p.label + ' — ' : '') + fmtKg(p.y) + ' ' + unit + ' · ' + fmtDate(p.x) + (p.deload ? ' · 🪶 scarico' : '');
      // cerchio invisibile più grande: area di tocco comoda col dito
      g += `<circle cx="${xPos(p.x).toFixed(1)}" cy="${yPos(p.y).toFixed(1)}" r="20" fill="transparent" data-tip="${escAttr(tip)}"/>`;
      g += `<circle cx="${xPos(p.x).toFixed(1)}" cy="${yPos(p.y).toFixed(1)}" r="6.5" fill="${dotColor}" style="stroke:var(--surface)" stroke-width="2.5" pointer-events="none"/>`;
    });
    // etichetta diretta ultimo punto
    const lp = pts[pts.length - 1];
    g += `<text x="${Math.min(xPos(lp.x) + 8, W - 4)}" y="${yPos(lp.y) - 12}" style="fill:var(--ink)" font-size="18" font-weight="700" text-anchor="end">${fmtKg(lp.y)}</text>`;
  });

  container.innerHTML = `
    <div class="chart-svg-wrap">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">${g}</svg>
      <div class="chart-tooltip"></div>
    </div>`;

  // tooltip su tap/hover dei punti
  const wrap = container.querySelector('.chart-svg-wrap');
  const tip = wrap.querySelector('.chart-tooltip');
  const svg = wrap.querySelector('svg');
  let tipTimeout = null;
  const showTip = (target, clientX, clientY) => {
    const txt = target.getAttribute('data-tip');
    if (!txt) return;
    const r = wrap.getBoundingClientRect();
    tip.textContent = txt;
    tip.style.display = 'block';
    tip.style.left = Math.max(60, Math.min(clientX - r.left, r.width - 60)) + 'px';
    tip.style.top = (clientY - r.top) + 'px';
    clearTimeout(tipTimeout);
    tipTimeout = setTimeout(() => { tip.style.display = 'none'; }, 2500);
  };
  svg.addEventListener('click', e => {
    const c = e.target.closest('circle[data-tip]');
    if (c) showTip(c, e.clientX, e.clientY);
    else tip.style.display = 'none';
  });
  svg.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') {
      const c = e.target.closest('circle[data-tip]');
      if (c) showTip(c, e.clientX, e.clientY);
    }
  });
}

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/* ---------- estrazione dati dalle sessioni ---------- */

/* Storico peso per una riga esercizio: [{x: date, y: kg, label}] */
function rowWeightHistory(rowId) {
  const pts = [];
  for (const s of state.sessions) {
    if (!s.completed) continue;
    const entries = (s.entries[rowId] || []).filter(e => e.done && e.kg != null);
    if (!entries.length) continue;
    const bestKg = Math.max(...entries.map(e => e.kg));
    const best = entries.find(e => e.kg === bestKg);
    pts.push({ x: s.date, y: bestKg, label: (best.reps || 0) + ' rep', deload: deloadWeekActive(s.date) });
  }
  return pts.sort((a, b) => (a.x < b.x ? -1 : 1));
}

/* Volume totale (kg × rep) per sessione di un giorno */
function dayVolumeHistory(dayId) {
  const pts = [];
  const day = getDay(dayId);
  if (!day) return pts;
  const rowIds = new Set(day.exercises.flatMap(ex => ex.rows.map(r => r.id)));
  for (const s of state.sessions) {
    if (!s.completed || s.dayId !== dayId) continue;
    let vol = 0;
    for (const [rid, entries] of Object.entries(s.entries)) {
      if (!rowIds.has(rid)) continue;
      for (const e of entries) {
        if (e.done && e.kg != null && e.reps) vol += e.kg * e.reps;
      }
    }
    if (vol > 0) pts.push({ x: s.date, y: Math.round(vol), label: 'volume', deload: deloadWeekActive(s.date) });
  }
  return pts.sort((a, b) => (a.x < b.x ? -1 : 1));
}
