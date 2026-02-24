const authHelpers = await loadFetchWithAuth();
const { fetchWithAuth } = authHelpers;
const domHelpers = await loadDomHelpers();
const { createCell, createInput, createSelect, createTextarea } = domHelpers;

const getIsAdmin = async () => {
    const res = await fetchWithAuth("/api/auth/status");
    if (!res.ok) {
        return false;
    }
    const data = await res.json();
    return data.is_admin === true || data.isAdmin === true;
};

export default async function initAccountsList({ showLoadingOverlay, hideLoadingOverlay, showErrorModal }) {
    const isAdmin = await getIsAdmin();
    const editHoverText = "Double click to edit.";
    const navAndEditHoverText = "Single click opens Transactions page. Double click to edit.";
    const navOnlyHoverText = "Single click opens Transactions page.";

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
        close_account_modal_button.style.cursor = "pointer";
    }

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
                    throw new Error(errorData.error || "ERR_ACCOUNT_CREATION_FAILED");
                }
                const newAccount = await response.json();
                window.location.reload();
            } catch (error) {
                showErrorModal(error.message || "ERR_ACCOUNT_CREATION_FAILED");
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
            const editHint = el.getAttribute("data-edit-hint");
            if (editHint) {
                el.title = editHint;
                return;
            }
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
    const categoryById = new Map(categories.map((category) => [String(category.id), category]));
    const subcategoryById = new Map(subcategories.map((subcategory) => [String(subcategory.id), subcategory]));
    const subcategoriesByCategoryId = new Map();
    subcategories.forEach((subcategory) => {
        const key = String(subcategory.account_category_id);
        if (!subcategoriesByCategoryId.has(key)) {
            subcategoriesByCategoryId.set(key, []);
        }
        subcategoriesByCategoryId.get(key).push(subcategory);
    });
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
                return account.normal_side ? String(account.normal_side).charAt(0).toUpperCase() + String(account.normal_side).slice(1) : "";
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

    const formatLongTextCell = (cell) => {
        if (!cell || !cell.hasAttribute("data-long-text")) {
            return;
        }
        const editHint = cell.getAttribute("data-edit-hint");
        if (editHint) {
            cell.title = editHint;
            return;
        }
        const text = cell.textContent || "";
        if (text.length > 20) {
            cell.title = text;
        } else {
            cell.removeAttribute("title");
        }
    };

    const getDefaultSubcategoryForCategory = (categoryId) => {
        if (!categoryId) {
            return null;
        }
        return subcategories.find((subcategory) => String(subcategory.account_category_id) === String(categoryId)) || null;
    };

    const updateSubcategoryCell = (account, subcategoryId) => {
        const subcategoryCell = document.querySelector(`[data-account_subcategory_id-${account.id}]`);
        if (!subcategoryCell) {
            return;
        }
        account.account_subcategory_id = subcategoryId;
        subcategoryCell.textContent = formatDisplayValue(account, "account_subcategory_id");
        formatLongTextCell(subcategoryCell);
    };

    function setupAccountEditing(accounts) {
        if (!Array.isArray(accounts) || accounts.length === 0 || !isAdmin) {
            return;
        }
        const ownerOptions = getOwnerOptions();
        for (const account of accounts) {
            const editableColumns = ["account_name", "account_number", "user_id", "normal_side", "account_description", "account_category_id", "account_subcategory_id", "statement_type", "comment"];
            for (const column of editableColumns) {
                const selector = `[data-${column}-${account.id}]`;
                const cell = document.querySelector(selector);
                if (!cell) {
                    continue;
                }
                const handleClick = () => {
                    cell.removeEventListener("dblclick", handleClick);
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
                    const inputAttr = `data-input-${column}-${account.id}`;
                    if (column === "user_id") {
                        const options = ownerOptions.length ? ownerOptions : [{ value: rawValue, label: displayValue || "Unassigned" }];
                        const select = createSelect(options, rawValue, inputAttr);
                        cell.replaceChildren(select);
                    } else if (column === "normal_side") {
                        const select = createSelect(accountTypeOptions, rawValue, inputAttr);
                        cell.replaceChildren(select);
                    } else if (column === "account_category_id") {
                        const categoryOptions = categories.map((category) => ({
                            value: String(category.id),
                            label: category.name,
                        }));
                        const select = createSelect(categoryOptions, rawValue, inputAttr);
                        cell.replaceChildren(select);
                    } else if (column === "account_subcategory_id") {
                        const categoryId = account.account_category_id ?? "";
                        const filtered = categoryId ? subcategories.filter((subcategory) => String(subcategory.account_category_id) === String(categoryId)) : subcategories;
                        const subcategoryOptions = filtered.map((subcategory) => ({
                            value: String(subcategory.id),
                            label: subcategory.name,
                        }));
                        const select = createSelect(subcategoryOptions, rawValue, inputAttr);
                        cell.replaceChildren(select);
                    } else if (column === "statement_type") {
                        const select = createSelect(statementTypeOptions, rawValue, inputAttr);
                        cell.replaceChildren(select);
                    } else if (column === "account_number") {
                        const input = createInput("number", rawValue, inputAttr);
                        input.step = "1";
                        input.min = "1000000000";
                        input.max = "9999999999";
                        cell.replaceChildren(input);
                    } else if (column === "account_description" || column === "comment") {
                        const textarea = createTextarea(rawValue, inputAttr, 2);
                        cell.replaceChildren(textarea);
                    } else {
                        const input = createInput("text", rawValue, inputAttr);
                        cell.replaceChildren(input);
                    }
                    const inputEl = cell.querySelector(`[data-input-${column}-${account.id}]`);
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
                            cell.addEventListener("dblclick", handleClick);
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
                                throw new Error(data.error || "ERR_FAILED_TO_UPDATE_ACCOUNT_FIELD");
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
                                const previousCategoryId = rawValue;
                                const previousSubcategoryId = String(account.account_subcategory_id ?? "");
                                account.account_category_id = newValue;
                                const defaultSubcategory = getDefaultSubcategoryForCategory(newValue);
                                if (!defaultSubcategory) {
                                    showErrorModal("ERR_NO_SUBCATEGORIES_FOUND");
                                    account.account_category_id = previousCategoryId;
                                    cell.textContent = formatDisplayValue(account, "account_category_id");
                                    updateSubcategoryCell(account, previousSubcategoryId);
                                    return;
                                }
                                const newSubcategoryId = String(defaultSubcategory.id);
                                try {
                                    const subcategoryResponse = await fetchWithAuth("/api/accounts/update-account-field", {
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                            account_id: account.id,
                                            field: "account_subcategory_id",
                                            value: newSubcategoryId,
                                        }),
                                    });
                                    const subcategoryData = await subcategoryResponse.json().catch(() => ({}));
                                    if (!subcategoryResponse.ok) {
                                        throw new Error(subcategoryData.error || "ERR_FAILED_TO_UPDATE_ACCOUNT_FIELD");
                                    }
                                    updateSubcategoryCell(account, newSubcategoryId);
                                } catch (error) {
                                    showErrorModal(error.message || "ERR_FAILED_TO_UPDATE_ACCOUNT_FIELD");
                                    try {
                                        await fetchWithAuth("/api/accounts/update-account-field", {
                                            method: "POST",
                                            headers: {
                                                "Content-Type": "application/json",
                                            },
                                            body: JSON.stringify({
                                                account_id: account.id,
                                                field: "account_category_id",
                                                value: previousCategoryId,
                                            }),
                                        });
                                    } catch (revertError) {
                                        // ignore revert errors, we'll resync UI below
                                    }
                                    account.account_category_id = previousCategoryId;
                                    cell.textContent = formatDisplayValue(account, "account_category_id");
                                    updateSubcategoryCell(account, previousSubcategoryId);
                                    return;
                                }
                            } else if (column === "account_subcategory_id") {
                                account.account_subcategory_id = newValue;
                            } else if (column === "statement_type") {
                                account.statement_type = newValue;
                            } else if (column === "comment") {
                                account.comment = newValue;
                            }
                            cell.textContent = formatDisplayValue(account, column);
                        } catch (error) {
                            showErrorModal(error.message || "ERR_FAILED_TO_UPDATE_ACCOUNT_FIELD");
                            cell.textContent = displayValue;
                        } finally {
                            formatLongTextCell(cell);
                            cell.addEventListener("dblclick", handleClick);
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
                cell.addEventListener("dblclick", handleClick);
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
    const updateTotalPages = () => {
        if (!totalPagesEl) {
            return;
        }
        const totalPages = Math.ceil(accountCount / accountsPerPage);
        totalPagesEl.textContent = totalPages;
    };

    if (accountsPerPageSelect) {
        accountsPerPageSelect.addEventListener("change", () => {
            accountsPerPage = parseInt(accountsPerPageSelect.value, 10);
            currentPage = 1;
            loadAccountsPage(currentPage);
            updateTotalPages();
        });
    }

    const accountsTableBody = document.querySelector("#accounts_table tbody");
    let activeFilter = null;
    let activeSort = { field: "account_number", direction: "asc" };
    const filterMinInputId = "account_list_filter_min";
    const filterMaxInputId = "account_list_filter_max";
    const filterFieldConfig = {
        account_number: {
            label: "Account Number",
            inputType: "text",
        },
        account_name: {
            label: "Account Name",
            inputType: "text",
        },
        user_id: {
            label: "Account Owner",
            inputType: "select",
            options: () => getOwnerOptions(),
        },
        status: {
            label: "Status",
            inputType: "select",
            options: () => [
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
            ],
        },
        account_type: {
            label: "Account Type",
            inputType: "select",
            options: () => accountTypeOptions,
        },
        account_category_id: {
            label: "Category",
            inputType: "select",
            options: () =>
                categories.map((category) => ({
                    value: String(category.id),
                    label: category.name,
                })),
        },
        account_subcategory_id: {
            label: "Subcategory",
            inputType: "select",
            options: () =>
                subcategories.map((subcategory) => ({
                    value: String(subcategory.id),
                    label: `${categoryNameById.get(String(subcategory.account_category_id)) || "Unknown"} - ${subcategory.name}`,
                })),
        },
        statement_type: {
            label: "Statement Type",
            inputType: "select",
            options: () => statementTypeOptions,
        },
        balance: {
            label: "Current Balance",
            inputType: "range",
        },
        account_description: {
            label: "Description",
            inputType: "text",
        },
        comment: {
            label: "Comments",
            inputType: "text",
        },
    };
    const getFilterConfig = (field, fallbackLabel) => {
        const config = filterFieldConfig[field];
        if (config) {
            return config;
        }
        return {
            label: fallbackLabel || field,
            inputType: "text",
        };
    };
    const buildAccountsQueryParams = () => {
        const params = new URLSearchParams();
        if (activeFilter && activeFilter.field) {
            params.set("filterField", activeFilter.field);
            if (activeFilter.field === "balance") {
                const minValue = String(activeFilter.min ?? "").trim();
                const maxValue = String(activeFilter.max ?? "").trim();
                if (minValue !== "") {
                    params.set("filterMin", minValue);
                }
                if (maxValue !== "") {
                    params.set("filterMax", maxValue);
                }
            } else {
                const value = activeFilter.value;
                if (value !== undefined && value !== null && String(value).trim() !== "") {
                    params.set("filterValue", value);
                }
            }
        }
        if (activeSort && activeSort.field && activeSort.direction) {
            params.set("sortField", activeSort.field);
            params.set("sortDirection", activeSort.direction);
        }
        const queryString = params.toString();
        return queryString ? `?${queryString}` : "";
    };
    const fetchAccountCount = async () => {
        try {
            const response = await fetchWithAuth(`/api/accounts/account_count${buildAccountsQueryParams()}`);
            if (response.ok) {
                const data = await response.json();
                accountCount = parseInt(data.total_accounts, 10) || 0;
            }
        } catch (error) {
            showErrorModal("ERR_INTERNAL_SERVER");
        } finally {
            updateTotalPages();
        }
    };

    const renderAccounts = async (accounts) => {
        if (!accountsTableBody) {
            return;
        }

        accountsTableBody.replaceChildren();
        for (const account of accounts) {
            const accountOwner = userNameById.get(String(account.user_id)) || "";
            const normalSide = account.normal_side ? String(account.normal_side).charAt(0).toUpperCase() + String(account.normal_side).slice(1) : "";
            const categoryName = categoryNameById.get(String(account.account_category_id)) || "";
            const subcategoryName = subcategoryNameById.get(String(account.account_subcategory_id)) || "";
            const statementType = statementTypeLabels[account.statement_type] || account.statement_type || "";
            const tr = document.createElement("tr");
            const status = account.status ? `${account.status.charAt(0).toUpperCase()}${account.status.slice(1)}` : "";
            const accountNameCell = createCell({ text: account.account_name ?? "", dataAttr: `data-account_name-${account.id}` });
            const accountNumberCell = createCell({ text: account.account_number ?? "", dataAttr: `data-account_number-${account.id}` });
            const accountCellHoverText = isAdmin ? navAndEditHoverText : navOnlyHoverText;
            accountNameCell.classList.add("account-transactions-link");
            accountNumberCell.classList.add("account-transactions-link");
            accountNameCell.title = accountCellHoverText;
            accountNumberCell.title = accountCellHoverText;
            if (isAdmin) {
                accountNameCell.setAttribute("data-edit-hint", navAndEditHoverText);
                accountNumberCell.setAttribute("data-edit-hint", navAndEditHoverText);
            }
            tr.appendChild(accountNameCell);
            tr.appendChild(accountNumberCell);
            tr.appendChild(createCell({ text: accountOwner, dataAttr: `data-user_id-${account.id}` }));
            tr.appendChild(createCell({ text: status }));
            tr.appendChild(createCell({ text: normalSide, dataAttr: `data-normal_side-${account.id}` }));
            tr.appendChild(createCell({ text: account.balance ?? "", isCurrency: true }));
            tr.appendChild(createCell({ text: account.account_description ?? "", dataAttr: `data-account_description-${account.id}`, isLongText: true }));
            tr.appendChild(createCell({ text: categoryName, dataAttr: `data-account_category_id-${account.id}` }));
            tr.appendChild(createCell({ text: subcategoryName, dataAttr: `data-account_subcategory_id-${account.id}` }));
            tr.appendChild(createCell({ text: statementType, dataAttr: `data-statement_type-${account.id}` }));
            tr.appendChild(createCell({ text: account.comment ?? "", dataAttr: `data-comment-${account.id}`, isLongText: true }));
            tr.appendChild(createCell({ text: account.initial_balance ?? "", isCurrency: true }));
            tr.appendChild(createCell({ text: account.account_order ?? "" }));
            tr.appendChild(createCell({ text: account.total_debits ?? "", isCurrency: true }));
            tr.appendChild(createCell({ text: account.total_credits ?? "", isCurrency: true }));
            const actionCell = document.createElement("td");
            const auditButton = document.createElement("button");
            auditButton.type = "button";
            auditButton.className = "button-small account-button";
            auditButton.setAttribute("data-account-id", account.id);
            auditButton.setAttribute("data-audit-account-button", "");
            auditButton.textContent = "Audit";
            actionCell.appendChild(auditButton);
            tr.appendChild(actionCell);
            if (isAdmin) {
                const editableColumns = ["user_id", "normal_side", "account_description", "account_category_id", "account_subcategory_id", "statement_type", "comment"];
                for (const column of editableColumns) {
                    const editableCell = tr.querySelector(`[data-${column}-${account.id}]`);
                    if (!editableCell) {
                        continue;
                    }
                    editableCell.setAttribute("data-edit-hint", editHoverText);
                    editableCell.title = editHoverText;
                }
            }
            let rowClickTimeout = null;
            const clearRowClickTimeout = () => {
                if (rowClickTimeout) {
                    clearTimeout(rowClickTimeout);
                    rowClickTimeout = null;
                }
            };
            const openLedgerForAccount = () => {
                const accountId = account.id;
                const url = new URL(window.location.origin + `/#/transactions?account_id=${accountId}`);
                window.location.href = url.toString();
            };
            const isInteractiveTarget = (target) => {
                if (!target || typeof target.closest !== "function") {
                    return false;
                }
                return Boolean(target.closest("button, a, input, select, textarea, label, [data-prevent-row-click]"));
            };

            const onLinkCellClick = (event) => {
                if (event.defaultPrevented || event.detail > 1 || isInteractiveTarget(event.target)) {
                    return;
                }
                clearRowClickTimeout();
                rowClickTimeout = setTimeout(() => {
                    rowClickTimeout = null;
                    openLedgerForAccount();
                }, 250);
            };

            accountNameCell.addEventListener("click", onLinkCellClick);
            accountNumberCell.addEventListener("click", onLinkCellClick);
            // Double-click should always suppress the pending single-click navigation.
            tr.addEventListener("dblclick", () => {
                clearRowClickTimeout();
            });
            accountsTableBody.appendChild(tr);
        }
        await formatCurrencyEls();
        formatLongTextEls();
        setupAccountEditing(accounts);
    };

    const loadAccountsPage = async (page) => {
        showLoadingOverlay();
        try {
            const offset = (page - 1) * accountsPerPage;
            const response = await fetchWithAuth(`/api/accounts/list/${offset}/${accountsPerPage}${buildAccountsQueryParams()}`);
            if (!response.ok) {
                throw new Error("ERR_FAILED_TO_LOAD_ACCOUNTS");
            }
            const accounts = await response.json();
            await renderAccounts(Array.isArray(accounts) ? accounts : []);
            if (currentPageEl) {
                currentPageEl.textContent = page;
            }
        } catch (error) {
            showErrorModal(error.message || "ERR_FAILED_TO_LOAD_ACCOUNTS");
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
    await fetchAccountCount();
    loadAccountsPage(currentPage);

    const accountCategorySelect = document.getElementById("account_category");
    const accountSubcategorySelect = document.getElementById("account_subcategory");

    const renderSubcategories = (categoryId) => {
        if (!accountSubcategorySelect) {
            return;
        }
        accountSubcategorySelect.replaceChildren();
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

    const addCategoryButton = document.querySelector("[data-add-category-button]");
    const addSubcategoryButton = document.querySelector("[data-add-subcategory-button]");
    const addCategoryModal = document.getElementById("category_modal");
    const isSubcategoryCheckbox = document.getElementById("is_subcategory");
    const categoryNameRow = document.querySelector("[data-category-name-row]");
    const categoryDescriptionRow = document.querySelector("[data-category-description-row]");
    const categorySubcategoryNameRow = document.querySelector("[data-category-subcategory-name-row]");
    const categorySubcategoryDescriptionRow = document.querySelector("[data-category-subcategory-description-row]");
    const categorySelectRow = document.querySelector("[data-category-select-row]");
    const subcategoryNameRow = document.querySelector("[data-subcategory-name-row]");
    const subcategoryDescriptionRow = document.querySelector("[data-subcategory-description-row]");
    const accountPrefixRow = document.querySelector("[data-account-prefix-row]");
    const categoryNameInput = document.getElementById("add_category__category_name");
    const categoryDescriptionInput = document.getElementById("add_category__category_description");
    const initialSubcategoryNameInput = document.getElementById("add_category__subcategory_name");
    const initialSubcategoryDescriptionInput = document.getElementById("add_category__subcategory_description");
    const categorySelect = document.getElementById("add_category__category_select");
    const subcategoryNameInput = document.getElementById("add_category__subcategory_name_existing");
    const subcategoryDescriptionInput = document.getElementById("add_category__subcategory_description_existing");
    const accountPrefixInput = document.getElementById("account_number_prefix");
    const orderIndexInput = document.getElementById("order_index");
    const populateCategorySelect = () => {
        if (!categorySelect) {
            return;
        }
        categorySelect.replaceChildren();
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select a category";
        placeholder.disabled = true;
        placeholder.selected = true;
        categorySelect.appendChild(placeholder);
        categories.forEach((category) => {
            const option = document.createElement("option");
            option.value = String(category.id);
            option.textContent = category.name;
            categorySelect.appendChild(option);
        });
    };
    const updateCategoryModalFields = (forceSubcategory) => {
        if (!isSubcategoryCheckbox) {
            return;
        }
        if (typeof forceSubcategory === "boolean") {
            isSubcategoryCheckbox.checked = forceSubcategory;
        }
        const isSubcategory = isSubcategoryCheckbox.checked;
        if (categoryNameRow) {
            categoryNameRow.hidden = isSubcategory;
        }
        if (categoryDescriptionRow) {
            categoryDescriptionRow.hidden = isSubcategory;
        }
        if (categorySubcategoryNameRow) {
            categorySubcategoryNameRow.hidden = isSubcategory;
        }
        if (categorySubcategoryDescriptionRow) {
            categorySubcategoryDescriptionRow.hidden = isSubcategory;
        }
        if (categorySelectRow) {
            categorySelectRow.hidden = !isSubcategory;
        }
        if (subcategoryNameRow) {
            subcategoryNameRow.hidden = !isSubcategory;
        }
        if (subcategoryDescriptionRow) {
            subcategoryDescriptionRow.hidden = !isSubcategory;
        }
        if (accountPrefixRow) {
            accountPrefixRow.hidden = isSubcategory;
        }
        if (categoryNameInput) {
            categoryNameInput.required = !isSubcategory;
        }
        if (categoryDescriptionInput) {
            categoryDescriptionInput.required = false;
        }
        if (initialSubcategoryNameInput) {
            initialSubcategoryNameInput.required = !isSubcategory;
        }
        if (initialSubcategoryDescriptionInput) {
            initialSubcategoryDescriptionInput.required = false;
        }
        if (categorySelect) {
            categorySelect.required = isSubcategory;
            if (isSubcategory && categorySelect.options.length === 0) {
                populateCategorySelect();
            }
        }
        if (subcategoryNameInput) {
            subcategoryNameInput.required = isSubcategory;
        }
        if (subcategoryDescriptionInput) {
            subcategoryDescriptionInput.required = false;
        }
        if (accountPrefixInput) {
            accountPrefixInput.required = !isSubcategory;
        }
    };
    if (categorySelect) {
        populateCategorySelect();
    }
    if (addCategoryButton && addCategoryModal) {
        addCategoryButton.addEventListener("click", () => {
            addCategoryModal.classList.add("is-visible");
            addCategoryModal.setAttribute("aria-hidden", "false");
            updateCategoryModalFields(false);
        });
    }
    const closeCategoryModalButton = document.getElementById("close_category_modal");
    if (closeCategoryModalButton && addCategoryModal) {
        closeCategoryModalButton.addEventListener("click", () => {
            addCategoryModal.classList.remove("is-visible");
            addCategoryModal.setAttribute("aria-hidden", "true");
        });
        closeCategoryModalButton.style.cursor = "pointer";
    }

    if (addSubcategoryButton && addCategoryModal) {
        addSubcategoryButton.addEventListener("click", () => {
            addCategoryModal.classList.add("is-visible");
            addCategoryModal.setAttribute("aria-hidden", "false");
            updateCategoryModalFields(true);
        });
    }
    if (isSubcategoryCheckbox) {
        isSubcategoryCheckbox.addEventListener("change", () => {
            updateCategoryModalFields();
        });
        updateCategoryModalFields();
    }

    const saveCategoryButton = document.getElementById("save_category_button");
    if (saveCategoryButton) {
        saveCategoryButton.addEventListener("click", async (event) => {
            event.preventDefault();
            showLoadingOverlay();
            const isSubcategory = isSubcategoryCheckbox ? isSubcategoryCheckbox.checked : false;
            const categoryName = categoryNameInput ? categoryNameInput.value.trim() : "";
            const categoryDescription = categoryDescriptionInput ? categoryDescriptionInput.value.trim() : "";
            const accountNumberPrefix = accountPrefixInput ? accountPrefixInput.value.trim() : "";
            const categoryId = categorySelect ? categorySelect.value : "";
            const subcategoryName = subcategoryNameInput ? subcategoryNameInput.value.trim() : "";
            const subcategoryDescription = subcategoryDescriptionInput ? subcategoryDescriptionInput.value.trim() : "";
            const initialSubcategoryName = initialSubcategoryNameInput ? initialSubcategoryNameInput.value.trim() : "";
            const initialSubcategoryDescription = initialSubcategoryDescriptionInput ? initialSubcategoryDescriptionInput.value.trim() : "";
            const orderIndex = orderIndexInput ? orderIndexInput.value.trim() : "";
            try {
                const response = await fetchWithAuth("/api/accounts/add-category", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        isSubcategory,
                        categoryName,
                        categoryDescription,
                        accountNumberPrefix,
                        categoryId,
                        subcategoryName,
                        subcategoryDescription,
                        initialSubcategoryName,
                        initialSubcategoryDescription,
                        orderIndex,
                    }),
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "ERR_INTERNAL_SERVER");
                }
                const result = await response.json();
                window.location.reload();
            } catch (error) {
                showErrorModal(error.message || "ERR_INTERNAL_SERVER");
            } finally {
                hideLoadingOverlay();
            }
        });
    }

    const deleteCategoryButton = document.querySelector("[data-delete-category-button]");
    const deleteCategoryModal = document.getElementById("delete_category_modal");
    const deleteCategorySelect = document.getElementById("delete_category__category_select");
    const populateDeleteCategorySelect = () => {
        if (!deleteCategorySelect) {
            return;
        }
        deleteCategorySelect.replaceChildren();
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select a category or subcategory";
        placeholder.disabled = true;
        placeholder.selected = true;
        deleteCategorySelect.appendChild(placeholder);
        categories.forEach((category) => {
            const optgroup = document.createElement("optgroup");
            optgroup.label = category.name;
            const categoryOption = document.createElement("option");
            categoryOption.value = `category:${category.id}`;
            categoryOption.textContent = `[Category] ${category.name}`;
            optgroup.appendChild(categoryOption);
            const subcats = subcategoriesByCategoryId.get(String(category.id)) || [];
            subcats.forEach((subcategory) => {
                const subOption = document.createElement("option");
                subOption.value = `subcategory:${subcategory.id}`;
                subOption.textContent = `- ${subcategory.name}`;
                optgroup.appendChild(subOption);
            });
            deleteCategorySelect.appendChild(optgroup);
        });
    };
    if (deleteCategorySelect) {
        populateDeleteCategorySelect();
    }
    if (deleteCategoryButton && deleteCategoryModal) {
        deleteCategoryButton.addEventListener("click", () => {
            deleteCategoryModal.classList.add("is-visible");
            deleteCategoryModal.setAttribute("aria-hidden", "false");
            populateDeleteCategorySelect();
        });
    }
    const closeDeleteCategoryModalButton = document.getElementById("close_delete_category_modal");
    if (closeDeleteCategoryModalButton && deleteCategoryModal) {
        closeDeleteCategoryModalButton.addEventListener("click", () => {
            deleteCategoryModal.classList.remove("is-visible");
            deleteCategoryModal.setAttribute("aria-hidden", "true");
        });
        closeDeleteCategoryModalButton.style.cursor = "pointer";
    }

    const confirmDeleteCategoryButton = document.getElementById("confirm_delete_category_button");
    if (confirmDeleteCategoryButton) {
        confirmDeleteCategoryButton.addEventListener("click", async (event) => {
            event.preventDefault();
            showLoadingOverlay();
            const selection = deleteCategorySelect ? deleteCategorySelect.value : "";
            if (!selection || !selection.includes(":")) {
                showErrorModal("ERR_SELECT_CATEGORY_OR_SUBCATEGORY_TO_DELETE");
                hideLoadingOverlay();
                return;
            }
            const [selectionType, selectionId] = selection.split(":");
            let endpoint = "";
            if (selectionType === "category") {
                const category = categoryById.get(String(selectionId));
                const categoryName = category ? category.name : "this category";
                const subcats = subcategoriesByCategoryId.get(String(selectionId)) || [];
                if (subcats.length > 0) {
                    const confirmDelete = confirm(`Deleting category "${categoryName}" will also delete ${subcats.length} subcategory(ies). Continue?`);
                    if (!confirmDelete) {
                        hideLoadingOverlay();
                        return;
                    }
                } else {
                    const confirmDelete = confirm(`Delete category "${categoryName}"?`);
                    if (!confirmDelete) {
                        hideLoadingOverlay();
                        return;
                    }
                }
                endpoint = `/api/accounts/category/${selectionId}`;
            } else if (selectionType === "subcategory") {
                const subcategory = subcategoryById.get(String(selectionId));
                const subcategoryName = subcategory ? subcategory.name : "this subcategory";
                const confirmDelete = confirm(`Delete subcategory "${subcategoryName}"?`);
                if (!confirmDelete) {
                    hideLoadingOverlay();
                    return;
                }
                endpoint = `/api/accounts/subcategory/${selectionId}`;
            } else {
                showErrorModal("ERR_INVALID_SELECTION");
                hideLoadingOverlay();
                return;
            }
            try {
                const response = await fetchWithAuth(endpoint, {
                    method: "DELETE",
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "ERR_INTERNAL_SERVER");
                }
                const result = await response.json();
                window.location.reload();
            } catch (error) {
                showErrorModal(error.message || "ERR_INTERNAL_SERVER");
            } finally {
                hideLoadingOverlay();
            }
        });
    }

    const deactivateAccountSelectEl = document.getElementById("deactivate_account_select");
    const deactivateAccountButton = document.getElementById("deactivate_account_button");
    if (deactivateAccountButton && deactivateAccountSelectEl) {
        deactivateAccountButton.addEventListener("click", async (event) => {
            event.preventDefault();
            const accountId = deactivateAccountSelectEl.value;
            if (!accountId) {
                showErrorModal("ERR_SELECT_ACCOUNT_TO_DEACTIVATE");
                return;
            }
            const confirmDeactivate = confirm("Are you sure you want to deactivate the selected account?");
            if (!confirmDeactivate) {
                return;
            }
            showLoadingOverlay();
            try {
                const response = await fetchWithAuth("/api/accounts/set-account-status", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        account_id: accountId,
                        is_active: false,
                    }),
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "ERR_INTERNAL_SERVER");
                }
                const result = await response.json();
                window.location.reload();
            } catch (error) {
                console.log(error.message);
                showErrorModal(error.message || "ERR_INTERNAL_SERVER");
            } finally {
                hideLoadingOverlay();
            }
        });
    }

    const reactivateButtons = document.querySelectorAll('[data-account-action="reactivate"]');
    if (reactivateButtons.length) {
        reactivateButtons.forEach((button) => {
            button.addEventListener("click", async () => {
                const accountId = button.dataset.accountId;
                if (!accountId) {
                    return;
                }
                const confirmReactivate = confirm("Are you sure you want to reactivate this account?");
                if (!confirmReactivate) {
                    return;
                }
                showLoadingOverlay();
                try {
                    const response = await fetchWithAuth("/api/accounts/set-account-status", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            account_id: accountId,
                            is_active: true,
                        }),
                    });
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || "ERR_INTERNAL_SERVER");
                    }
                    const row = document.querySelector(`[data-inactive_account_id-${accountId}]`);
                    if (row) {
                        row.remove();
                    }
                } catch (error) {
                    showErrorModal(error.message || "ERR_INTERNAL_SERVER");
                } finally {
                    hideLoadingOverlay();
                }
            });
        });
    }

    const accountsHeaderNameEl = document.querySelector("[data-accounts-header-name]");
    const accountsHeaderNumberEl = document.querySelector("[data-accounts-header-account-number]");
    const accountsHeaderOwnerEl = document.querySelector("[data-accounts-header-account-owner]");
    const accountsHeaderStatusEl = document.querySelector("[data-accounts-header-status]");
    const accountsHeaderNormalSideEl = document.querySelector("[data-accounts-header-account-type]");
    const accountsHeaderBalanceEl = document.querySelector("[data-accounts-header-balance]");
    const accountsHeaderDescriptionEl = document.querySelector("[data-accounts-header-description]");
    const accountsHeaderCategoryEl = document.querySelector("[data-accounts-header-category]");
    const accountsHeaderSubcategoryEl = document.querySelector("[data-accounts-header-subcategory]");
    const accountsHeaderStatementTypeEl = document.querySelector("[data-accounts-header-statement-type]");
    const accountsHeaderCommentEl = document.querySelector("[data-accounts-header-comments]");
    const accountsHeaderOpeningBalanceEl = document.querySelector("[data-accounts-header-opening-balance]");
    const accountsHeaderAccountOrderEl = document.querySelector("[data-accounts-header-account-order]");
    const accountsHeaderTotalDebitsEl = document.querySelector("[data-accounts-header-total-debits]");
    const accountsHeaderTotalCreditsEl = document.querySelector("[data-accounts-header-total-credits]");
    const headers = [
        { el: accountsHeaderNameEl, field: "account_name", filterable: true, sortable: true },
        { el: accountsHeaderNumberEl, field: "account_number", filterable: true, sortable: true },
        { el: accountsHeaderOwnerEl, field: "user_id", filterable: true, sortable: true },
        { el: accountsHeaderStatusEl, field: "status", filterable: true, sortable: true },
        { el: accountsHeaderNormalSideEl, field: "account_type", filterable: true, sortable: true },
        { el: accountsHeaderBalanceEl, field: "balance", filterable: true, sortable: true },
        { el: accountsHeaderDescriptionEl, field: "account_description", filterable: true, sortable: false },
        { el: accountsHeaderCategoryEl, field: "account_category_id", filterable: true, sortable: true },
        { el: accountsHeaderSubcategoryEl, field: "account_subcategory_id", filterable: true, sortable: true },
        { el: accountsHeaderStatementTypeEl, field: "statement_type", filterable: true, sortable: true },
        { el: accountsHeaderCommentEl, field: "comment", filterable: true, sortable: false },
        { el: accountsHeaderOpeningBalanceEl, field: "initial_balance", filterable: false, sortable: false },
        { el: accountsHeaderAccountOrderEl, field: "account_order", filterable: false, sortable: false },
        { el: accountsHeaderTotalDebitsEl, field: "total_debits", filterable: false, sortable: false },
        { el: accountsHeaderTotalCreditsEl, field: "total_credits", filterable: false, sortable: false },
    ];

    const accountListFilterModal = document.getElementById("account_list_filter_modal");
    const filterModalTitleEl = document.getElementById("account_list_filter_modal_title");
    const filterFormEl = document.getElementById("account_list_filter_form");
    const applyFiltersButton = document.getElementById("apply_account_list_filter_button");
    const sortAscendingButton = document.getElementById("apply_account_list_sort_asc_button");
    const sortDescendingButton = document.getElementById("apply_account_list_sort_desc_button");
    const clearFiltersButton = document.getElementById("clear_account_list_filters_button");
    const closeFiltersModalButton = document.getElementById("close_account_list_filter_modal");
    if (closeFiltersModalButton && accountListFilterModal) {
        closeFiltersModalButton.style.cursor = "pointer";
        closeFiltersModalButton.addEventListener("click", () => {
            accountListFilterModal.classList.remove("is-visible");
            accountListFilterModal.setAttribute("aria-hidden", "true");
        });
    }
    const filterLabelEl = document.getElementById("account_list_filter__label");
    const filterValueEl = document.getElementById("account_list_filter__input");
    let activeHeaderField = null;
    let activeHeaderSortable = false;
    const filterInputId = "account_list_filter_value";

    const closeFilterModal = () => {
        if (!accountListFilterModal) {
            return;
        }
        accountListFilterModal.classList.remove("is-visible");
        accountListFilterModal.setAttribute("aria-hidden", "true");
    };
    const clearFilters = async () => {
        activeFilter = null;
        activeSort = { field: "account_number", direction: "asc" };
        currentPage = 1;
        await fetchAccountCount();
        await loadAccountsPage(currentPage);
        closeFilterModal();
    };

    const buildFilterInput = (config, currentValue) => {
        if (config.inputType === "select") {
            const select = document.createElement("select");
            select.id = filterInputId;
            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = "All";
            select.appendChild(placeholder);
            const options = typeof config.options === "function" ? config.options() : config.options || [];
            options.forEach((option) => {
                const opt = document.createElement("option");
                opt.value = String(option.value);
                opt.textContent = option.label;
                select.appendChild(opt);
            });
            if (currentValue !== undefined && currentValue !== null && currentValue !== "") {
                select.value = String(currentValue);
            } else {
                placeholder.selected = true;
            }
            return select;
        }
        if (config.inputType === "range") {
            const wrapper = document.createElement("div");
            const minInput = createInput("number", currentValue?.min ?? "");
            minInput.id = filterMinInputId;
            minInput.placeholder = "Min";
            minInput.step = "0.01";
            const maxInput = createInput("number", currentValue?.max ?? "");
            maxInput.id = filterMaxInputId;
            maxInput.placeholder = "Max";
            maxInput.step = "0.01";
            const separator = document.createElement("span");
            separator.textContent = " - ";
            wrapper.appendChild(minInput);
            wrapper.appendChild(separator);
            wrapper.appendChild(maxInput);
            return wrapper;
        }
        const input = createInput("text", currentValue ?? "");
        input.id = filterInputId;
        input.placeholder = "Enter filter text";
        return input;
    };

    const getActiveFilterValue = () => {
        if (!filterValueEl) {
            return {};
        }
        const minInput = filterValueEl.querySelector(`#${filterMinInputId}`);
        const maxInput = filterValueEl.querySelector(`#${filterMaxInputId}`);
        if (minInput || maxInput) {
            return {
                min: minInput ? minInput.value : "",
                max: maxInput ? maxInput.value : "",
            };
        }
        const input = filterValueEl.querySelector("input, select, textarea");
        return { value: input ? input.value : "" };
    };

    const applyFilterFromModal = async () => {
        if (!activeHeaderField) {
            closeFilterModal();
            return;
        }
        const { value, min, max } = getActiveFilterValue();
        if (activeHeaderField === "balance") {
            const minValue = String(min ?? "").trim();
            const maxValue = String(max ?? "").trim();
            if (minValue === "" && maxValue === "") {
                activeFilter = null;
            } else {
                activeFilter = { field: activeHeaderField, min: minValue, max: maxValue };
            }
        } else {
            const normalizedValue = value !== undefined && value !== null ? String(value) : "";
            if (normalizedValue.trim() === "") {
                activeFilter = null;
            } else {
                activeFilter = { field: activeHeaderField, value: normalizedValue };
            }
        }
        currentPage = 1;
        await fetchAccountCount();
        await loadAccountsPage(currentPage);
        closeFilterModal();
    };

    const applySortFromModal = async (direction) => {
        if (!activeHeaderField || !activeHeaderSortable) {
            closeFilterModal();
            return;
        }
        activeSort = { field: activeHeaderField, direction };
        currentPage = 1;
        await loadAccountsPage(currentPage);
        closeFilterModal();
    };

    const openFilterModal = (field, label, sortable) => {
        if (!accountListFilterModal || !filterLabelEl || !filterValueEl) {
            return;
        }
        activeHeaderField = field;
        activeHeaderSortable = Boolean(sortable);
        const config = getFilterConfig(field, label || "");
        const currentFilter = activeFilter && activeFilter.field === field ? activeFilter : null;
        const currentValue = config.inputType === "range" ? { min: currentFilter?.min ?? "", max: currentFilter?.max ?? "" } : (currentFilter?.value ?? "");
        filterLabelEl.textContent = `${config.label || label || "Filter"}:`;
        const labelForId = config.inputType === "range" ? filterMinInputId : filterInputId;
        filterLabelEl.setAttribute("for", labelForId);
        if (filterModalTitleEl) {
            filterModalTitleEl.textContent = `Filter Accounts: ${config.label || label || "Column"}`;
        }
        const inputEl = buildFilterInput(config, currentValue);
        filterValueEl.replaceChildren(inputEl);
        if (sortAscendingButton) {
            sortAscendingButton.disabled = !activeHeaderSortable;
        }
        if (sortDescendingButton) {
            sortDescendingButton.disabled = !activeHeaderSortable;
        }
        accountListFilterModal.classList.add("is-visible");
        accountListFilterModal.setAttribute("aria-hidden", "false");
        const focusEl = inputEl.querySelector ? inputEl.querySelector("input, select, textarea") : inputEl;
        if (focusEl && typeof focusEl.focus === "function") {
            focusEl.focus();
        }
    };

    if (filterFormEl) {
        filterFormEl.addEventListener("submit", (event) => {
            event.preventDefault();
            applyFilterFromModal().catch((error) => {
                console.error("Failed to apply filter", error);
            });
        });
    }
    if (clearFiltersButton) {
        clearFiltersButton.addEventListener("click", (event) => {
            event.preventDefault();
            clearFilters().catch((error) => {
                console.error("Failed to clear filters", error);
            });
        });
    }
    if (applyFiltersButton) {
        applyFiltersButton.addEventListener("click", (event) => {
            event.preventDefault();
            applyFilterFromModal().catch((error) => {
                console.error("Failed to apply filter", error);
            });
        });
    }
    if (sortAscendingButton) {
        sortAscendingButton.addEventListener("click", (event) => {
            event.preventDefault();
            applySortFromModal("asc").catch((error) => {
                console.error("Failed to apply sort", error);
            });
        });
    }
    if (sortDescendingButton) {
        sortDescendingButton.addEventListener("click", (event) => {
            event.preventDefault();
            applySortFromModal("desc").catch((error) => {
                console.error("Failed to apply sort", error);
            });
        });
    }

    headers.forEach(({ el, field, filterable, sortable }) => {
        if (el && filterable) {
            el.style.cursor = "pointer";
            el.addEventListener("click", () => {
                openFilterModal(field, el.textContent?.trim() || "", sortable);
            });
        } else if (el) {
            el.style.cursor = "default";
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

async function loadDomHelpers() {
    const moduleUrl = new URL("/js/utils/dom_helpers.js", window.location.origin).href;
    const module = await import(moduleUrl);
    const { createCell, createInput, createSelect, createTextarea } = module;
    return { createCell, createInput, createSelect, createTextarea };
}

async function loadFetchWithAuth() {
    const moduleUrl = new URL("/js/utils/fetch_with_auth.js", window.location.origin).href;
    const module = await import(moduleUrl);
    const { fetchWithAuth } = module;
    return { fetchWithAuth };
}
