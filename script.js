const debtForm = document.getElementById('debt-form');
const debtTableBody = document.querySelector('#debt-table tbody');

let debts = JSON.parse(localStorage.getItem('debts')) || [];

function saveDebts() {
  localStorage.setItem('debts', JSON.stringify(debts));
}

function renderDebts() {
  debtTableBody.innerHTML = ''; // clear the table
  debts.forEach(debt => {
    const percentPaid = (((debt.originalAmount - debt.balance) / debt.originalAmount) * 100).toFixed(2);
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${debt.name}</td>
      <td>$${debt.originalAmount.toFixed(2)}</td>
      <td>$${debt.balance.toFixed(2)}</td>
      <td>${debt.apr.toFixed(2)}%</td>
      <td>$${debt.minPayment.toFixed(2)}</td>
      <td>${debt.dueDate}</td>
      <td>${percentPaid}%</td>
    `;
    debtTableBody.appendChild(row);
  });
}

debtForm.addEventListener('submit', function (e) {
  e.preventDefault();

  const name = document.getElementById('debt-name').value;
  const originalAmount = parseFloat(document.getElementById('original-amount').value);
  const balance = parseFloat(document.getElementById('balance').value);
  const apr = parseFloat(document.getElementById('apr').value);
  const minPayment = parseFloat(document.getElementById('min-payment').value);
  const dueDate = document.getElementById('due-date').value;

  const newDebt = { name, originalAmount, balance, apr, minPayment, dueDate };
  debts.push(newDebt);
  saveDebts();
  renderDebts();
  debtForm.reset();
});

// Load debts on page load
renderDebts();
