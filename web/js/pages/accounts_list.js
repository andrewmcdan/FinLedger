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

export default async function initAccountsList({ showLoadingOverlay, hideLoadingOverlay }) {
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
            const balance = parseFloat(document.getElementById("account_balance")?.value?.replace(/[^0-9.-]+/g, "")) || 0;
            const initialBalance = parseFloat(document.getElementById("initial_balance")?.value?.replace(/[^0-9.-]+/g, "")) || 0;
            const accountOrder = parseInt(document.getElementById("account_order")?.value, 10) || 0;
            const statementType = document.getElementById("account_statement_type")?.value;
            const comments = document.getElementById("account_comments")?.value;
            const total_debits = parseFloat(document.getElementById("account_debit")?.value?.replace(/[^0-9.-]+/g, "")) || 0;
            const total_credits = parseFloat(document.getElementById("account_credit")?.value?.replace(/[^0-9.-]+/g, "")) || 0;
            const accountOwner = document.getElementById("account_owner")?.value;

            // TODO: Add validation for required fields

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
                        balance,
                        initialBalance,
                        total_debits,
                        total_credits,
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

    const currencyEls = document.querySelectorAll("[data-is-currency]");
    const numericHelpers = await loadNumericHelpers();
    currencyEls.forEach(el => {
        el.textContent = numericHelpers.formatNumberAsCurrency(el.textContent);
        if(el.type === "number"){
            el.addEventListener("blur", () => {
                // replace the number input with text input to allow formatting
                const newEl = document.createElement("input");
                newEl.type = "text";
                newEl.id = el.id;
                newEl.name = el.name;
                newEl.className = el.className;
                newEl.setAttribute("data-is-currency", "true");
                newEl.value = el.value;
                el.replaceWith(newEl);
                newEl.value = numericHelpers.formatNumberAsCurrency(newEl.value);
            });
        }
    });

    const longTextEls = document.querySelectorAll("[data-long-text]");
    longTextEls.forEach(el => {
        if (el.textContent.length > 20) {
            el.title = el.textContent;
        }
    });
}

async function loadNumericHelpers() {
    const moduleUrl = new URL("/js/utils/numeric_display.js", window.location.origin).href;
    const module = await import(moduleUrl);
    const formatNumberAsCurrency = module.formatNumberAsCurrency;
    const formatNumberWithCommas = module.formatNumberWithCommas;
    return { formatNumberAsCurrency, formatNumberWithCommas };
}