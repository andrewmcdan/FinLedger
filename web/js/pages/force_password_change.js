function setMessage(text) {
    const messageBox = document.querySelector("[data-force-password-message]");
    if (!messageBox) {
        return;
    }
    if (text === null || text === "" || text === undefined) {
        messageBox.classList.add("hidden");
        return;
    }
    messageBox.textContent = text;
    messageBox.classList.remove("hidden");
}

export default async function initForcePasswordChange() {
    const form = document.querySelector("[data-force-password]");
    if (!form) {
        return;
    }

    setMessage();

    const selectEls = [document.getElementById("security_question_1"), document.getElementById("security_question_2"), document.getElementById("security_question_3")];
    try {
        const response = await fetch("/api/users/security-questions-list", {
            headers: {
                Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
                "X-User-Id": `${localStorage.getItem("user_id") || ""}`,
            },
        });
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

    const passwordInput = document.getElementById("new_password");
    const confirmPasswordInput = document.getElementById("confirm_password");
    const passwordRequirementsContainer = document.querySelector("[data-password-requirements]");
    const passwordMatchContainer = document.querySelector("[data-password-match]");
    const requirementItems = {
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
            return;
        }
        const password = passwordInput.value;
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

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const newPassword = formData.get("new_password");
        const confirmPassword = formData.get("confirm_password");
        const securityQuestions = [
            {
                question: formData.get("security_question_1"),
                answer: formData.get("security_answer_1"),
            },
            {
                question: formData.get("security_question_2"),
                answer: formData.get("security_answer_2"),
            },
            {
                question: formData.get("security_question_3"),
                answer: formData.get("security_answer_3"),
            },
        ];

        const missingEntry = securityQuestions.find((entry) => !entry.question || !entry.answer);
        if (missingEntry) {
            setMessage("Please choose all security questions and provide answers.");
            return;
        }

        if (newPassword !== confirmPassword) {
            setMessage("Passwords do not match.");
            return;
        }

        try {
            const response = await fetch("/api/users/change-temp-password", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
                    "X-User-Id": `${localStorage.getItem("user_id") || ""}`,
                },
                body: JSON.stringify({ newPassword, securityQuestions }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setMessage(data.error || "Unable to update password.");
                return;
            }
            localStorage.removeItem("must_change_password");
            setMessage("Password updated successfully. Redirecting...");
            window.location.hash = "#/dashboard";
        } catch (error) {
            setMessage(`An error occurred: ${error.message}`);
        }
    });
}


