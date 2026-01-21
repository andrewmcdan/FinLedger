async function isLoggedIn() {
    try {
        const response = await fetch("/api/auth/status", {
            method: "GET",
            credentials: "include",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("auth_token") || ""}`,
                'User_id': `${localStorage.getItem("user_id") || ""}`
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
        const username = localStorage.getItem("username") || "User";
        login_button.textContent = `Logout: (${username})`;
        login_button.href = "#/logout"; // TODO: Implement logout route
    } else {
        login_button.textContent = "Login";
        login_button.href = "#/login";
    }
}