# Palestra 💪

Web app (PWA) per tracciare gli allenamenti in palestra, pensata per **iPhone**:
si installa sulla schermata Home e funziona anche offline.

## Cosa fa

- **Scheda a giorni** (A/B/C…) con esercizi, serie e progressione automatica:
  schema russo (3x3 → 5x5, poi +kg), rep range, serie a cedimento (rep o secondi), tetto di carico.
- **Timer di recupero** con suono, vibrazione e schermo sempre acceso.
- **Riscaldamento** calcolato in automatico (20/50/70% del carico).
- **Scarico (deload)** periodico con pesi dimezzati.
- **Progressi**: grafici di forza, 1RM stimato (Epley), volume, costanza, volume per muscolo, peso corporeo.
- **Mappa muscoli** fronte/retro colorata per giorno (nella scheda Progressi).
- **Cardio** con progressione graduale:
  - *Salto corda*: tempo fisso (10 min), il lavoro cresce e il riposo cala di 5s a ogni sessione completata fino al continuo; poi il tempo continuo sale di 1 min a ogni completamento.
  - *Tapis roulant e cyclette*: se nella settimana completi l'obiettivo, dal lunedì successivo sale del 10% (almeno +1 min). Km facoltativi.
- **Database di 1324 esercizi** con immagini, animazioni e istruzioni in italiano.
- **Backup**: export/import `.json` e sync tra dispositivi (Supabase, opzionale).
- **Tema chiaro/scuro** (automatico come l'iPhone, o forzato).

## Struttura

```
index.html              pagina unica dell'app
manifest.webmanifest    dati per l'installazione (icona, nome, colori)
sw.js                   service worker: offline + aggiornamento automatico
css/styles.css          stile (variabili colore per tema chiaro e scuro)
js/data.js              dati, salvataggio, migrazioni, progressione, deload, 1RM
js/muscles.js           figura del corpo in SVG
js/charts.js            grafici SVG (senza librerie)
js/exlib.js             ricerca nel database esercizi
js/cardio.js            sezione cardio
js/sync.js              sincronizzazione cloud (Supabase)
js/app.js               interfaccia e navigazione
data/exercises-index.json  indice compatto degli esercizi
icons/                  icone dell'app
scripts/                script per rigenerare indice esercizi e icone
```

Nessun framework né build: sono file statici, si pubblicano così come sono.

## Pubblicare (Vercel)

1. Su [vercel.com](https://vercel.com) → **Add New → Project** → importa questo repository.
2. Framework preset: **Other**. Nessun comando di build. Output: la cartella principale.
3. Ogni `git push` pubblica la nuova versione.

> Quando cambi qualcosa, aumenta `VERSION` in `sw.js`: così l'iPhone scarica i file nuovi
> e l'app si aggiorna da sola (mai durante un timer o una seduta in corso).

## Installare su iPhone

Apri il sito in **Safari** → tasto **Condividi** → **Aggiungi alla schermata Home**.

## Provarla in locale

```bash
python3 -m http.server 8000
```

Poi apri `http://localhost:8000`.

## Dati e crediti

- Dati esercizi: [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (MIT).
- Immagini e animazioni: **© Gym visual — https://gymvisual.com/** — caricate direttamente
  dal repository del dataset (180×180), **non** copiate qui.
- I dati personali restano nel telefono (`localStorage`); il sync è facoltativo.
