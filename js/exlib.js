/* ============ Libreria esercizi (dataset) ============
   Dati (nomi, istruzioni IT, muscoli): github.com/hasaneyldrm/exercises-dataset (MIT).
   Immagini/animazioni © Gym visual (gymvisual.com), 180x180, richiamate via URL
   (non sono copiate in questo repository). */
'use strict';

const EX_RAW = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main';
const EX_ATTRIB = '© Gym visual — gymvisual.com';

function exImg(stem) { return EX_RAW + '/images/' + stem + '.jpg'; }
function exGif(stem) { return EX_RAW + '/videos/' + stem + '.gif'; }

/* Traduzioni etichette in italiano */
const BODYPART_IT = {
  'back': 'Schiena', 'cardio': 'Cardio', 'chest': 'Petto', 'lower arms': 'Avambracci',
  'lower legs': 'Polpacci', 'neck': 'Collo', 'shoulders': 'Spalle', 'upper arms': 'Braccia',
  'upper legs': 'Gambe', 'waist': 'Core',
};
const EQUIP_IT = {
  'assisted': 'Assistito', 'band': 'Elastico', 'barbell': 'Bilanciere', 'body weight': 'Corpo libero',
  'bosu ball': 'Bosu', 'cable': 'Cavi', 'dumbbell': 'Manubri', 'elliptical machine': 'Ellittica',
  'ez barbell': 'Bilanciere EZ', 'hammer': 'Hammer', 'kettlebell': 'Kettlebell',
  'leverage machine': 'Macchina', 'medicine ball': 'Palla medica', 'olympic barbell': 'Bilanciere olimpico',
  'resistance band': 'Banda elastica', 'roller': 'Roller', 'rope': 'Corda', 'skierg machine': 'SkiErg',
  'sled machine': 'Slitta', 'smith machine': 'Smith machine', 'stability ball': 'Fitball',
  'stationary bike': 'Cyclette', 'stepmill machine': 'Stepmill', 'tire': 'Pneumatico',
  'trap bar': 'Trap bar', 'upper body ergometer': 'Ergometro', 'weighted': 'Zavorra',
  'wheel roller': 'Ruota addominale',
};
const MUSC_IT = {
  'abductors': 'Abduttori', 'abs': 'Addominali', 'abdominals': 'Addominali', 'adductors': 'Adduttori',
  'ankle stabilizers': 'Stabilizzatori caviglia', 'ankles': 'Caviglie', 'biceps': 'Bicipiti',
  'calves': 'Polpacci', 'cardiovascular system': 'Cardio', 'chest': 'Petto', 'core': 'Core',
  'delts': 'Deltoidi', 'deltoids': 'Deltoidi', 'forearms': 'Avambracci', 'glutes': 'Glutei',
  'hamstrings': 'Femorali', 'hands': 'Mani', 'hip flexors': "Flessori dell'anca", 'lats': 'Dorsali',
  'latissimus dorsi': 'Gran dorsale', 'levator scapulae': 'Elevatore scapola', 'lower back': 'Lombari',
  'obliques': 'Obliqui', 'pectorals': 'Pettorali', 'quads': 'Quadricipiti', 'quadriceps': 'Quadricipiti',
  'rhomboids': 'Romboidi', 'rotator cuff': 'Cuffia dei rotatori', 'serratus anterior': 'Dentato anteriore',
  'shoulders': 'Spalle', 'soleus': 'Soleo', 'spine': 'Colonna', 'traps': 'Trapezi', 'trapezius': 'Trapezio',
  'triceps': 'Tricipiti', 'upper back': 'Alta schiena', 'wrist extensors': 'Estensori polso',
  'wrist flexors': 'Flessori polso', 'wrists': 'Polsi',
};
function tBody(v) { return BODYPART_IT[v] || v || ''; }
function tEquip(v) { return EQUIP_IT[v] || v || ''; }
function tMusc(v) { return MUSC_IT[v] || v || ''; }

/* Mappa muscoli del dataset (inglese) -> chiavi del modello muscoli dell'app (MUSCLES).
   Serve ad assegnare AUTOMATICAMENTE i muscoli allenati in base all'esercizio scelto dal DB. */
const MUSC_KEY = {
  // petto
  'pectorals': 'petto', 'chest': 'petto', 'serratus anterior': 'petto',
  // spalle
  'delts': 'spalle', 'deltoids': 'spalle', 'shoulders': 'spalle', 'rotator cuff': 'spalle',
  // trapezio / alta schiena
  'traps': 'trapezio', 'trapezius': 'trapezio', 'levator scapulae': 'trapezio',
  // dorsali
  'lats': 'dorsali', 'latissimus dorsi': 'dorsali', 'upper back': 'dorsali', 'rhomboids': 'dorsali',
  // lombari / colonna
  'lower back': 'lombari', 'spine': 'lombari',
  // braccia
  'biceps': 'bicipiti', 'triceps': 'tricipiti',
  'forearms': 'avambracci', 'wrist extensors': 'avambracci', 'wrist flexors': 'avambracci', 'wrists': 'avambracci', 'hands': 'avambracci',
  // core
  'abs': 'addome', 'abdominals': 'addome', 'core': 'addome', 'hip flexors': 'addome',
  'obliques': 'obliqui',
  // gambe / glutei
  'glutes': 'glutei',
  'quads': 'quadricipiti', 'quadriceps': 'quadricipiti',
  'hamstrings': 'femorali',
  'adductors': 'adduttori', 'abductors': 'abduttori',
  'calves': 'polpacci', 'soleus': 'polpacci',
  // (cardiovascular system, ankles, ankle stabilizers -> nessun muscolo mappato: ignorati)
};

/* Dato un record del dataset, restituisce le chiavi-muscolo dell'app (target + secondari, deduplicate). */
function musclesFromDataset(ds) {
  if (!ds) return [];
  const raw = [ds.tg, ds.mg, ...(ds.sec || [])].filter(Boolean);
  const keys = raw.map(m => MUSC_KEY[m]).filter(Boolean);
  return [...new Set(keys)];
}

/* Dataset caricato on-demand (lazy): non pesa sull'avvio dell'app.
   Il service worker lo tiene in cache → funziona anche offline dopo il primo uso.
   Formato compatto (generato da scripts/build-index.py):
   { id, n:nome, m:media, it:istruzioni IT, tg:target, mg:gruppo, sec:[secondari], eq:attrezzo, bp:parte corpo } */
let EXERCISES = null;
let EX_LOADING = null;
function ensureExercises() {
  if (EXERCISES) return Promise.resolve(EXERCISES);
  if (EX_LOADING) return EX_LOADING;
  EX_LOADING = fetch('data/exercises-index.json')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(list => { EXERCISES = list; EX_INDEX = null; return list; })
    .catch(err => { EX_LOADING = null; throw err; });
  return EX_LOADING;
}

/* Indice di ricerca precalcolato (testo normalizzato) */
let EX_INDEX = null;
function exIndex() {
  if (EX_INDEX) return EX_INDEX;
  const list = (EXERCISES || []);
  EX_INDEX = list.map(e => {
    const hay = normStr([
      e.n, e.eq, tEquip(e.eq), tMusc(e.tg), tMusc(e.mg), tBody(e.bp),
      ...(e.sec || []).map(tMusc),
    ].join(' '));
    return { e, hay };
  });
  return EX_INDEX;
}
function exById(id) {
  return (EXERCISES || []).find(e => e.id === id) || null;
}

function normStr(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/* Sinonimi italiano → parole chiave inglesi presenti nei nomi del dataset */
const IT_SYN = {
  trazioni: 'pull up', trazione: 'pull up', 'zavorrate': 'weighted', 'zavorrato': 'weighted',
  zavorra: 'weighted', dorsali: 'lat pulldown', dorso: 'lat', lat: 'lat', pulley: 'row',
  rematore: 'row', tirata: 'row', panca: 'bench press', distensioni: 'press', spinte: 'press',
  spinta: 'press', stacco: 'deadlift', stacchi: 'deadlift', croci: 'fly', aperture: 'fly',
  alzate: 'raise', alzata: 'raise', affondi: 'lunge', affondo: 'lunge', curl: 'curl',
  bicipiti: 'curl', tricipiti: 'triceps', francese: 'triceps extension', polpacci: 'calf raise',
  polpaccio: 'calf', addominali: 'abs crunch', crunch: 'crunch', adduttori: 'adduction',
  abduttori: 'abduction', femorali: 'leg curl', quadricipiti: 'leg extension squat',
  pressa: 'leg press', spalle: 'shoulder', squat: 'squat', stacchi_rumeni: 'romanian deadlift',
  rumeno: 'romanian', dip: 'dip', dips: 'dip', plank: 'plank', pull: 'pull', push: 'push',
  inclinata: 'incline', inclinato: 'incline', laterali: 'lateral', laterale: 'lateral',
  piana: 'flat', manubri: 'dumbbell', manubrio: 'dumbbell', bilanciere: 'barbell',
  cavi: 'cable', cavo: 'cable', macchina: 'machine', seduto: 'seated', seduta: 'seated',
  gamba: 'leg', gambe: 'legs', petto: 'chest', glutei: 'glutes', frontali: 'front',
  verticale: 'vertical', orizzontale: 'horizontal', singolo: 'one arm', singola: 'one arm',
};

/* Cerca: tutti i token (con sinonimi IT) devono comparire. Ritorna max `limit` risultati. */
function exSearch(query, limit) {
  limit = limit || 40;
  const expanded = normStr(query).split(/\s+/).filter(Boolean)
    .map(t => IT_SYN[t] ? IT_SYN[t] : t).join(' ');
  const tokens = expanded.split(/\s+/).filter(Boolean);
  const idx = exIndex();
  const out = [];
  for (const item of idx) {
    if (tokens.every(t => item.hay.includes(t))) {
      out.push(item.e);
      if (out.length >= limit) break;
    }
  }
  return out;
}
