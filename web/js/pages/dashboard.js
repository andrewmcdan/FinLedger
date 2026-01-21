export default function initDashboard() {
    const stamp = document.querySelector("[data-last-updated]");
    if (stamp) {
        stamp.textContent = new Date().toLocaleString();
    }
}
