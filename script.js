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

// === REPLACE with your real values (apiKey is already set) ===
const firebaseConfig = {
  apiKey: "AIzaSyDiFlAL9xN1MiFlvNGQ425anWXg8Ed32cc",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  appId: "REPLACE_ME"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ===== Utilities =====
const $ = (sel) => document.querySelector(sel);
const fmt = (n) => isFinite(n) ? n.toLocaleString(undefined,{style:'currency',currency:'USD'}) : '$0.00';
const pct = (n) => isFinite(n) ? `${n.toFixed(1)}%` : '0%';
const todayISO = () => new Date().toISOString().slice(0,10);
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ===== State =====
const LOCAL_KEY = 'debts.v1';
let debts = [];
let user  = null;

// ===== Local storage =====
function loadFromLocal(){
  try { debts = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }
  catch { debts = []; }
}
function saveToLocal(){ localStorage.setItem(LOCAL_KEY, JSON.stringify(debts)); }

// ===== Firestore =====
async function loadFromCloud(uid){
  const snap = await getDocs(collection(db, `users/${uid}/debts`));
  debts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function saveItemToCloud(uid, item){
  const ref = item.id
    ? doc(db, `users/${uid}/debts/${item.id}`)
    : doc(collection(db, `users/${uid}/debts`));
  if (!item.id) item.id = ref.id;
  await setDoc(ref, item);
}
async function deleteItemFromCloud(uid, id){
  await deleteDoc(doc(db, `users/${uid}/debts/${id}`));
}

// ===== Auth buttons =====
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
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        // If you want to require verification, uncomment next 5 lines:
        // if (!cred.user.emailVerified) {
        //   await signOut(auth);
        //   alert('Verify your email first.');
        //   return;
        // }
      } catch (e) {
        console.error(e); alert(e.message || 'Login failed.');
      } finally { login.disabled = false; }
    });
  }
  if (logout){
    logout.addEventListener('click', async () => { try { await signOut(auth); } catch(e){ console.error(e); } });
  }
}

// ===== Form =====
function bindForm(){
  const form = $('#debt-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = {
      id: null,
      name: $('#debt-name')?.value.trim() || '',
      original: parseFloat($('#original-amount')?.value || '0') || 0,
      balance:  parseFloat($('#balance')?.value || '0') || 0,
      paid:     parseFloat($('#amount-paid')?.value || '0') || 0,
      apr:      parseFloat($('#apr')?.value || '0') || 0,
      minPayment: parseFloat($('#min-payment')?.value || '0') || 0,
      due: $('#due-date')?.value || todayISO(),
      createdAt: Date.now()
    };
    if (!($('#balance')?.value) && item.original >= 0 && item.paid >= 0) {
      const inferred = Math.max(item.original - item.paid, 0);
      item.balance = isFinite(inferred) ? inferred : 0;
    }
    debts.push(item);
    if (user) await saveItemToCloud(user.uid, item); else saveToLocal();
    e.target.reset?.();
    const due = $('#due-date'); if (due) due.value = todayISO();
    render();
  });
}

// ===== Render =====
function render(){
  const tbody = document.querySelector('#debt-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  let totOriginal = 0, totBalance = 0, totPaid = 0, totMin = 0;

  debts.slice().sort((a,b)=>(a.due||'').localeCompare(b.due||'')).forEach((d, idx) => {
    totOriginal += d.original||0; totBalance += d.balance||0;
    totPaid += d.paid||0; totMin += d.minPayment||0;
    const percentPaid = d.original>0 ? (100*(d.paid||0)/d.original) : 0;

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
      if (user && item?.id) await deleteItemFromCloud(user.uid, item.id);
      else saveToLocal();
      render();
    });
  });
}

// ===== UI gate =====
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

// ===== Startup =====
document.addEventListener('DOMContentLoaded', async () => {
  const dueInput = $('#due-date');
  if (dueInput && !dueInput.value) dueInput.value = todayISO();
  bindAuthButtons();
  bindForm();
  loadFromLocal(); // show something immediately while auth resolves
  render();
});

onAuthStateChanged(auth, async (u) => {
  // Allow unverified users to see the app; change to (u && u.emailVerified) if you want to gate it.
  user = u || null;
  try {
    if (user) await loadFromCloud(user.uid); else loadFromLocal();
  } catch (e) {
    console.warn('Cloud load failed, using local.', e);
    loadFromLocal();
  }
  showApp(!!user);
  render();
});
