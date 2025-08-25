// ===== Firebase (v10 modular) =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc,
  getDocs, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ===== Firebase config =====
   Fill in the three placeholders below from Firebase Console:
   Project settings → General → Your apps → Web SDK config                               */
const firebaseConfig = {
  apiKey: "AIzaSyDiFlAL9xN1MiFlvNGQ425anWXg8Ed32cc",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  appId: "REPLACE_ME" // e.g. 1:1234567890:web:abcdef123456
};

// Basic sanity check so we don’t try cloud when config is blank
const CONFIG_OK = firebaseConfig.projectId !== "REPLACE_ME" &&
                  firebaseConfig.appId      !== "REPLACE_ME" &&
                  firebaseConfig.authDomain !== "REPLACE_ME.firebaseapp.com";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = CONFIG_OK ? getFirestore(app) : null;

/* ===== Utilities ===== */
const $   = (sel) => document.querySelector(sel);
const fmt = (n) => isFinite(n) ? n.toLocaleString(undefined,{ style:'currency', currency:'USD' }) : '$0.00';
const pct = (n) => isFinite(n) ? `${n.toFixed(1)}%` : '0%';
const todayISO    = () => new Date().toISOString().slice(0,10);
const escapeHtml  = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const notify      = (msg) => console.info(msg);

/* ===== State ===== */
let debts = [];
let user  = null;
// Key is per-user so your local data doesn’t collide between users
const localKey = () => `debts.v1.${user ? user.uid : 'guest'}`;

/* ===== Local storage ===== */
function loadFromLocal(){
  try { debts = JSON.parse(localStorage.getItem(localKey()) || '[]'); }
  catch { debts = []; }
}
function saveToLocal(){ localStorage.setItem(localKey(), JSON.stringify(debts)); }

/* ===== Firestore helpers ===== */
function userDebtsPath(uid){ return `users/${uid}/debts`; }

async function loadFromCloud(uid){
  if (!db) throw new Error('Firestore not initialized (missing config).');
  const snap = await getDocs(collection(db, userDebtsPath(uid)));
  debts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function saveItemToCloud(uid, item){
  if (!db) return; // fail soft: keep working locally
  const ref = item.id
    ? doc(db, `${userDebtsPath(uid)}/${item.id}`)
    : doc(collection(db, userDebtsPath(uid)));
  if (!item.id) item.id = ref.id;
  await setDoc(ref, item);
}

async function deleteItemFromCloud(uid, id){
  if (!db) return;
  await deleteDoc(doc(db, `${userDebtsPath(uid)}/${id}`));
}

/* ===== Auth buttons ===== */
function bindAuthButtons(){
  const signup = $('#signup'), login = $('#login'), logout = $('#logout');

  if (signup){
    signup.addEventListener('click', async () => {
      const email = $('#email')?.value.trim();
      const pass  = $('#password')?.value;
      if (!email || !pass) return alert('Enter email and password.');
      signup.disabled = true;
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await sendEmailVerification(cred.user);
        alert('Verification email sent.');
      } catch (e) {
        console.error(e); alert(e.message || 'Sign up failed.');
      } finally { signup.disabled = false; }
    });
  }

  if (login){
    login.addEventListener('click', async () => {
      const email = $('#email')?.value.trim();
      const pass  = $('#password')?.value;
      if (!email || !pass) return alert('Enter email and password.');
      login.disabled = true;
      try {
        await signInWithEmailAndPassword(auth, email, pass);
        // To require verification before showing the app, switch the onAuthStateChanged logic below.
      } catch (e) {
        console.error(e); alert(e.message || 'Login failed.');
      } finally { login.disabled = false; }
    });
  }

  if (logout){
    logout.addEventListener('click', async () => {
      try { await signOut(auth); } catch(e){ console.error(e); }
    });
  }
}

/* ===== Form ===== */
function bindForm(){
  const form = $('#debt-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const item = {
      id: null,
      name: $('#debt-name')?.value.trim() || '',
      original:  parseFloat($('#original-amount')?.value || '0') || 0,
      balance:   parseFloat($('#balance')?.value || '0') || 0,
      paid:      parseFloat($('#amount-paid')?.value || '0') || 0,
      apr:       parseFloat($('#apr')?.value || '0') || 0,
      minPayment:parseFloat($('#min-payment')?.value || '0') || 0,
      due: $('#due-date')?.value || todayISO(),
      createdAt: Date.now()
    };

    // Infer balance if omitted
    if (!($('#balance')?.value) && item.original >= 0 && item.paid >= 0) {
      const inferred = Math.max(item.original - item.paid, 0);
      item.balance = isFinite(inferred) ? inferred : 0;
    }

    debts.push(item);

    try {
      if (user) await saveItemToCloud(user.uid, item);
      else saveToLocal();
    } catch (e) {
      console.warn('Cloud save failed; saved locally instead.', e);
      saveToLocal();
    }

    e.target.reset?.();
    const due = $('#due-date'); if (due) due.value = todayISO();
    render();
  });
}

/* ===== Render ===== */
function render(){
  const tbody = document.querySelector('#debt-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  let totOriginal = 0, totBalance = 0, totPaid = 0, totMin = 0;

  debts.slice().sort((a,b)=>(a.due||'').localeCompare(b.due||'')).forEach((d, idx) => {
    totOriginal += d.original     || 0;
    totBalance  += d.balance      || 0;
    totPaid     += d.paid         || 0;
    totMin      += d.minPayment   || 0;

    const percentPaid = d.original > 0 ? (100 * (d.paid || 0) / d.original) : 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(d.name||'')}</td>
      <td>${fmt(d.original)}</td>
      <td>${fmt(d.balance)}</td>
      <td>${fmt(d.paid)}</td>
      <td>${(d.apr||0).toFixed(2)}</td>
      <td>${fmt(d.minPayment)}</td>
      <td>${d.due||''}</td>
      <td>${pct(percentPaid)}</td>
      <td><button data-idx="${idx}" class="del">Delete</button></td>
    `;
    tbody.appendChild(tr);
  });

  $('#tot-original') && ($('#tot-original').textContent = fmt(totOriginal));
  $('#tot-balance')  && ($('#tot-balance').textContent  = fmt(totBalance));
  $('#tot-paid')     && ($('#tot-paid').textContent     = fmt(totPaid));
  $('#tot-minpay')   && ($('#tot-minpay').textContent   = fmt(totMin));

  tbody.querySelectorAll('button.del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const i = Number(e.currentTarget.getAttribute('data-idx'));
      const item = debts[i];
      debts.splice(i, 1);

      try {
        if (user && item?.id) await deleteItemFromCloud(user.uid, item.id);
        else saveToLocal();
      } catch (err) {
        console.warn('Cloud delete failed; updating local only.', err);
        saveToLocal();
      }

      render();
    });
  });
}

/* ===== UI gate ===== */
function showApp(authed){
  const authPanel = $('#auth');
  const debtForm  = $('#debt-form');
  const logoutBtn = $('#logout');
  if (!authPanel || !debtForm || !logoutBtn) return;

  if (authed){
    authPanel.style.display = 'none';
    debtForm.style.display  = 'block';
    logoutBtn.style.display = 'inline-block';
  } else {
    authPanel.style.display = 'block';
    debtForm.style.display  = 'none';
    logoutBtn.style.display = 'none';
  }
}

/* ===== Startup ===== */
document.addEventListener('DOMContentLoaded', () => {
  const dueInput = $('#due-date');
  if (dueInput && !dueInput.value) dueInput.value = todayISO();
  bindAuthButtons();
  bindForm();
  // Show local data immediately while auth resolves
  loadFromLocal(); 
  render();
});

onAuthStateChanged(auth, async (u) => {
  // CURRENT: allow unverified users. To require verification, replace with:
  // user = (u && u.emailVerified) ? u : null;
  user = u || null;

  try {
    if (user && db) {
      await loadFromCloud(user.uid);
      notify('Loaded debts from Firestore.');
    } else {
      loadFromLocal();
      if (!db && user) notify('Firestore disabled (config incomplete). Using local only.');
    }
  } catch (e) {
    console.warn('Cloud load failed; using local.', e);
    loadFromLocal();
  }

  showApp(!!user);
  render();
});
