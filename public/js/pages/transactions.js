export default function initTransactions() {
  const button = document.querySelector('[data-refresh]');
  const status = document.querySelector('[data-status]');
  if (!button || !status) {
    return;
  }

  const updateStatus = () => {
    status.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  };

  button.addEventListener('click', updateStatus);
  updateStatus();
}
