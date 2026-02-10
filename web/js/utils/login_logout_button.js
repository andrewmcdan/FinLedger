async function isLoggedIn() {
    try {
        const response = await fetch("/api/auth/status", {
            method: "GET",
            credentials: "include",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("auth_token") || ""}`,
                "X-User-Id": `${localStorage.getItem("user_id") || ""}`
            }
        });
        if (!response.ok) {
            return false;
        }
        const data = await response.json();
        return data.loggedIn;
    } catch (error) {
        console.error("Error checking login status:", error);
        return false;
    }
}

export async function updateLoginLogoutButton() {
    const login_button = document.querySelector("[data-login-button]");
    if (!login_button) {
        return;
    }
    if (await isLoggedIn()) {
        login_button.textContent = `Logout`;
        login_button.href = "#/logout";
    } else {
        login_button.textContent = "Login";
        login_button.href = "#/login";
    }
}