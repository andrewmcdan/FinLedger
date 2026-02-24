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

let showLoadingOverlayFn, hideLoadingOverlayFn, showErrorModalFn;
let accountsList = [];
let draftJournalLineCounter = 1;
let formatNumberAsCurrencyFn, formatNumberWithCommasFn;

const loadAccounts = async () => {
    try {
        showLoadingOverlayFn();
        const res = await fetchWithAuth("/api/accounts/list/0/10000");
        if (!res.ok) {
            throw new Error("ERR_FAILED_TO_LOAD_ACCOUNTS");
        }
        accountsList = await res.json();
        return accountsList;
    } catch (error) {
        showErrorModalFn(error.message, false);
    } finally {
        hideLoadingOverlayFn();
    }
};

const updateJournalEntryTotals = (journalLinesContainer) => {
    const debitCells = journalLinesContainer.querySelectorAll("[data-debit-inputs]");
    const creditCells = journalLinesContainer.querySelectorAll("[data-credit-inputs]");
    console.log("Updating totals. Debit cells:", debitCells, "Credit cells:", creditCells);
    let totalDebit = 0;
    let totalCredit = 0;
    debitCells.forEach((input) => {
        console.log("Processing debit input:", input);
        const value = parseFloat(input.value.replace(/[^0-9.-]/g, ""));
        console.log("Debit input value:", input.value, "Parsed value:", value);
        if (!isNaN(value)) {
            totalDebit += value;
        }
    });
    creditCells.forEach((input) => {
        console.log("Processing credit input:", input);
        const value = parseFloat(input.value.replace(/[^0-9.-]/g, ""));
        console.log("Credit input value:", input.value, "Parsed value:", value);
        if (!isNaN(value)) {
            totalCredit += value;
        }
    });
    const totalDebitEl = document.querySelector("[data-journal-total-debits]");
    const totalCreditEl = document.querySelector("[data-journal-total-credits]");
    if (totalDebitEl) {
        totalDebitEl.textContent = formatNumberAsCurrencyFn(totalDebit);
    }
    if (totalCreditEl) {
        totalCreditEl.textContent = formatNumberAsCurrencyFn(totalCredit);
    }
    const differenceEl = document.querySelector("[data-journal-balance-diff]");
    if (differenceEl) {
        const difference = totalDebit - totalCredit;
        differenceEl.textContent = formatNumberAsCurrencyFn(difference);
        if (difference === 0) {
            differenceEl.classList.remove("unbalanced");
            differenceEl.classList.add("balanced");
        } else {
            differenceEl.classList.remove("balanced");
            differenceEl.classList.add("unbalanced");
        }
    }
};

const buildJournalLine = async (rowNum) => {
    const { formatNumberAsCurrency, formatNumberWithCommas } = await loadNumericHelpers();
    formatNumberAsCurrencyFn = formatNumberAsCurrency;
    formatNumberWithCommasFn = formatNumberWithCommas;
    const row = document.createElement("tr");
    const rowNumCell = createCell({ text: rowNum });
    const accountCell = createCell({});
    const descriptionCell = createCell({});
    const debitCell = createCell({});
    const creditCell = createCell({});
    const removeCell = createCell({});

    const accountSelectOptions = accountsList.map((account) => ({ value: account.id, label: account.account_name }));
    const accountSelect = createSelect(accountSelectOptions, "Journal line account");
    accountCell.appendChild(accountSelect);
    const descriptionInput = createInput("text", "", "data-line-note");
    descriptionInput.placeholder = "Optional line note";
    descriptionCell.appendChild(descriptionInput);
    const debitInput = createInput("text", "", "data-debit-inputs");
    debitInput.addEventListener("input", () => {
        if (debitInput.value) {
            creditInput.value = "";
        }
        if (/[a-zA-Z]/.test(debitInput.value)) {
            debitInput.value = debitInput.value.replace(/[^0-9.-]/g, "");
        }
        updateJournalEntryTotals(row.parentElement);
    });
    debitInput.addEventListener("blur", () => {
        debitInput.value = formatNumberAsCurrencyFn(debitInput.value);
    });
    debitInput.id = `debit-${rowNum}`;
    debitCell.appendChild(debitInput);
    const creditInput = createInput("text", "", "data-credit-inputs");
    creditInput.addEventListener("input", () => {
        if (creditInput.value) {
            debitInput.value = "";
        }
        if (/[a-zA-Z]/.test(creditInput.value)) {
            creditInput.value = creditInput.value.replace(/[^0-9.-]/g, "");
        }
        updateJournalEntryTotals(row.parentElement);
    });
    creditInput.addEventListener("blur", () => {
        creditInput.value = formatNumberAsCurrencyFn(creditInput.value);
    });
    creditInput.id = `credit-${rowNum}`;
    creditCell.appendChild(creditInput);
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "button-small";
    removeButton.textContent = "Remove";
    removeCell.appendChild(removeButton);

    row.appendChild(rowNumCell);
    row.appendChild(accountCell);
    row.appendChild(descriptionCell);
    row.appendChild(debitCell);
    row.appendChild(creditCell);
    row.appendChild(removeCell);
    return row;
};

export default async function initTransactions({ showLoadingOverlay, hideLoadingOverlay, showErrorModal }) {
    showLoadingOverlayFn = showLoadingOverlay;
    hideLoadingOverlayFn = hideLoadingOverlay;
    showErrorModalFn = showErrorModal;
    await loadAccounts();
    console.log("Accounts list:", accountsList);

    const draftJournalLines = document.querySelector("[data-journal-lines]");
    if (draftJournalLines) {
        draftJournalLines.appendChild(await buildJournalLine(draftJournalLineCounter++));

        const addLineButton = document.querySelector("[data-add-line-button]");
        if (addLineButton) {
            addLineButton.addEventListener("click", async () => {
                draftJournalLines.appendChild(await buildJournalLine(draftJournalLineCounter++));
            });
        }

        draftJournalLines.addEventListener("click", (event) => {
            if (event.target.tagName === "BUTTON" && event.target.textContent === "Remove") {
                const row = event.target.closest("tr");
                if (row) {
                    row.remove();
                    draftJournalLineCounter = Math.max(1, draftJournalLineCounter - 1);
                    // Re-number remaining rows
                    const rows = draftJournalLines.querySelectorAll("tr");
                    rows.forEach((r, index) => {
                        const cell = r.querySelector("td");
                        if (cell) {
                            cell.textContent = index + 1;
                        }
                    });
                }
            }
        });
    }
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
