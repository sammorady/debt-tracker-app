/* ===== Utilities ===== */
const $ = (sel) => document.querySelector(sel);
const fmt = (n) => isFinite(n) ? n.toLocaleString(undefined,{style:'currency',currency:'USD'}) : '$0.00';
const pct = (n) => isFinite(n) ? `${n.toFixed(1)}%` : '0%';
const todayISO = () => new Date().toISOString().slice(0,10);

/* ===== State (local or cloud) ===== */
const LOCAL_KEY = 'debts.v1';
let debts = [];          // in-memory list
let userId = null;       // Firebase user uid if logged in

/* ===== Init: default due date to today, load data, bind events ===== */
document.addEventListener('DOMContentLoaded', () => {
  const dueInput = $('#due-date');
  if (dueInput && !dueInput.value) {
    dueInput.value = todayISO();
  }

  bindAuthButtons();
  bindForm();
  if (window._auth) {
    window._auth.onAuthStateChanged(async (u) => {
      userId = u ? u.uid : null;
      $('#logout').style.display = u ? '' : 'none';
      if (userId && window._db) {
        await loadFromCloud();
      } else {
        loadFromLocal();
      }
      render();
    });
  } else {
    loadFromLocal();
    render();
  }
});

/* ===== Auth (optional) ===== */
function bindAuthButtons() {
  const signup = $('#signup'), login = $('#login'), logout = $('#logout');
  if (!signup || !login || !logout) return;

  signup.addEventListener('click', async () => {
    if (!window._auth) return alert('Add Firebase config to enable Sign Up.');
    const email = $('#email').value.trim();
    const pass  = $('#password').value;
    await _auth.createUserWithEmailAndPassword(email, pass);
  });

  login.addEventListener('click', async () => {
    if (!window._auth) return alert('Add Firebase config to enable Log In.');
    const email = $('#email').value.trim();
    const pass  = $('#password').value;
    await _auth.signInWithEmailAndPassword(email, pass);
  });

  logout.addEventListener('click', async () => {
    if (!window._auth) return;
    await _auth.signOut();
  });
}

/* ===== Persistence ===== */
function loadFromLocal() {
  try {
    debts = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  } catch {
    debts = [];
  }
}
function saveToLocal() {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(debts));
}

async function loadFromCloud() {
  try {
    const snap = await _db.collection('users').doc(userId).collection('debts').get();
    debts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('Cloud load failed, falling back to local.', e);
    loadFromLocal();
  }
}
async function saveItemToCloud(item) {
  if (!userId || !_db) return;
  const ref = item.id
    ? _db.collection('users').doc(userId).collection('debts').doc(item.id)
    : _db.collection('users').doc(userId).collection('debts').doc();
  if (!item.id) item.id = ref.id;
  await ref.set(item);
}
async function deleteItemFromCloud(id) {
  if (!userId || !_db) return;
  await _db.collection('users').doc(userId).collection('debts').doc(id).delete();
}

/* ===== Form/Submissions ===== */
function bindForm() {
  const form = $('#debt-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const item = {
      id: null,
      name: $('#debt-name').value.trim(),
      original: parseFloat($('#original-amount').value || '0') || 0,
      balance: parseFloat($('#balance').value || '0') || 0,
      paid: parseFloat($('#amount-paid').value || '0') || 0,
      apr: parseFloat($('#apr').value || '0') || 0,
      minPayment: parseFloat($('#min-payment').value || '0') || 0,
      due: $('#due-date').value || todayISO(),
      createdAt: Date.now()
    };

    // If balance omitted but original/paid provided, infer balance.
    if (!$('#balance').value && item.original >= 0 && item.paid >= 0) {
      const inferred = Math.max(item.original - item.paid, 0);
      item.balance = isFinite(inferred) ? inferred : 0;
    }

    debts.push(item);
    if (userId && _db) {
      await saveItemToCloud(item);
    } else {
      saveToLocal();
    }

    e.target.reset();
    $('#due-date').value = todayISO(); // keep default
    render();
  });
}

/* ===== Render ===== */
function render() {
  const tbody = $('#debt-table tbody');
  tbody.innerHTML = '';

  let totOriginal = 0, totBalance = 0, totPaid = 0, totMin = 0;

  debts
    .slice()
    .sort((a,b) => (a.due || '').localeCompare(b.due || ''))
    .forEach((d, idx) => {
      totOriginal += d.original || 0;
      totBalance  += d.balance  || 0;
      totPaid     += d.paid     || 0;
      totMin      += d.minPayment || 0;

      const percentPaid = d.original > 0 ? (100 * (d.paid || 0) / d.original) : 0;
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td>${escapeHtml(d.name || '')}</td>
        <td>${fmt(d.original)}</td>
        <td>${fmt(d.balance)}</td>
        <td>${fmt(d.paid)}</td>
        <td>${(d.apr || 0).toFixed(2)}</td>
        <td>${fmt(d.minPayment)}</td>
        <td>${d.due || ''}</td>
        <td>${pct(percentPaid)}</td>
        <td><button data-idx="${idx}" class="del">Delete</button></td>
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
      debts.splice(i, 1);
      if (userId && _db && item && item.id) {
        await deleteItemFromCloud(item.id);
      } else {
        saveToLocal();
      }
      render();
    });
  });
}

/* ===== Helpers ===== */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
