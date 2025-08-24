/* ===== Utilities ===== */
const $ = (sel) => document.querySelector(sel);
const fmt = (n) => isFinite(n) ? n.toLocaleString(undefined,{style:'currency',currency:'USD'}) : '$0.00';
const pct = (n) => isFinite(n) ? `${n.toFixed(1)}%` : '0%';
const todayISO = () => new Date().toISOString().slice(0,10);

/* ===== State (local or cloud) ===== */
const LOCAL_KEY = 'debts.v1';
let debts = [];          // in-memory list
let userId = null;       // Firebase user uid if logged in

// References to auth-related UI elements for easy access
let authEmailInput, authPasswordInput, authSignupBtn, authLoginBtn, authLogoutBtn;
let authUserDisplaySpan; // To show "Logged in as: user@example.com"

/* ===== Init: default due date to today, load data, bind events ===== */
document.addEventListener('DOMContentLoaded', () => {
  const dueInput = $('#due-date');
  if (dueInput && !dueInput.value) {
    dueInput.value = todayISO();
  }

  // Get references to auth elements once the DOM is loaded
  authEmailInput = $('#email');
  authPasswordInput = $('#password');
  authSignupBtn = $('#signup');
  authLoginBtn = $('#$('#login');
  authLogoutBtn = $('#logout');

  // Create a span for displaying user email if it doesn't exist
  authUserDisplaySpan = document.createElement('span');
  authUserDisplaySpan.id = 'user-display';
  $('#auth').prepend(authUserDisplaySpan); // Add it at the beginning of the auth div

  bindAuthButtons(); // Set up button click listeners
  bindForm();       // Set up debt form submission

  if (window._auth) {
    // This listener handles UI updates and data loading based on auth state
    window._auth.onAuthStateChanged(async (user) => {
      userId = user ? user.uid : null;
      console.log('Auth state changed. User:', user ? user.email : 'None');

      // Update UI based on authentication state
      if (user) {
        // User is signed in: hide inputs and login/signup buttons, show logout and user email
        authEmailInput.style.display = 'none';
        authPasswordInput.style.display = 'none';
        authSignupBtn.style.display = 'none';
        authLoginBtn.style.display = 'none';
        authLogoutBtn.style.display = ''; // Show logout button
        authUserDisplaySpan.textContent = `Logged in as: ${user.email}`;
        authUserDisplaySpan.style.display = '';
        $('#debt-form').style.display = ''; // Show debt form when logged in

        if (userId && window._db) {
          await loadFromCloud(); // Load user-specific data from Firestore
        } else {
          loadFromLocal(); // Fallback if _db is not configured or userId is somehow missing
        }
      } else {
        // User is signed out: show inputs and login/signup buttons, hide logout and user email
        authEmailInput.style.display = '';
        authPasswordInput.style.display = '';
        authSignupBtn.style.display = '';
        authLoginBtn.style.display = '';
        authLogoutBtn.style.display = 'none'; // Hide logout button
        authUserDisplaySpan.style.display = 'none'; // Hide user email display
        $('#debt-form').style.display = 'none'; // Hide debt form when logged out (optional, based on your app flow)

        loadFromLocal(); // Always load from local storage if no user is signed in
      }
      render(); // Re-render the debt list based on the newly loaded data
    });
  } else {
    console.warn("Firebase Authentication not configured. Running in local-only mode.");
    // Ensure auth panel is visible but indicate no Firebase config
    if (authEmailInput) authEmailInput.style.display = '';
    if (authPasswordInput) authPasswordInput.style.display = '';
    if (authSignupBtn) authSignupBtn.style.display = '';
    if (authLoginBtn) authLoginBtn.style.display = '';
    if (authLogoutBtn) authLogoutBtn.style.display = 'none';
    if (authUserDisplaySpan) authUserDisplaySpan.style.display = 'none';
    $('#auth').innerHTML += "<p>Firebase config missing. Auth disabled.</p>"; // Add a warning message
    $('#debt-form').style.display = 'none'; // Hide form if not logged in
    loadFromLocal();
    render();
  }
});

/* ===== Auth (optional) ===== */
function bindAuthButtons() {
  // Ensure all necessary elements are available before binding
  if (!authSignupBtn || !authLoginBtn || !authLogoutBtn || !authEmailInput || !authPasswordInput) {
      console.warn("Auth UI elements not found, auth buttons will not bind.");
      return;
  }

  // --- Sign Up Functionality ---
  authSignupBtn.addEventListener('click', async () => {
    if (!window._auth) {
      alert('Firebase is not configured. Please add your API key, auth domain, and project ID.');
      return;
    }
    const email = authEmailInput.value.trim();
    const password = authPasswordInput.value;

    if (!email || !password) {
      alert('Please enter both email and password to sign up.');
      return;
    }

    try {
      await window._auth.createUserWithEmailAndPassword(email, password);
      console.log('User signed up successfully!');
      // UI will update via onAuthStateChanged listener
      alert(`Account created for ${email}!`);
      authEmailInput.value = ''; // Clear input fields on success
      authPasswordInput.value = '';
    } catch (error) {
      console.error('Sign Up Error:', error);
      alert(`Sign Up Failed: ${error.message}`);
    }
  });

  // --- Log In Functionality ---
  authLoginBtn.addEventListener('click', async () => {
    if (!window._auth) {
      alert('Firebase is not configured. Please add your API key, auth domain, and project ID.');
      return;
    }
    const email = authEmailInput.value.trim();
    const password = authPasswordInput.value;

    if (!email || !password) {
      alert('Please enter both email and password to log in.');
      return;
    }

    try {
      await window._auth.signInWithEmailAndPassword(email, password);
      console.log('User logged in successfully!');
      // UI will update via onAuthStateChanged listener
      alert(`Welcome back, ${email}!`);
      authEmailInput.value = ''; // Clear input fields on success
      authPasswordInput.value = '';
    } catch (error) {
      console.error('Login Error:', error);
      alert(`Login Failed: ${error.message}`);
    }
  });

  // --- Log Out Functionality ---
  authLogoutBtn.addEventListener('click', async () => {
    if (!window._auth) return;
    try {
      await window._auth.signOut();
      console.log('User logged out successfully!');
      // UI will update via onAuthStateChanged listener
      alert('You have been logged out.');
    } catch (error) {
      console.error('Logout Error:', error);
      alert(`Logout Failed: ${error.message}`);
    }
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
    // Only attempt to load if userId and _db are definitively available
    if (userId && window._db) {
      const snap = await window._db.collection('users').doc(userId).collection('debts').get();
      debts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
        // If not logged in or _db is missing, load local data
        loadFromLocal();
    }
  } catch (e) {
    console.warn('Cloud load failed, falling back to local.', e);
    loadFromLocal();
  }
}
async function saveItemToCloud(item) {
  if (!userId || !window._db) {
    console.warn('Cannot save to cloud: User not logged in or Firestore not initialized.');
    return;
  }
  const ref = item.id
    ? window._db.collection('users').doc(userId).collection('debts').doc(item.id)
    : window._db.collection('users').doc(userId).collection('debts').doc();
  if (!item.id) item.id = ref.id;
  await ref.set(item);
  console.log('Item saved to cloud:', item.id);
}
async function deleteItemFromCloud(id) {
  if (!userId || !window._db) {
    console.warn('Cannot delete from cloud: User not logged in or Firestore not initialized.');
    return;
  }
  await window._db.collection('users').doc(userId).collection('debts').doc(id).delete();
  console.log('Item deleted from cloud:', id);
}

/* ===== Form/Submissions ===== */
function bindForm() {
  const form = $('#debt-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const item = {
      id: null, // Will be populated by Firestore if saving to cloud
      name: $('#debt-name').value.trim(),
      original: parseFloat($('#original-amount').value || '0') || 0,
      balance: parseFloat($('#balance').value || '0') || 0,
      paid: parseFloat($('#amount-paid').value || '0') || 0,
      apr: parseFloat($('#apr').value || '0') || 0,
      minPayment: parseFloat($('#min-payment').value || '0') || 0,
      due: $('#due-date').value || todayISO(),
      createdAt: Date.now() // Add a timestamp for creation
    };

    // If balance omitted but original/paid provided, infer balance.
    if (!$('#balance').value && item.original >= 0 && item.paid >= 0) {
      const inferred = Math.max(item.original - item.paid, 0);
      item.balance = isFinite(inferred) ? inferred : 0;
    }

    debts.push(item);

    // Save based on current auth state
    if (userId && window._db) {
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

  // Filter debts by userId if logged in, otherwise show all local debts.
  // NOTE: Your loadFromCloud/loadFromLocal already ensures 'debts' array
  // only contains relevant data, so no explicit filtering needed here.

  debts
    .slice() // create a shallow copy to sort
    .sort((a,b) => (a.due || '').localeCompare(b.due || '')) // Sort by due date
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
        <td><button data-id="${d.id}" class="del">Delete</button></td>
      `;
      tbody.appendChild(tr);
    });

  $('#tot-original').textContent = fmt(totOriginal);
  $('#tot-balance').textContent  = fmt(totBalance);
  $('#tot-paid').textContent     = fmt(totPaid);
  $('#tot-minpay').textContent   = fmt(totMin);

  // Re-bind delete buttons after rendering
  tbody.querySelectorAll('button.del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const itemIdToDelete = e.currentTarget.getAttribute('data-id'); // Get ID instead of index
      // Remove from local 'debts' array first
      debts = debts.filter(d => d.id !== itemIdToDelete);

      // Delete from cloud or local storage
      if (userId && window._db) {
        await deleteItemFromCloud(itemIdToDelete);
      } else {
        saveToLocal();
      }
      render(); // Re-render the table
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
