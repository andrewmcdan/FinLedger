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

export default function initAccountsList({ showLoadingOverlay, hideLoadingOverlay }) {
    const add_account_button = document.getElementById("add_account_button");
    const account_modal = document.getElementById("account_modal");
    const close_account_modal_button = document.getElementById("close_account_modal");
    const save_account_button = document.getElementById("save_account_button");

    if (add_account_button && account_modal) {
        add_account_button.addEventListener("click", () => {
            account_modal.classList.add("is-visible");
            account_modal.setAttribute("aria-hidden", "false");
        });
    }
    if (close_account_modal_button && account_modal) {
        close_account_modal_button.addEventListener("click", () => {
            account_modal.classList.remove("is-visible");
            account_modal.setAttribute("aria-hidden", "true");
        });
    }
    close_account_modal_button.style.cursor = "pointer";

    if (save_account_button) {
        save_account_button.addEventListener("click", async (event) => {
            event.preventDefault();
            showLoadingOverlay();
            const accountName = document.getElementById("account_name")?.value;
            const accountDescription = document.getElementById("account_description")?.value;
            const normalSide = document.getElementById("account_type")?.value;
            const accountCategory = document.getElementById("account_category")?.value;
            const accountSubcategory = document.getElementById("account_subcategory")?.value;
            const openingBalance = parseFloat(document.getElementById("account_balance")?.value) || 0;
            const accountOrder = parseInt(document.getElementById("account_order")?.value, 10) || 0;
            const statementType = document.getElementById("account_statement_type")?.value;
            const comments = document.getElementById("account_comments")?.value;
            const debit = document.getElementById("account_debit")?.value;
            const credit = document.getElementById("account_credit")?.value;
            const accountOwner = document.getElementById("account_owner")?.value;

            try {
                const response = await fetchWithAuth("/api/accounts/create", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
                        User_id: `${localStorage.getItem("user_id") || ""}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        accountName,
                        accountDescription,
                        normalSide,
                        accountCategory,
                        accountSubcategory,
                        openingBalance,
                        debit,
                        credit,
                        accountOrder,
                        statementType,
                        comments,
                        accountOwner,
                    }),
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "Failed to create account");
                }
                const newAccount = await response.json();
                window.location.reload();
            } catch (error) {
                alert("Error creating account: " + error.message);
            } finally {
                hideLoadingOverlay();
            }
        });
    }
}
