// --- constantes ---
const DIV_X = 10, DIV_Y = 8;
const CENTER_TWEAK_PX = -2;

const TIME_SCALE_CORR = 1.039; // facteur de correction horizontale

const VDIV_STEPS = [5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001];
const TDIV_STEPS = [0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001, 0.0005, 0.0002, 0.0001];

let vIndex = VDIV_STEPS.indexOf(1);
let tIndex = TDIV_STEPS.indexOf(0.002);

const cvs = document.getElementById('trace');
const ctx = cvs.getContext('2d');

const ui = {
    wave: document.getElementById('wave'),
    duty: document.getElementById('duty'),
    dutyNum: document.getElementById('dutyNum'),
    freq: document.getElementById('freq'),
    per: document.getElementById('per'),
    amp: document.getElementById('amp'),
    offset: document.getElementById('offset'),
    showDC: document.getElementById('showDC'),
    exportPng: document.getElementById('exportPng')
};

// Centres en divisions (0..DIV_X/Y)
let yCenterDiv = DIV_Y / 2;     // vertical
let xCenterDiv = DIV_X / 2;     // horizontal (décalage)

// ------ helpers ------
// Lecture nombre robuste (gère valueAsNumber + virgule FR)
function readNum(inputEl, fallback = 0) {
    const raw = String(inputEl?.value ?? '');
    const n = inputEl && Number.isFinite(inputEl.valueAsNumber)
        ? inputEl.valueAsNumber
        : parseFloat(raw.replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
}

function resizeCanvasToCSS() {
    const rect = cvs.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const dpr = window.devicePixelRatio || 1;
    cvs.width = Math.round(rect.width * dpr);
    cvs.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
}

// Génération des échantillons (intègre le rapport cyclique pour carré + décalage horizontal)
function generateSamples(vPerDiv, sPerDiv) {
    const w = Math.max(2, cvs.getBoundingClientRect().width);
    const secTotal = sPerDiv * DIV_X * TIME_SCALE_CORR;

    const f = Math.max(0.000001, readNum(ui.freq, 50));
    const A = Math.abs(readNum(ui.amp, 2));
    const DC = readNum(ui.offset, 0);

    // On prend la valeur du champ numérique comme source
    const dutyRatio = Math.max(0.05, Math.min(0.95, (readNum(ui.dutyNum, 50)) / 100));

    const stepT = secTotal / (w - 1);
    const tOffset = xCenterDiv * sPerDiv; // décalage temporel commandé par le bouton horizontal

    const pts = [];
    for (let x = 0; x < w; x++) {
        const t = (x * stepT) - tOffset;   // centré par xCenterDiv (au centre: t≈0)
        let y = 0;

        switch (ui.wave.value) {
            case 'sine': {
                y = A * Math.sin(2 * Math.PI * f * t);
                break;
            }
            case 'square': {
                const T = 1 / f;
                let frac = (t / T) - Math.floor(t / T);
                if (frac < 0) frac += 1;
                y = (frac < dutyRatio) ? A : -A;
                break;
            }
            case 'triangle': {
                const T = 1 / f;
                const frac = (t / T) - Math.floor(t / T + 0.5);
                y = A * (2 * Math.abs(2 * frac) - 1);
                break;
            }
        }

        y += DC;
        pts.push({ x, y });
    }
    return { pts, vPerDiv, DC };
}

function draw() {
    if (!resizeCanvasToCSS()) return;

    const rect = cvs.getBoundingClientRect();
    const W = rect.width, H = rect.height;

    const vPerDiv = VDIV_STEPS[vIndex];
    const sPerDiv = TDIV_STEPS[tIndex];

    const { pts, DC } = generateSamples(vPerDiv, sPerDiv);

    const pxPerDivY = H / DIV_Y;
    const centerY = yCenterDiv * pxPerDivY + CENTER_TWEAK_PX;
    const pxPerVolt = pxPerDivY / vPerDiv;

    ctx.clearRect(0, 0, W, H);

    // Ligne DC : contrôlée par la case à cocher
    const EPS_V = 1e-6;
    if (ui.showDC.checked && Math.abs(DC) > EPS_V) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#d11';
        ctx.beginPath();
        const yDC = centerY - DC * pxPerVolt;
        ctx.moveTo(0, yDC); ctx.lineTo(W, yDC);
        ctx.stroke();
    }

    // Trace
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0a7d2c';
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const x = p.x;
        const y = centerY - p.y * pxPerVolt;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

// -------- KNOBS (V/div & s/div) --------
const MIN_ANGLE = 0, MAX_ANGLE = 330;
function stepAngle(list, idx) { return MIN_ANGLE + (MAX_ANGLE - MIN_ANGLE) * (idx / (list.length - 1)); }
function setNeedle(needle, list, idx) { needle.style.transform = `translate(-50%,-100%) rotate(${stepAngle(list, idx)}deg)`; }
function polarAngleCWdeg(x, y) { let a = Math.atan2(y, x) * 180 / Math.PI; return (a + 450) % 360; }
function angleFromEvent(e, el) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ex = (e.touches ? e.touches[0].clientX : e.clientX) - cx;
    const ey = (e.touches ? e.touches[0].clientY : e.clientY) - cy;
    return Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, polarAngleCWdeg(ex, ey)));
}
function idxFromAngle(ang, list) { const ratio = (ang - MIN_ANGLE) / (MAX_ANGLE - MIN_ANGLE); return Math.max(0, Math.min(list.length - 1, Math.round(ratio * (list.length - 1)))); }

const vNeedle = document.getElementById('vNeedle');
const tNeedle = document.getElementById('tNeedle');
const vLabel = document.getElementById('vdivVal');
const tLabel = document.getElementById('tdivVal');

function fmtV(v) { return v >= 1 ? `${v} V/div` : (v >= 1e-3 ? `${v * 1e3} mV/div` : `${v * 1e6} µV/div`); }
function fmtT(s) { if (s >= 1) return `${s} s/div`; if (s >= 1e-3) return `${s * 1e3} ms/div`; return `${s * 1e6} µs/div`; }

function attachKnobDrag(el, list, getIdx, setIdx, labelEl, fmt, needleEl) {
    let dragging = false;
    function applyIndex(i) {
        const idx = Math.max(0, Math.min(list.length - 1, i));
        if (idx !== getIdx()) {
            setIdx(idx);
            if (labelEl) labelEl.textContent = fmt(list[idx]); // bulles masquées via CSS, mais on met à jour
            setNeedle(needleEl, list, idx);
            draw();
        }
    }
    function onDown(e) { dragging = true; e.preventDefault(); onMove(e); }
    function onMove(e) { if (!dragging) return; e.preventDefault(); const ang = angleFromEvent(e, el); applyIndex(idxFromAngle(ang, list)); }
    function onUp() { dragging = false; }
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    el.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    if (labelEl) labelEl.textContent = fmt(list[getIdx()]);
    setNeedle(needleEl, list, getIdx());
}
attachKnobDrag(document.getElementById('knobV'), VDIV_STEPS, () => vIndex, (i) => { vIndex = i; }, vLabel, fmtV, vNeedle);
attachKnobDrag(document.getElementById('knobT'), TDIV_STEPS, () => tIndex, (i) => { tIndex = i; }, tLabel, fmtT, tNeedle);

// ---- Période <-> Fréquence (robuste à la virgule) ----
let syncingFP = false;
function setFreqFromPer() {
    if (syncingFP) return;
    const P = readNum(ui.per);
    if (!(P > 0)) return;
    syncingFP = true;
    ui.freq.value = (1 / P).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    syncingFP = false;
    draw();
}
function setPerFromFreq() {
    if (syncingFP) return;
    const f = readNum(ui.freq);
    if (!(f > 0)) return;
    syncingFP = true;
    ui.per.value = (1 / f).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    syncingFP = false;
    draw();
}
setPerFromFreq();
ui.freq.addEventListener('input', setPerFromFreq);
ui.freq.addEventListener('change', setPerFromFreq);
ui.per.addEventListener('input', setFreqFromPer);
ui.per.addEventListener('change', setFreqFromPer);

// ---- Slider/Number de rapport cyclique (sync + activation selon forme) ----
function syncDuty(fromRange) {
    if (fromRange) {
        ui.dutyNum.value = ui.duty.value;
    } else {
        const v = Math.max(5, Math.min(95, Math.round(readNum(ui.dutyNum, 50))));
        ui.dutyNum.value = String(v);
        ui.duty.value = String(v);
    }
    draw();
}
ui.duty.addEventListener('input', () => syncDuty(true));
ui.dutyNum.addEventListener('input', () => syncDuty(false));

function updateDutyState() {
    const isSquare = ui.wave.value === 'square';
    ui.duty.disabled = !isSquare;
    ui.dutyNum.disabled = !isSquare;
}
updateDutyState();
ui.wave.addEventListener('change', () => { updateDutyState(); draw(); });

// ---- Afficher/masquer la ligne DC ----
ui.showDC.addEventListener('change', draw);

// ---- Pan vertical à la molette + clic droit = recentrer verticalement
cvs.addEventListener('wheel', (e) => {
    e.preventDefault();
    const deltaDiv = (e.deltaY > 0 ? 0.2 : -0.2);
    yCenterDiv = Math.max(0, Math.min(DIV_Y, yCenterDiv + deltaDiv));
    draw();
}, { passive: false });
cvs.addEventListener('contextmenu', (e) => { e.preventDefault(); yCenterDiv = DIV_Y / 2; draw(); });

// ---- Décalage horizontal via le bouton "hShift" (drag horizontal)
(function () {
    const h = document.getElementById('hShift');
    if (!h) return; // sécurité si le bouton n'est pas présent
    let dragging = false, startX = 0, startCenter = DIV_X / 2;

    function onDown(e) {
        dragging = true;
        startX = (e.touches ? e.touches[0].clientX : e.clientX);
        startCenter = xCenterDiv;
        e.preventDefault();
    }
    function onMove(e) {
        if (!dragging) return;
        const rect = cvs.getBoundingClientRect();
        const pxPerDivX = rect.width / DIV_X;
        const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
        const dx = clientX - startX;
        const deltaDiv = dx / pxPerDivX;
        xCenterDiv = Math.max(0, Math.min(DIV_X, startCenter + deltaDiv));
        draw();
        e.preventDefault();
    }
    function onUp() { dragging = false; }

    // Double-clic = recentre horizontalement
    h.addEventListener('dblclick', () => { xCenterDiv = DIV_X / 2; draw(); });

    h.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    h.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
})();

// ---- Export PNG (oscilloscope COMPLET) ----
function exportFullPNG() {
  const bg = document.getElementById('bg');
  const scopeEl = document.getElementById('scope');

  // Canvas de sortie à la taille native du PNG
  const out = document.createElement('canvas');
  out.width = bg.naturalWidth;
  out.height = bg.naturalHeight;
  const octx = out.getContext('2d');

  // 1) Fond
  octx.drawImage(bg, 0, 0, out.width, out.height);

  // 2) Trace dans la zone écran (utilise les variables CSS)
  const css = getComputedStyle(document.documentElement);
  const leftPct = parseFloat(css.getPropertyValue('--screen-left'));
  const topPct  = parseFloat(css.getPropertyValue('--screen-top'));
  const wPct    = parseFloat(css.getPropertyValue('--screen-width'));
  const hPct    = parseFloat(css.getPropertyValue('--screen-height'));

  const sx = Math.round(out.width  * leftPct / 100);
  const sy = Math.round(out.height * topPct  / 100);
  const sW = Math.round(out.width  * wPct   / 100);
  const sH = Math.round(out.height * hPct   / 100);

  octx.drawImage(cvs, 0, 0, cvs.width, cvs.height, sx, sy, sW, sH);

  // ---------- 3) Aiguilles des knobs (V/div & sec/div) ----------
  // On mesure les éléments overlay à l'écran, puis on les projette à l'échelle du PNG.
  const bgRect    = bg.getBoundingClientRect();
  const kVRect    = document.getElementById('knobV').getBoundingClientRect();
  const kTRect    = document.getElementById('knobT').getBoundingClientRect();

  const scaleX = out.width  / bgRect.width;
  const scaleY = out.height / bgRect.height;
  const scaleA = (scaleX + scaleY) / 2; // échelle moyenne pour les largeurs de trait

  function drawNeedleFromRect(r, angleDeg) {
    // centre du knob dans l'image exportée
    const cx = ( (r.left - bgRect.left) + r.width  / 2 ) * scaleX;
    const cy = ( (r.top  - bgRect.top ) + r.height / 2 ) * scaleY;

    // longueur ≈ 45% du diamètre visuel du knob
    const len = (Math.min(r.width * scaleX, r.height * scaleY)) * 0.45;

    // angle 0° = vers le haut, sens horaire (comme en CSS)
    const th = angleDeg * Math.PI / 180;
    const x2 = cx + Math.sin(th) * len;
    const y2 = cy - Math.cos(th) * len;

    // petit liseré blanc puis trait noir (effet proche du CSS)
    octx.lineCap = 'round';

    octx.lineWidth = 6 * scaleA;
    octx.strokeStyle = 'rgba(255,255,255,0.85)';
    octx.beginPath(); octx.moveTo(cx, cy); octx.lineTo(x2, y2); octx.stroke();

    octx.lineWidth = 4 * scaleA;
    octx.strokeStyle = '#111';
    octx.beginPath(); octx.moveTo(cx, cy); octx.lineTo(x2, y2); octx.stroke();

    // pastille centrale
    const capR = 0.09 * Math.min(r.width * scaleX, r.height * scaleY);
    octx.fillStyle = '#e9e7df';
    octx.strokeStyle = 'rgba(0,0,0,0.25)';
    octx.lineWidth = 1 * scaleA;
    octx.beginPath(); octx.arc(cx, cy, capR, 0, Math.PI * 2); octx.fill(); octx.stroke();
  }

  // angles actuels des deux knobs (mêmes calculs que pour le DOM)
  const angV = (function(){ return MIN_ANGLE + (MAX_ANGLE - MIN_ANGLE) * (vIndex / (VDIV_STEPS.length - 1)); })();
  const angT = (function(){ return MIN_ANGLE + (MAX_ANGLE - MIN_ANGLE) * (tIndex / (TDIV_STEPS.length - 1)); })();

  drawNeedleFromRect(kVRect, angV);
  drawNeedleFromRect(kTRect, angT);

  // 4) Téléchargement
  const a = document.createElement('a');
  a.href = out.toDataURL('image/png');
  a.download = exportFileNameFromState();
  document.body.appendChild(a); a.click(); a.remove();
}

ui.exportPng.addEventListener('click', exportFullPNG);

// ---- INIT ----
const bg = document.getElementById('bg');
const ro = new ResizeObserver(() => draw());
function init() {
    ro.observe(document.getElementById('scope'));
    ro.observe(cvs);
    requestAnimationFrame(() => { draw(); setTimeout(draw, 80); });
}
if (bg.complete) init(); else bg.addEventListener('load', init, { once: true });

window.addEventListener('resize', draw);
['change', 'input'].forEach(ev => {
    [ui.wave, ui.freq, ui.per, ui.amp, ui.offset].forEach(el => el && el.addEventListener(ev, draw));
});

// (Optionnel) Aide au calage des positions en % sur l'image (log dans la console)

document.getElementById('scope').addEventListener('click', (e)=>{
  const r = e.currentTarget.getBoundingClientRect();
  const xPct = ((e.clientX - r.left) / r.width) * 100;
  const yPct = ((e.clientY - r.top)  / r.height) * 100;
  console.log(`--left: ${xPct.toFixed(1)}%;  --top: ${yPct.toFixed(1)}%;`);
});

// Formattage SI compact pour noms de fichiers
function fmtSI(val, kind) { // kind: 'Hz' ou 'V'
    const a = Math.abs(val);
    let unit = kind, scale = 1;
    if (kind === 'Hz') {
        if (a >= 1e6) { unit = 'MHz'; scale = 1e6; }
        else if (a >= 1e3) { unit = 'kHz'; scale = 1e3; }
        else { unit = 'Hz'; scale = 1; }
    } else if (kind === 'V') {
        if (a < 1e-3) { unit = 'uV'; scale = 1e-6; }
        else if (a < 1) { unit = 'mV'; scale = 1e-3; }
        else { unit = 'V'; scale = 1; }
    }
    const n = val / scale;
    const s = (Math.round(n * 1000) / 1000).toString()
        .replace(/\.0+$/, '')
        .replace(/(\.\d*[1-9])0+$/, '$1');
    return s + unit;
}

function exportFileNameFromState() {
  // lit les valeurs actuelles de l’interface
  const wave = (ui.wave?.value || 'sine').toLowerCase(); // 'sine' | 'square' | 'triangle'
  const f     = readNum(ui.freq, 50);
  const um    = Math.abs(readNum(ui.amp, 2));  // Umax (amplitude crête)
  const ucc   = readNum(ui.offset, 0);         // composante continue

  const fStr  = fmtSI(f, 'Hz');
  const umStr = fmtSI(um, 'V');
  const uccStr= fmtSI(ucc, 'V');

  return `${wave}_f-${fStr}_Umax-${umStr}_Ucc-${uccStr}.png`;
}

