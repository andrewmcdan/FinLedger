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

let showLoadingOverlayFn, hideLoadingOverlayFn, showErrorModalFn, showMessageModalFn;
let accountsList = [];
let draftJournalLineCounter = 1;
let formatNumberAsCurrencyFn, formatNumberWithCommasFn;
let draftJournalDocumentCounter = 1;
let journalAttachedDocuments = [];
let lineDocumentAssociations = new Map();
let pendingLineDocumentSelections = new Set();
const JOURNAL_REFERENCE_CHECK_DEBOUNCE_MS = 350;
const JOURNAL_REFERENCE_NOT_AVAILABLE_ERROR_CODE = "ERR_JOURNAL_REFERENCE_CODE_NOT_AVAILABLE";
const JOURNAL_REFERENCE_CHECK_PENDING_ERROR_CODE = "ERR_JOURNAL_REFERENCE_CODE_CHECK_PENDING";
const JOURNAL_ENTRY_NOT_BALANCED_ERROR_CODE = "ERR_JOURNAL_ENTRY_NOT_BALANCED";
let refreshJournalSubmitButtonStateFn = () => {};

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
    if (!journalLinesContainer) {
        refreshJournalSubmitButtonStateFn();
        return;
    }
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
    refreshJournalSubmitButtonStateFn();
};

const getTodayIsoDate = () => {
    return new Date().toISOString().split("T")[0];
};

const parseCurrencyInput = (value) => {
    const normalized = String(value || "").replace(/[^0-9.-]/g, "");
    if (!normalized) {
        return 0;
    }
    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed)) {
        return Number.NaN;
    }
    return parsed;
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

export default async function initTransactions({ showLoadingOverlay, hideLoadingOverlay, showErrorModal, showMessageModal }) {
    showLoadingOverlayFn = showLoadingOverlay;
    hideLoadingOverlayFn = hideLoadingOverlay;
    showErrorModalFn = showErrorModal;
    showMessageModalFn = showMessageModal;
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
                updateJournalEntryTotals(draftJournalLines);
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
                    updateJournalEntryTotals(draftJournalLines);
                }
            }
        });
    }

    const journalEntryDateInput = document.getElementById("journal_entry_date");
    if (journalEntryDateInput) {
        journalEntryDateInput.value = getTodayIsoDate();
    }
    const journalEntryForm = document.getElementById("journal_entry_form");
    const journalTypeSelect = document.getElementById("journal_type");
    const journalReferenceInput = document.getElementById("journal_reference");
    const journalReferenceField = document.querySelector("[data-journal-reference-field]");
    const journalReferenceTip = document.querySelector("[data-journal-reference-tip]");
    const journalDescriptionInput = document.getElementById("journal_entry_description");
    const journalSubmitButton = document.getElementById("journal_submit_button");
    const journalResetButton = document.getElementById("journal_reset_button");
    let journalReferenceAvailabilityDebounceTimerId = null;
    let journalReferenceAvailabilityRequestSequence = 0;
    let journalReferenceLastCheckedCode = "";
    let journalReferenceLastKnownAvailable = true;
    let journalReferenceLastAnnouncedUnavailableCode = "";
    let journalReferenceUnavailableTipMessage = "Not available";
    let journalReferenceAvailabilityPending = false;
    let isJournalSubmissionInFlight = false;
    let journalSubmitBlockingIssueCodes = [];

    const getJournalEntryBalanceState = () => {
        if (!draftJournalLines) {
            return {
                totalDebits: 0,
                totalCredits: 0,
                difference: 0,
                hasInvalidAmounts: false,
            };
        }
        const rows = Array.from(draftJournalLines.querySelectorAll("tr"));
        let totalDebits = 0;
        let totalCredits = 0;
        let hasInvalidAmounts = false;
        rows.forEach((row) => {
            const debitInput = row.querySelector("input[data-debit-inputs]");
            const creditInput = row.querySelector("input[data-credit-inputs]");
            const debitAmount = parseCurrencyInput(debitInput?.value || "");
            const creditAmount = parseCurrencyInput(creditInput?.value || "");
            if (Number.isNaN(debitAmount) || Number.isNaN(creditAmount)) {
                hasInvalidAmounts = true;
                return;
            }
            totalDebits += debitAmount;
            totalCredits += creditAmount;
        });
        totalDebits = Number(totalDebits.toFixed(2));
        totalCredits = Number(totalCredits.toFixed(2));
        return {
            totalDebits,
            totalCredits,
            difference: Number((totalDebits - totalCredits).toFixed(2)),
            hasInvalidAmounts,
        };
    };

    const getJournalSubmitBlockingIssues = () => {
        const issues = [];
        const hasAttachedDocuments = Array.isArray(journalAttachedDocuments) && journalAttachedDocuments.length > 0;
        if (!hasAttachedDocuments) {
            issues.push("ERR_NO_FILE_UPLOADED");
        }

        const balanceState = getJournalEntryBalanceState();
        const isBalanced = !balanceState.hasInvalidAmounts && balanceState.difference === 0;
        if (!isBalanced) {
            issues.push(JOURNAL_ENTRY_NOT_BALANCED_ERROR_CODE);
        }

        const normalizedReferenceCode = String(journalReferenceInput?.value || "").trim();
        if (normalizedReferenceCode.length > 0) {
            if (journalReferenceAvailabilityPending || journalReferenceLastCheckedCode !== normalizedReferenceCode) {
                issues.push(JOURNAL_REFERENCE_CHECK_PENDING_ERROR_CODE);
            } else if (!journalReferenceLastKnownAvailable) {
                issues.push(JOURNAL_REFERENCE_NOT_AVAILABLE_ERROR_CODE);
            }
        }

        return issues;
    };

    const focusInputForBlockingIssue = (issueCode) => {
        if (issueCode === "ERR_NO_FILE_UPLOADED") {
            addJournalDocumentButton?.focus();
            return;
        }
        if (issueCode === JOURNAL_ENTRY_NOT_BALANCED_ERROR_CODE) {
            draftJournalLines?.querySelector("input[data-debit-inputs], input[data-credit-inputs]")?.focus();
            return;
        }
        if (issueCode === JOURNAL_REFERENCE_CHECK_PENDING_ERROR_CODE || issueCode === JOURNAL_REFERENCE_NOT_AVAILABLE_ERROR_CODE) {
            journalReferenceInput?.focus();
        }
    };

    const refreshJournalSubmitButtonState = () => {
        if (!journalSubmitButton) {
            return;
        }

        journalSubmitBlockingIssueCodes = getJournalSubmitBlockingIssues();
        const isSoftDisabled = journalSubmitBlockingIssueCodes.length > 0;
        const isHardDisabled = isJournalSubmissionInFlight;

        journalSubmitButton.disabled = isHardDisabled;
        journalSubmitButton.classList.toggle("is-soft-disabled", isSoftDisabled);
        journalSubmitButton.setAttribute("aria-disabled", isSoftDisabled || isHardDisabled ? "true" : "false");
    };
    refreshJournalSubmitButtonStateFn = refreshJournalSubmitButtonState;

    const hydrateJournalReferenceUnavailableTipMessage = async () => {
        try {
            const messagesHelper = await loadMessagesHelper();
            const resolvedMessage = await messagesHelper.getMessage(
                JOURNAL_REFERENCE_NOT_AVAILABLE_ERROR_CODE,
                {},
                journalReferenceUnavailableTipMessage,
            );
            if (typeof resolvedMessage === "string" && resolvedMessage.trim()) {
                journalReferenceUnavailableTipMessage = resolvedMessage.trim();
            }
        } catch (error) {
            // Keep fallback tip text when message catalog is unavailable.
        }
        if (journalReferenceTip) {
            journalReferenceTip.textContent = journalReferenceUnavailableTipMessage;
        }
    };

    const announceJournalReferenceUnavailable = async (normalizedReferenceCode) => {
        if (!normalizedReferenceCode || journalReferenceLastAnnouncedUnavailableCode === normalizedReferenceCode) {
            return;
        }
        journalReferenceLastAnnouncedUnavailableCode = normalizedReferenceCode;
        if (typeof showErrorModalFn === "function") {
            await showErrorModalFn(JOURNAL_REFERENCE_NOT_AVAILABLE_ERROR_CODE, false);
        }
    };

    const clearJournalReferenceAvailabilityDebounce = () => {
        if (journalReferenceAvailabilityDebounceTimerId === null) {
            return;
        }
        clearTimeout(journalReferenceAvailabilityDebounceTimerId);
        journalReferenceAvailabilityDebounceTimerId = null;
    };

    const setJournalReferenceAvailabilityUi = (isAvailable) => {
        const isUnavailable = !isAvailable;
        if (journalReferenceField) {
            journalReferenceField.classList.toggle("is-unavailable", isUnavailable);
        }
        if (journalReferenceTip) {
            journalReferenceTip.classList.toggle("is-visible", isUnavailable);
            journalReferenceTip.setAttribute("aria-hidden", isUnavailable ? "false" : "true");
        }
        if (journalReferenceInput) {
            journalReferenceInput.setAttribute("aria-invalid", isUnavailable ? "true" : "false");
        }
        refreshJournalSubmitButtonState();
    };

    const clearJournalReferenceAvailabilityState = () => {
        clearJournalReferenceAvailabilityDebounce();
        journalReferenceAvailabilityRequestSequence += 1;
        journalReferenceLastCheckedCode = "";
        journalReferenceLastKnownAvailable = true;
        journalReferenceLastAnnouncedUnavailableCode = "";
        journalReferenceAvailabilityPending = false;
        setJournalReferenceAvailabilityUi(true);
    };

    const validateJournalReferenceAvailability = async (rawReferenceCode, { force = false, showUnavailableMessage = true } = {}) => {
        const normalizedReferenceCode = String(rawReferenceCode || "").trim();
        if (!normalizedReferenceCode) {
            journalReferenceLastCheckedCode = "";
            journalReferenceLastKnownAvailable = true;
            journalReferenceLastAnnouncedUnavailableCode = "";
            journalReferenceAvailabilityPending = false;
            setJournalReferenceAvailabilityUi(true);
            return true;
        }

        if (!force && journalReferenceLastCheckedCode === normalizedReferenceCode) {
            journalReferenceAvailabilityPending = false;
            setJournalReferenceAvailabilityUi(journalReferenceLastKnownAvailable);
            return journalReferenceLastKnownAvailable;
        }

        const requestSequence = ++journalReferenceAvailabilityRequestSequence;
        journalReferenceAvailabilityPending = true;
        refreshJournalSubmitButtonState();
        try {
            const query = new URLSearchParams({ reference_code: normalizedReferenceCode });
            const res = await fetchWithAuth(`/api/transactions/reference-code-available?${query.toString()}`);
            if (requestSequence !== journalReferenceAvailabilityRequestSequence) {
                return journalReferenceLastKnownAvailable;
            }
            journalReferenceAvailabilityPending = false;
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                journalReferenceLastCheckedCode = "";
                journalReferenceLastKnownAvailable = true;
                journalReferenceLastAnnouncedUnavailableCode = "";
                setJournalReferenceAvailabilityUi(true);
                return true;
            }
            const isAvailable = data?.is_available === true;
            journalReferenceLastCheckedCode = normalizedReferenceCode;
            journalReferenceLastKnownAvailable = isAvailable;
            if (isAvailable) {
                journalReferenceLastAnnouncedUnavailableCode = "";
            }
            setJournalReferenceAvailabilityUi(isAvailable);
            if (!isAvailable && showUnavailableMessage) {
                await announceJournalReferenceUnavailable(normalizedReferenceCode);
            }
            return isAvailable;
        } catch (error) {
            if (requestSequence !== journalReferenceAvailabilityRequestSequence) {
                return journalReferenceLastKnownAvailable;
            }
            journalReferenceAvailabilityPending = false;
            journalReferenceLastCheckedCode = "";
            journalReferenceLastKnownAvailable = true;
            journalReferenceLastAnnouncedUnavailableCode = "";
            setJournalReferenceAvailabilityUi(true);
            return true;
        }
    };

    const scheduleJournalReferenceAvailabilityValidation = (rawReferenceCode) => {
        const normalizedReferenceCode = String(rawReferenceCode || "").trim();
        clearJournalReferenceAvailabilityDebounce();
        if (!normalizedReferenceCode) {
            clearJournalReferenceAvailabilityState();
            return;
        }
        if (journalReferenceLastCheckedCode !== normalizedReferenceCode) {
            setJournalReferenceAvailabilityUi(true);
            journalReferenceLastAnnouncedUnavailableCode = "";
            journalReferenceAvailabilityPending = true;
            refreshJournalSubmitButtonState();
        } else {
            journalReferenceAvailabilityPending = false;
            refreshJournalSubmitButtonState();
        }
        journalReferenceAvailabilityDebounceTimerId = window.setTimeout(() => {
            void validateJournalReferenceAvailability(normalizedReferenceCode);
        }, JOURNAL_REFERENCE_CHECK_DEBOUNCE_MS);
    };

    if (journalReferenceInput) {
        journalReferenceInput.addEventListener("input", () => {
            scheduleJournalReferenceAvailabilityValidation(journalReferenceInput.value);
        });
        journalReferenceInput.addEventListener("blur", () => {
            clearJournalReferenceAvailabilityDebounce();
            const normalizedReferenceCode = String(journalReferenceInput.value || "").trim();
            if (!normalizedReferenceCode) {
                clearJournalReferenceAvailabilityState();
                return;
            }
            void validateJournalReferenceAvailability(normalizedReferenceCode, { force: true });
        });
    }
    void hydrateJournalReferenceUnavailableTipMessage();
    clearJournalReferenceAvailabilityState();

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
            refreshJournalSubmitButtonState();
        });
    }
    renderJournalAttachedDocumentsList();
    refreshJournalSubmitButtonState();

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

    const rebuildDefaultJournalLines = async () => {
        if (!draftJournalLines) {
            return;
        }
        draftJournalLines.replaceChildren();
        draftJournalLineCounter = 1;
        draftJournalLines.appendChild(await buildJournalLine(draftJournalLineCounter++));
        draftJournalLines.appendChild(await buildJournalLine(draftJournalLineCounter++));
        updateJournalEntryTotals(draftJournalLines);
    };

    const resetJournalEntryDraft = async () => {
        hideJournalLineDocumentsModal();
        journalAttachedDocuments = [];
        draftJournalDocumentCounter = 1;
        lineDocumentAssociations = new Map();
        pendingLineDocumentSelections = new Set();
        if (journalEntryDocumentInput) {
            journalEntryDocumentInput.value = "";
        }
        renderJournalAttachedDocumentsList();
        await rebuildDefaultJournalLines();
        if (journalEntryDateInput) {
            journalEntryDateInput.value = getTodayIsoDate();
        }
        if (journalReferenceInput) {
            journalReferenceInput.value = "";
        }
        clearJournalReferenceAvailabilityState();
        if (journalDescriptionInput) {
            journalDescriptionInput.value = "";
        }
        if (journalTypeSelect) {
            journalTypeSelect.value = "general";
        }
        syncVisibleJournalLineDocumentsModal();
    };

    const buildLinesPayload = () => {
        if (!draftJournalLines) {
            return [];
        }
        const rows = Array.from(draftJournalLines.querySelectorAll("tr"));
        const lines = [];
        let totalDebits = 0;
        let totalCredits = 0;

        rows.forEach((row, index) => {
            const accountSelect = row.querySelector("select");
            const description = row.querySelector("input[data-line-note]")?.value?.trim() || "";
            const debitInput = row.querySelector("input[data-debit-inputs]");
            const creditInput = row.querySelector("input[data-credit-inputs]");
            const debitAmount = parseCurrencyInput(debitInput?.value || "");
            const creditAmount = parseCurrencyInput(creditInput?.value || "");
            if (Number.isNaN(debitAmount) || Number.isNaN(creditAmount)) {
                throw new Error("ERR_INVALID_SELECTION");
            }
            const hasDebit = debitAmount > 0;
            const hasCredit = creditAmount > 0;
            if (!hasDebit && !hasCredit) {
                return;
            }
            if (hasDebit && hasCredit) {
                throw new Error("ERR_INVALID_SELECTION");
            }
            const accountId = Number(accountSelect?.value);
            if (!Number.isSafeInteger(accountId) || accountId <= 0) {
                throw new Error("ERR_INVALID_SELECTION");
            }
            const lineNoText = row.querySelector("td")?.textContent?.trim() || String(index + 1);
            const lineNo = Number.isSafeInteger(Number(lineNoText)) ? Number(lineNoText) : (index + 1);
            const lineDocIds = Array.from(lineDocumentAssociations.get(String(lineNo)) || []);

            const dc = hasDebit ? "debit" : "credit";
            const amount = hasDebit ? debitAmount : creditAmount;
            lines.push({
                line_no: lines.length + 1,
                account_id: accountId,
                dc,
                amount: amount.toFixed(2),
                line_description: description || null,
                document_ids: lineDocIds,
            });
            if (dc === "debit") {
                totalDebits += amount;
            } else {
                totalCredits += amount;
            }
        });

        const roundedDebits = Number(totalDebits.toFixed(2));
        const roundedCredits = Number(totalCredits.toFixed(2));
        if (lines.length < 2 || roundedDebits <= 0 || roundedCredits <= 0 || roundedDebits !== roundedCredits) {
            throw new Error("ERR_INVALID_SELECTION");
        }

        return lines;
    };

    const submitJournalEntryForApproval = async () => {
        const entryDate = journalEntryDateInput?.value || getTodayIsoDate();
        const journalType = String(journalTypeSelect?.value || "general").toLowerCase();
        const description = String(journalDescriptionInput?.value || "").trim();
        const referenceCode = String(journalReferenceInput?.value || "").trim();
        if (referenceCode) {
            clearJournalReferenceAvailabilityDebounce();
            const isReferenceCodeAvailable = await validateJournalReferenceAvailability(referenceCode, { force: true, showUnavailableMessage: false });
            if (!isReferenceCodeAvailable) {
                journalReferenceInput?.focus();
                throw new Error(JOURNAL_REFERENCE_NOT_AVAILABLE_ERROR_CODE);
            }
        }
        if (!description) {
            throw new Error("ERR_PLEASE_FILL_ALL_FIELDS");
        }
        if (!Array.isArray(journalAttachedDocuments) || journalAttachedDocuments.length === 0) {
            throw new Error("ERR_NO_FILE_UPLOADED");
        }
        const lines = buildLinesPayload();

        const payloadDocuments = journalAttachedDocuments.map((doc, index) => ({
            client_document_id: doc.id,
            title: doc.name,
            upload_index: index,
            meta_data: {
                original_name: doc.name,
                file_size: doc.size,
                last_modified: doc.lastModified,
            },
        }));

        const payload = {
            journal_type: journalType,
            entry_date: entryDate,
            description,
            reference_code: referenceCode || null,
            documents: payloadDocuments,
            journal_entry_document_ids: journalAttachedDocuments.map((doc) => doc.id),
            lines,
        };

        const formData = new FormData();
        formData.append("payload", JSON.stringify(payload));
        journalAttachedDocuments.forEach((doc) => {
            if (doc.file instanceof File) {
                formData.append("documents", doc.file, doc.name);
            }
        });

        isJournalSubmissionInFlight = true;
        refreshJournalSubmitButtonState();
        showLoadingOverlayFn();
        try {
            const res = await fetchWithAuth("/api/transactions/new-journal-entry", {
                method: "POST",
                body: formData,
            });
            let data = null;
            try {
                data = await res.json();
            } catch (parseError) {
                data = null;
            }
            if (!res.ok) {
                const apiError = data?.errorCode || data?.error || "ERR_INTERNAL_SERVER";
                throw new Error(apiError);
            }
            if (typeof showMessageModalFn === "function") {
                await showMessageModalFn(data?.messageCode || "MSG_JOURNAL_ENTRY_CREATED_SUCCESS", true);
            }
            await resetJournalEntryDraft();
        } finally {
            isJournalSubmissionInFlight = false;
            refreshJournalSubmitButtonState();
            hideLoadingOverlayFn();
        }
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

    if (journalEntryForm) {
        journalEntryForm.addEventListener("submit", (event) => {
            event.preventDefault();
        });
    }

    if (journalSubmitButton) {
        journalSubmitButton.addEventListener("click", async () => {
            refreshJournalSubmitButtonState();
            if (!isJournalSubmissionInFlight && journalSubmitBlockingIssueCodes.length > 0) {
                const firstBlockingIssueCode = journalSubmitBlockingIssueCodes[0];
                focusInputForBlockingIssue(firstBlockingIssueCode);
                showErrorModalFn(firstBlockingIssueCode, false);
                return;
            }
            try {
                await submitJournalEntryForApproval();
            } catch (error) {
                showErrorModalFn(error?.message || "ERR_INTERNAL_SERVER", false);
            }
        });
    }

    if (journalResetButton) {
        journalResetButton.addEventListener("click", async () => {
            try {
                await resetJournalEntryDraft();
            } catch (error) {
                showErrorModalFn(error?.message || "ERR_INTERNAL_SERVER", false);
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

async function loadMessagesHelper() {
    const moduleUrl = new URL("/js/utils/messages.js", window.location.origin).href;
    const module = await import(moduleUrl);
    const { getMessage } = module;
    return { getMessage };
}

async function loadFetchWithAuth() {
    const moduleUrl = new URL("/js/utils/fetch_with_auth.js", window.location.origin).href;
    const module = await import(moduleUrl);
    const { fetchWithAuth } = module;
    return { fetchWithAuth };
}
