function fetchWithAuth(url, options = {}) {
    const authToken = localStorage.getItem("auth_token") || "";
    const userId = localStorage.getItem("user_id") || "";
    const mergedHeaders = {
        Authorization: `Bearer ${authToken}`,
        "X-User-Id": `${userId}`,
        ...(options.headers || {}),
    };

    return fetch(url, {
        ...options,
        credentials: options.credentials || "include",
        headers: mergedHeaders,
    });
}

export default function initDashboard({showLoadingOverlay, hideLoadingOverlay}) {
    const stamp = document.querySelector("[data-last-updated]");
    if (stamp) {
        stamp.textContent = new Date().toLocaleString();
    }

    const emailForm = document.getElementById("email-user-form");
    if (emailForm) {
        emailForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            showLoadingOverlay();
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
                    "X-User-Id": `${localStorage.getItem("user_id") || ""}`,
                },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                alert("Email sent successfully");
                emailForm.reset();
                hideLoadingOverlay();
                return;
            }
            alert(data.error || "Failed to send email");
            hideLoadingOverlay();
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
    const actionButtons = document.querySelectorAll("[data-user-action]");
    if (actionButtons.length) {
        const actionConfig = {
            approve: {
                url: (id) => `/api/users/approve-user/${id}`,
                success: "User approved successfully",
                error: "Error approving user",
                rowSelector: (id) => `[data-user_id-${id}]`,
            },
            reject: {
                url: (id) => `/api/users/reject-user/${id}`,
                success: "User rejected successfully",
                error: "Error rejecting user",
                rowSelector: (id) => `[data-user_id-${id}]`,
            },
            reinstate: {
                url: (id) => `/api/users/reinstate-user/${id}`,
                success: "User reinstated successfully",
                error: "Error reinstating user",
                rowSelector: (id) => `[data-suspended_user_id-${id}]`,
            },
        };
        actionButtons.forEach((button) => {
            button.addEventListener("click", async () => {
                showLoadingOverlay();
                const action = button.dataset.userAction;
                const userId = button.dataset.userId;
                const config = actionConfig[action];
                if (!config || !userId) {
                    return;
                }
                const response = await fetchWithAuth(config.url(userId), {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                    },
                });
                if (response.ok) {
                    alert(config.success);
                    const row = document.querySelector(config.rowSelector(userId));
                    if (row) {
                        row.remove();
                    }
                } else {
                    alert(config.error);
                }
                hideLoadingOverlay();
            });
        });
    }
    const tableColumns = ["fullname", "email", "role", "status", "created_at", "last_login_at", "suspension_start_at", "suspension_end_at", "address", "password_expires_at"];
    const dateColumns = ["last_login_at", "suspension_start_at", "suspension_end_at", "created_at", "password_expires_at"];
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

    const createUserForm = document.getElementById("create-user-form");
    if (createUserForm) {
        createUserForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            showLoadingOverlay();
            const formData = new FormData(createUserForm);
            const response = await fetchWithAuth("/api/users/create-user", {
                method: "POST",
                body: formData,
            });
            if (response.ok) {
                alert("User created successfully");
                createUserForm.reset();
            } else {
                const errorData = await response.json();
                alert(`Error creating user: ${errorData.message}`);
            }
            hideLoadingOverlay();
        });
    }

    const suspendUserForm = document.getElementById("suspend-user-form");
    if (suspendUserForm) {
        suspendUserForm.addEventListener("submit", (event) => {
            event.preventDefault();
            showLoadingOverlay();
            const formData = new FormData(suspendUserForm);
            const usernameToSuspend = formData.get("suspend_username");
            let userIdToSuspend = null;
            const matchedUser = usersData.find((user) => user.username === usernameToSuspend && user.status === "active" && user.id !== currentUserId);
            if (matchedUser) {
                userIdToSuspend = matchedUser.id;
            }
            if (userIdToSuspend === null) {
                alert("Invalid username selected");
                hideLoadingOverlay();
                return;
            }
            const suspensionStartRaw = formData.get("suspension_start_date");
            const suspensionEndRaw = formData.get("suspension_end_date");
            if (!userIdToSuspend || !suspensionStartRaw || !suspensionEndRaw) {
                alert("Please fill in all fields");
                hideLoadingOverlay();
                return;
            }
            const suspensionStartDate = new Date(suspensionStartRaw);
            const suspensionEndDate = new Date(suspensionEndRaw);
            if (Number.isNaN(suspensionStartDate.getTime()) || Number.isNaN(suspensionEndDate.getTime())) {
                alert("Please provide valid suspension dates");
                hideLoadingOverlay();
                return;
            }
            if (suspensionEndDate <= suspensionStartDate) {
                alert("Suspension end date must be after start date");
                hideLoadingOverlay();
                return;
            }
            const suspensionData = {
                userIdToSuspend: userIdToSuspend,
                suspensionStart: suspensionStartDate.toISOString(),
                suspensionEnd: suspensionEndDate.toISOString(),
            };
            fetchWithAuth("/api/users/suspend-user", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(suspensionData),
            })
                .then((response) => {
                    if (response.ok) {
                        alert("User suspended successfully");
                        suspendUserForm.reset();
                    } else {
                        response.json().then((errorData) => {
                            alert(`Error suspending user: ${errorData.message}`);
                            hideLoadingOverlay();
                        });
                    }
                    hideLoadingOverlay();
                })
                .finally(() => {
                    suspendUserForm.reset();
                    hideLoadingOverlay();
                })
                .catch((error) => {
                    alert(`Error suspending user: ${error.message}`);
                    hideLoadingOverlay();
                });
        });
    }

    const deleteUserForm = document.getElementById("delete-user-form");
    if (deleteUserForm) {
        deleteUserForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            showLoadingOverlay();
            const formData = new FormData(deleteUserForm);
            const usernameToDelete = formData.get("username");
            if (!usernameToDelete) {
                alert("Please enter a username to delete");
                hideLoadingOverlay();
                return;
            }
            const userToDelete = usersData.find((user) => user.username === usernameToDelete);
            if (!userToDelete) {
                alert("User not found");
                hideLoadingOverlay();
                return;
            }
            if (userToDelete.id === currentUserId) {
                alert("You cannot delete your own account");
                hideLoadingOverlay();
                return;
            }
            const confirmDelete = confirm(`Are you sure you want to delete user "${usernameToDelete}"? This action cannot be undone.`);
            if (!confirmDelete) {
                hideLoadingOverlay();
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
                    hideLoadingOverlay();
                    location.reload();
                    return;
                }
                alert(data.error || "Failed to delete user");
                hideLoadingOverlay();
            } catch (error) {
                alert("Error deleting user");
                hideLoadingOverlay();
            }
        });
    }

    const resetPasswordForm = document.getElementById("reset-password-form");
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            showLoadingOverlay();
            const formData = new FormData(resetPasswordForm);
            const username = formData.get("username");
            if (!username) {
                alert("Please enter a username to reset password");
                hideLoadingOverlay();
                return;
            }
            // Find user by username
            const user = usersData.find((u) => u.username === username);
            if (!user) {
                alert("User not found");
                hideLoadingOverlay();
                return;
            }
            const userId = user.id;
            try {
                const response = await fetchWithAuth(`/api/users/reset-user-password/${userId}`, {
                    method: "GET",
                });
                const data = await response.json().catch(() => ({}));
                if (response.ok) {
                    alert("Password reset successfully. An email has been sent to the user with the new password.");
                    resetPasswordForm.reset();
                    hideLoadingOverlay();
                    return;
                }
                alert(data.error || "Failed to reset password");
                hideLoadingOverlay();
            } catch (error) {
                alert("Error resetting password");
                hideLoadingOverlay();
            }
        });
    }
}


