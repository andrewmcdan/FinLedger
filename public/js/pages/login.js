export default function initLogin() {
    const form = document.querySelector("[data-login]");
    const message = document.querySelector("[data-login-message]");
    if (!form || !message) {
        return;
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        message.textContent = "Login is wired. Connect to the auth API next.";
    });
}
