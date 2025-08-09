// ---------- UI ELEMENTS ----------
const debtForm = document.getElementById('debt-form');
const debtTableBody = document.querySelector('#debt-table tbody');

// Auth inputs/buttons (add these to index.html per notes below)
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

// ---------- FIREBASE (expects firebase compat scripts on page) ----------
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
    firebase.initializeApp(firebaseConfig);
    window._auth = firebase.auth();
    window._db   = firebase.firestore();
  </script>
*/

if (!window._auth || !window._db) {
  console.warn('Firebase not initialized. Add the compat scripts + config in index.html.');
}

// References
const auth = window._auth;
const db   = window._db;

let currentUser = null;
let debtsUnsub = null;

// ---------- AUTH WIRES ----------
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
  const table = document.getElementById('debt-table');
  if (table) table.style.display = visible ? 'table' : 'none';
  if (logout) logout.style.display = visible ? 'inline-block' : 'none';
}

if (auth) {
  auth.onAuthStateChanged(user => {
    currentUser = user || null;
    toggleApp(!!user);

    // stop previous listener
    if (debtsUnsub) { debtsUnsub(); debtsUnsub = null; }
    if (user) startUserListener(user.uid);
    else debtTableBody.innerHTML = '';
  });
} else {
  // No Firebase: fallback to localStorage render so the page still works
  console.warn('Running in local-only mode.');
  renderDebtsLocal();
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
    `;
    debtTableBody.appendChild(row);
  });
}

// ---------- LOCAL FALLBACK (if Firebase not wired yet) ----------
let localDebts = JSON.parse(localStorage.getItem('debts') || '[]');

function saveDebtsLocal() {
  localStorage.setItem('debts', JSON.stringify(localDebts));
}

function renderDebtsLocal() {
  debtTableBody.innerHTML = '';
  localDebts.forEach(debt => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${debt.name}</td>
      <td>${fmtCurrency(debt.originalAmount)}</td>
      <td>${fmtCurrency(debt.balance)}</td>
      <td>${Number(debt.apr || 0).toFixed(2)}%</td>
      <td>${fmtCurrency(debt.minPayment)}</td>
      <td>${fmtDate(debt.dueDate)}</td>
      <td>${percentPaid(debt.originalAmount, debt.balance)}%</td>
    `;
    debtTableBody.appendChild(row);
  });
}

// ---------- FORM SUBMIT ----------
debtForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('debt-name').value.trim();
  const originalAmount = parseFloat(document.getElementById('original-amount').value);
  const balance = parseFloat(document.getElementById('balance').value);
  const apr = parseFloat(document.getElementById('apr').value || '0');
  const minPayment = parseFloat(document.getElementById('min-payment').value || '0');
  // With <input type="date"> this is yyyy-mm-dd
  const dueDate = document.getElementById('due-date').value;

  if (!name || !isFinite(originalAmount) || !isFinite(balance)) {
    alert('Please enter valid values.'); return;
  }

  // If logged in -> write to Firestore; else -> localStorage
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

// If no Firebase (or not logged in), show local data on load
if (!auth) renderDebtsLocal();

