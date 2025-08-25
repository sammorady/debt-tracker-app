/* QuickWheel – pure front-end, per-user wheel */

// --- DOM
const $ = (s) => document.querySelector(s);
const optionsEl = $('#options');
const noRepeatsEl = $('#noRepeats');
const equalizeColorsEl = $('#equalizeColors');
const canvas = $('#wheel');
const ctx = canvas.getContext('2d', { alpha: false });
const spinBtn = $('#spin');
const resultEl = $('#result');

// --- State
let items = [];           // [{label: string}]
let spinning = false;
let angle = 0;            // current rotation in radians
let targetAngle = 0;      // destination angle for current spin
let startTs = 0;          // spin start timestamp
let duration = 0;         // spin duration ms

// --- Persistence keys
const LS_KEY = 'quickwheel.options';
const URL_KEY = 'w'; // hash param

// --- Helpers
const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function linesToItems(txt) {
  return txt
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => ({ label: s }));
}
function itemsToText(list) {
  return list.map(x => x.label).join('\n');
}
function randomChoice(n) {
  return Math.floor(Math.random() * n);
}
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }
function rand(min, max){ return Math.random() * (max - min) + min; }
function hashEncode(str){ return btoa(unescape(encodeURIComponent(str))); }
function hashDecode(str){ try { return decodeURIComponent(escape(atob(str))); } catch { return ''; } }

// --- Colors
function segmentColor(i, n) {
  if (!equalizeColorsEl.checked) {
    // pleasant random palette by index (golden ratio)
    const hue = (i * 137.508) % 360;
    return `hsl(${hue}deg 80% 45%)`;
  }
  // equalized across the circle
  const hue = Math.round((i / Math.max(1, n)) * 360);
  return `hsl(${hue}deg 75% 47%)`;
}

// --- Drawing
function drawWheel() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0,0,W,H);

  const cx = W/2, cy = H/2, r = Math.min(W,H)/2 - 12;

  const n = items.length || 1;
  const slice = TAU / n;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  for (let i=0;i<n;i++){
    const a0 = i * slice;
    const a1 = a0 + slice;

    // slice
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.arc(0,0,r,a0,a1);
    ctx.closePath();
    ctx.fillStyle = items.length ? segmentColor(i, n) : '#283041';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0b0f14';
    ctx.stroke();

    // label
    const mid = a0 + slice/2;
    ctx.save();
    ctx.rotate(mid);
    ctx.translate(r*0.68, 0);
    ctx.rotate(Math.PI/2);
    ctx.fillStyle = '#fff';
    ctx.font = '600 16px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = items.length ? truncate(items[i].label, 26) : 'Add options';
    wrapText(ctx, label, 0, 0, r*0.46, 18);
    ctx.restore();
  }
  ctx.restore();

  // pointer
  ctx.beginPath();
  ctx.moveTo(cx, cy - r - 6);
  ctx.lineTo(cx - 14, cy - r - 38);
  ctx.lineTo(cx + 14, cy - r - 38);
  ctx.closePath();
  ctx.fillStyle = '#22d3ee';
  ctx.fill();
  ctx.strokeStyle = '#0b0f14';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function truncate(s, max){
  return s.length > max ? s.slice(0, max-1) + '…' : s;
}

// simple text wrapping for labels
function wrapText(ctx, text, x, y, maxWidth, lineHeight){
  const words = text.split(/\s+/);
  let line = '';
  let yy = y;
  for (let w of words){
    const test = line ? (line + ' ' + w) : w;
    const width = ctx.measureText(test).width;
    if (width > maxWidth && line){
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, yy);
}

// --- Logic
function setItemsFromTextarea() {
  items = linesToItems(optionsEl.value);
  drawWheel();
}

function spin() {
  if (spinning || items.length < 2) return;
  spinning = true;
  resultEl.textContent = '';

  // pick a target segment
  const idx = randomChoice(items.length);

  // each slice angle:
  const slice = TAU / items.length;

  // We want the pointer (top) to land at the center of idx slice.
  // Current pointer relative to wheel is angle 0 (top). So make targetAngle
  // such that angle % TAU === (TAU - mid) to align.
  const mid = idx * slice + slice / 2;
  const spins = 4 + Math.floor(Math.random() * 3); // 4-6 full spins
  const final = spins * TAU + (TAU - mid);

  startTs = performance.now();
  duration = rand(3200, 4700);
  const startAngle = angle;
  targetAngle = startAngle + final;

  requestAnimationFrame(function animate(ts){
    const t = clamp((ts - startTs) / duration, 0, 1);
    const eased = easeOutCubic(t);
    angle = startAngle + (final * eased);
    drawWheel();

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      angle = targetAngle % TAU;
      spinning = false;

      const winner = items[idx].label;
      resultEl.textContent = `Winner: ${winner}`;
      if (noRepeatsEl.checked) {
        items.splice(idx, 1);
        optionsEl.value = itemsToText(items);
        drawWheel();
        saveLocal(false); // silent
      }
    }
  });
}

// --- Local save/load
function saveLocal(showToast = true) {
  localStorage.setItem(LS_KEY, optionsEl.value);
  if (showToast) toast('Saved locally.');
}
function loadLocal() {
  const v = localStorage.getItem(LS_KEY);
  if (v != null) {
    optionsEl.value = v;
    setItemsFromTextarea();
    toast('Loaded.');
  } else {
    toast('Nothing saved yet.');
  }
}

// --- Share via URL (base64 in hash)
function shareUrl() {
  const enc = hashEncode(optionsEl.value);
  const url = `${location.origin}${location.pathname}#${URL_KEY}=${enc}`;
  navigator.clipboard?.writeText(url).catch(()=>{});
  toast('Share link copied.');
}

function loadFromHash() {
  const m = location.hash.match(/#w=([^&]+)/);
  if (m) {
    const txt = hashDecode(m[1]);
    if (txt) optionsEl.value = txt;
  }
}

// --- UI events
$('#addLine').onclick   = () => { optionsEl.value += (optionsEl.value.endsWith('\n') || optionsEl.value === '' ? '' : '\n'); optionsEl.value += ''; optionsEl.focus(); };
$('#shuffle').onclick   = () => { items = linesToItems(optionsEl.value); for (let i=items.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [items[i],items[j]]=[items[j],items[i]]; } optionsEl.value = itemsToText(items); drawWheel(); saveLocal(false); };
$('#clear').onclick     = () => { optionsEl.value=''; items=[]; drawWheel(); saveLocal(false); };
$('#saveLocal').onclick = () => saveLocal(true);
$('#loadLocal').onclick = () => loadLocal();
$('#shareUrl').onclick  = () => shareUrl();
optionsEl.addEventListener('input', setItemsFromTextarea);
spinBtn.addEventListener('click', spin);
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); spin(); }
});

// --- toast
let toastTimer = null;
function toast(msg){
  let el = document.getElementById('toast');
  if (!el){
    el = document.createElement('div');
    el.id = 'toast';
    Object.assign(el.style, {
      position:'fixed', left:'50%', bottom:'28px', transform:'translateX(-50%)',
      background:'#111726', color:'#e9edf1', border:'1px solid #1e2632',
      padding:'10px 14px', borderRadius:'12px', boxShadow:'0 10px 24px rgba(0,0,0,.35)', zIndex:9999,
      font:'13px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Arial'
    });
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.style.opacity='0'; }, 1600);
}

// --- boot
function boot(){
  loadFromHash();
  if (!optionsEl.value.trim()){
    // default sample
    optionsEl.value = ['Pizza','Sushi','Burgers','Tacos'].join('\n');
  }
  setItemsFromTextarea();
}
boot();
