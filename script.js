// ===== Firebase (optional; app works fully without logging in) =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDocs, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Put your real values here if you want cloud sync; otherwise leave as-is and it will use localStorage only.
const firebaseConfig = {
  apiKey: "AIzaSyDiFlAL9xN1MiFlvNGQ425anWXg8Ed32cc",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  appId: "REPLACE_ME"
};
const CONFIG_OK = firebaseConfig.projectId !== "REPLACE_ME";
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = CONFIG_OK ? getFirestore(app) : null;

// ===== Utilities =====
const $ = (s) => document.querySelector(s);
const fmt = (n) => isFinite(n) ? n.toLocaleString(undefined,{style:'currency',currency:'USD'}) : '$0.00';
const pct = (n) => isFinite(n) ? `${n.toFixed(1)}%` : '0%';
const todayISO = () => new Date().toISOString().slice(0,10);
const escapeHtml = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ===== State =====
let user = null;
let debts = [];
const localKey = () => `debts.v1.${user ? user.uid : 'guest'}`;

// ===== Local storage =====
function loadFromLocal(){
  try { debts = JSON.parse(localStorage.getItem(localKey()) || '[]'); }
  catch { debts = []; }
}
function saveToLocal(){
  localStorage.setItem(localKey(), JSON.stringify(debts));
}

// ===== Firestore =====
const path = (uid) => `users/${uid}/debts`;
async function loadFromCloud(uid){
  const snap = await getDocs(collection(db, path(uid)));
  debts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function saveItemToCloud(uid, item){
  const ref = item.id ? doc(db, `${path(uid)}/${item.id}`) : doc(collection(db, path(uid)));
  if (!item.id) item.id = ref.id;
  await setDoc(ref, item);
}
async function deleteItemFromCloud(uid, id){
  await deleteDoc(doc(db, `${path(uid)}/${id}`));
}

// ===== Form =====
function bindForm(){
  const form = $('#debt-form');
  const due  = $('#due-date');
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
      due: due?.value || todayISO(),
      createdAt: Date.now()
    };

    // infer balance if omitted
    if (!($('#balance')?.value) && item.original >= 0 && item.paid >= 0) {
      const inferred = Math.max(item.original - item.paid, 0);
      item.balance = isFinite(inferred) ? inferred : 0;
    }

    debts.push(item);
    try { if (user && db) await saveItemToCloud(user.uid, item); else saveToLocal(); }
    catch { saveToLocal(); }

    e.target.reset?.();
    if (due) due.value = todayISO();
    render();
  });
}

// ===== Render =====
function render(){
  const tbody = document.querySelector('#debt-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  let totOriginal=0, totBalance=0, totPaid=0, totMin=0;

  debts.slice().sort((a,b)=>(a.due||'').localeCompare(b.due||'')).forEach((d, idx) => {
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
      <td>${d.due||''}</td>
      <td>${pct(p)}</td>
      <td><button class="del" data-idx="${idx}">Delete</button></td>
    `;
    tbody.appendChild(tr);
  });

  $('#tot-original').textContent = fmt(totOriginal);
  $('#tot-balance').textContent  = fmt(totBalance);
  $('#tot-paid').textContent     = fmt(totPaid);
  $('#tot-minpay').textContent   = fmt(totMin);

  tbody.querySelectorAll('button.del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const i = Number(e.currentTarget.getAttribute('data-idx'));
      const item = debts[i];
      debts.splice(i,1);
      try { if (user && item?.id && db) await deleteItemFromCloud(user.uid, item.id); else saveToLocal(); }
      catch { saveToLocal(); }
      render();
    });
  });
}

// ===== Auth (optional) =====
function bindAuth(){
  const signup = $('#signup'), login = $('#login'), logout = $('#logout');
  const email  = $('#email'),  pass  = $('#password');

  if (signup){
    signup.addEventListener('click', async () => {
      if (!email?.value || !pass?.value) return alert('Enter email and password.');
      signup.disabled = true;
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.value.trim(), pass.value);
        await sendEmailVerification(cred.user);
        alert('Verification email sent (login still allowed without verification).');
      } catch (e) { alert(e.message || 'Sign up failed.'); }
      finally { signup.disabled = false; }
    });
  }

  if (login){
    login.addEventListener('click', async () => {
      if (!email?.value || !pass?.value) return alert('Enter email and password.');
      login.disabled = true;
      try { await signInWithEmailAndPassword(auth, email.value.trim(), pass.value); }
      catch (e) { alert(e.message || 'Login failed.'); }
      finally { login.disabled = false; }
    });
  }

  if (logout){
    logout.addEventListener('click', async () => { try { await signOut(auth); } catch {} });
  }
}

// ===== Show/Hide =====
function showApp(isLoggedIn){
  // Per your request: the app works even when logged out.
  // Logged-in users sync to Firestore; guests use localStorage.
  $('#logout').style.display = isLoggedIn ? 'inline-block' : 'none';
}

// ===== Startup =====
document.addEventListener('DOMContentLoaded', () => {
  const due = $('#due-date');
  if (due && !due.value) due.value = todayISO();
  bindAuth();
  bindForm();
  loadFromLocal(); // immediate UX
  render();
});

onAuthStateChanged(auth, async (u) => {
  // Allow unverified accounts; switch to (u && u.emailVerified) to gate.
  user = u || null;

  try {
    if (user && db) await loadFromCloud(user.uid);
    else loadFromLocal();
  } catch {
    loadFromLocal();
  }

  showApp(!!user);
  render();
});
