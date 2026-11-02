/* ============ Figura corpo umano — SVG stilizzato fronte/retro ============
   Ogni muscolo ha data-muscle="<id>"; la vista li colora col colore del giorno. */
'use strict';

/* Elementi di base (silhouette) comuni alle due viste */
function bodyBase() {
  return `
  <circle class="body-base" cx="100" cy="27" r="17"/>
  <rect class="body-base" x="91" y="41" width="18" height="14" rx="4"/>
  <path class="body-base" d="M63,60 L137,60 L129,170 L71,170 Z"/>
  <rect class="body-base" x="46" y="64" width="21" height="68" rx="10"/>
  <rect class="body-base" x="133" y="64" width="21" height="68" rx="10"/>
  <rect class="body-base" x="41" y="126" width="19" height="56" rx="9"/>
  <rect class="body-base" x="140" y="126" width="19" height="56" rx="9"/>
  <circle class="body-base" cx="50" cy="190" r="8"/>
  <circle class="body-base" cx="150" cy="190" r="8"/>
  <path class="body-base" d="M71,168 L100,172 L129,168 L126,258 L104,258 L100,236 L96,258 L74,258 Z"/>
  <rect class="body-base" x="70" y="252" width="26" height="100" rx="12"/>
  <rect class="body-base" x="104" y="252" width="26" height="100" rx="12"/>
  <ellipse class="body-base" cx="81" cy="362" rx="15" ry="9"/>
  <ellipse class="body-base" cx="119" cy="362" rx="15" ry="9"/>
  `;
}

/* Forme muscoli - lato sinistro; il destro è generato in mirror.
   center: forme centrali non specchiate. */
const FRONT_MUSCLES = {
  left: {
    trapezio:     `<path data-muscle="trapezio" class="muscle" d="M91,48 L66,64 L92,62 Z"/>`,
    spalle:       `<ellipse data-muscle="spalle" class="muscle" cx="60" cy="77" rx="12" ry="14"/>`,
    petto:        `<path data-muscle="petto" class="muscle" d="M98,62 C80,62 70,70 70,81 C70,93 84,99 98,95 Z"/>`,
    bicipiti:     `<ellipse data-muscle="bicipiti" class="muscle" cx="56" cy="108" rx="9" ry="19"/>`,
    avambracci:   `<ellipse data-muscle="avambracci" class="muscle" cx="50" cy="152" rx="8" ry="24"/>`,
    obliqui:      `<path data-muscle="obliqui" class="muscle" d="M84,100 C76,106 73,118 75,142 L84,154 Z"/>`,
    quadricipiti: `<path data-muscle="quadricipiti" class="muscle" d="M76,176 C64,196 66,232 76,248 C86,252 92,244 93,226 L93,192 C88,180 82,174 76,176 Z"/>`,
    adduttori:    `<path data-muscle="adduttori" class="muscle" d="M97,176 L97,224 L94,224 C90,206 91,188 94,178 Z"/>`,
    abduttori:    `<ellipse data-muscle="abduttori" class="muscle" cx="68" cy="182" rx="7" ry="14"/>`,
    polpacci:     `<path data-muscle="polpacci" class="muscle" d="M74,258 C70,274 70,292 76,306 C82,300 84,280 82,262 Z"/>`,
  },
  center: {
    addome: `<path data-muscle="addome" class="muscle" d="M87,99 L113,99 L113,150 C113,160 100,166 100,166 C100,166 87,160 87,150 Z
             M87,116 L113,116 M87,133 L113,133 M100,99 L100,158"
             fill-rule="evenodd"/>`,
  },
};

const BACK_MUSCLES = {
  left: {
    spallePost:  `<ellipse data-muscle="spallePost" class="muscle" cx="60" cy="77" rx="12" ry="14"/>`,
    tricipiti:   `<ellipse data-muscle="tricipiti" class="muscle" cx="56" cy="108" rx="9" ry="19"/>`,
    avambracci:  `<ellipse data-muscle="avambracci" class="muscle" cx="50" cy="152" rx="8" ry="24"/>`,
    dorsali:     `<path data-muscle="dorsali" class="muscle" d="M74,86 C68,102 70,126 86,142 L97,148 L97,102 C88,98 80,92 74,86 Z"/>`,
    glutei:      `<ellipse data-muscle="glutei" class="muscle" cx="85" cy="192" rx="16" ry="17"/>`,
    abduttori:   `<ellipse data-muscle="abduttori" class="muscle" cx="66" cy="182" rx="7" ry="13"/>`,
    femorali:    `<path data-muscle="femorali" class="muscle" d="M74,212 C66,228 68,244 76,254 C86,258 93,250 94,234 L94,214 C87,206 79,206 74,212 Z"/>`,
    adduttori:   `<path data-muscle="adduttori" class="muscle" d="M97,210 L97,240 L95,242 C92,230 93,218 95,210 Z"/>`,
    polpacci:    `<ellipse data-muscle="polpacci" class="muscle" cx="80" cy="290" rx="11" ry="30"/>`,
  },
  center: {
    trapezio: `<path data-muscle="trapezio" class="muscle" d="M100,44 L72,66 L100,118 L128,66 Z"/>`,
    lombari:  `<path data-muscle="lombari" class="muscle" d="M89,138 L111,138 L111,160 C111,167 100,171 100,171 C100,171 89,167 89,160 Z"/>`,
  },
};

/* litMap: { muscleId: '#colore' } — colore con cui evidenziare il muscolo */
function muscleFigureSVG(side, litMap) {
  const shapes = side === 'front' ? FRONT_MUSCLES : BACK_MUSCLES;
  const leftShapes = Object.values(shapes.left).join('');
  const centerShapes = Object.values(shapes.center).join('');
  let svg = `<svg viewBox="0 0 200 380" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${side === 'front' ? 'Corpo — fronte' : 'Corpo — retro'}">
    ${bodyBase()}
    <g>${leftShapes}</g>
    <g transform="translate(200,0) scale(-1,1)">${leftShapes}</g>
    ${centerShapes}
    <text x="100" y="376" text-anchor="middle" style="fill:var(--ink-muted)" font-size="12" font-family="system-ui,sans-serif">${side === 'front' ? 'Fronte' : 'Retro'}</text>
  </svg>`;
  // colora i muscoli evidenziati con il colore del giorno (fill inline)
  if (litMap) {
    svg = svg.replace(/data-muscle="([a-zA-Z]+)" class="muscle"/g, (m, id) => {
      const col = litMap[id];
      return col ? `data-muscle="${id}" class="muscle lit" style="fill:${col}"` : m;
    });
  }
  return svg;
}

/* Ritorna { muscleId: '#colore' } per i giorni selezionati (array di dayId).
   Se più giorni allenano lo stesso muscolo, vince il primo selezionato. */
function musclesForDays(dayIds) {
  const map = {};
  for (const dayId of dayIds) {
    const day = getDay(dayId);
    if (!day) continue;
    for (const ex of day.exercises) {
      for (const m of (ex.muscles || [])) {
        if (!map[m]) map[m] = day.color || '#3987e5';
      }
    }
  }
  return map;
}
