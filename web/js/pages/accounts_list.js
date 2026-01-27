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
            const initialBalance = parseFloat(document.getElementById("initial_balance")?.value?.replace(/[^0-9.-]+/g, "")) || 0;
            const balance = initialBalance;
            const accountOrder = parseInt(document.getElementById("account_order")?.value, 10) || 0;
            const statementType = document.getElementById("account_statement_type")?.value;
            const comments = document.getElementById("account_comments")?.value;
            const total_debits = 0;
            const total_credits = 0;
            const accountOwner = document.getElementById("account_owner")?.value;

            // TODO: Add validation for required fields

            try {
                const response = await fetchWithAuth("/api/accounts/create", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
                        "X-User-Id": `${localStorage.getItem("user_id") || ""}`,
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

    const formatCurrencyEls = async () => {
        const currencyEls = document.querySelectorAll("[data-is-currency]");
        const numericHelpers = await loadNumericHelpers();
        currencyEls.forEach((el) => {
            el.textContent = numericHelpers.formatNumberAsCurrency(el.textContent);
            if (el.type === "number") {
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
    };

    const formatLongTextEls = () => {
        const longTextEls = document.querySelectorAll("[data-long-text]");
        longTextEls.forEach((el) => {
            if (el.textContent.length > 20) {
                el.title = el.textContent;
            }
        });
    };

    const accountsDataEl = document.getElementById("accounts-data");
    const accountsData = accountsDataEl ? JSON.parse(accountsDataEl.textContent || "{}") : {};
    const categories = accountsData?.allCategories?.categories || [];
    const subcategories = accountsData?.allCategories?.subcategories || [];
    const allUsers = accountsData?.allUsers || [];
    const categoryNameById = new Map(categories.map((category) => [String(category.id), category.name]));
    const subcategoryNameById = new Map(subcategories.map((subcategory) => [String(subcategory.id), subcategory.name]));
    const userNameById = new Map(allUsers.map((user) => [String(user.id), user.username]));
    if (userNameById.size === 0) {
        const accountOwnerSelect = document.getElementById("account_owner");
        if (accountOwnerSelect) {
            for (const option of accountOwnerSelect.options) {
                if (!option.value) {
                    continue;
                }
                const label = option.textContent || "";
                const username = label.split(" (")[0] || label;
                userNameById.set(String(option.value), username);
            }
        }
    }
    const statementTypeLabels = {
        IS: "Income Statement",
        BS: "Balance Sheet",
        RE: "Retained Earnings Statement",
    };

    const pageDownBtn = document.querySelector("[data-accounts-page-down]");
    const pageUpBtn = document.querySelector("[data-accounts-page-up]");
    const currentPageEl = document.querySelector("[data-accounts-current-page]");
    let currentPage = 1;
    let accountCount = 0;
    const accountsPerPage = 25;
    try {
        const response = await fetchWithAuth("/api/accounts/account_count");
        if (response.ok) {
            const data = await response.json();
            accountCount = parseInt(data.total_accounts, 10) || 0;
        }
    } catch (error) {
        alert("Error fetching account counts: " + error.message);
    }

    const totalPagesEl = document.querySelector("[data-accounts-total-pages]");
    if (totalPagesEl) {
        const totalPages = Math.ceil(accountCount / accountsPerPage);
        totalPagesEl.textContent = totalPages;
    }

    const loadAccountsPage = async (page) => {
        showLoadingOverlay();
        try {
            const offset = (page - 1) * accountsPerPage;
            const response = await fetchWithAuth(`/api/accounts/list/${offset}/${accountsPerPage}`);
            if (!response.ok) {
                throw new Error("Failed to fetch accounts");
            }
            const accounts = await response.json();
            const tbody = document.querySelector("#accounts_table tbody");
            tbody.innerHTML = "";
            for (const account of accounts) {
                const accountOwner = userNameById.get(String(account.user_id)) || "";
                const normalSide = account.normal_side
                    ? String(account.normal_side).charAt(0).toUpperCase() + String(account.normal_side).slice(1)
                    : "";
                const categoryName = categoryNameById.get(String(account.account_category_id)) || "";
                const subcategoryName = subcategoryNameById.get(String(account.account_subcategory_id)) || "";
                const statementType = statementTypeLabels[account.statement_type] || account.statement_type || "";
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${account.account_name ?? ""}</td>
                    <td>${account.account_number ?? ""}</td>
                    <td>${accountOwner}</td>
                    <td>${normalSide}</td>
                    <td data-is-currency>${account.balance ?? ""}</td>
                    <td data-long-text>${account.account_description ?? ""}</td>
                    <td>${categoryName}</td>
                    <td>${subcategoryName}</td>
                    <td>${statementType}</td>
                    <td data-long-text>${account.comment ?? ""}</td>
                    <td data-is-currency>${account.initial_balance ?? ""}</td>
                    <td>${account.account_order ?? ""}</td>
                    <td data-is-currency>${account.total_debits ?? ""}</td>
                    <td data-is-currency>${account.total_credits ?? ""}</td>
                    <td>
                        <button type="button" class="button-small account-button" data-account-id="${account.id}" data-edit-account-button>Edit</button>
                        <button type="button" class="button-small account-button" data-account-id="${account.id}" data-audit-account-button>Audit</button>
                    </td>
                `;
                tbody.appendChild(tr);
            }
            currentPageEl.textContent = page;
            await formatCurrencyEls();
            formatLongTextEls();
        } catch (error) {
            alert("Error loading accounts: " + error.message);
        } finally {
            hideLoadingOverlay();
        }
    };

    if (pageDownBtn) {
        pageDownBtn.addEventListener("click", () => {
            if (currentPage > 1) {
                currentPage -= 1;
                loadAccountsPage(currentPage);
            }
        });
    }

    if (pageUpBtn) {
        pageUpBtn.addEventListener("click", () => {
            if (currentPage * accountsPerPage < accountCount) {
                currentPage += 1;
                loadAccountsPage(currentPage);
            }
        });
    }

    // Initial load
    loadAccountsPage(currentPage);

    const accountCategorySelect = document.getElementById("account_category");
    const accountSubcategorySelect = document.getElementById("account_subcategory");

    const renderSubcategories = (categoryId) => {
        if (!accountSubcategorySelect) {
            return;
        }
        accountSubcategorySelect.innerHTML = "";
        if (!categoryId) {
            return;
        }
        const filtered = subcategories.filter((subcategory) => String(subcategory.account_category_id) === String(categoryId));
        for (const subcategory of filtered) {
            const option = document.createElement("option");
            option.value = subcategory.id;
            option.textContent = subcategory.name;
            accountSubcategorySelect.appendChild(option);
        }
    };

    if (accountCategorySelect) {
        accountCategorySelect.addEventListener("change", () => {
            renderSubcategories(accountCategorySelect.value);
        });
        renderSubcategories(accountCategorySelect.value);
    }
}

async function loadNumericHelpers() {
    const moduleUrl = new URL("/js/utils/numeric_display.js", window.location.origin).href;
    const module = await import(moduleUrl);
    const formatNumberAsCurrency = module.formatNumberAsCurrency;
    const formatNumberWithCommas = module.formatNumberWithCommas;
    return { formatNumberAsCurrency, formatNumberWithCommas };
}
