const errorMessagePrettyMap = {
    "duplicate key value violates unique constraint": "An item with that value already exists.",
    "violates foreign key constraint": "The selected related item does not exist.",
    "null value in column": "A required field is missing.",
    "accounts_account_name_key": "An account with that name already exists.",
};

const errorFormatter = (error) => {
    let errors = [];
    for (const [key, prettyMessage] of Object.entries(errorMessagePrettyMap)) {
        if (error.includes(key)) {
            errors.push(prettyMessage);
        }
    }
    return errors.length > 0 ? errors[errors.length - 1] : "An unknown error occurred.";
}

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
                alert("Error creating account: " + errorFormatter(error.message));
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
    const statementTypeValueByLabel = {
        "Income Statement": "IS",
        "Balance Sheet": "BS",
        "Retained Earnings Statement": "RE",
    };
    const accountTypeOptions = [
        { value: "debit", label: "Debit" },
        { value: "credit", label: "Credit" },
    ];
    const statementTypeOptions = [
        { value: "IS", label: "Income Statement" },
        { value: "BS", label: "Balance Sheet" },
        { value: "RE", label: "Retained Earnings Statement" },
    ];

    const normalizeNormalSide = (value) => {
        if (!value) {
            return "";
        }
        return String(value).toLowerCase();
    };

    const normalizeStatementTypeValue = (value) => {
        if (!value) {
            return "";
        }
        if (statementTypeValueByLabel[value]) {
            return statementTypeValueByLabel[value];
        }
        if (statementTypeLabels[value]) {
            return value;
        }
        return value;
    };

    const formatDisplayValue = (account, column) => {
        switch (column) {
            case "account_name":
                return account.account_name ?? "";
            case "account_number":
                return account.account_number ?? "";
            case "user_id":
                return userNameById.get(String(account.user_id)) || "";
            case "normal_side":
                return account.normal_side
                    ? String(account.normal_side).charAt(0).toUpperCase() + String(account.normal_side).slice(1)
                    : "";
            case "account_description":
                return account.account_description ?? "";
            case "account_category_id":
                return categoryNameById.get(String(account.account_category_id)) || "";
            case "account_subcategory_id":
                return subcategoryNameById.get(String(account.account_subcategory_id)) || "";
            case "statement_type":
                return statementTypeLabels[account.statement_type] || account.statement_type || "";
            case "comment":
                return account.comment ?? "";
            default:
                return "";
        }
    };

    const getOwnerOptions = () => {
        if (allUsers.length) {
            return allUsers.map((user) => ({
                value: String(user.id),
                label: `${user.username}${user.last_name || user.first_name ? ` (${user.last_name || ""}${user.last_name && user.first_name ? ", " : ""}${user.first_name || ""})` : ""}`,
            }));
        }
        const ownerSelect = document.getElementById("account_owner");
        if (!ownerSelect) {
            return [];
        }
        return Array.from(ownerSelect.options)
            .filter((option) => option.value)
            .map((option) => ({ value: String(option.value), label: option.textContent || "" }));
    };

    const buildOptionsHTML = (options, selectedValue) => {
        const selected = String(selectedValue ?? "");
        return options
            .map((option) => {
                const value = String(option.value);
                const isSelected = value === selected ? "selected" : "";
                return `<option value="${value}" ${isSelected}>${option.label}</option>`;
            })
            .join("");
    };

    const formatLongTextCell = (cell) => {
        if (!cell || !cell.hasAttribute("data-long-text")) {
            return;
        }
        const text = cell.textContent || "";
        if (text.length > 20) {
            cell.title = text;
        } else {
            cell.removeAttribute("title");
        }
    };

    function setupAccountEditing(accounts) {
        if (!Array.isArray(accounts) || accounts.length === 0) {
            return;
        }
        const ownerOptions = getOwnerOptions();
        for (const account of accounts) {
            const editableColumns = [
                "account_name",
                "account_number",
                "user_id",
                "normal_side",
                "account_description",
                "account_category_id",
                "account_subcategory_id",
                "statement_type",
                "comment",
            ];
            for (const column of editableColumns) {
                const selector = `[data-${column}-${account.id}]`;
                const cell = document.querySelector(selector);
                if (!cell) {
                    continue;
                }
                const handleClick = () => {
                    cell.removeEventListener("click", handleClick);
                    const rawValue = (() => {
                        switch (column) {
                            case "account_name":
                                return account.account_name ?? "";
                            case "account_number":
                                return account.account_number ?? "";
                            case "user_id":
                                return String(account.user_id ?? "");
                            case "normal_side":
                                return normalizeNormalSide(account.normal_side);
                            case "account_description":
                                return account.account_description ?? "";
                            case "account_category_id":
                                return String(account.account_category_id ?? "");
                            case "account_subcategory_id":
                                return String(account.account_subcategory_id ?? "");
                            case "statement_type":
                                return normalizeStatementTypeValue(account.statement_type);
                            case "comment":
                                return account.comment ?? "";
                            default:
                                return "";
                        }
                    })();
                    const displayValue = formatDisplayValue(account, column);
                    if (column === "user_id") {
                        const options = ownerOptions.length
                            ? ownerOptions
                            : [{ value: rawValue, label: displayValue || "Unassigned" }];
                        cell.innerHTML = `<select data-input-${column}-${account.id}>
                            ${buildOptionsHTML(options, rawValue)}
                        </select>`;
                    } else if (column === "normal_side") {
                        cell.innerHTML = `<select data-input-${column}-${account.id}>
                            ${buildOptionsHTML(accountTypeOptions, rawValue)}
                        </select>`;
                    } else if (column === "account_category_id") {
                        const categoryOptions = categories.map((category) => ({
                            value: String(category.id),
                            label: category.name,
                        }));
                        cell.innerHTML = `<select data-input-${column}-${account.id}>
                            ${buildOptionsHTML(categoryOptions, rawValue)}
                        </select>`;
                    } else if (column === "account_subcategory_id") {
                        const categoryId = account.account_category_id ?? "";
                        const filtered = categoryId
                            ? subcategories.filter((subcategory) => String(subcategory.account_category_id) === String(categoryId))
                            : subcategories;
                        const subcategoryOptions = filtered.map((subcategory) => ({
                            value: String(subcategory.id),
                            label: subcategory.name,
                        }));
                        cell.innerHTML = `<select data-input-${column}-${account.id}>
                            ${buildOptionsHTML(subcategoryOptions, rawValue)}
                        </select>`;
                    } else if (column === "statement_type") {
                        cell.innerHTML = `<select data-input-${column}-${account.id}>
                            ${buildOptionsHTML(statementTypeOptions, rawValue)}
                        </select>`;
                    } else if (column === "account_number") {
                        cell.innerHTML = `<input type="number" step="1" value="${rawValue}" data-input-${column}-${account.id} />`;
                    } else if (column === "account_description" || column === "comment") {
                        cell.innerHTML = `<textarea rows="2" data-input-${column}-${account.id}>${rawValue}</textarea>`;
                    } else {
                        cell.innerHTML = `<input type="text" value="${rawValue}" data-input-${column}-${account.id} />`;
                    }
                    const inputEl = document.querySelector(`[data-input-${column}-${account.id}]`);
                    if (!inputEl) {
                        return;
                    }
                    inputEl.focus();
                    const commitChange = async () => {
                        const newValue = inputEl.value;
                        cell.textContent = displayValue;
                        if (String(newValue ?? "") === String(rawValue ?? "")) {
                            cell.textContent = displayValue;
                            formatLongTextCell(cell);
                            cell.addEventListener("click", handleClick);
                            return;
                        }
                        const payload = {
                            account_id: account.id,
                            field: column,
                            value: newValue,
                        };
                        try {
                            const response = await fetchWithAuth("/api/accounts/update-account-field", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify(payload),
                            });
                            const data = await response.json().catch(() => ({}));
                            if (!response.ok) {
                                throw new Error(data.error || "Failed to update account field");
                            }
                            if (column === "account_name") {
                                account.account_name = newValue;
                            } else if (column === "account_number") {
                                account.account_number = newValue;
                            } else if (column === "user_id") {
                                account.user_id = newValue;
                            } else if (column === "normal_side") {
                                account.normal_side = newValue;
                            } else if (column === "account_description") {
                                account.account_description = newValue;
                            } else if (column === "account_category_id") {
                                account.account_category_id = newValue;
                            } else if (column === "account_subcategory_id") {
                                account.account_subcategory_id = newValue;
                            } else if (column === "statement_type") {
                                account.statement_type = newValue;
                            } else if (column === "comment") {
                                account.comment = newValue;
                            }
                            cell.textContent = formatDisplayValue(account, column);
                        } catch (error) {
                            alert(error.message || "Error updating account field");
                            cell.textContent = displayValue;
                        } finally {
                            formatLongTextCell(cell);
                            cell.addEventListener("click", handleClick);
                        }
                    };
                    inputEl.addEventListener("blur", commitChange);
                    inputEl.addEventListener("keydown", (event) => {
                        if (event.key === "Enter" && inputEl.tagName !== "TEXTAREA") {
                            event.preventDefault();
                            inputEl.blur();
                        }
                    });
                    inputEl.addEventListener("click", (event) => {
                        event.stopPropagation();
                    });
                };
                cell.addEventListener("click", handleClick);
            }
        }
    }

    const pageDownBtn = document.querySelector("[data-accounts-page-down]");
    const pageUpBtn = document.querySelector("[data-accounts-page-up]");
    const currentPageEl = document.querySelector("[data-accounts-current-page]");
    const accountsPerPageSelect = document.querySelector("[data-accounts-per-page-select]");
    const totalPagesEl = document.querySelector("[data-accounts-total-pages]");
    let currentPage = 1;
    let accountCount = 0;
    let accountsPerPage = accountsPerPageSelect ? parseInt(accountsPerPageSelect.value, 10) : 10;

    try {
        const response = await fetchWithAuth("/api/accounts/account_count");
        if (response.ok) {
            const data = await response.json();
            accountCount = parseInt(data.total_accounts, 10) || 0;
        }
    } catch (error) {
        alert("Error fetching account counts: " + error.message);
    }
    
    if (totalPagesEl) {
        const totalPages = Math.ceil(accountCount / accountsPerPage);
        totalPagesEl.textContent = totalPages;
    }
    
    if (accountsPerPageSelect) {
        accountsPerPageSelect.addEventListener("change", () => {
            accountsPerPage = parseInt(accountsPerPageSelect.value, 10);
            currentPage = 1;
            loadAccountsPage(currentPage);
            if (totalPagesEl) {
                const totalPages = Math.ceil(accountCount / accountsPerPage);
                totalPagesEl.textContent = totalPages;
            }
        });
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
                    <td data-account_name-${account.id}>${account.account_name ?? ""}</td>
                    <td data-account_number-${account.id}>${account.account_number ?? ""}</td>
                    <td data-user_id-${account.id}>${accountOwner}</td>
                    <td data-normal_side-${account.id}>${normalSide}</td>
                    <td data-is-currency>${account.balance ?? ""}</td>
                    <td data-account_description-${account.id} data-long-text>${account.account_description ?? ""}</td>
                    <td data-account_category_id-${account.id}>${categoryName}</td>
                    <td data-account_subcategory_id-${account.id}>${subcategoryName}</td>
                    <td data-statement_type-${account.id}>${statementType}</td>
                    <td data-comment-${account.id} data-long-text>${account.comment ?? ""}</td>
                    <td data-is-currency>${account.initial_balance ?? ""}</td>
                    <td>${account.account_order ?? ""}</td>
                    <td data-is-currency>${account.total_debits ?? ""}</td>
                    <td data-is-currency>${account.total_credits ?? ""}</td>
                    <td>
                        <button type="button" class="button-small account-button" data-account-id="${account.id}" data-audit-account-button>Audit</button>
                    </td>
                `;
                tbody.appendChild(tr);
            }
            currentPageEl.textContent = page;
            await formatCurrencyEls();
            formatLongTextEls();
            setupAccountEditing(accounts);
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
