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
let draftJournalDocumentCounter = 1;
let journalAttachedDocuments = [];
let lineDocumentAssociations = new Map();
let pendingLineDocumentSelections = new Set();

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

const getLineDocumentAssociationSet = (lineNumber) => {
    const normalizedLineNumber = String(lineNumber || "");
    if (!normalizedLineNumber) {
        return new Set();
    }
    if (!lineDocumentAssociations.has(normalizedLineNumber)) {
        lineDocumentAssociations.set(normalizedLineNumber, new Set());
    }
    return lineDocumentAssociations.get(normalizedLineNumber);
};

const getLineDocumentAssociationSnapshot = (lineNumber) => {
    const normalizedLineNumber = String(lineNumber || "");
    if (!normalizedLineNumber || !lineDocumentAssociations.has(normalizedLineNumber)) {
        return new Set();
    }
    return new Set(lineDocumentAssociations.get(normalizedLineNumber));
};

const renderJournalAttachedDocumentsList = () => {
    const documentsList = document.querySelector("[data-journal-entry-documents-list]");
    if (!documentsList) {
        return;
    }
    documentsList.replaceChildren();

    if (journalAttachedDocuments.length === 0) {
        const emptyItem = document.createElement("li");
        emptyItem.className = "meta";
        emptyItem.setAttribute("data-journal-entry-documents-empty", "");
        emptyItem.textContent = "No documents attached. Documentation is required for all journal entries.";
        documentsList.appendChild(emptyItem);
        return;
    }

    journalAttachedDocuments.forEach((doc, index) => {
        const item = document.createElement("li");
        item.className = "journal-entry-document-item";
        item.setAttribute("data-journal-entry-document-id", doc.id);
        item.textContent = `${index + 1}. ${doc.name}`;
        documentsList.appendChild(item);
    });
};

const renderJournalLineDocumentsChecklist = (lineNumber, selectedDocsOverride = null) => {
    const checklistContainer = document.querySelector("[data-journal-line-documents-checklist]");
    if (!checklistContainer) {
        return;
    }
    checklistContainer.replaceChildren();

    if (journalAttachedDocuments.length === 0) {
        const emptyState = document.createElement("p");
        emptyState.className = "meta";
        emptyState.textContent = "No documents available to associate.";
        checklistContainer.appendChild(emptyState);
        return;
    }

    const selectedDocs = selectedDocsOverride ?? getLineDocumentAssociationSet(lineNumber);
    journalAttachedDocuments.forEach((doc) => {
        const row = document.createElement("label");
        row.className = "journal-line-doc-option";
        row.setAttribute("for", `line-doc-checkbox-${doc.id}`);
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = doc.id;
        checkbox.id = `line-doc-checkbox-${doc.id}`;
        checkbox.setAttribute("data-journal-line-document-checkbox", "");
        checkbox.checked = selectedDocs.has(doc.id);
        const labelText = document.createElement("span");
        labelText.className = "journal-line-doc-name";
        labelText.textContent = doc.name;
        row.appendChild(checkbox);
        row.appendChild(labelText);
        checklistContainer.appendChild(row);
    });
};

const syncVisibleJournalLineDocumentsModal = () => {
    const journalLineDocumentsModal = document.getElementById("journal_line_documents_modal");
    if (!journalLineDocumentsModal || !journalLineDocumentsModal.classList.contains("is-visible")) {
        return;
    }
    const lineNumber = journalLineDocumentsModal.dataset.activeLineNumber || "";
    renderJournalLineDocumentsChecklist(lineNumber, pendingLineDocumentSelections);
};

const openJournalLineDocumentsModal = (lineNumber) => {
    const journalLineDocumentsModal = document.getElementById("journal_line_documents_modal");
    if (!journalLineDocumentsModal) {
        return;
    }
    const normalizedLineNumber = String(lineNumber || "");
    journalLineDocumentsModal.dataset.activeLineNumber = normalizedLineNumber;
    pendingLineDocumentSelections = getLineDocumentAssociationSnapshot(normalizedLineNumber);
    const targetLineLabel = journalLineDocumentsModal.querySelector("[data-journal-line-documents-target-line]");
    if (targetLineLabel) {
        targetLineLabel.textContent = `Line ${normalizedLineNumber || "--"}`;
    }
    renderJournalLineDocumentsChecklist(normalizedLineNumber, pendingLineDocumentSelections);
    journalLineDocumentsModal.classList.add("is-visible");
    journalLineDocumentsModal.setAttribute("aria-hidden", "false");
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
    const actionsCell = createCell({});

    const accountSelectOptions = accountsList.map((account) => ({ value: account.id, label: account.account_name }));
    const accountSelect = createSelect(accountSelectOptions, "Journal line account");
    accountSelect.id = `account-${rowNum}`;
    accountCell.appendChild(accountSelect);
    const descriptionInput = createInput("text", "", "data-line-note");
    descriptionInput.placeholder = "Optional line note";
    descriptionInput.id = `description-${rowNum}`;
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
    const lineDocumentsButton = document.createElement("button");
    lineDocumentsButton.type = "button";
    lineDocumentsButton.className = "button-small";
    lineDocumentsButton.textContent = "Docs";
    lineDocumentsButton.setAttribute("data-journal-line-documents-button", "");
    lineDocumentsButton.setAttribute("data-journal-line-number", String(rowNum));
    lineDocumentsButton.addEventListener("click", () => {
        const lineNumber = lineDocumentsButton.getAttribute("data-journal-line-number") || "";
        openJournalLineDocumentsModal(lineNumber);
    });
    actionsCell.appendChild(lineDocumentsButton);

    const removeButtonSpacer = document.createTextNode(" ");
    actionsCell.appendChild(removeButtonSpacer);

    removeButton.type = "button";
    removeButton.className = "button-small";
    removeButton.textContent = "Remove";
    actionsCell.appendChild(removeButton);

    row.appendChild(rowNumCell);
    row.appendChild(accountCell);
    row.appendChild(descriptionCell);
    row.appendChild(debitCell);
    row.appendChild(creditCell);
    row.appendChild(actionsCell);
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
                    const nextLineDocumentAssociations = new Map();
                    rows.forEach((r, index) => {
                        const cell = r.querySelector("td");
                        if (cell) {
                            cell.textContent = index + 1;
                        }
                        // adjust input IDs to match new row numbers
                        const debitInput = r.querySelector("input[data-debit-inputs]");
                        const creditInput = r.querySelector("input[data-credit-inputs]");
                        if (debitInput) {
                            debitInput.id = `debit-${index + 1}`;
                        }
                        if (creditInput) {
                            creditInput.id = `credit-${index + 1}`;
                        }

                        const lineDocsButton = r.querySelector("button[data-journal-line-documents-button]");
                        if (lineDocsButton) {
                            const previousLineNumber = lineDocsButton.getAttribute("data-journal-line-number") || String(index + 1);
                            if (lineDocumentAssociations.has(previousLineNumber)) {
                                nextLineDocumentAssociations.set(String(index + 1), new Set(lineDocumentAssociations.get(previousLineNumber)));
                            }
                            lineDocsButton.setAttribute("data-journal-line-number", String(index + 1));
                        }

                        const descriptionInput = r.querySelector("input[data-line-note]");
                        if (descriptionInput) {
                            descriptionInput.id = `description-${index + 1}`;
                        }

                        const accountSelect = r.querySelector("select");
                        if (accountSelect) {
                            accountSelect.id = `account-${index + 1}`;
                        }
                    });
                    lineDocumentAssociations = nextLineDocumentAssociations;
                    syncVisibleJournalLineDocumentsModal();
                }
            }
        });
    }

    const journalEntryDateInput = document.getElementById("journal_entry_date");
    if (journalEntryDateInput) {
        const today = new Date().toISOString().split("T")[0];
        journalEntryDateInput.value = today;
    }

    const addJournalDocumentButton = document.querySelector("[data-journal-add-document-button]");
    const journalEntryDocumentInput = document.getElementById("journal_entry_document_input");
    if (addJournalDocumentButton && journalEntryDocumentInput) {
        addJournalDocumentButton.addEventListener("click", () => {
            journalEntryDocumentInput.click();
        });
        journalEntryDocumentInput.addEventListener("change", () => {
            const files = Array.from(journalEntryDocumentInput.files || []);
            if (files.length === 0) {
                return;
            }
            const existingSignatures = new Set(journalAttachedDocuments.map((doc) => `${doc.name}:${doc.size}:${doc.lastModified}`));
            files.forEach((file) => {
                const signature = `${file.name}:${file.size}:${file.lastModified}`;
                if (existingSignatures.has(signature)) {
                    return;
                }
                existingSignatures.add(signature);
                journalAttachedDocuments.push({
                    id: String(draftJournalDocumentCounter++),
                    name: file.name,
                    size: file.size,
                    lastModified: file.lastModified,
                    file,
                });
            });
            journalEntryDocumentInput.value = "";
            renderJournalAttachedDocumentsList();
            syncVisibleJournalLineDocumentsModal();
        });
    }
    renderJournalAttachedDocumentsList();

    const journalLineDocumentsModal = document.getElementById("journal_line_documents_modal");
    const closeJournalLineDocumentsModalButton = document.getElementById("close_journal_line_documents_modal");
    const cancelJournalLineDocumentsButton = document.getElementById("journal_line_documents_cancel_button");
    const journalLineDocumentsChecklist = document.querySelector("[data-journal-line-documents-checklist]");
    const journalLineDocumentsForm = document.getElementById("journal_line_documents_form");

    const hideJournalLineDocumentsModal = () => {
        if (!journalLineDocumentsModal) {
            return;
        }
        journalLineDocumentsModal.dataset.activeLineNumber = "";
        pendingLineDocumentSelections = new Set();
        journalLineDocumentsModal.classList.remove("is-visible");
        journalLineDocumentsModal.setAttribute("aria-hidden", "true");
    };

    if (journalLineDocumentsChecklist && journalLineDocumentsModal) {
        journalLineDocumentsChecklist.addEventListener("change", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement) || !target.matches("[data-journal-line-document-checkbox]")) {
                return;
            }
            const lineNumber = journalLineDocumentsModal.dataset.activeLineNumber || "";
            if (!lineNumber) {
                return;
            }
            const documentId = target.value;
            if (target.checked) {
                pendingLineDocumentSelections.add(documentId);
            } else {
                pendingLineDocumentSelections.delete(documentId);
            }
        });
    }
    if (journalLineDocumentsForm) {
        journalLineDocumentsForm.addEventListener("submit", (event) => {
            event.preventDefault();
            const lineNumber = journalLineDocumentsModal?.dataset.activeLineNumber || "";
            if (lineNumber) {
                if (pendingLineDocumentSelections.size > 0) {
                    lineDocumentAssociations.set(lineNumber, new Set(pendingLineDocumentSelections));
                } else {
                    lineDocumentAssociations.delete(lineNumber);
                }
            }
            hideJournalLineDocumentsModal();
        });
    }

    if (closeJournalLineDocumentsModalButton) {
        closeJournalLineDocumentsModalButton.style.cursor = "pointer";
        closeJournalLineDocumentsModalButton.addEventListener("click", () => {
            hideJournalLineDocumentsModal();
        });
    }
    if (cancelJournalLineDocumentsButton) {
        cancelJournalLineDocumentsButton.addEventListener("click", () => {
            hideJournalLineDocumentsModal();
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
