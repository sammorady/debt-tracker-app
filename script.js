/************ SAFE FIREBASE WRAPPER (optional) ************/
let auth = null, db = null, fbReady = false;
(async () => {
  try {
    const [{ initializeApp }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
    ]);
    const [
      { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendEmailVerification },
      { getFirestore, collection, doc, getDocs, setDoc, deleteDoc }
    ] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"),
    ]);

    // Expose for later
    window._fb = { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendEmailVerification,
                   getFirestore, collection, doc, getDocs, setDoc, deleteDoc };

    const firebaseConfig = {
      apiKey: "AIzaSyDiFlAL9xN1MiFlvNGQ425anWXg8Ed32cc",
      authDomain: "REPLACE_ME.firebaseapp.com",
      projectId: "REPLACE_ME",
      appId: "REPLACE_ME"
    };
    const CONFIG_OK = firebaseConfig.projectId !== "REPLACE_ME";

    const app = initializeApp(firebaseConfig);
    auth = window._fb.getAuth(app);
    db   = CONFIG_OK ? window._fb.getFirestore(app) : null;
    fbReady = true;
  } catch (e) {
    // Firebase not available or blocked — app still works offline
    fbReady = false;
  }
})();

/************ UTILITIES ************/
const $ = (s) => document.querySelector(s);
const fmt = (n) => isFinite(n) ? n.toLocaleString(undefined,{style:'currency',currency:'USD'}) : '$0.00';
const pct = (n) => isFinite(n) ? `${n.toFixed(1)}%` : '0%';
const escapeHtml = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const formatDateMMDDYYYY = (iso) => {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
};

/************ STATE & STORAGE ************/
let user = null;
let debts = [];
const localKey = () => `debts.v1.${user ? user.uid : 'guest'}`;

function loadFromLocal(){
  try { debts = JSON.parse(localStorage.getItem(localKey()) || '[]'); }
  catch { debts = []; }
}
function saveToLocal(){
  try { localStorage.setItem(localKey(), JSON.stringify(debts)); } catch {}
}

/************ CLOUD (guarded) ************/
const path = (uid) => `users/${uid}/debts`;
async function loadFromCloud(uid){
  if (!db) return;
  const snap = await window._fb.getDocs(window._fb.collection(db, path(uid)));
  debts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function saveItemToCloud(uid, item){
  if (!db) return;
  const ref = item.id
    ? window._fb.doc(db, `${path(uid)}/${item.id}`)
    : window._fb.doc(window._fb.collection(db, path(uid)));
  if (!item.id) item.id = ref.id;
  await window._fb.setDoc(ref, item);
}
async function deleteItemFromCloud(uid, id){
  if (!db) return;
  await window._fb.deleteDoc(window._fb.doc(db, `${path(uid)}/${id}`));
}

/************ ERROR PANEL ************/
function showError(msg){
  let bar = $('#error-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'error-bar';
    bar.style.cssText = 'margin:8px 0;padding:8px;border:1px solid #e33;background:#fee;color:#900;font:12px/1.4 system-ui';
    $('#auth')?.insertAdjacentElement('afterend', bar);
  }
  bar.textContent = msg;
}

/************ FORM ************/
function bindForm(){
  const form = $('#debt-form');
  const due  = $('#due-date');
  if (!form) return;

  // "Due Date" placeholder -> switch to native date on focus
  if (due){
    due.type = 'text';
    due.placeholder = 'Due Date';
    due.addEventListener('focus', () => { if (due.type !== 'date') due.type = 'date'; });
    due.addEventListener('blur',  () => { if (!due.value) { due.type = 'text'; due.placeholder = 'Due Date'; } });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const item = {
        id: null,
        name: $('#debt-name')?.value.trim() || '',
        original:   parseFloat($('#original-amount')?.value || '0') || 0,
        balance:    parseFloat($('#balance')?.value || '0') || 0,
        paid:       parseFloat($('#amount-paid')?.value || '0') || 0,
        apr:        parseFloat($('#apr')?.value || '0') || 0,
        minPayment: parseFloat($('#min-payment')?.value || '0') || 0,
        due:        ($('#due-date')?.value || '').trim(),
        createdAt:  Date.now()
      };

      // Infer balance if omitted
      if (!($('#balance')?.value) && item.original >= 0 && item.paid >= 0) {
        const inferred = Math.max(item.original - item.paid, 0);
        item.balance = isFinite(inferred) ? inferred : 0;
      }

      // Push to memory first so UI updates even if saving fails
      debts.push(item);
      saveToLocal();

      // If logged in with Firestore configured, try cloud save (best-effort)
      if (user && db) {
        try { await saveItemToCloud(user.uid, item); } catch (e) { showError(`Cloud save failed (using local): ${e.message||e}`); }
      }

      // Reset form & restore placeholder
      form.reset();
      if (due) { due.type = 'text'; due.placeholder = 'Due Date'; }

      render();
    } catch (err) {
      showError(`Add failed: ${err?.message || err}`);
      console.error(err);
    }
  });
}

/************ RENDER ************/
function render(){
  const tbody = document.querySelector('#debt-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  let totOriginal=0, totBalance=0, totPaid=0, totMin=0;

  debts
    .slice()
    .sort((a,b)=> (a.due||'').localeCompare(b.due||''))
    .forEach((d, idx) => {
      totOriginal += d.original||0;
      totBalance  += d.balance||0;
      totPaid     += d.paid||0;
      totMin      += d.minPayment||0;

      const p = d.original>0 ? (100*(d.paid||0)/d.original) : 0;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(d.name||'')}</td>
        <td>${fmt(d.original)}</td>
        <td>${fmt(d.balance)}</td>
        <td>${fmt(d.paid)}</td>
        <td>${(d.apr||0).toFixed(2)}</td>
        <td>${fmt(d.minPayment)}</td>
        <td>${escapeHtml(formatDateMMDDYYYY(d.due||''))}</td>
        <td>${pct(p)}</td>
        <td><button class="del" data-idx="${idx}">Delete</button></td>
      `;
      tbody.appendChild(tr);
    });

  $('#tot-original').textContent = fmt(totOriginal);
  $('#tot-balance').textContent  = fmt(totBalance);
  $('#tot-paid').textContent     = fmt(totPaid);
  $('#tot-minpay').textContent   = fmt(totMin);

  // Delete handlers
  tbody.querySelectorAll('button.del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const i = Number(e.currentTarget.getAttribute('data-idx'));
      const item = debts[i];
      debts.splice(i,1);
      saveToLocal();
      if (user && db && item?.id) {
        try { await deleteItemFromCloud(user.uid, item.id); } catch (e2) { showError(`Cloud delete failed: ${e2.message||e2}`); }
      }
      render();
    });
  });
}

/************ AUTH (optional) ************/
function bindAuth(){
  const signup = $('#signup'), login = $('#login'), logout = $('#logout');
  const email  = $('#email'),  pass  = $('#password');

  if (!signup || !login || !logout) return;

  // If Firebase failed to init, keep buttons but make them no-ops with a message
  if (!fbReady) {
    [signup, login, logout].forEach(b => b?.addEventListener('click', () => showError('Auth disabled (Firebase not loaded). App still works locally.')));
    return;
  }

  signup.addEventListener('click', async () => {
    if (!email?.value || !pass?.value) return alert('Enter email and password.');
    try {
      const cred = await window._fb.createUserWithEmailAndPassword(auth, email.value.trim(), pass.value);
      await window._fb.sendEmailVerification(cred.user);
      alert('Verification email sent (login allowed without verification).');
    } catch (e) { alert(e.message || 'Sign up failed.'); }
  });

  login.addEventListener('click', async () => {
    if (!email?.value || !pass?.value) return alert('Enter email and password.');
    try { await window._fb.signInWithEmailAndPassword(auth, email.value.trim(), pass.value); }
    catch (e) { alert(e.message || 'Login failed.'); }
  });

  logout.addEventListener('click', async () => { try { await window._fb.signOut(auth); } catch {} });
}

function showApp(isLoggedIn){
  const lo = $('#logout');
  if (lo) lo.style.display = isLoggedIn ? 'inline-block' : 'none';
}

/************ STARTUP ************/
document.addEventListener('DOMContentLoaded', () => {
  try {
    bindAuth();
    bindForm();
    loadFromLocal();
    render();
  } catch (e) {
    showError(`Startup error: ${e.message||e}`);
    console.error(e);
  }
});

// If Firebase was loaded, wire auth state. If not, we stay in "guest".
const waitForFb = setInterval(() => {
  if (!fbReady) return; // either loading or not available; if it never loads, we remain guest with local storage
  clearInterval(waitForFb);
  if (!auth) return;
  window._fb.onAuthStateChanged(auth, async (u) => {
    user = u || null;
    try {
      if (user && db) await loadFromCloud(user.uid);
      else loadFromLocal();
    } catch { loadFromLocal(); }
    showApp(!!user);
    render();
  });
}, 100);
