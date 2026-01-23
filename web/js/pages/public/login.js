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

let getUrlParamFn = null;

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

export default function initLogin() {
    const form = document.querySelector("[data-login]");
    const container = document.querySelector("[data-login-container]");
    if (!form || !container) {
        return;
    }

    setMessage(); // Clear any existing messages

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
            .then((data) => {
                if (data.token) {
                    setMessage("Login successful!");
                    // You might want to store the token and user info here
                    localStorage.setItem("user_id", data.user_id);
                    localStorage.setItem("auth_token", data.token);
                    localStorage.setItem("username", data.username);
                    // Redirect to the main app page or refresh
                    window.location.href = "/#/dashboard";
                } else {
                    setMessage("Login failed: " + (data.error || "Unknown error"));
                }
            })
            .catch((error) => {
                setMessage("An error occurred: " + error.message);
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
                replacePageContent("public/forgot-password_submit").then(async () => {
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
    setMessage();
    history.pushState({ page: "register" }, "");
    window.onpopstate = async () => {
        await replacePageContent("public/login");
        window.onpopstate = null;
        // Go back to login page, re-initialize login logic
        initLogin();
    };

    const SECURITY_QUESTION_GROUPS = {
        1: [
            { value: "sq_mother_maiden_name", label: "What is your mother's maiden name?" },
            { value: "sq_first_pet", label: "What was the name of your first pet?" },
            { value: "sq_first_car", label: "What was the make and model of your first car?" },
            { value: "sq_birth_city", label: "In which city were you born?" },
            { value: "sq_elementary_school", label: "What was the name of your elementary school?" },
            { value: "sq_favorite_teacher", label: "Who was your favorite teacher?" },
            { value: "sq_childhood_nickname", label: "What was your childhood nickname?" },
            { value: "sq_first_job", label: "What was your first job?" },
            { value: "sq_street_grew_up_on", label: "What street did you grow up on?" },
            { value: "sq_favorite_food", label: "What is your favorite food?" },
        ],
        2: [
            { value: "sq_best_childhood_friend", label: "What is the name of your best childhood friend?" },
            { value: "sq_childhood_dream_job", label: "What was your childhood dream job?" },
            { value: "sq_favorite_vacation_spot", label: "Where was your favorite vacation destination?" },
            { value: "sq_first_concert", label: "What was the first concert you attended?" },
            { value: "sq_first_sports_team", label: "What was the first sports team you played on?" },
            { value: "sq_favorite_book", label: "What is the title of your favorite book?" },
            { value: "sq_favorite_movie", label: "What is your favorite movie?" },
            { value: "sq_favorite_character", label: "Who was your favorite fictional character as a kid?" },
            { value: "sq_first_phone_model", label: "What was the model of your first phone?" },
            { value: "sq_first_video_game", label: "What was the first video game you owned?" },
        ],
        3: [
            { value: "sq_high_school_mascot", label: "What was your high school mascot?" },
            { value: "sq_high_school_name", label: "What was the name of your high school?" },
            { value: "sq_first_album", label: "What was the first album you owned?" },
            { value: "sq_first_instrument", label: "What was the first musical instrument you learned?" },
            { value: "sq_first_plane_trip", label: "Where did you travel on your first airplane trip?" },
            { value: "sq_favorite_hobby", label: "What is your favorite hobby?" },
            { value: "sq_favorite_restaurant", label: "What is the name of your favorite restaurant?" },
            { value: "sq_favorite_holiday", label: "What is your favorite holiday?" },
            { value: "sq_first_best_gift", label: "What was the best gift you received as a child?" },
            { value: "sq_childhood_hero", label: "Who was your childhood hero?" },
        ],
    };
    const selectEls = [document.getElementById("security_question_1"), document.getElementById("security_question_2"), document.getElementById("security_question_3")];
    selectEls.forEach((selectEl, index) => {
        if (selectEl) {
            const group = SECURITY_QUESTION_GROUPS[index + 1];
            group.forEach((question) => {
                const option = document.createElement("option");
                option.value = question.value;
                option.textContent = question.label;
                selectEl.appendChild(option);
            });
        }
    });

    const form = document.querySelector("[data-register]");
    if (form) {
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
                .then((data) => {
                    // clear the form
                    form.reset();
                    if (data.user) {
                        alert("Registration successful! Check your email for further instructions. Redirecting to login page...");
                        setTimeout(async () => {
                            // After a short delay, go back to login page
                            await replacePageContent("public/login");
                            initLogin();
                            history.pushState({ page: "login" }, "");
                        }, 3000);
                    } else {
                        setMessage("Registration failed: " + (data.error || "Unknown error"));
                    }
                })
                .catch((error) => {
                    form.reset();
                    setMessage("An error occurred: " + error.message);
                });
        });
    }

    const passwordInput = document.getElementById("password");
    const confirmPasswordInput = document.getElementById("password_confirmation");
    const passwordRequirementsContainer = document.querySelector("[data-password-requirements]");
    const passwordMatchContainer = document.querySelector("[data-password-match]");
    const requirementItems = {
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
            const lengthMet = password.length >= 8;
            const uppercaseMet = /[A-Z]/.test(password);
            const lowercaseMet = /[a-z]/.test(password);
            const numberMet = /[0-9]/.test(password);
            const specialMet = /[~!@#$%^&*()_+|}{":?><,./;'[\]\\=-]/.test(password);
            const requirementsMet = lengthMet && uppercaseMet && lowercaseMet && numberMet && specialMet;

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
    setMessage();
    history.pushState({ page: "forgot-password" }, "");
    window.onpopstate = async () => {
        await replacePageContent("public/login");
        window.onpopstate = null;
        // Go back to login page, re-initialize login logic
        initLogin();
    };

    const form = document.querySelector("[data-forgot-password]");
    if (form) {
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const formData = new FormData(form);
            const email_or_user_id = formData.get("email_or_user_id");
            fetch("/api/users/reset-password/" + encodeURIComponent(email_or_user_id), {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            })
                .then((response) => response.json())
                .then((data) => {
                    if (data.message) {
                        setMessage(data.message);
                    } else {
                        setMessage("Password reset request failed: " + (data.error || "Unknown error"));
                    }
                })
                .catch((error) => {
                    setMessage("An error occurred: " + error.message);
                });
        });
    }
};

let newPasswordLogic = async function (resetToken) {
    setMessage();
    console.log(resetToken);
    const form = document.querySelector("[data-forgot-password]");
    if (form) {
        // load security question via /api/users/security-questions/:resetToken API
        const response = await fetch("/api/users/security-questions/" + encodeURIComponent(resetToken), {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });
        const data = await response.json();
        if (data.error) {
            setMessage("Failed to load security questions: " + data.error);
            return;
        }

        console.log(data);

        for (var i = 1; i <= 3; i++) {
            const questionLabel = document.getElementById(`security_question_${i}`);
            if (questionLabel) {
                questionLabel.textContent = data.questions[i - 1] || `Question ${i}?`; // Use fetched question or placeholder
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
