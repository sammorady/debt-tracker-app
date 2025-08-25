// ---------- UI ELEMENTS ----------
const debtForm = document.getElementById('debt-form');
const debtTable = document.getElementById('debt-table');
const debtTableBody = document.querySelector('#debt-table tbody');

// Auth inputs/buttons (add these to index.html per notes below)
// Auth inputs/buttons (optional if you added auth UI)
const emailEl = document.getElementById('email');
const passEl  = document.getElementById('password');
const signup  = document.getElementById('signup');
@@ -27,47 +28,48 @@
  return (((o - b) / o) * 100).toFixed(2);
}

// ---------- FIREBASE (expects firebase compat scripts on page) ----------
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
  In index.html, before this file, include:

  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
  <script>
    const firebaseConfig = {
      apiKey: "YOUR_KEY",
      authDomain: "YOUR_PROJECT.firebaseapp.com",
      projectId: "YOUR_PROJECT_ID",
    };
  index.html must include firebase-app-compat, firebase-auth-compat, firebase-firestore-compat
  and initialize:
    firebase.initializeApp(firebaseConfig);
    window._auth = firebase.auth();
    window._db   = firebase.firestore();
  </script>
*/

if (!window._auth || !window._db) {
  console.warn('Firebase not initialized. Add the compat scripts + config in index.html.');
  console.warn('Firebase not initialized. Add compat scripts + config in index.html if using auth/cloud.');
}

// References
const auth = window._auth;
const db   = window._db;

let currentUser = null;
let debtsUnsub = null;

// ---------- AUTH WIRES ----------
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
@@ -76,8 +78,7 @@
// Toggle UI visibility based on auth
function toggleApp(visible) {
  if (debtForm) debtForm.style.display = visible ? 'block' : 'none';
  const table = document.getElementById('debt-table');
  if (table) table.style.display = visible ? 'table' : 'none';
  if (debtTable) debtTable.style.display = visible ? 'table' : 'none';
  if (logout) logout.style.display = visible ? 'inline-block' : 'none';
}

@@ -86,15 +87,14 @@
    currentUser = user || null;
    toggleApp(!!user);

    // stop previous listener
    if (debtsUnsub) { debtsUnsub(); debtsUnsub = null; }
    if (user) startUserListener(user.uid);
    else debtTableBody.innerHTML = '';
    else { debtTableBody.innerHTML = ''; updateTotals([]); }
  });
} else {
  // No Firebase: fallback to localStorage render so the page still works
  console.warn('Running in local-only mode.');
  renderDebtsLocal();
  toggleApp(true);
}

// ---------- FIRESTORE SYNC ----------
@@ -121,12 +121,14 @@
      <td>${fmtCurrency(debt.minPayment)}</td>
      <td>${fmtDate(debt.dueDate)}</td>
      <td>${percentPaid(debt.originalAmount, debt.balance)}%</td>
      <td><button class="btn btn-danger" data-del-id="${debt.id}">Delete</button></td>
    `;
    debtTableBody.appendChild(row);
  });
  updateTotals(debts);
}

// ---------- LOCAL FALLBACK (if Firebase not wired yet) ----------
// ---------- LOCAL FALLBACK ----------
let localDebts = JSON.parse(localStorage.getItem('debts') || '[]');

function saveDebtsLocal() {
@@ -135,7 +137,7 @@

function renderDebtsLocal() {
  debtTableBody.innerHTML = '';
  localDebts.forEach(debt => {
  localDebts.forEach((debt, i) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${debt.name}</td>
@@ -145,9 +147,11 @@
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
@@ -159,14 +163,13 @@
  const balance = parseFloat(document.getElementById('balance').value);
  const apr = parseFloat(document.getElementById('apr').value || '0');
  const minPayment = parseFloat(document.getElementById('min-payment').value || '0');
  // With <input type="date"> this is yyyy-mm-dd
  const dueDate = document.getElementById('due-date').value;
  const dueDate = document.getElementById('due-date').value; // yyyy-mm-dd

  if (!name || !isFinite(originalAmount) || !isFinite(balance)) {
    alert('Please enter valid values.'); return;
  }

  // If logged in -> write to Firestore; else -> localStorage
  // If logged in -> Firestore; else -> localStorage
  if (currentUser && db) {
    await db.collection('users').doc(currentUser.uid).collection('debts').add({
      name, originalAmount, balance, apr, minPayment, dueDate,
@@ -181,6 +184,27 @@
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
