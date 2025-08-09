// ---------- UI ELEMENTS ----------
const debtForm = document.getElementById('debt-form');
const debtTable = document.getElementById('debt-table');
const debtTableBody = document.querySelector('#debt-table tbody');

// Auth inputs/buttons (optional if you added auth UI)
const emailEl = document.getElementById('email');
const passEl  = document.getElementById('password');
const signup  = document.getElementById('signup');
const login   = document.getElementById('login');
const logout  = document.getElementById('logout');

// ---------- HELPERS ----------
function fmtCurrency(n) {
  const num = Number(n);
  return isFinite(num) ? `$${num.toFixed(2)}` : '$0.00';
}

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleDateString('en-US'); // MM/DD/YYYY
}

function percentPaid(original, balance) {
  const o = Number(original), b = Number(balance);
  if (!isFinite(o) || o <= 0) return '0.00';
  return (((o - b) / o) * 100).toFixed(2);
}

function sum(nums){ return nums.reduce((a,b)=>a + (isFinite(+b)? +b : 0), 0); }

function setText(id, text){
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function updateTotals(rows){
  const totOriginal = sum(rows.map(r => r.originalAmount));
  const totBalance  = sum(rows.map(r => r.balance));
  const totMinPay   = sum(rows.map(r => r.minPayment));
  setText('tot-original', fmtCurrency(totOriginal));
  setText('tot-balance',  fmtCurrency(totBalance));
  setText('tot-minpay',   fmtCurrency(totMinPay));
}

// ---------- FIREBASE (expects compat scripts + config in index.html) ----------
/*
  index.html must include firebase-app-compat, firebase-auth-compat, firebase-firestore-compat
  and initialize:
    firebase.initializeApp(firebaseConfig);
    window._auth = firebase.auth();
    window._db   = firebase.firestore();
*/
if (!window._auth || !window._db) {
  console.warn('Firebase not initialized. Add compat scripts + config in index.html if using auth/cloud.');
}
const auth = window._auth;
const db   = window._db;

let currentUser = null;
let debtsUnsub = null;

// ---------- AUTH WIRES (optional) ----------
signup?.addEventListener('click', async () => {
  if (!auth) return alert('Auth not set up.');
  await auth.createUserWithEmailAndPassword(emailEl.value.trim(), passEl.value);
});
login?.addEventListener('click', async () => {
  if (!auth) return alert('Auth not set up.');
  await auth.signInWithEmailAndPassword(emailEl.value.trim(), passEl.value);
});
logout?.addEventListener('click', async () => {
  if (!auth) return alert('Auth not set up.');
  await auth.signOut();
});

// Toggle UI visibility based on auth
function toggleApp(visible) {
  if (debtForm) debtForm.style.display = visible ? 'block' : 'none';
  if (debtTable) debtTable.style.display = visible ? 'table' : 'none';
  if (logout) logout.style.display = visible ? 'inline-block' : 'none';
}

if (auth) {
  auth.onAuthStateChanged(user => {
    currentUser = user || null;
    toggleApp(!!user);

    if (debtsUnsub) { debtsUnsub(); debtsUnsub = null; }
    if (user) startUserListener(user.uid);
    else { debtTableBody.innerHTML = ''; updateTotals([]); }
  });
} else {
  console.warn('Running in local-only mode.');
  renderDebtsLocal();
  toggleApp(true);
}

// ---------- FIRESTORE SYNC ----------
function startUserListener(uid) {
  debtsUnsub = db
    .collection('users').doc(uid).collection('debts')
    .orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      const items = [];
      snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
      renderDebtsRemote(items);
    });
}

function renderDebtsRemote(debts) {
  debtTableBody.innerHTML = '';
  debts.forEach(debt => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${debt.name ?? ''}</td>
      <td>${fmtCurrency(debt.originalAmount)}</td>
      <td>${fmtCurrency(debt.balance)}</td>
      <td>${Number(debt.apr || 0).toFixed(2)}%</td>
      <td>${fmtCurrency(debt.minPayment)}</td>
      <td>${fmtDate(debt.dueDate)}</td>
      <td>${percentPaid(debt.originalAmount, debt.balance)}%</td>
      <td><button class="btn btn-danger" data-del-id="${debt.id}">Delete</button></td>
    `;
    debtTableBody.appendChild(row);
  });
  updateTotals(debts);
}

// ---------- LOCAL FALLBACK ----------
let localDebts = JSON.parse(localStorage.getItem('debts') || '[]');

function saveDebtsLocal() {
  localStorage.setItem('debts', JSON.stringify(localDebts));
}

function renderDebtsLocal() {
  debtTableBody.innerHTML = '';
  localDebts.forEach((debt, i) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${debt.name}</td>
      <td>${fmtCurrency(debt.originalAmount)}</td>
      <td>${fmtCurrency(debt.balance)}</td>
      <td>${Number(debt.apr || 0).toFixed(2)}%</td>
      <td>${fmtCurrency(debt.minPayment)}</td>
      <td>${fmtDate(debt.dueDate)}</td>
      <td>${percentPaid(debt.originalAmount, debt.balance)}%</td>
      <td><button class="btn btn-danger" data-del-local="${i}">Delete</button></td>
    `;
    debtTableBody.appendChild(row);
  });
  updateTotals(localDebts);
}

// ---------- FORM SUBMIT ----------
debtForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('debt-name').value.trim();
  const originalAmount = parseFloat(document.getElementById('original-amount').value);
  const balance = parseFloat(document.getElementById('balance').value);
  const apr = parseFloat(document.getElementById('apr').value || '0');
  const minPayment = parseFloat(document.getElementById('min-payment').value || '0');
  const dueDate = document.getElementById('due-date').value; // yyyy-mm-dd

  if (!name || !isFinite(originalAmount) || !isFinite(balance)) {
    alert('Please enter valid values.'); return;
  }

  // If logged in -> Firestore; else -> localStorage
  if (currentUser && db) {
    await db.collection('users').doc(currentUser.uid).collection('debts').add({
      name, originalAmount, balance, apr, minPayment, dueDate,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } else {
    localDebts.push({ name, originalAmount, balance, apr, minPayment, dueDate });
    saveDebtsLocal();
    renderDebtsLocal();
  }

  debtForm.reset();
});

// ---------- DELETE (event delegation) ----------
document.getElementById('debt-table').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  // Remote delete
  const delId = btn.getAttribute('data-del-id');
  if (delId && currentUser && db) {
    await db.collection('users').doc(currentUser.uid)
      .collection('debts').doc(delId).delete();
    return; // snapshot will re-render + totals
  }

  // Local delete
  const idx = btn.getAttribute('data-del-local');
  if (idx !== null) {
    localDebts.splice(Number(idx), 1);
    saveDebtsLocal();
    renderDebtsLocal();
  }
});

// If no Firebase (or not logged in), show local data on load
if (!auth) renderDebtsLocal();
