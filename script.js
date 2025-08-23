// ================== CONFIG ==================
const REQUIRE_LOGIN = false; // set true if you want to force login before using the app

// ================== UI ELEMENTS ==================
const debtForm = document.getElementById('debt-form');
const debtTable = document.getElementById('debt-table');
const debtTableBody = document.querySelector('#debt-table tbody');

// Optional auth elements (only if you use Firebase)
const emailEl = document.getElementById('email');
const passEl  = document.getElementById('password');
const signup  = document.getElementById('signup');
const login   = document.getElementById('login');
const logout  = document.getElementById('logout');

// ================== HELPERS ==================
function fmtCurrency(n) {
  const num = Number(n);
  return isFinite(num) ? `$${num.toFixed(2)}` : '$0.00';
}
function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleDateString('en-US'); // MM/DD/YYYY
}
function paidToDate(debt) {
  if (isFinite(Number(debt.amountPaid))) return Number(debt.amountPaid);
  if (isFinite(Number(debt.originalAmount)) && isFinite(Number(debt.balance))) {
    return Math.max(0, Number(debt.originalAmount) - Number(debt.balance));
  }
  return 0;
}
function percentPaidFor(debt) {
  const o = Number(debt.originalAmount);
  const paid = paidToDate(debt);
  if (!isFinite(o) || o <= 0) return '0.00';
  return ((paid / o) * 100).toFixed(2);
}
function sum(nums){ return nums.reduce((a,b)=>a + (isFinite(+b)? +b : 0), 0); }
function setText(id, text){ const el = document.getElementById(id); if (el) el.textContent = text; }
function updateTotals(rows){
  const totOriginal = sum(rows.map(r => r.originalAmount));
  const totBalance  = sum(rows.map(r => r.balance));
  const totPaid     = sum(rows.map(paidToDate));
  const totMinPay   = sum(rows.map(r => r.minPayment));
  setText('tot-original', fmtCurrency(totOriginal));
  setText('tot-balance',  fmtCurrency(totBalance));
  setText('tot-paid',     fmtCurrency(totPaid));
  setText('tot-minpay',   fmtCurrency(totMinPay));
}

// ================== FIREBASE WIRING (optional) ==================
// In index.html, Firebase is initialized into window._auth and window._db if config is present.
const auth = window._auth || null;
const db   = window._db   || null;

let currentUser = null;
let debtsUnsub = null;

function toggleApp(visible) {
  if (debtForm)  debtForm.style.display  = visible ? 'block' : 'none';
  if (debtTable) debtTable.style.display = visible ? 'table' : 'none';
  if (logout)    logout.style.display    = visible ? 'inline-block' : 'none';
}

// AUTH (only if you added the auth UI)
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

// If Firebase exists, watch auth; else local mode
if (auth) {
  auth.onAuthStateChanged(user => {
    currentUser = user || null;
    toggleApp(REQUIRE_LOGIN ? !!user : true);

    if (debtsUnsub) { debtsUnsub(); debtsUnsub = null; }
    if (user) startUserListener(user.uid);
    else {
      debtTableBody.innerHTML = '';
      updateTotals([]);
      if (!REQUIRE_LOGIN) renderDebtsLocal();
    }
  });
} else {
  console.warn("Running in local-only mode (no Firebase configured).");
  toggleApp(true);
  renderDebtsLocal();
}

// ================== REMOTE (Firestore) ==================
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
      <td>${fmtCurrency(paidToDate(debt))}</td>
      <td>${Number(debt.apr || 0).toFixed(2)}%</td>
      <td>${fmtCurrency(debt.minPayment)}</td>
      <td>${fmtDate(debt.dueDate)}</td>
      <td>${percentPaidFor(debt)}%</td>
      <td>
        <button class="btn" data-edit-id="${debt.id}">Edit</button>
        <button class="btn btn-danger" data-del-id="${debt.id}">Delete</button>
      </td>
    `;
    debtTableBody.appendChild(row);
  });
  updateTotals(debts);
}

// ================== LOCAL (fallback) ==================
let localDebts = JSON.parse(localStorage.getItem('debts') || '[]');
function saveDebtsLocal() { localStorage.setItem('debts', JSON.stringify(localDebts)); }

function renderDebtsLocal() {
  debtTableBody.innerHTML = '';
  localDebts.forEach((debt, i) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${debt.name}</td>
      <td>${fmtCurrency(debt.originalAmount)}</td>
      <td>${fmtCurrency(debt.balance)}</td>
      <td>${fmtCurrency(paidToDate(debt))}</td>
      <td>${Number(debt.apr || 0).toFixed(2)}%</td>
      <td>${fmtCurrency(debt.minPayment)}</td>
      <td>${fmtDate(debt.dueDate)}</td>
      <td>${percentPaidFor(debt)}%</td>
      <td>
        <button class="btn" data-edit-local="${i}">Edit</button>
        <button class="btn btn-danger" data-del-local="${i}">Delete</button>
      </td>
    `;
    debtTableBody.appendChild(row);
  });
  updateTotals(localDebts);
}

// ================== EDIT SUPPORT ==================
let editing = { id: null, idx: null };

function fillFormFromDebt(d) {
  document.getElementById('debt-name').value = d.name || '';
  document.getElementById('original-amount').value = d.originalAmount ?? '';
  document.getElementById('balance').value = d.balance ?? '';
  document.getElementById('amount-paid').value = d.amountPaid ?? '';
  document.getElementById('apr').value = d.apr ?? '';
  document.getElementById('min-payment').value = d.minPayment ?? '';
  document.getElementById('due-date').value = d.dueDate || '';
  const btn = debtForm.querySelector('button[type="submit"]');
  if (btn) btn.textContent = 'Save Changes';
}
function clearEditingState() {
  editing = { id: null, idx: null };
  const btn = debtForm.querySelector('button[type="submit"]');
  if (btn) btn.textContent = 'Add Debt';
  debtForm.reset();
}

// ================== FORM SUBMIT (Add / Update) ==================
debtForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('debt-name').value.trim();
  const originalAmount = parseFloat(document.getElementById('original-amount').value);
  let   balance = parseFloat(document.getElementById('balance').value);
  const amountPaid = parseFloat(document.getElementById('amount-paid').value || '0');
  const apr = parseFloat(document.getElementById('apr').value || '0');
  const minPayment = parseFloat(document.getElementById('min-payment').value || '0');
  const dueDate = document.getElementById('due-date').value;

  if (!name || !isFinite(originalAmount)) {
    alert('Please enter a name and a valid original amount.');
    return;
  }

  // If balance missing but amountPaid provided, derive balance
  if (!isFinite(balance) && isFinite(amountPaid)) {
    balance = Math.max(0, originalAmount - amountPaid);
  }
  if (!isFinite(balance)) {
    alert('Please enter a valid balance or amount paid.');
    return;
  }

  const payload = { name, originalAmount, balance, amountPaid, apr, minPayment, dueDate };

  // UPDATE (remote)
  if (editing.id && currentUser && db) {
    await db.collection('users').doc(currentUser.uid).collection('debts')
      .doc(editing.id).update(payload);
    clearEditingState();
    return;
  }
  // UPDATE (local)
  if (editing.idx !== null && editing.idx !== undefined) {
    localDebts[editing.idx] = { ...localDebts[editing.idx], ...payload };
    saveDebtsLocal();
    renderDebtsLocal();
    clearEditingState();
    return;
  }

  // ADD (remote vs local)
  if (currentUser && db && (REQUIRE_LOGIN ? currentUser : true)) {
    await db.collection('users').doc(currentUser.uid).collection('debts').add({
      ...payload,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } else {
    localDebts.push(payload);
    saveDebtsLocal();
    renderDebtsLocal();
  }

  debtForm.reset();
});

// ================== TABLE ACTIONS (Edit/Delete) ==================
document.getElementById('debt-table').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  // Remote delete
  const delId = btn.getAttribute('data-del-id');
  if (delId && currentUser && db) {
    await db.collection('users').doc(currentUser.uid)
      .collection('debts').doc(delId).delete();
    return;
  }

  // Remote edit
  const editId = btn.getAttribute('data-edit-id');
  if (editId && currentUser && db) {
    const docRef = await db.collection('users').doc(currentUser.uid)
      .collection('debts').doc(editId).get();
    if (docRef.exists) {
      editing = { id: editId, idx: null };
      fillFormFromDebt(docRef.data());
    }
    return;
  }

  // Local delete
  const idxDel = btn.getAttribute('data-del-local');
  if (idxDel !== null) {
    localDebts.splice(Number(idxDel), 1);
    saveDebtsLocal();
    renderDebtsLocal();
    return;
  }

  // Local edit
  const idxEdit = btn.getAttribute('data-edit-local');
  if (idxEdit !== null) {
    editing = { id: null, idx: Number(idxEdit) };
    fillFormFromDebt(localDebts[editing.idx]);
    return;
  }
});

// Initial local render if no Firebase or login not required
if (!auth || (!REQUIRE_LOGIN && !currentUser)) {
  toggleApp(true);
  renderDebtsLocal();
}
