export default function initHelp() {
    const stamp = document.querySelector("[data-last-updated]");
    if (stamp) {
        stamp.textContent = new Date().toLocaleString();
    }
}
