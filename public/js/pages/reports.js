export default function initReports() {
    const select = document.querySelector("[data-period]");
    const label = document.querySelector("[data-period-label]");
    if (!select || !label) {
        return;
    }

    const updateLabel = () => {
        label.textContent = select.value;
    };

    select.addEventListener("change", updateLabel);
    updateLabel();
}
