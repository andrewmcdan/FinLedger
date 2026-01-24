export default function initProfile() {
    const selectEls = [document.getElementById("security_question_1"), document.getElementById("security_question_2"), document.getElementById("security_question_3")];

    const authHeaders = () => ({
        Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
        User_id: `${localStorage.getItem("user_id") || ""}`,
    });

    if (selectEls.some(Boolean)) {
        fetch("/api/users/security-questions-list", { headers: authHeaders() })
            .then((response) => response.json())
            .then((data) => {
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
            })
            .catch((error) => {
                console.error("Failed to load security question list:", error);
            });
    }

    const changePasswordForm = document.getElementById("change-password-form");
    if (changePasswordForm) {
        changePasswordForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const formData = new FormData(changePasswordForm);
            const response = await fetch("/api/users/change-password", {
                method: "POST",
                headers: authHeaders(),
                body: formData,
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                changePasswordForm.reset();
                alert("Password changed successfully");
                return;
            }
            alert(data.error || "Error changing password");
        });
    }

    const securityQuestionsForm = document.getElementById("security-questions-form");
    if (securityQuestionsForm) {
        securityQuestionsForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = {
                security_question_1: securityQuestionsForm.querySelector("[name='security_question_1']")?.value || "",
                security_answer_1: securityQuestionsForm.querySelector("[name='security_answer_1']")?.value || "",
                security_question_2: securityQuestionsForm.querySelector("[name='security_question_2']")?.value || "",
                security_answer_2: securityQuestionsForm.querySelector("[name='security_answer_2']")?.value || "",
                security_question_3: securityQuestionsForm.querySelector("[name='security_question_3']")?.value || "",
                security_answer_3: securityQuestionsForm.querySelector("[name='security_answer_3']")?.value || "",
                current_password: securityQuestionsForm.querySelector("[name='current_password']")?.value || "",
            };
            const response = await fetch("/api/users/update-security-questions", {
                method: "POST",
                headers: {
                    ...authHeaders(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                securityQuestionsForm.reset();
                alert("Security questions updated successfully");
                return;
            }
            alert(data.error || "Error updating security questions");
        });
    }

    const profileForm = document.getElementById("profile-form");
    if (profileForm) {
        profileForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const formData = new FormData(profileForm);
            const response = await fetch("/api/users/update-profile", {
                method: "POST",
                headers: authHeaders(),
                body: formData,
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                alert("Profile updated successfully");
                return;
            }
            alert(data.error || "Error updating profile");
        });
    }
}
