/* ============ Sync cloud opzionale (Supabase) ============
   Modello a "codice di sincronizzazione": un codice segreto generato sul primo
   dispositivo; inserendolo su un altro dispositivo i dati restano allineati.
   - Nessun account, nessuna email: il codice È la chiave (come un link segreto).
   - Offline-first: l'app funziona sempre; il sync avviene quando c'è rete.
   - Fusione: le sedute di entrambi i dispositivi si sommano; il programma vince il più recente. */
'use strict';

const SYNC_URL = 'https://nubscmwfceedvnwjieir.supabase.co';
// Chiave "publishable": è pensata per stare nel browser, non è un segreto.
const SYNC_KEY = 'sb_publishable_vGpn6lxtHRMl7Xv0WuVunQ_WfbwP9VL';
const SYNC_CODE_KEY = 'palestra-sync-code';

let syncStatus = 'off';   // off | ok | syncing | error
let syncLastError = null;
let syncPushTimer = null;
let syncApplyingRemote = false; // evita loop: pull → saveState → push
let syncPulling = null;         // evita pull sovrapposti

function syncGetCode() { try { return localStorage.getItem(SYNC_CODE_KEY); } catch (e) { return null; } }
function syncEnabled() { return !!syncGetCode(); }

function syncNewCode() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 24).toUpperCase();
}

async function syncRpc(name, args) {
  const res = await fetch(SYNC_URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {
      'apikey': SYNC_KEY,
      'Authorization': 'Bearer ' + SYNC_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* Fonde due stati SENZA perdere dati registrati:
   - sessions: unione per id (tutte le sedute di entrambi i dispositivi)
   - cardio log: unione per sessione (attività + data + durata)
   - programma (giorni/esercizi), profilo e impostazioni: vince lo stato più recente
   Ritorna lo stato fuso. */
function syncMerge(local, remote) {
  const localAt = local.updatedAt || 0, remoteAt = remote.updatedAt || 0;
  const base = remoteAt >= localAt ? remote : local;   // "programma" dal più recente
  const other = remoteAt >= localAt ? local : remote;
  const merged = JSON.parse(JSON.stringify(base));

  // sedute: unione per id
  const byId = {};
  for (const s of (base.sessions || [])) byId[s.id] = s;
  for (const s of (other.sessions || [])) if (!byId[s.id]) byId[s.id] = s;
  merged.sessions = Object.values(byId).sort((a, b) => (a.date < b.date ? -1 : 1));

  // log cardio: unione per (id attività + data)
  const otherCardio = {};
  for (const c of (other.cardio || [])) otherCardio[c.id] = c;
  for (const c of (merged.cardio || [])) {
    const oc = otherCardio[c.id];
    if (!oc || !Array.isArray(oc.log)) continue;
    if (!Array.isArray(c.log)) c.log = [];
    // chiave di una sessione: data + durata/round (due sessioni nello stesso giorno restano distinte)
    const key = l => l && [l.date, l.durationSec || 0, l.totalSec || 0, l.roundsDone || 0, l.distanceKm || 0].join('|');
    const seen = new Set(c.log.map(key));
    for (const l of oc.log) if (l && !seen.has(key(l))) { c.log.push(l); seen.add(key(l)); }
    c.log.sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  merged.updatedAt = Math.max(localAt, remoteAt);
  return merged;
}

/* Scarica lo stato remoto e lo FONDE col locale (niente perdite), poi ripubblica. */
function syncPull() {
  if (syncPulling) return syncPulling;
  syncPulling = syncPullInner().finally(() => { syncPulling = null; });
  return syncPulling;
}
async function syncPullInner() {
  const code = syncGetCode();
  if (!code) return;
  syncStatus = 'syncing'; syncRenderStatus();
  try {
    const rows = await syncRpc('palestra_pull', { p_code: code });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row && row.data) {
      const remote = migrateState(row.data);
      remote.updatedAt = new Date(row.updated_at).getTime() || remote.updatedAt || 0;
      const before = JSON.stringify(state);
      const merged = syncMerge(state, remote);
      syncApplyingRemote = true;
      state = merged;
      saveState();
      syncApplyingRemote = false;
      if (JSON.stringify(state) !== before) {
        if (typeof render === 'function') render();
        toast('Dati sincronizzati dal cloud ✓');
      }
      await syncPushNow(); // ripubblica lo stato fuso, così anche il cloud è allineato
    } else {
      await syncPushNow(); // prima volta con questo codice: carica il locale
    }
    if (syncStatus !== 'error') { syncStatus = 'ok'; syncLastError = null; }
  } catch (e) {
    syncApplyingRemote = false;
    syncStatus = 'error'; syncLastError = e.message;
  }
  syncRenderStatus();
}

async function syncPushNow() {
  const code = syncGetCode();
  if (!code) return;
  try {
    await syncRpc('palestra_push', {
      p_code: code,
      p_data: state,
      p_updated: new Date(state.updatedAt || Date.now()).toISOString(),
    });
    syncStatus = 'ok'; syncLastError = null;
  } catch (e) {
    syncStatus = 'error'; syncLastError = e.message;
  }
  syncRenderStatus();
}

/* Chiamata da saveState(): push con debounce (3s dopo l'ultima modifica). */
function syncSchedulePush() {
  if (!syncEnabled() || syncApplyingRemote) return;
  clearTimeout(syncPushTimer);
  syncPushTimer = setTimeout(syncPushNow, 3000);
}

/* Attiva il sync con un codice nuovo o esistente. */
async function syncEnable(code) {
  try { localStorage.setItem(SYNC_CODE_KEY, code); } catch (e) {}
  await syncPull();
}

function syncDisable() {
  try { localStorage.removeItem(SYNC_CODE_KEY); } catch (e) {}
  clearTimeout(syncPushTimer);
  syncStatus = 'off';
  syncRenderStatus();
}

/* Aggiorna solo l'indicatore nella scheda Profilo (se visibile). */
function syncRenderStatus() {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const dot = syncStatus === 'ok' ? 'on' : syncStatus === 'error' ? 'err' : '';
  const label = syncStatus === 'ok' ? 'Sincronizzato'
    : syncStatus === 'syncing' ? 'Sincronizzazione…'
    : syncStatus === 'error' ? 'Errore: ' + (syncLastError || 'connessione')
    : 'Non attivo';
  el.innerHTML = `<span class="sync-dot ${dot}"></span><span>${label}</span>`;
}

/* All'avvio (chiamato da app.js dopo loadState): pull in background. */
function syncInit() {
  // i listener si registrano sempre: così funzionano anche se il sync viene attivato dopo l'avvio
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && syncEnabled()) syncPull();
  });
  window.addEventListener('online', () => { if (syncEnabled()) syncPull(); });
  if (syncEnabled()) syncPull();
}
