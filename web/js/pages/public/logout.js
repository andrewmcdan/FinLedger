export default function initLogout() {
    const form = document.querySelector("[data-logout]");
    // when the user submits the logout form
    if (!form) {
        return;
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        // Perform get on /api/auth/logout to invalidate the session on the server
        fetch("/api/auth/logout", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
                User_id: `${localStorage.getItem("user_id") || ""}`,
            },
        })
            .then((response) => {
                if (!response.ok) {
                    console.error("Logout request failed:", response.statusText);
                } else {
                    console.log("Logout successful");
                    localStorage.removeItem("user_id");
                    localStorage.removeItem("auth_token");
                    localStorage.removeItem("username");
                    // Redirect to the login page
                    window.location.href = "/#/login";
                }
            })
            .catch((error) => {
                console.error("An error occurred during logout:", error);
            });
    });
}
