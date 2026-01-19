import getUrlParam from "/js/utils/url_params.js";

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

function setMessage(text) {
    const messageBox = document.querySelector("[data-login-message]");

    if (text === null || text == "" || text === undefined) {
        if (messageBox) {
            messageBox.classList.add("hidden");
        }
        return;
    }
    if (messageBox) {
        messageBox.textContent = text;
        messageBox.classList.remove("hidden");
    }
}

export default function initLogin() {
    const form = document.querySelector("[data-login]");
    const container = document.querySelector("[data-login-container]");
    if (!form || !container) {
        return;
    }

    setMessage(); // Clear any existing messages

    form.addEventListener("submit", (event) => {
        event.preventDefault();
    });

    const newUserButton = document.getElementById("new_user");
    if (newUserButton) {
        newUserButton.addEventListener("click", newUserLogic);
    }

    const forgotPasswordButton = document.getElementById("forgot_password");
    if (forgotPasswordButton) {
        forgotPasswordButton.addEventListener("click", forgotPasswordLogic);
    }

    // Determine if the url has a reset token parameter
    const resetToken = getUrlParam("reset_token");
    if (resetToken) {
        replacePageContent("forgot-password_submit").then(async () => {
            await newPasswordLogic(resetToken);
        });
    }
}

let newUserLogic = async function () {
    await replacePageContent("register");
    setMessage();
    history.pushState({ page: "register" }, "");
    window.onpopstate = async () => {
        await replacePageContent("login");
        window.onpopstate = null;
        // Go back to login page, re-initialize login logic
        initLogin();
    };

    const form = document.querySelector("[data-register]");
    if (form) {
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            // TODO: Handle registration logic
        });
    }
};

let forgotPasswordLogic = async function () {
    await replacePageContent("forgot-password_init");
    setMessage();
    history.pushState({ page: "forgot-password" }, "");
    window.onpopstate = async () => {
        await replacePageContent("login");
        window.onpopstate = null;
        // Go back to login page, re-initialize login logic
        initLogin();
    };

    const form = document.querySelector("[data-forgot-password]");
    if (form) {
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            // TODO: Handle password reset logic
            // This should check that the email or user ID exists and then send a reset token via email.
            // If the operation is not successful, display an error message.
            setMessage("Email or User ID submitted. Check your email for further instructions.");
        });
    }
};

let newPasswordLogic = async function (resetToken) {
    setMessage();
    console.log(resetToken);
    const form = document.querySelector("[data-forgot-password]");
    if (form) {
        // load security question via API using the reset token. This should fail if the reset token is invalid or expired.
        // In the case of failure, show an error message and do not allow submission.
        // For now, we'll use a placeholder
        for (var i = 1; i <= 3; i++) {
            const questionLabel = document.getElementById(`security_question_${i}`);
            if (questionLabel) {
                questionLabel.textContent = `Question ${i}?`; // Placeholder question
            }
        }

        form.addEventListener("submit", (event) => {
            event.preventDefault();
            // TODO: Handle password reset submission logic
            // This should validate the reset token, security question answers, and set the new password.
            // If successful, show a success message.
            setMessage("Password has been reset. You can now log in with your new password.");
        });
    }
};
