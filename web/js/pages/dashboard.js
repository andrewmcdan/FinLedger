function fetchWithAuth(url, options = {}) {
    const authToken = localStorage.getItem("auth_token") || "";
    const userId = localStorage.getItem("user_id") || "";
    const mergedHeaders = {
        Authorization: `Bearer ${authToken}`,
        User_id: `${userId}`,
        ...(options.headers || {}),
    };

    return fetch(url, {
        ...options,
        credentials: options.credentials || "include",
        headers: mergedHeaders,
    });
}

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

    // get list of users
    const usersDataEl = document.getElementById("users-data");
    let usersData = [];
    let currentUserId = null;
    try {
        let parsed = usersDataEl ? JSON.parse(usersDataEl.textContent) : [];
        usersData = parsed.users || [];
        currentUserId = parsed.currentUserId || null;
    } catch (error) {
        usersData = [];
        console.error("Failed to parse users data", error);
    }
    const tableColumns = ["fullname", "email", "role", "status", "created_at", "last_login_at", "suspension_start_at", "suspension_end_at", "address"];
    const dateColumns = ["last_login_at", "suspension_start_at", "suspension_end_at", "created_at"];
    const modifyTableCell = (user, column, value, isDate = false) => {
        const selector = `[data-${column}-${user.id}]`;
        const cell = document.querySelector(selector);
        if (cell) {
            let value = column === "fullname" ? `${user.first_name} ${user.last_name}` : user[column];
            const handleClick = () => {
                cell.removeEventListener("click", handleClick);
                if (isDate) {
                    cell.innerHTML = `<input type="datetime-local" value="${value ? new Date(value).toISOString().slice(0, 16) : ""}" data-input-${column}-${user.id} />`;
                } else if (column === "role") {
                    cell.innerHTML = `<select data-input-${column}-${user.id}>
                                <option value="administrator" ${value === "administrator" ? "selected" : ""}>Administrator</option>
                                <option value="manager" ${value === "manager" ? "selected" : ""}>Manager</option>
                                <option value="accountant" ${value === "accountant" ? "selected" : ""}>Accountant</option>
                            </select>`;
                } else if (column === "status") {
                    cell.innerHTML = `<select data-input-${column}-${user.id}>
                                <option value="active" ${value === "active" ? "selected" : ""}>Active</option>
                                <option value="pending" ${value === "pending" ? "selected" : ""}>Pending</option>
                                <option value="suspended" ${value === "suspended" ? "selected" : ""}>Suspended</option>
                                <option value="deactivated" ${value === "deactivated" ? "selected" : ""}>Deactivated</option>
                                <option value="rejected" ${value === "rejected" ? "selected" : ""}>Rejected</option>
                            </select>`;
                } else {
                    cell.innerHTML = `<input type="text" value="${value || ""}" data-input-${column}-${user.id} />`;
                }
                const inputEl = document.querySelector(`[data-input-${column}-${user.id}]`);
                inputEl.focus();
                inputEl.addEventListener("blur", async () => {
                    const newValue = inputEl.value;
                    cell.textContent = newValue;
                    if (newValue !== value) {
                        const payload = {
                            user_id: user.id,
                            field: column,
                            value: newValue,
                        };
                        try {
                            const response = await fetchWithAuth("/api/users/update-user-field", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify(payload),
                            });
                            const data = await response.json().catch(() => ({}));
                            if (!response.ok) {
                                alert(data.error || "Failed to update user field");
                                cell.textContent = value;
                            }
                        } catch (error) {
                            alert("Error updating user field");
                            cell.textContent = value;
                        }
                    }
                });
                inputEl.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") {
                        inputEl.blur();
                    }
                });
                inputEl.addEventListener("click", (event) => {
                    event.stopPropagation();
                });
            };
            cell.addEventListener("click", handleClick);
        }
    };
    if (usersData.length) {
        for (const user of usersData) {
            for (const column of tableColumns) {
                modifyTableCell(user, column, user[column], dateColumns.includes(column));
            }
        }
    }

    const refreshButton = document.querySelector("[data-refresh]");
    if (refreshButton) {
        refreshButton.addEventListener("click", () => {
            location.reload();
        });
    }

    const deleteUserForm = document.getElementById("delete-user-form");
    if (deleteUserForm) {
        deleteUserForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const formData = new FormData(deleteUserForm);
            const usernameToDelete = formData.get("username");
            if (!usernameToDelete) {
                alert("Please enter a username to delete");
                return;
            }
            const userToDelete = usersData.find((user) => user.username === usernameToDelete);
            if (!userToDelete) {
                alert("User not found");
                return;
            }
            if (userToDelete.id === currentUserId) {
                alert("You cannot delete your own account");
                return;
            }
            const confirmDelete = confirm(`Are you sure you want to delete user "${usernameToDelete}"? This action cannot be undone.`);
            if (!confirmDelete) {
                return;
            }
            try {
                const response = await fetchWithAuth("/api/users/delete-user", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ userIdToDelete: userToDelete.id }),
                });
                const data = await response.json().catch(() => ({}));
                if (response.ok) {
                    alert("User deleted successfully");
                    deleteUserForm.reset();
                    location.reload();
                    return;
                }
                alert(data.error || "Failed to delete user");
            } catch (error) {
                alert("Error deleting user");
            }
        });
    }
}
