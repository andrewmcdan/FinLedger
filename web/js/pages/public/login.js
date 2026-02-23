async function replacePageContent(pageName, query = "") {
    const container = document.querySelector("[data-login-container]");
    if (!container) {
        return;
    }
    const suffix = query ? (query.startsWith("?") ? query : `?${query}`) : "";
    const response = await fetch(`pages/${pageName}.html${suffix}`);
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

let getUrlParamFn = null;
let getMessageFn = null;

async function loadUrlParamHelper() {
    if (getUrlParamFn) {
        return getUrlParamFn;
    }
    // Use an absolute URL so it resolves when the module itself is loaded from a blob URL.
    const moduleUrl = new URL("/js/utils/url_params.js", window.location.origin).href;
    const module = await import(moduleUrl);
    getUrlParamFn = module.default;
    return getUrlParamFn;
}

async function loadMessageHelper() {
    if (getMessageFn) {
        return getMessageFn;
    }
    const moduleUrl = new URL("/js/utils/messages.js", window.location.origin).href;
    const module = await import(moduleUrl);
    getMessageFn = module.getMessage;
    return getMessageFn;
}

async function setMessageFromCode(code, replacements = {}, fallback = "") {
    const getMessage = await loadMessageHelper();
    const text = await getMessage(code, replacements, fallback);
    setMessage(text);
}

async function showLocalMessage(message) {
    const text = `${message ?? ""}`.trim();
    if (!text) {
        setMessage();
        return;
    }
    if (text.startsWith("ERR_") || text.startsWith("MSG_")) {
        await setMessageFromCode(text, {}, text);
        return;
    }
    setMessage(text);
}

let showGlobalErrorFn = null;
let showGlobalMessageFn = null;

function clearMessages() {
    setMessage();
    if (typeof showGlobalMessageFn === "function") {
        void showGlobalMessageFn("");
        return;
    }
    if (typeof showGlobalErrorFn === "function") {
        void showGlobalErrorFn("");
    }
}

async function showErrorMessage(message, autoHide) {
    const presenter = showGlobalErrorFn || showLocalMessage;
    await presenter(message, autoHide);
}

async function showSuccessMessage(message, autoHide) {
    const presenter = showGlobalMessageFn || showLocalMessage;
    await presenter(message, autoHide);
}

export default function initLogin({ showErrorModal, showMessageModal } = {}) {
    const form = document.querySelector("[data-login]");
    const container = document.querySelector("[data-login-container]");
    if (!form || !container) {
        return;
    }

    if (typeof showErrorModal === "function") {
        showGlobalErrorFn = showErrorModal;
    }
    if (typeof showMessageModal === "function") {
        showGlobalMessageFn = showMessageModal;
    }

    clearMessages();
    form.addEventListener("input", clearMessages);

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const username = formData.get("username");
        const password = formData.get("password");
        fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ username, password }),
        })
            .then((response) => response.json())
            .then(async (data) => {
                if (data.token) {
                    await showSuccessMessage("MSG_LOGIN_SUCCESS", true);
                    localStorage.setItem("user_id", data.user_id);
                    localStorage.setItem("auth_token", data.token);
                    localStorage.setItem("username", data.username);
                    localStorage.setItem("full_name", data.fullName);
                    const mustChangePassword = data.must_change_password === true;
                    if (mustChangePassword) {
                        localStorage.setItem("must_change_password", "true");
                        window.location.href = "/#/force_password_change";
                        return;
                    }
                    localStorage.removeItem("must_change_password");
                    // Redirect to the main app page or refresh
                    window.location.href = "/#/dashboard";
                } else {
                    const errorCode = typeof data.errorCode === "string" ? data.errorCode.trim() : "";
                    await showErrorMessage(errorCode || data.error || "ERR_INTERNAL_SERVER");
                }
            })
            .catch(async () => {
                await showErrorMessage("ERR_INTERNAL_SERVER");
            });
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
    loadUrlParamHelper()
        .then((getUrlParam) => {
            const resetToken = getUrlParam("reset_token");
            if (resetToken) {
                replacePageContent("public/forgot-password_submit", `reset_token=${encodeURIComponent(resetToken)}`).then(async () => {
                    await newPasswordLogic(resetToken);
                });
            }
        })
        .catch((error) => {
            console.error("Failed to load url_params helper:", error);
        });
}

let newUserLogic = async function () {
    await replacePageContent("public/register");
    clearMessages();
    history.pushState({ page: "register" }, "");
    window.onpopstate = async () => {
        await replacePageContent("public/login");
        window.onpopstate = null;
        // Go back to login page, re-initialize login logic
        initLogin();
    };

    const selectEls = [document.getElementById("security_question_1"), document.getElementById("security_question_2"), document.getElementById("security_question_3")];
    try {
        const response = await fetch("/api/users/security-questions-list");
        const data = await response.json();
        const questionGroups = data.security_questions || {};
        selectEls.forEach((selectEl, index) => {
            if (!selectEl) {
                return;
            }
            const group = questionGroups[index + 1] || [];
            group.forEach((question) => {
                const option = document.createElement("option");
                option.value = question.value;
                option.textContent = question.label;
                selectEl.appendChild(option);
            });
        });
    } catch (error) {
        console.error("Failed to load security question list:", error);
    }

    const form = document.querySelector("[data-register]");
    if (form) {
        form.addEventListener("input", clearMessages);
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const formData = new FormData(form);
            const first_name = formData.get("first_name");
            const last_name = formData.get("last_name");
            const email = formData.get("email");
            const password = formData.get("password");
            const address = formData.get("address");
            const date_of_birth = formData.get("date_of_birth");
            const role = formData.get("role");
            const security_question_1 = formData.get("security_question_1");
            const security_answer_1 = formData.get("security_answer_1");
            const security_question_2 = formData.get("security_question_2");
            const security_answer_2 = formData.get("security_answer_2");
            const security_question_3 = formData.get("security_question_3");
            const security_answer_3 = formData.get("security_answer_3");
            fetch("/api/users/register_new_user", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ first_name, last_name, email, password, address, date_of_birth, role, security_question_1, security_answer_1, security_question_2, security_answer_2, security_question_3, security_answer_3 }),
            })
                .then((response) => response.json())
                .then(async (data) => {
                    form.reset();
                    if (data.user) {
                        await showSuccessMessage("MSG_REGISTRATION_SUCCESS_REDIRECT");
                        setTimeout(() => {
                            const loginUrl = `${window.location.pathname}?reload=${Date.now()}#/login`;
                            window.location.href = loginUrl;
                        }, 1500);
                    } else {
                        await showErrorMessage(data.errorCode || data.error || "ERR_FAILED_TO_REGISTER_USER");
                    }
                })
                .catch(async () => {
                    form.reset();
                    await showErrorMessage("ERR_INTERNAL_SERVER");
                });
        });
    }

    const passwordInput = document.getElementById("password");
    const confirmPasswordInput = document.getElementById("password_confirmation");
    const passwordRequirementsContainer = document.querySelector("[data-password-requirements]");
    const passwordMatchContainer = document.querySelector("[data-password-match]");
    const requirementItems = {
        starts_with_letter: document.getElementById("starts_with_letter"),
        length: document.getElementById("length"),
        uppercase: document.getElementById("uppercase"),
        lowercase: document.getElementById("lowercase"),
        number: document.getElementById("number"),
        special: document.getElementById("special"),
    };

    if (passwordInput && confirmPasswordInput) {
        const setRequirementState = (key, met) => {
            const item = requirementItems[key];
            if (!item) {
                return;
            }
            item.classList.toggle("valid", met);
            item.classList.toggle("invalid", !met);
        };

        const validatePasswords = () => {
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;
            // Check password requirements
            const startsWithLetterMet = /^[A-Za-z]/.test(password);
            const lengthMet = password.length >= 8;
            const uppercaseMet = /[A-Z]/.test(password);
            const lowercaseMet = /[a-z]/.test(password);
            const numberMet = /[0-9]/.test(password);
            const specialMet = /[~!@#$%^&*()_+|}{":?><,./;'[\]\\=-]/.test(password);
            const requirementsMet = startsWithLetterMet && lengthMet && uppercaseMet && lowercaseMet && numberMet && specialMet;

            setRequirementState("starts_with_letter", startsWithLetterMet);
            setRequirementState("length", lengthMet);
            setRequirementState("uppercase", uppercaseMet);
            setRequirementState("lowercase", lowercaseMet);
            setRequirementState("number", numberMet);
            setRequirementState("special", specialMet);

            if (passwordRequirementsContainer && requirementsMet) {
                passwordRequirementsContainer.classList.add("hidden");
            } else if (passwordRequirementsContainer) {
                passwordRequirementsContainer.classList.remove("hidden");
            }
        };
        const validatePasswordMatch = () => {
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;
            if (passwordMatchContainer && password === confirmPassword) {
                passwordMatchContainer.classList.add("hidden");
            }else if (passwordMatchContainer) {
                passwordMatchContainer.classList.remove("hidden");
            }
        };
        passwordInput.addEventListener("input", validatePasswords);
        confirmPasswordInput.addEventListener("input", validatePasswordMatch);
    }
    
};

let forgotPasswordLogic = async function () {
    await replacePageContent("public/forgot-password_init");
    clearMessages();
    history.pushState({ page: "forgot-password" }, "");
    window.onpopstate = async () => {
        await replacePageContent("public/login");
        window.onpopstate = null;
        // Go back to login page, re-initialize login logic
        initLogin();
    };

    const form = document.querySelector("[data-forgot-password]");
    if (form) {
        form.addEventListener("input", clearMessages);
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const formData = new FormData(form);
            const email = formData.get("email");
            const user_id = formData.get("user_id");
            fetch("/api/users/reset-password/" + encodeURIComponent(email) + "/" + encodeURIComponent(user_id), {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            })
                .then((response) => response.json())
                .then(async (data) => {
                    if (data.message) {
                        await showSuccessMessage(data.message);
                    } else {
                        await showErrorMessage(data.errorCode || data.error || "ERR_PASSWORD_RESET_REQUEST_FAILED");
                    }
                })
                .catch(async () => {
                    await showErrorMessage("ERR_PASSWORD_RESET_REQUEST_FAILED");
                });
        });
    }
};

let newPasswordLogic = async function (resetToken) {
    clearMessages();
    const form = document.querySelector("[data-forgot-password]");
    if (form) {
        form.addEventListener("input", clearMessages);
        const passwordInput = document.getElementById("password");
        const confirmPasswordInput = document.getElementById("password_confirmation");
        const passwordRequirementsContainer = document.querySelector("[data-password-requirements]");
        const passwordMatchContainer = document.querySelector("[data-password-match]");
        const requirementItems = {
            starts_with_letter: document.getElementById("starts_with_letter"),
            length: document.getElementById("length"),
            uppercase: document.getElementById("uppercase"),
            lowercase: document.getElementById("lowercase"),
            number: document.getElementById("number"),
            special: document.getElementById("special"),
        };

        const setRequirementState = (key, met) => {
            const item = requirementItems[key];
            if (!item) {
                return;
            }
            item.classList.toggle("valid", met);
            item.classList.toggle("invalid", !met);
        };

        const validatePasswords = () => {
            if (!passwordInput) {
                return false;
            }
            const password = passwordInput.value;
            const startsWithLetterMet = /^[A-Za-z]/.test(password);
            const lengthMet = password.length >= 8;
            const uppercaseMet = /[A-Z]/.test(password);
            const lowercaseMet = /[a-z]/.test(password);
            const numberMet = /[0-9]/.test(password);
            const specialMet = /[~!@#$%^&*()_+|}{":?><,./;'[\]\\=-]/.test(password);
            const requirementsMet = startsWithLetterMet && lengthMet && uppercaseMet && lowercaseMet && numberMet && specialMet;

            setRequirementState("starts_with_letter", startsWithLetterMet);
            setRequirementState("length", lengthMet);
            setRequirementState("uppercase", uppercaseMet);
            setRequirementState("lowercase", lowercaseMet);
            setRequirementState("number", numberMet);
            setRequirementState("special", specialMet);

            if (passwordRequirementsContainer && requirementsMet) {
                passwordRequirementsContainer.classList.add("hidden");
            } else if (passwordRequirementsContainer) {
                passwordRequirementsContainer.classList.remove("hidden");
            }

            return requirementsMet;
        };

        const validatePasswordMatch = () => {
            if (!passwordInput || !confirmPasswordInput) {
                return;
            }
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;
            if (passwordMatchContainer && password === confirmPassword) {
                passwordMatchContainer.classList.add("hidden");
            } else if (passwordMatchContainer) {
                passwordMatchContainer.classList.remove("hidden");
            }
        };

        passwordInput?.addEventListener("input", validatePasswords);
        confirmPasswordInput?.addEventListener("input", validatePasswordMatch);

        const questionLabels = [1, 2, 3].map((i) => document.getElementById(`security_question_${i}`));
        const hasQuestions = questionLabels.every((label) => label && label.textContent && label.textContent.trim().length > 0);
        if (!hasQuestions) {
            const response = await fetch("/api/users/security-questions/" + encodeURIComponent(resetToken), {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            const data = await response.json();
            if (data.error) {
                await showErrorMessage(data.errorCode || data.error || "ERR_INVALID_OR_EXPIRED_RESET_TOKEN");
                return;
            }

            for (let i = 1; i <= 3; i++) {
                const questionLabel = document.getElementById(`security_question_${i}`);
                if (questionLabel) {
                    const key = `security_question_${i}`;
                    questionLabel.textContent = data.security_questions?.[key] || `Question ${i}?`;
                }
            }
        }

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const formData = new FormData(form);
            const securityAnswers = [
                formData.get("security_answer_1"),
                formData.get("security_answer_2"),
                formData.get("security_answer_3"),
            ];
            const newPassword = formData.get("password");
            const confirmPassword = formData.get("password_confirmation");

            if (!validatePasswords()) {
                await showErrorMessage("ERR_PASSWORD_COMPLEXITY");
                return;
            }
            if (newPassword !== confirmPassword) {
                await showErrorMessage("ERR_PASSWORDS_DO_NOT_MATCH");
                return;
            }

            fetch("/api/users/verify-security-answers/" + encodeURIComponent(resetToken), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ securityAnswers, newPassword }),
            })
                .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
                .then(async ({ ok, data }) => {
                    if (!ok) {
                        await showErrorMessage(data.errorCode || data.error || "ERR_FAILED_TO_RESET_PASSWORD");
                        return;
                    }
                    await showSuccessMessage("MSG_PASSWORD_RESET_SUCCESS");
                    setTimeout(async () => {
                        window.location.hash = "#/login";
                    }, 1200);
                })
                .catch(async () => {
                    await showErrorMessage("ERR_INTERNAL_SERVER");
                });
        });
    }
};
