async function replacePageContent(pageName) {
    const container = document.querySelector("[data-login-container]");
    if (!container) {
        return;
    }
    const response = await fetch(`pages/${pageName}.html`);
    if (!response.ok) {
        throw new Error(`Unable to load ${pageName}`);
    }
    container.innerHTML = await response.text();
}
        

export default function initLogin() {
    const form = document.querySelector("[data-login]");
    const message = document.querySelector("[data-login-message]");
    const container = document.querySelector("[data-login-container]");
    if (!form || !message || !container) {
        return;
    }

    message.classList.add("hidden");

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        message.textContent = "Login is wired. Connect to the auth API next.";
    });

    const newUserButton = document.getElementById("new_user");
    if (newUserButton) {
        newUserButton.addEventListener("click", async () => {
            await replacePageContent("register");
            history.pushState({ page: "register" }, "");
            window.onpopstate = async () => {
                await replacePageContent("login");
                window.onpopstate = null;
                initLogin();
            };

            const form = document.querySelector("[data-register]");
            if (form) {
                form.addEventListener("submit", (event) => {
                    event.preventDefault();
                    // TODO: Handle registration logic
                });
            }
        });
    }

    const forgotPasswordButton = document.getElementById("forgot_password");
    if (forgotPasswordButton) {
        forgotPasswordButton.addEventListener("click", async () => {
            await replacePageContent("forgot-password");
            history.pushState({ page: "forgot-password" }, "");
            window.onpopstate = async () => {
                await replacePageContent("login");
                window.onpopstate = null;
                initLogin();
            };
            
            const form = document.querySelector("[data-forgot-password]");
            if (form) {
                form.addEventListener("submit", (event) => {
                    event.preventDefault();
                    // TODO: Handle password reset logic
                });
            }
        });
    }
}
