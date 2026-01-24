export default function initDashboard() {
    const stamp = document.querySelector("[data-last-updated]");
    if (stamp) {
        stamp.textContent = new Date().toLocaleString();
    }

    const emailForm = document.getElementById("email-user-form");
    if (emailForm) {
        emailForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const formData = new FormData(emailForm);
            const payload = {
                username: formData.get("username"),
                subject: formData.get("subject"),
                message: formData.get("message"),
            };
            const response = await fetch("/api/users/email-user", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
                    User_id: `${localStorage.getItem("user_id") || ""}`,
                },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                alert("Email sent successfully");
                emailForm.reset();
                return;
            }
            alert(data.error || "Failed to send email");
        });
    }
}
