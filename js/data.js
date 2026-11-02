/* ============ Palestra — dati, persistenza, progressione ============ */
'use strict';

const STORAGE_KEY = 'palestra-app-v1';

/* Schema russo: sequenza di (serie x rep) */
const RUSSO_SCHEME = [[3,3],[4,3],[5,3],[3,4],[4,4],[5,4],[3,5],[4,5],[5,5]];

/* Muscoli disponibili (id → etichetta) */
const MUSCLES = {
  petto:        'Petto',
  spalle:       'Spalle (ant/lat)',
  spallePost:   'Spalle posteriori',
  trapezio:     'Trapezio',
  dorsali:      'Dorsali',
  lombari:      'Lombari',
  bicipiti:     'Bicipiti',
  tricipiti:    'Tricipiti',
  avambracci:   'Avambracci',
  addome:       'Addome',
  obliqui:      'Obliqui',
  glutei:       'Glutei',
  quadricipiti: 'Quadricipiti',
  femorali:     'Femorali',
  adduttori:    'Adduttori',
  abduttori:    'Abduttori',
  polpacci:     'Polpacci',
};

/* Categorie recupero (secondi default, modificabili) */
const DEFAULT_REST = {
  russo:      { label: 'Russo (3 min)',              seconds: 180 },
  normale:    { label: 'Top set + back off (5–7 min)', seconds: 360 },
  isolamento: { label: 'Isolamento (2 min)',         seconds: 120 },
};

let uidCounter = 0;
function uid() {
  return Date.now().toString(36) + '-' + (uidCounter++).toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

/*
 Riga esercizio (set line):
 { id, label:'S1', type:'russo'|'range'|'reps'|'tempo',
   repMin, repMax,          (per range)
   schemeIndex,             (per russo: indice in RUSSO_SCHEME)
   russoIncrement,          (kg da aggiungere dopo 5x5)
   weight (kg), sets (n. serie per questa riga) }
 Esercizio:
 { id, name, note, restCat, warmup:'full'|'second'|'none', muscles:[], rows:[] }
*/

/* type:
   'russo'  → schema russo a top set (progressione di schema, poi peso)
   'range'  → rep range: sopra il range aumenta il peso (fino a maxWeight, se impostato)
   'reps'   → a cedimento: peso fisso, si progredisce battendo le RIPETIZIONI
   'tempo'  → a cedimento: si progredisce battendo i SECONDI (plank ecc.)
   maxWeight: tetto di carico (0 = nessuno). Al tetto si progredisce a ripetizioni. */
function row(label, type, opts) {
  return Object.assign({
    id: uid(), label, type,
    repMin: 8, repMax: 10,
    schemeIndex: 0, russoIncrement: 5,
    weight: 0, sets: 1, maxWeight: 0,
  }, opts);
}

/* Miglior risultato (rep o secondi) mai registrato per una riga, prima di una data. */
function bestRepsFor(rowId, beforeDate) {
  let best = 0;
  for (const s of state.sessions) {
    if (!s.completed) continue;
    if (beforeDate && s.date >= beforeDate) continue;
    for (const e of (s.entries[rowId] || [])) {
      if (e.done && e.reps) best = Math.max(best, e.reps);
    }
  }
  return best;
}

function exercise(name, opts) {
  const ex = Object.assign({
    id: uid(), name, note: '',
    restCat: 'normale', warmup: 'none',
    muscles: [], rows: [],
  }, opts);
  if (!(Number(ex.incKg) > 0)) ex.incKg = defaultIncFor(ex, 2.5);
  return ex;
}

function defaultState() {
  return {
    profile: { name: '', age: null, bodyWeight: null, bodyWeightLog: [] },
    settings: {
      rest: JSON.parse(JSON.stringify(DEFAULT_REST)),
      smallIncrement: 2.5,
      cardioSeconds: 180,
      warmupName: 'Salto corda',
      warmupRest: 60,
      autoProgress: true,
      weeklyGoal: 3,     // obiettivo sedute/settimana (anello di progresso nella Home)
      weeklyCardioGoal: 2, // obiettivo sessioni cardio/settimana (secondo anello nella Home)
      unit: 'kg',        // 'kg' | 'lb' (i pesi sono sempre salvati in kg)
      theme: 'auto',     // 'auto' (segue iPhone) | 'dark' | 'light'
      cardioVoice: true, // conteggio vocale nel cardio
      // Deload: ogni 6 settimane di carico, 1 settimana di scarico coi kg dimezzati
      deload: { enabled: true, everyWeeks: 6, factor: 0.5, startDate: todayISO() },
    },
    onboarded: false,
    days: [
      {
        id: 'A', name: 'Giorno A', color: '#3987e5', exercises: [
          exercise('Trazioni esplosive', {
            note: 'Quando riesco: muscle up. Elastico giallo.',
            dsId: '0652', dsMedia: '0652-lBDjFxJ', dsName: 'pull-up',
            restCat: 'russo', warmup: 'full',
            muscles: ['dorsali', 'bicipiti', 'avambracci'],
            rows: [row('S1', 'russo', { schemeIndex: 1, weight: 0, russoIncrement: 5 })],
          }),
          exercise('Chest inclinata rossa', {
            dsId: '1299', dsMedia: '1299-jHAnWmT', dsName: 'lever incline chest press',
            restCat: 'normale', warmup: 'second',
            muscles: ['petto', 'spalle', 'tricipiti'],
            rows: [
              row('S1', 'range', { repMin: 4, repMax: 6, weight: 100 }),
              row('S2', 'range', { repMin: 8, repMax: 10, weight: 80 }),
            ],
          }),
          exercise('RDL', {
            dsId: '0085', dsMedia: '0085-wQ2c4XD', dsName: 'barbell romanian deadlift',
            restCat: 'normale', warmup: 'second',
            muscles: ['femorali', 'glutei', 'lombari'],
            rows: [
              row('S1', 'range', { repMin: 6, repMax: 8, weight: 60 }),
              row('S2', 'range', { repMin: 10, repMax: 12, weight: 30 }),
            ],
          }),
          exercise('Seated face pull', {
            dsId: '0202', dsMedia: '0202-yUdIGNs', dsName: 'cable rear delt row (stirrups)',
            restCat: 'isolamento',
            muscles: ['spallePost', 'trapezio'],
            rows: [row('S1', 'range', { repMin: 10, repMax: 15, weight: 15 })],
          }),
          exercise('Adductor interno', {
            dsId: '0598', dsMedia: '0598-oHsrypV', dsName: 'lever seated hip adduction',
            restCat: 'isolamento',
            note: 'Max macchina 93 kg: poi si cresce a rep, a cedimento',
            muscles: ['adduttori'],
            rows: [row('S1', 'range', { repMin: 4, repMax: 8, weight: 91, maxWeight: 93 })],
          }),
          exercise('Crunch cavi', {
            dsId: '0175', dsMedia: '0175-WW95auq', dsName: 'cable kneeling crunch',
            restCat: 'isolamento',
            muscles: ['addome'],
            rows: [
              row('S1', 'range', { repMin: 10, repMax: 15, weight: 60 }),
              row('S2', 'range', { repMin: 15, repMax: 20, weight: 50 }),
            ],
          }),
        ],
      },
      {
        id: 'B', name: 'Giorno B', color: '#199e70', exercises: [
          exercise('Leg press gamba singola', {
            dsId: '2611', dsMedia: '2611-9KU9TYF', dsName: 'lever horizontal one leg press',
            restCat: 'russo', warmup: 'full',
            muscles: ['quadricipiti', 'glutei'],
            rows: [row('S1', 'russo', { schemeIndex: 2, weight: 60, russoIncrement: 10 })],
          }),
          exercise('Shoulder Press', {
            dsId: '0869', dsMedia: '0869-vqsbmL0', dsName: 'lever shoulder press v. 2',
            restCat: 'normale', warmup: 'second',
            muscles: ['spalle', 'tricipiti'],
            rows: [
              row('S1', 'range', { repMin: 4, repMax: 6, weight: 80 }),
              row('S2', 'range', { repMin: 8, repMax: 10, weight: 60 }),
            ],
          }),
          exercise('Row Machine singola', {
            dsId: '1356', dsMedia: '1356-OIFMAp1', dsName: 'lever one arm lateral high row',
            restCat: 'normale', warmup: 'second',
            muscles: ['dorsali', 'bicipiti', 'trapezio'],
            rows: [
              row('S1', 'range', { repMin: 4, repMax: 6, weight: 130 }),
              row('S2', 'range', { repMin: 8, repMax: 10, weight: 110 }),
            ],
          }),
          exercise('Rotary calf (prima dx)', {
            dsId: '2315', dsMedia: '2315-MrgP9L6', dsName: 'lever rotary calf',
            restCat: 'normale',
            muscles: ['polpacci'],
            rows: [
              row('S1', 'range', { repMin: 4, repMax: 6, weight: 60 }),
              row('S2', 'range', { repMin: 8, repMax: 10, weight: 40 }),
            ],
          }),
          exercise('Alzate cavi', {
            dsId: '0178', dsMedia: '0178-goJ6ezq', dsName: 'cable lateral raise',
            restCat: 'isolamento',
            muscles: ['spalle'],
            rows: [
              row('S1', 'range', { repMin: 10, repMax: 15, weight: 12.5 }),
              row('S2', 'range', { repMin: 10, repMax: 15, weight: 7.5 }),
            ],
          }),
          exercise('Leg raise', {
            dsId: '0472', dsMedia: '0472-I3tsCnC', dsName: 'hanging leg raise',
            restCat: 'isolamento',
            note: 'A cedimento: batti le rep della volta prima',
            muscles: ['addome'],
            rows: [row('S1', 'reps', { weight: 0, sets: 3 })],
          }),
        ],
      },
      {
        id: 'C', name: 'Giorno C', color: '#d95926', exercises: [
          exercise('Weighted Dips', {
            dsId: '0814', dsMedia: '0814-X6C6i5Y', dsName: 'triceps dip',
            restCat: 'russo', warmup: 'full',
            muscles: ['petto', 'tricipiti', 'spalle'],
            rows: [row('S1', 'russo', { schemeIndex: 2, weight: 40, russoIncrement: 5 })],
          }),
          exercise('Weighted Pull Ups', {
            dsId: '0841', dsMedia: '0841-HMzLjXx', dsName: 'weighted pull-up',
            restCat: 'normale', warmup: 'second',
            muscles: ['dorsali', 'bicipiti', 'avambracci'],
            rows: [
              row('S1', 'range', { repMin: 4, repMax: 6, weight: 27.5 }),
              row('S2', 'range', { repMin: 8, repMax: 10, weight: 7.5 }),
            ],
          }),
          exercise('Leg Curl (prima sx)', {
            dsId: '0586', dsMedia: '0586-17lJ1kr', dsName: 'lever lying leg curl',
            restCat: 'normale', warmup: 'second',
            muscles: ['femorali'],
            rows: [
              row('S1', 'range', { repMin: 4, repMax: 6, weight: 32.5 }),
              row('S2', 'range', { repMin: 8, repMax: 10, weight: 25 }),
            ],
          }),
          exercise('Seated face pull', {
            dsId: '0202', dsMedia: '0202-yUdIGNs', dsName: 'cable rear delt row (stirrups)',
            restCat: 'isolamento',
            muscles: ['spallePost', 'trapezio'],
            rows: [row('S1', 'range', { repMin: 10, repMax: 15, weight: 15 })],
          }),
          exercise('Abductor esterno', {
            dsId: '0597', dsMedia: '0597-CHpahtl', dsName: 'lever seated hip abduction',
            restCat: 'isolamento',
            note: 'Max macchina 93 kg: poi si cresce a rep, a cedimento',
            muscles: ['abduttori', 'glutei'],
            rows: [row('S1', 'range', { repMin: 4, repMax: 8, weight: 91, maxWeight: 93 })],
          }),
          exercise('Plank + Reverse Plank', {
            dsId: '0464', dsMedia: '0464-CosupLu', dsName: 'front plank with twist',
            restCat: 'isolamento',
            note: '1 serie a cedimento per variante: cronometra e batti il tuo tempo',
            muscles: ['addome', 'lombari', 'obliqui'],
            rows: [
              row('Plank', 'tempo', { weight: 0 }),
              row('Reverse plank', 'tempo', { weight: 0 }),
              row('Plank lato dx', 'tempo', { weight: 0 }),
              row('Plank lato sx', 'tempo', { weight: 0 }),
            ],
          }),
        ],
      },
    ],
    /* sessions: [{ id, date:'YYYY-MM-DD', dayId, entries: { rowId: [{kg, reps, done}] }, completed }] */
    sessions: [],
    /* cardio: attività cardio con storico proprio */
    cardio: [
      cardioActivity('Salto corda HIIT', 'interval', {
        color: '#eda100',
        note: 'Tempo fisso 10 min: cresce il lavoro fino al continuo',
        mode: 'fixedtime', totalSec: 600, roundSec: 30, workSec: 10, restSec: 20, stepSec: 5,
        rounds: 20, autoProgress: true,
      }),
      ...defaultSteadyCardio(),
    ],
    cardioSeeded: true,
  };
}

/* ---------- cardio ----------
 activity: { id, name, type:'interval'|'steady'|'stopwatch', color, note, autoProgress,
   interval: workSec, restSec, rounds
   steady:   targetMin, trackDistance
   log: [ sessione ] }
 log interval:  { date, roundsDone, workSec, restSec, totalSec }
 log steady:    { date, durationSec, distanceKm }
 log stopwatch: { date, durationSec } */
function cardioActivity(name, type, opts) {
  return Object.assign({
    id: uid(), name, type, color: '#3987e5', note: '',
    // interval: mode 'rounds' (aumenta i round) | 'fixedtime' (tempo fisso, sposta lavoro/riposo)
    mode: 'rounds', workSec: 20, restSec: 10, rounds: 8,
    totalSec: 600, roundSec: 30, stepSec: 5,
    targetMin: 20, trackDistance: false,
    // continuo (corsa/bici): progressione +10% a settimana
    pendingTarget: null,   // nuovo obiettivo che parte dal lunedì successivo
    progressWeek: null,    // settimana (lunedì YYYY-MM-DD) in cui l'obiettivo è stato completato
    autoProgress: false, log: [],
  }, opts);
}

/* Attività continue predefinite: tapis roulant e cyclette (in palestra). */
function defaultSteadyCardio() {
  return [
    cardioActivity('Tapis roulant', 'steady', {
      color: '#ff375f', note: 'Corsa · +10% a settimana',
      targetMin: 15, trackDistance: true, autoProgress: true,
    }),
    cardioActivity('Cyclette', 'steady', {
      color: '#30b0c7', note: 'Bici · +10% a settimana',
      targetMin: 20, trackDistance: true, autoProgress: true,
    }),
  ];
}

/* Chiave della settimana: il lunedì in formato YYYY-MM-DD (confrontabile come stringa). */
function isoWeekKey(dateISO) {
  const d = new Date(dateISO + 'T00:00:00');
  const day = (d.getDay() + 6) % 7; // lun=0
  d.setDate(d.getDate() - day);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* Obiettivo della settimana successiva: +10%, almeno +1 minuto. */
function nextWeeklyTarget(min) {
  return Math.max(min + 1, Math.ceil(min * 1.1));
}

/* Se è iniziata una nuova settimana, applica l'obiettivo guadagnato la settimana prima.
   Ritorna true se qualcosa è cambiato. */
function applyCardioWeek(c) {
  if (!c || c.type !== 'steady' || !c.pendingTarget || !c.progressWeek) return false;
  if (isoWeekKey(todayISO()) <= c.progressWeek) return false;
  c.targetMin = c.pendingTarget;
  c.pendingTarget = null;
  return true;
}

/* Per gli interval a tempo fisso: numero di round = tempo totale / durata round */
function cardioRounds(c) {
  if (c.type === 'interval' && c.mode === 'fixedtime') {
    const rs = (c.workSec + c.restSec) || c.roundSec || 30;
    return Math.max(1, Math.round((c.totalSec || 600) / rs));
  }
  return c.rounds || 1;
}

function getCardio(id) { return (state.cardio || []).find(c => c.id === id) || null; }

function cardioSummary(c) {
  if (c.type === 'interval') {
    if (c.mode === 'fixedtime') {
      if (c.restSec <= 0) return 'Continuo · ' + c.workSec + 's × ' + cardioRounds(c) + ' = ' + fmtClock(c.totalSec);
      return fmtClock(c.totalSec) + ' fissi · ' + c.workSec + 's/' + c.restSec + 's · ' + cardioRounds(c) + ' round';
    }
    const tot = c.rounds * (c.workSec + c.restSec);
    return c.rounds + ' round · ' + c.workSec + 's/' + c.restSec + 's · ' + fmtClock(tot);
  }
  if (c.type === 'steady') return 'Obiettivo ' + c.targetMin + ' min' + (c.pendingTarget ? ' · da lunedì ' + c.pendingTarget + ' min' : '');
  return 'Cronometro libero';
}

function fmtClock(sec) {
  sec = Math.round(sec);
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

/* Ultimo risultato registrato (o null) */
function cardioLast(c) {
  const log = (c.log || []).filter(Boolean).sort((a, b) => (a.date < b.date ? 1 : -1));
  return log[0] || null;
}

/* Velocità media (km/h) di una sessione con distanza, o 0. */
function cardioSpeed(l) {
  return l && l.distanceKm && l.durationSec ? l.distanceKm / (l.durationSec / 3600) : 0;
}
function fmtSpeed(v) { return fmtKg(Math.round(v * 10) / 10) + ' km/h'; }

/* Sessioni e minuti di cardio della settimana corrente (tutte le attività). */
function cardioWeekStats(dateISO) {
  const wk = isoWeekKey(dateISO || todayISO());
  let count = 0, sec = 0;
  for (const c of (state.cardio || [])) for (const l of (c.log || [])) {
    if (!l || isoWeekKey(l.date) !== wk) continue;
    count++;
    sec += l.durationSec || l.totalSec || 0;
  }
  return { count, minutes: Math.round(sec / 60) };
}

/* Record di un'attività: durata più lunga, velocità migliore, round migliori. */
function cardioRecords(c) {
  const log = (c.log || []).filter(Boolean);
  if (!log.length) return null;
  if (c.type === 'interval') {
    const cont = log.filter(l => l.restSec === 0 && l.roundsDone >= (l.rounds || 0));
    const longestCont = cont.length ? Math.max(...cont.map(l => l.totalSec || 0)) : 0;
    return { sessions: log.length, longestCont, bestWork: Math.max(...log.filter(l => l.roundsDone >= (l.rounds || 0)).map(l => l.workSec || 0), 0) };
  }
  return {
    sessions: log.length,
    longest: Math.max(...log.map(l => l.durationSec || 0)),
    bestSpeed: Math.max(...log.map(cardioSpeed), 0),
    bestKm: Math.max(...log.map(l => l.distanceKm || 0), 0),
  };
}

/* Testo "ultima volta" da mostrare in evidenza */
function cardioLastText(c) {
  const l = cardioLast(c);
  if (!l) return null;
  if (c.type === 'interval') return fmtDate(l.date) + ': ' + l.roundsDone + '/' + (l.rounds || c.rounds) + ' round · ' + fmtClock(l.totalSec || 0);
  if (c.type === 'steady') return fmtDate(l.date) + ': ' + fmtClock(l.durationSec) + (l.distanceKm ? ' · ' + fmtKg(l.distanceKm) + ' km · ' + fmtSpeed(cardioSpeed(l)) : '');
  return fmtDate(l.date) + ': ' + fmtClock(l.durationSec);
}

/* Registra una sessione cardio e (se attivo) applica la progressione. Ritorna testo suggerimento. */
function logCardio(id, entry) {
  const c = getCardio(id);
  if (!c) return null;
  entry.date = todayISO();
  c.log.push(entry);
  let tip = null;
  if (c.autoProgress) {
    if (c.type === 'interval' && c.mode === 'fixedtime') {
      // tempo totale fisso: sposta stepSec dal riposo al lavoro, fino al continuo
      const target = cardioRounds(c);
      if (entry.roundsDone >= target && c.restSec > 0) {
        const step = c.stepSec || 5;
        c.workSec = Math.min(c.roundSec, c.workSec + step);
        c.restSec = Math.max(0, c.roundSec - c.workSec);
        c.rounds = cardioRounds(c);
        tip = c.restSec > 0
          ? 'Completato! La prossima volta: ' + c.workSec + 's lavoro / ' + c.restSec + 's riposo (stesso tempo totale).'
          : '🔥 Traguardo: la prossima volta salti in CONTINUO per ' + fmtClock(c.totalSec) + '!';
      } else if (entry.roundsDone >= target && c.restSec <= 0) {
        // già al continuo: si allunga il tempo totale di 1 minuto
        c.totalSec = (c.totalSec || 600) + 60;
        c.rounds = cardioRounds(c);
        tip = 'Continuo completato! La prossima volta: ' + fmtClock(c.totalSec) + ' in continuo.';
      }
    } else if (c.type === 'interval' && entry.roundsDone >= c.rounds) {
      c.rounds += 1;
      tip = 'Completato! La prossima volta: ' + c.rounds + ' round.';
    } else if (c.type === 'steady' && entry.durationSec >= c.targetMin * 60) {
      // +10% a settimana: l'obiettivo nuovo parte dal lunedì successivo
      const wk = isoWeekKey(entry.date);
      if (c.progressWeek !== wk || !c.pendingTarget) {
        c.pendingTarget = nextWeeklyTarget(c.targetMin);
        c.progressWeek = wk;
      }
      tip = 'Obiettivo della settimana completato! Da lunedì: ' + c.pendingTarget + ' min (+10%). Fino ad allora resta ' + c.targetMin + ' min.';
    }
  }
  saveState();
  return tip;
}

/* ---------- persistenza ---------- */
let state = null;

/* Riempie i campi mancanti e applica le migrazioni (usato sia all'avvio che all'import). */
function migrateState(s) {
  // compatibilità: se c'è il formato multi-allenamento (wrapper),
  // torniamo allo stato singolo prendendo il programma "base" (quello sincronizzato).
  if (s && Array.isArray(s.programs)) {
    const base = s.programs.find(p => p && p.id === 'base')
      || s.programs.find(p => p && p.id === s.activeId)
      || s.programs[0];
    s = (base && base.state) ? base.state : defaultState();
  }
  const def = defaultState();
  s.settings = Object.assign({}, def.settings, s.settings || {});
  s.settings.rest = Object.assign({}, def.settings.rest, s.settings.rest || {});
  s.profile = Object.assign({}, def.profile, s.profile || {});
  if (!Array.isArray(s.profile.bodyWeightLog)) s.profile.bodyWeightLog = [];
  if (!Array.isArray(s.sessions)) s.sessions = [];
  if (!Array.isArray(s.days)) s.days = def.days;
  // migrazione: colore giorni mancante + sezione cardio
  const palette = ['#3987e5', '#199e70', '#d95926', '#9085e9', '#eda100', '#e34948', '#199e70', '#e87ba4'];
  s.days.forEach((d, i) => {
    if (!d.color) d.color = palette[i % palette.length];
    if (!Array.isArray(d.exercises)) d.exercises = [];
    d.exercises.forEach(ex => {
      if (!(Number(ex.incKg) > 0)) ex.incKg = defaultIncFor(ex, s.settings && s.settings.smallIncrement);
      (ex.rows || []).forEach(r => { if (r.failCount == null) r.failCount = 0; });
    });
  });
  if (!Array.isArray(s.cardio)) s.cardio = def.cardio;
  // aggiunge una sola volta tapis roulant e cyclette (se non esistono già attività simili)
  if (!s.cardioSeeded) {
    const has = re => s.cardio.some(c => re.test(c.name || ''));
    const [tread, bike] = defaultSteadyCardio();
    if (!has(/corsa|tapis|run/i)) s.cardio.push(tread);
    if (!has(/bici|cyclette|bike/i)) s.cardio.push(bike);
    s.cardioSeeded = true;
  }
  s.cardio.forEach(c => {
    if (!Array.isArray(c.log)) c.log = [];
    if (!c.color) c.color = '#3987e5';
    if (!c.mode) c.mode = 'rounds';
    if (c.roundSec == null) c.roundSec = (c.workSec || 20) + (c.restSec || 10);
    if (c.totalSec == null) c.totalSec = (c.rounds || 8) * ((c.workSec || 20) + (c.restSec || 10));
    if (c.stepSec == null) c.stepSec = 5;
    if (c.pendingTarget === undefined) c.pendingTarget = null;
    if (c.progressWeek === undefined) c.progressWeek = null;
    applyCardioWeek(c);
  });
  if (!s.settings.deload) s.settings.deload = def.settings.deload;
  // migrazione recuperi: chi aveva i VECCHI default (russo 360 / pesante 210)
  // passa ai nuovi (russo 3 min, top set+back off 5–7 min). Valori personalizzati restano.
  const R = s.settings.rest;
  if (R.russo.seconds === 360 && R.normale.seconds === 210) {
    R.russo.seconds = 180;
    R.normale.seconds = 360;
  }
  R.russo.label = def.settings.rest.russo.label;
  R.normale.label = def.settings.rest.normale.label;
  R.isolamento.label = def.settings.rest.isolamento.label;
  return s;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const wasWrapper = parsed && Array.isArray(parsed.programs);
      state = migrateState(parsed);
      if (wasWrapper) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }
      return;
    }
  } catch (e) { console.error('loadState', e); }
  state = defaultState();
  saveState();
}

/* ---------- gestione giorni ---------- */
const DAY_PALETTE = ['#3987e5', '#199e70', '#d95926', '#9085e9', '#eda100', '#e34948', '#e87ba4', '#1baf7a'];

function dayLetter(dayId) {
  const i = state.days.findIndex(d => d.id === dayId);
  return i >= 0 && i < 26 ? String.fromCharCode(65 + i) : String(i + 1);
}

function addDay() {
  const n = state.days.length;
  const day = { id: uid(), name: 'Giorno ' + String.fromCharCode(65 + (n % 26)), color: DAY_PALETTE[n % DAY_PALETTE.length], exercises: [] };
  state.days.push(day);
  saveState();
  return day;
}

function deleteDay(dayId) {
  // lo storico delle sedute resta salvato
  state.days = state.days.filter(d => d.id !== dayId);
  if (state.uiSelectedDay === dayId && state.days[0]) state.uiSelectedDay = state.days[0].id;
  saveState();
}

function moveDay(dayId, dir) {
  const i = state.days.findIndex(d => d.id === dayId);
  const j = i + dir;
  if (i >= 0 && j >= 0 && j < state.days.length) {
    const [m] = state.days.splice(i, 1);
    state.days.splice(j, 0, m);
    saveState();
  }
}

function saveState() {
  try {
    state.updatedAt = Date.now(); // per il sync: vince lo stato più recente
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('saveState', e);
    alert('Errore nel salvataggio dei dati (memoria piena?).');
  }
  if (typeof syncSchedulePush === 'function') syncSchedulePush();
}

/* ---------- utility ---------- */
function getDay(dayId) { return state.days.find(d => d.id === dayId); }

function findRow(rowId) {
  for (const d of state.days) for (const ex of d.exercises) {
    const r = ex.rows.find(r => r.id === rowId);
    if (r) return { day: d, ex, row: r };
  }
  return null;
}

/* Incremento di peso di un esercizio (kg). Ogni esercizio ha il suo:
   sugli esercizi leggeri +2,5 kg può essere un salto del 20–25%. */
function exIncrement(ex) {
  const v = ex && Number(ex.incKg);
  return v > 0 ? v : (state.settings.smallIncrement || 2.5);
}
/* Incremento predefinito in base al peso: leggero (<25 kg) → 1 kg, altrimenti quello generale. */
function defaultIncFor(ex, fallback) {
  const w = Math.max(0, ...(ex.rows || []).filter(r => r.type === 'range').map(r => r.weight || 0));
  return w > 0 && w < 25 ? 1 : (fallback || 2.5);
}
function roundHalf(kg) { return Math.round(kg * 2) / 2; }

function roundToPlate(kg) {
  return Math.round(kg / 2.5) * 2.5;
}

function fmtKg(kg) {
  if (kg === null || kg === undefined || isNaN(kg)) return '—';
  return (Math.round(kg * 100) / 100).toString().replace('.', ',');
}

function russoLabel(idx) {
  const s = RUSSO_SCHEME[Math.min(idx, RUSSO_SCHEME.length - 1)];
  return s[0] + 'x' + s[1];
}

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function fmtDate(iso) {
  const [y, m, g] = iso.split('-');
  return g + '/' + m + '/' + y.slice(2);
}

/* ---------- deload (scarico periodico) ----------
 Ciclo: everyWeeks settimane di carico + 1 di scarico (kg dimezzati).
 La settimana è calcolata dalla data di inizio ciclo (deload.startDate). */
function daysBetween(aISO, bISO) {
  // in UTC: immune ai passaggi di ora legale (DST)
  const a = new Date(aISO + 'T00:00:00Z'), b = new Date(bISO + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

/* Info sul ciclo per una data (default oggi): posizione, se è scarico, quando arriva. */
function deloadInfo(dateISO) {
  const d = state.settings.deload || {};
  dateISO = dateISO || todayISO();
  if (!d.enabled || !d.startDate) return { enabled: false, active: false };
  const every = Math.max(1, d.everyWeeks || 6);
  const cycle = every + 1; // settimane totali per ciclo
  const days = daysBetween(d.startDate, dateISO);
  if (days < 0) return { enabled: true, active: false, weekInCycle: 0, weeksToDeload: every };
  const weekIndex = Math.floor(days / 7);
  const pos = ((weekIndex % cycle) + cycle) % cycle; // 0..cycle-1
  const active = pos === every; // ultima settimana del ciclo = scarico
  return {
    enabled: true, active,
    factor: d.factor || 0.5,
    weekInCycle: pos + 1,          // 1..7
    cycleLen: cycle,
    weeksToDeload: active ? 0 : (every - pos),
  };
}
function deloadWeekActive(dateISO) { return !!deloadInfo(dateISO).active; }

/* Peso effettivo da usare/mostrare (dimezzato durante lo scarico). */
function effectiveWeight(weight) {
  const info = deloadInfo();
  if (info.active && weight) return roundToPlate(weight * (info.factor || 0.5));
  return weight;
}

/* ---------- record personali (PR) e 1RM stimato ---------- */
/* 1RM stimato con formula di Epley: 1RM = peso * (1 + rep/30).
   Le formule di stima sono attendibili solo con poche ripetizioni: oltre le 12
   sovrastimano molto (es. 93 kg × 13 → 133 kg), quindi quelle serie non contano. */
const E1RM_MAX_REPS = 12;
function e1RM(kg, reps) {
  if (!kg || !reps || reps > E1RM_MAX_REPS) return 0;
  if (reps <= 1) return kg;
  return kg * (1 + reps / 30);
}

/* Miglior 1RM stimato storico per una riga (prima di una certa data, opzionale). */
function bestE1RM(rowId, beforeDate) {
  let best = 0;
  for (const s of state.sessions) {
    if (!s.completed) continue;
    if (beforeDate && s.date >= beforeDate) continue;
    for (const e of (s.entries[rowId] || [])) {
      if (e.done && e.kg != null && e.reps) best = Math.max(best, e1RM(e.kg, e.reps));
    }
  }
  return best;
}

/* Serie storiche di 1RM stimato per una riga: [{x:date, y:1RM}] */
function e1RMHistory(rowId) {
  const pts = [];
  for (const s of state.sessions) {
    if (!s.completed) continue;
    let best = 0;
    for (const e of (s.entries[rowId] || [])) {
      if (e.done && e.kg != null && e.reps) best = Math.max(best, e1RM(e.kg, e.reps));
    }
    if (best > 0) pts.push({ x: s.date, y: Math.round(best * 10) / 10, deload: deloadWeekActive(s.date) });
  }
  return pts.sort((a, b) => (a.x < b.x ? -1 : 1));
}

/* Tutti i record correnti (miglior 1RM per riga) per la sezione Record. */
function allRecords() {
  const recs = [];
  for (const d of state.days) for (const ex of d.exercises) for (const r of ex.rows) {
    const best = bestE1RM(r.id);
    if (best > 0) recs.push({ day: d, ex, row: r, e1rm: Math.round(best * 10) / 10 });
  }
  return recs.sort((a, b) => b.e1rm - a.e1rm);
}

/* Storico completo di una riga: [{date, dayId, sets:[{kg,reps}], e1rm}] più recente prima. */
function rowFullHistory(rowId) {
  const out = [];
  for (const s of state.sessions) {
    if (!s.completed) continue;
    const done = (s.entries[rowId] || []).filter(e => e.done);
    if (!done.length) continue;
    let best = 0;
    for (const e of done) if (e.kg != null && e.reps) best = Math.max(best, e1RM(e.kg, e.reps));
    out.push({
      date: s.date, dayId: s.dayId,
      sets: done.map(e => ({ kg: e.kg, reps: e.reps })),
      e1rm: best ? Math.round(best * 10) / 10 : 0,
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* ---------- unità peso (kg / lb) ---------- */
function unitLabel() { return (state.settings && state.settings.unit === 'lb') ? 'lb' : 'kg'; }
function toDisplayWeight(kg) {
  if (kg == null || isNaN(kg)) return kg;
  return unitLabel() === 'lb' ? Math.round(kg * 2.20462 * 2) / 2 : kg;
}
function fromDisplayWeight(v) {
  if (v == null || isNaN(v)) return v;
  return unitLabel() === 'lb' ? Math.round((v / 2.20462) * 100) / 100 : v;
}
/* peso formattato con unità corrente (accetta kg interni) */
function fmtWeight(kg) {
  if (kg == null || isNaN(kg)) return '—';
  return fmtKg(toDisplayWeight(kg)) + ' ' + unitLabel();
}

/* ---------- volume per gruppo muscolare ---------- */
/* Somma kg×rep delle serie completate negli ultimi `days` giorni, distribuita ai muscoli
   di ogni esercizio. Ritorna [{muscle, label, volume}] ordinato per volume. */
function volumeByMuscle(days) {
  const since = new Date(); since.setDate(since.getDate() - (days || 30));
  const sinceISO = since.getFullYear() + '-' + String(since.getMonth() + 1).padStart(2, '0') + '-' + String(since.getDate()).padStart(2, '0');
  const byMuscle = {};
  for (const s of state.sessions) {
    if (!s.completed || s.date < sinceISO) continue;
    const day = getDay(s.dayId);
    if (!day) continue;
    for (const ex of day.exercises) {
      const muscles = ex.muscles && ex.muscles.length ? ex.muscles : [];
      if (!muscles.length) continue;
      let vol = 0;
      for (const r of ex.rows) for (const e of (s.entries[r.id] || [])) {
        if (e.done && e.kg != null && e.reps) vol += e.kg * e.reps;
      }
      if (vol <= 0) continue;
      for (const m of muscles) byMuscle[m] = (byMuscle[m] || 0) + vol;
    }
  }
  return Object.entries(byMuscle)
    .map(([m, v]) => ({ muscle: m, label: MUSCLES[m] || m, volume: Math.round(v) }))
    .sort((a, b) => b.volume - a.volume);
}

/* Volume totale di una settimana (offset 0 = questa, 1 = scorsa). */
function weekVolume(offset) {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day - (offset || 0) * 7);
  const start = new Date(d); const end = new Date(d); end.setDate(end.getDate() + 6);
  const iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  const s0 = iso(start), s1 = iso(end);
  let vol = 0;
  for (const s of state.sessions) {
    if (!s.completed || s.date < s0 || s.date > s1) continue;
    const dd = getDay(s.dayId); if (!dd) continue;
    for (const ex of dd.exercises) for (const r of ex.rows) for (const e of (s.entries[r.id] || [])) {
      if (e.done && e.kg != null && e.reps) vol += e.kg * e.reps;
    }
  }
  return Math.round(vol);
}

/* Giorni con almeno una seduta completata (per la heatmap): Set di 'YYYY-MM-DD'. */
function sessionDays() {
  const set = new Set();
  for (const s of state.sessions) if (s.completed) set.add(s.date);
  return set;
}

/* ---------- progressione ----------
 range:  reps ≥ repMax → peso + incremento dell'esercizio ; nel range → uguale ; < repMin → peso − incremento
 russo:  tutte le serie completate a target → passo successivo dello schema;
         dopo 5x5 → peso + russoIncrement e si riparte da 3x3.
 Applica la progressione al programma dopo il completamento di una seduta.
 Ritorna la lista dei cambiamenti per il riepilogo. */
function applyProgression(session) {
  const changes = [];
  const day = getDay(session.dayId);
  if (!day) return changes;
  // Settimana di scarico: non si progredisce, i pesi base restano invariati
  if (deloadWeekActive(session.date)) {
    for (const ex of day.exercises) for (const r of ex.rows) {
      if ((session.entries[r.id] || []).some(e => e.done)) {
        changes.push({ ex: ex.name, row: r.label, kind: 'same', text: 'Scarico: peso base invariato' });
      }
    }
    return changes;
  }
  for (const ex of day.exercises) {
    for (const r of ex.rows) {
      const entries = (session.entries[r.id] || []).filter(e => e.done);
      if (!entries.length) continue;

      if (r.type === 'russo') {
        const idx = r.schemeIndex || 0;
        const [nSets, nReps] = RUSSO_SCHEME[Math.min(idx, RUSSO_SCHEME.length - 1)];
        const ok = entries.length >= nSets && entries.every(e => (e.reps || 0) >= nReps);
        if (!ok) {
          const fails = (r.failCount || 0) + 1;
          if (fails >= 2 && idx > 0) {
            // 2 volte di fila non completato: un passo indietro per consolidare
            changes.push({ ex: ex.name, row: r.label, kind: 'down', text: '2° tentativo non riuscito: ' + russoLabel(idx) + ' → ' + russoLabel(idx - 1) });
            if (state.settings.autoProgress) { r.schemeIndex = idx - 1; r.failCount = 0; }
          } else {
            changes.push({ ex: ex.name, row: r.label, kind: 'same', text: 'Ripeti ' + russoLabel(idx) + (fails >= 2 ? '' : ' (se non riesce di nuovo, si torna indietro di un passo)') });
            if (state.settings.autoProgress) r.failCount = fails;
          }
          continue;
        }
        if (state.settings.autoProgress) r.failCount = 0;
        if (idx >= RUSSO_SCHEME.length - 1) {
          const newW = roundToPlate((r.weight || 0) + (r.russoIncrement || 5));
          changes.push({ ex: ex.name, row: r.label, kind: 'up', text: fmtKg(r.weight) + ' → ' + fmtKg(newW) + ' kg, da 3x3' });
          if (state.settings.autoProgress) { r.weight = newW; r.schemeIndex = 0; }
        } else {
          changes.push({ ex: ex.name, row: r.label, kind: 'up', text: russoLabel(idx) + ' → ' + russoLabel(idx + 1) });
          if (state.settings.autoProgress) r.schemeIndex = idx + 1;
        }
        continue;
      }

      // a cedimento: peso fisso, si progredisce battendo rep (o secondi col plank)
      if (r.type === 'reps' || r.type === 'tempo') {
        const unit = r.type === 'tempo' ? 'sec' : 'rep';
        const nowBest = Math.max(...entries.map(e => e.reps || 0));
        const prevBest = bestRepsFor(r.id, session.date);
        if (nowBest > prevBest) {
          changes.push({ ex: ex.name, row: r.label, kind: 'up', text: 'Nuovo record: ' + nowBest + ' ' + unit + (prevBest ? ' (prima ' + prevBest + ')' : '') });
        } else {
          changes.push({ ex: ex.name, row: r.label, kind: 'same', text: 'Obiettivo prossima volta: batti ' + Math.max(nowBest, prevBest) + ' ' + unit });
        }
        continue;
      }

      // range: come riferimento uso il peso più alto tra le serie completate (non la prima)
      // riferimento = la serie più pesante, e le rep fatte CON quel peso
      // (prima si prendevano peso massimo e rep massime anche da serie diverse)
      const kgs = entries.map(e => e.kg).filter(k => k != null);
      const lastKg = kgs.length ? Math.max(...kgs) : r.weight;
      const atTop = kgs.length ? entries.filter(e => e.kg === lastKg) : entries;
      const bestReps = Math.max(...atTop.map(e => e.reps || 0));
      const inc = exIncrement(ex);
      // tetto di carico raggiunto (es. macchina a 93 kg): si cresce a ripetizioni
      if (r.maxWeight && lastKg >= r.maxWeight && bestReps >= r.repMax) {
        const prevBest = bestRepsFor(r.id, session.date);
        if (state.settings.autoProgress) r.weight = Math.min(lastKg, r.maxWeight);
        changes.push({
          ex: ex.name, row: r.label, kind: bestReps > prevBest ? 'up' : 'same',
          text: 'Max carico ' + fmtKg(r.maxWeight) + ' kg → cresci a rep: ' + bestReps + (prevBest ? ' (prima ' + prevBest + ')' : ''),
        });
        continue;
      }
      if (bestReps >= r.repMax) {
        // doppia progressione: raggiunto il massimo del range (es. 8 su 4–8) → più peso
        let newW = roundHalf(lastKg + inc);
        if (r.maxWeight && newW > r.maxWeight) newW = r.maxWeight; // non superare il tetto
        changes.push({ ex: ex.name, row: r.label, kind: 'up', text: fmtKg(lastKg) + ' → ' + fmtKg(newW) + ' kg' });
        if (state.settings.autoProgress) r.weight = newW;
      } else if (bestReps < r.repMin) {
        const newW = Math.max(0, roundHalf(lastKg - inc));
        changes.push({ ex: ex.name, row: r.label, kind: 'down', text: fmtKg(lastKg) + ' → ' + fmtKg(newW) + ' kg' });
        if (state.settings.autoProgress) r.weight = newW;
      } else {
        changes.push({ ex: ex.name, row: r.label, kind: 'same', text: 'Mantieni ' + fmtKg(lastKg) + ' kg' });
        if (state.settings.autoProgress) r.weight = lastKg;
      }
    }
  }
  return changes;
}

/* ---------- riscaldamento ---------- */
function warmupSteps(kind, s1Weight) {
  const w = s1Weight || 0;
  if (kind === 'full') {
    return [
      { pct: 20, kg: roundToPlate(w * 0.20), reps: 5 },
      { pct: 50, kg: roundToPlate(w * 0.50), reps: 3 },
      { pct: 70, kg: roundToPlate(w * 0.70), reps: 1 },
    ];
  }
  if (kind === 'second') {
    return [
      { pct: 50, kg: roundToPlate(w * 0.50), reps: 3 },
      { pct: 70, kg: roundToPlate(w * 0.70), reps: 1 },
    ];
  }
  return [];
}

/* ---------- export/import ---------- */
function exportData() {
  const json = JSON.stringify(state, null, 2);
  const name = 'palestra-backup-' + todayISO() + '.json';
  // iPhone: se disponibile usa il foglio di condivisione (Salva su File, AirDrop…)
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).catch(() => {});
      return;
    }
  } catch (e) { /* fallback al download classico */ }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importData(json) {
  const parsed = JSON.parse(json);
  if (!parsed || (!Array.isArray(parsed.programs) && (!parsed.days || !parsed.sessions))) throw new Error('File non valido');
  state = migrateState(parsed);
  saveState();
}
