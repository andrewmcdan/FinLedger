const authHelpers = await loadFetchWithAuth();
const { fetchWithAuth } = authHelpers;
const domHelpers = await loadDomHelpers();
const { createCell, createInput, createSelect, createTextarea } = domHelpers;

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
const LEDGER_DEFAULT_LIMIT = 200;
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
    let totalDebit = 0;
    let totalCredit = 0;
    debitCells.forEach((input) => {
        const value = parseFloat(input.value.replace(/[^0-9.-]/g, ""));
        if (!isNaN(value)) {
            totalDebit += value;
        }
    });
    creditCells.forEach((input) => {
        const value = parseFloat(input.value.replace(/[^0-9.-]/g, ""));
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

const formatDateForDisplay = (value) => {
    if (!value) {
        return "--";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return String(value);
    }
    return parsed.toISOString().slice(0, 10);
};

const formatReferenceCode = (entry) => {
    if (entry?.reference_code) {
        return String(entry.reference_code);
    }
    if (!entry?.id) {
        return "--";
    }
    return `JE-${String(entry.id).padStart(8, "0")}`;
};

const normalizeQueueStatus = (status) => {
    const normalized = String(status || "")
        .trim()
        .toLowerCase();
    if (!normalized) {
        return "pending";
    }
    if (["pending", "approved", "rejected", "all"].includes(normalized)) {
        return normalized;
    }
    return "pending";
};

const toQueueStatusLabel = (status) => {
    const normalized = normalizeQueueStatus(status);
    if (normalized === "approved") {
        return "Approved";
    }
    if (normalized === "rejected") {
        return "Rejected";
    }
    if (normalized === "all") {
        return "All";
    }
    return "Pending";
};

const toQueueBadgeClass = (status) => {
    const normalized = normalizeQueueStatus(status);
    if (normalized === "approved") {
        return "badge badge--approved";
    }
    if (normalized === "rejected") {
        return "badge badge--rejected";
    }
    return "badge badge--pending";
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
    lineDocumentsButton.title = "Manage documents attached to this journal line.";
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
    removeButton.title = "Remove this journal line.";
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
    const numericHelpers = await loadNumericHelpers();
    formatNumberAsCurrencyFn = numericHelpers.formatNumberAsCurrency;
    formatNumberWithCommasFn = numericHelpers.formatNumberWithCommas;

    const formatCurrencyDisplay = (value) => {
        const numericValue = Number(value);
        const normalizedValue = Number.isFinite(numericValue) ? numericValue : 0;
        if (typeof formatNumberAsCurrencyFn === "function") {
            return formatNumberAsCurrencyFn(normalizedValue);
        }
        return `$${normalizedValue.toFixed(2)}`;
    };

    const journalQueueSection = document.querySelector("[data-journal-queue-section]");
    const journalQueueTableBody = document.querySelector("[data-journal-queue]");
    const queueStatusFilter = document.querySelector("[data-queue-status-filter]");
    const queueFromDateInput = document.querySelector("[data-queue-from-date]");
    const queueToDateInput = document.querySelector("[data-queue-to-date]");
    const queueSearchInput = document.querySelector("[data-queue-search]");
    const queueApplyFiltersButton = document.getElementById("queue_apply_filters_button");
    const queueClearFiltersButton = document.getElementById("queue_clear_filters_button");
    const queueRefreshButton = document.querySelector("[data-refresh]");
    const queueStatusLabel = document.querySelector("[data-status]");
    const canApproveQueueEntries = journalQueueSection?.dataset?.canApprove === "true";
    let activeQueueJournalEntryId = null;
    let queueModalBusy = false;
    let queueFetchSequence = 0;

    const queueModal = document.getElementById("journal_queue_view_modal");
    const closeQueueModalButtonTop = document.getElementById("close_journal_queue_view_modal");
    const closeQueueModalButtonBottom = document.getElementById("journal_queue_modal_close_button");
    const queueModalReferenceLabel = document.querySelector("[data-journal-queue-modal-reference]");
    const queueModalStatusLabel = document.querySelector("[data-journal-queue-modal-status]");
    const queueModalCreatedByLabel = document.querySelector("[data-journal-queue-modal-created-by]");
    const queueModalEntryDateLabel = document.querySelector("[data-journal-queue-modal-entry-date]");
    const queueModalTotalDebitsLabel = document.querySelector("[data-journal-queue-modal-total-debits]");
    const queueModalTotalCreditsLabel = document.querySelector("[data-journal-queue-modal-total-credits]");
    const queueModalJournalTypeLabel = document.querySelector("[data-journal-queue-modal-journal-type]");
    const queueModalDescription = document.querySelector("[data-journal-queue-modal-description]");
    const queueModalDocumentsList = document.querySelector("[data-journal-queue-modal-documents]");
    const queueModalLinesBody = document.querySelector("[data-journal-queue-modal-lines]");
    const queueModalManagerCommentInput = document.getElementById("journal_queue_manager_comment");
    const queueModalApproveButton = document.getElementById("journal_queue_modal_approve_button");
    const queueModalRejectButton = document.getElementById("journal_queue_modal_reject_button");

    const ledgerRowsBody = document.querySelector("[data-ledger-rows]");
    const ledgerDebitRowsBody = document.querySelector("[data-t-account-debit]");
    const ledgerCreditRowsBody = document.querySelector("[data-t-account-credit]");
    const ledgerAccountFilterSelect = document.querySelector("[data-ledger-account-filter]");
    const ledgerFromDateInput = document.querySelector("[data-ledger-from-date]");
    const ledgerToDateInput = document.querySelector("[data-ledger-to-date]");
    const ledgerSearchInput = document.querySelector("[data-ledger-search]");
    const ledgerApplyFiltersButton = document.getElementById("ledger_apply_filters_button");
    const ledgerClearFiltersButton = document.getElementById("ledger_clear_filters_button");
    let ledgerFetchSequence = 0;

    const queuePageDownBtn = document.querySelector("[data-queue-page-down]");
    const queuePageUpBtn = document.querySelector("[data-queue-page-up]");
    const queueCurrentPageEl = document.querySelector("[data-queue-current-page]");
    const queueTotalPagesEl = document.querySelector("[data-queue-total-pages]");
    const queuePerPageSelect = document.querySelector("[data-queue-per-page-select]");
    let queueCurrentPage = 1;
    let queuePerPage = queuePerPageSelect ? parseInt(queuePerPageSelect.value, 10) : 10;
    let queueTotal = 0;

    const ledgerPageDownBtn = document.querySelector("[data-ledger-page-down]");
    const ledgerPageUpBtn = document.querySelector("[data-ledger-page-up]");
    const ledgerCurrentPageEl = document.querySelector("[data-ledger-current-page]");
    const ledgerTotalPagesEl = document.querySelector("[data-ledger-total-pages]");
    const ledgerPerPageSelect = document.querySelector("[data-ledger-per-page-select]");
    let ledgerCurrentPage = 1;
    let ledgerPerPage = ledgerPerPageSelect ? parseInt(ledgerPerPageSelect.value, 10) : 10;
    let ledgerTotal = 0;

    const updateQueuePaginationDisplay = () => {
        if (queueCurrentPageEl) queueCurrentPageEl.textContent = String(queueCurrentPage);
        if (queueTotalPagesEl) queueTotalPagesEl.textContent = String(Math.max(1, Math.ceil(queueTotal / queuePerPage)));
    };

    const updateLedgerPaginationDisplay = () => {
        if (ledgerCurrentPageEl) ledgerCurrentPageEl.textContent = String(ledgerCurrentPage);
        if (ledgerTotalPagesEl) ledgerTotalPagesEl.textContent = String(Math.max(1, Math.ceil(ledgerTotal / ledgerPerPage)));
    };

    const resolveFileNameFromResponse = (response, fallbackName = "journal-document") => {
        const contentDisposition = String(response.headers.get("content-disposition") || "");
        const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
        if (utf8Match && utf8Match[1]) {
            try {
                return decodeURIComponent(utf8Match[1]);
            } catch {
                return utf8Match[1];
            }
        }
        const fallbackMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
        if (fallbackMatch && fallbackMatch[1]) {
            return fallbackMatch[1];
        }
        return fallbackName;
    };

    const parseErrorCodeFromResponse = async (response) => {
        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        if (!contentType.includes("application/json")) {
            return "ERR_INTERNAL_SERVER";
        }
        const payload = await response.json().catch(() => null);
        return payload?.errorCode || payload?.error || "ERR_INTERNAL_SERVER";
    };

    const triggerBrowserDownload = ({ blob, fileName }) => {
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = fileName || "journal-document";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(downloadUrl);
    };

    const downloadDocumentFromUrl = async (downloadUrl, fallbackName = "journal-document") => {
        if (!downloadUrl) {
            showErrorModalFn("ERR_INVALID_SELECTION", false);
            return;
        }
        showLoadingOverlayFn();
        try {
            const response = await fetchWithAuth(downloadUrl, { method: "GET" });
            if (!response.ok) {
                const errorCode = await parseErrorCodeFromResponse(response);
                throw new Error(errorCode);
            }
            const responseBlob = await response.blob();
            const resolvedFileName = resolveFileNameFromResponse(response, fallbackName);
            triggerBrowserDownload({ blob: responseBlob, fileName: resolvedFileName });
        } catch (error) {
            showErrorModalFn(error?.message || "ERR_INTERNAL_SERVER", false);
        } finally {
            hideLoadingOverlayFn();
        }
    };

    const markQueueUpdated = (label = null) => {
        if (!queueStatusLabel) {
            return;
        }
        if (label) {
            queueStatusLabel.textContent = label;
            return;
        }
        const now = new Date();
        queueStatusLabel.textContent = `Updated ${now.toISOString().slice(11, 19)}`;
    };

    const setQueueModalVisible = (visible) => {
        if (!queueModal) {
            return;
        }
        queueModal.classList.toggle("is-visible", visible);
        queueModal.setAttribute("aria-hidden", visible ? "false" : "true");
    };

    const closeQueueModal = () => {
        activeQueueJournalEntryId = null;
        setQueueModalVisible(false);
    };

    const setQueueDecisionButtonsState = ({ pending = false, busy = false } = {}) => {
        if (queueModalApproveButton) {
            queueModalApproveButton.disabled = !pending || busy;
        }
        if (queueModalRejectButton) {
            queueModalRejectButton.disabled = !pending || busy;
        }
        if (queueModalManagerCommentInput) {
            queueModalManagerCommentInput.readOnly = !pending || !canApproveQueueEntries || busy;
        }
    };

    const buildQueueRow = (entry) => {
        const row = document.createElement("tr");
        row.setAttribute("data-journal-queue-row-id", String(entry.id));

        const idCell = createCell({ text: formatReferenceCode(entry) });
        const dateCell = createCell({ text: formatDateForDisplay(entry.entry_date) });
        const descriptionCell = createCell({ text: entry.description || "-", isLongText: true });
        const createdByCell = createCell({ text: entry.created_by_username || "-" });
        const debitCell = createCell({ text: formatCurrencyDisplay(entry.total_debits) });
        const creditCell = createCell({ text: formatCurrencyDisplay(entry.total_credits) });
        const statusCell = createCell({});
        const statusBadge = document.createElement("span");
        statusBadge.className = toQueueBadgeClass(entry.status);
        statusBadge.textContent = toQueueStatusLabel(entry.status);
        statusCell.appendChild(statusBadge);
        const managerCommentCell = createCell({ text: entry.manager_comment || "-", isLongText: true });
        const actionsCell = createCell({});
        const viewButton = document.createElement("button");
        viewButton.type = "button";
        viewButton.className = "button-small";
        viewButton.textContent = "View";
        viewButton.title = "View the full journal entry details.";
        viewButton.setAttribute("data-journal-queue-view-button", "");
        viewButton.setAttribute("data-journal-entry-id", String(entry.id));
        actionsCell.appendChild(viewButton);

        row.appendChild(idCell);
        row.appendChild(dateCell);
        row.appendChild(descriptionCell);
        row.appendChild(createdByCell);
        row.appendChild(debitCell);
        row.appendChild(creditCell);
        row.appendChild(statusCell);
        row.appendChild(managerCommentCell);
        row.appendChild(actionsCell);
        return row;
    };

    const renderQueueRows = (entries = []) => {
        if (!journalQueueTableBody) {
            return;
        }
        journalQueueTableBody.replaceChildren();
        if (!Array.isArray(entries) || entries.length === 0) {
            const row = document.createElement("tr");
            const cell = createCell({ text: "No journal entries found for the selected filters." });
            cell.colSpan = 9;
            cell.className = "meta";
            row.appendChild(cell);
            journalQueueTableBody.appendChild(row);
            return;
        }

        entries.forEach((entry) => {
            journalQueueTableBody.appendChild(buildQueueRow(entry));
        });
    };

    const renderQueueModalDocuments = (documents = []) => {
        if (!queueModalDocumentsList) {
            return;
        }
        queueModalDocumentsList.replaceChildren();
        if (!Array.isArray(documents) || documents.length === 0) {
            const empty = document.createElement("li");
            empty.className = "meta";
            empty.textContent = "No documents attached.";
            queueModalDocumentsList.appendChild(empty);
            return;
        }

        documents.forEach((doc, index) => {
            const item = document.createElement("li");
            item.className = "journal-entry-document-item";
            const title = doc.title || doc.original_file_name || `Document ${index + 1}`;
            const extension = doc.file_extension || "";
            const uploadedAt = formatDateForDisplay(doc.upload_at);
            const labelPrefix = document.createTextNode(`${index + 1}. `);
            item.appendChild(labelPrefix);
            const link = document.createElement("a");
            link.href = doc.download_url || "#";
            link.textContent = `${title}${extension ? ` (${extension})` : ""}`;
            link.setAttribute("data-document-download-url", doc.download_url || "");
            link.setAttribute("data-document-download-name", title);
            item.appendChild(link);
            item.appendChild(document.createTextNode(` - ${uploadedAt}`));
            queueModalDocumentsList.appendChild(item);
        });
    };

    const renderQueueModalLines = (lines = []) => {
        if (!queueModalLinesBody) {
            return;
        }
        queueModalLinesBody.replaceChildren();

        if (!Array.isArray(lines) || lines.length === 0) {
            const row = document.createElement("tr");
            const cell = createCell({ text: "No journal lines available." });
            cell.colSpan = 6;
            cell.className = "meta";
            row.appendChild(cell);
            queueModalLinesBody.appendChild(row);
            return;
        }

        lines.forEach((line) => {
            const row = document.createElement("tr");
            const lineNumberCell = createCell({ text: line.line_no });
            const accountCell = createCell({ text: line.account_name || line.account_id || "-" });
            const descriptionCell = createCell({ text: line.line_description || "-", isLongText: true });
            const debitCell = createCell({ text: line.dc === "debit" ? formatCurrencyDisplay(line.amount) : "$0.00" });
            const creditCell = createCell({ text: line.dc === "credit" ? formatCurrencyDisplay(line.amount) : "$0.00" });
            const lineDocsCell = createCell({});

            if (Array.isArray(line.documents) && line.documents.length > 0) {
                const docsContainer = document.createElement("div");
                docsContainer.className = "journal-line-doc-pills";
                line.documents.forEach((doc) => {
                    const docPill = document.createElement("a");
                    docPill.className = "journal-line-doc-pill";
                    docPill.href = doc.download_url || "#";
                    docPill.setAttribute("data-document-download-url", doc.download_url || "");
                    docPill.setAttribute("data-document-download-name", doc.title || doc.original_file_name || "Document");
                    docPill.title = doc.title || doc.original_file_name || "Document";
                    docPill.textContent = doc.title || doc.original_file_name || "Document";
                    docsContainer.appendChild(docPill);
                });
                lineDocsCell.appendChild(docsContainer);
            } else {
                lineDocsCell.textContent = "-";
            }

            row.appendChild(lineNumberCell);
            row.appendChild(accountCell);
            row.appendChild(descriptionCell);
            row.appendChild(debitCell);
            row.appendChild(creditCell);
            row.appendChild(lineDocsCell);
            queueModalLinesBody.appendChild(row);
        });
    };

    const hydrateQueueModal = (detail) => {
        const journalEntry = detail?.journal_entry || {};
        if (queueModalReferenceLabel) {
            queueModalReferenceLabel.textContent = `Reference: ${formatReferenceCode(journalEntry)}`;
        }
        if (queueModalStatusLabel) {
            queueModalStatusLabel.textContent = toQueueStatusLabel(journalEntry.status);
        }
        if (queueModalCreatedByLabel) {
            queueModalCreatedByLabel.textContent = journalEntry.created_by_username || "--";
        }
        if (queueModalEntryDateLabel) {
            queueModalEntryDateLabel.textContent = formatDateForDisplay(journalEntry.entry_date);
        }
        if (queueModalTotalDebitsLabel) {
            queueModalTotalDebitsLabel.textContent = formatCurrencyDisplay(journalEntry.total_debits);
        }
        if (queueModalTotalCreditsLabel) {
            queueModalTotalCreditsLabel.textContent = formatCurrencyDisplay(journalEntry.total_credits);
        }
        if (queueModalJournalTypeLabel) {
            const normalizedJournalType = String(journalEntry.journal_type || "").trim();
            queueModalJournalTypeLabel.textContent = normalizedJournalType ? `${normalizedJournalType.charAt(0).toUpperCase()}${normalizedJournalType.slice(1)}` : "--";
        }
        if (queueModalDescription) {
            queueModalDescription.value = journalEntry.description || "";
        }
        if (queueModalManagerCommentInput) {
            queueModalManagerCommentInput.value = journalEntry.manager_comment || "";
            queueModalManagerCommentInput.placeholder = canApproveQueueEntries && journalEntry.status === "pending" ? "Required when rejecting." : "Manager comment (if provided).";
        }
        renderQueueModalDocuments(detail?.documents || []);
        renderQueueModalLines(detail?.lines || []);
        setQueueDecisionButtonsState({
            pending: canApproveQueueEntries && normalizeQueueStatus(journalEntry.status) === "pending",
            busy: false,
        });
    };

    const openQueueModalForJournalEntry = async (journalEntryId) => {
        if (!queueModal) {
            return;
        }
        const normalizedJournalEntryId = Number(journalEntryId);
        if (!Number.isSafeInteger(normalizedJournalEntryId) || normalizedJournalEntryId <= 0) {
            showErrorModalFn("ERR_INVALID_SELECTION", false);
            return;
        }

        queueModalBusy = true;
        showLoadingOverlayFn();
        try {
            const res = await fetchWithAuth(`/api/transactions/journal-entry/${normalizedJournalEntryId}`);
            const detail = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(detail?.errorCode || detail?.error || "ERR_INTERNAL_SERVER");
            }
            activeQueueJournalEntryId = normalizedJournalEntryId;
            hydrateQueueModal(detail);
            setQueueModalVisible(true);
        } catch (error) {
            showErrorModalFn(error?.message || "ERR_INTERNAL_SERVER", false);
        } finally {
            queueModalBusy = false;
            hideLoadingOverlayFn();
        }
    };

    const loadJournalQueue = async (page = queueCurrentPage) => {
        if (!journalQueueTableBody) {
            return;
        }

        queueCurrentPage = page;
        const currentSequence = ++queueFetchSequence;
        const status = normalizeQueueStatus(queueStatusFilter?.value || "pending");
        const fromDate = String(queueFromDateInput?.value || "").trim();
        const toDate = String(queueToDateInput?.value || "").trim();
        const search = String(queueSearchInput?.value || "").trim();

        const offset = (page - 1) * queuePerPage;
        const query = new URLSearchParams({ status, limit: String(queuePerPage), offset: String(offset) });
        if (fromDate) {
            query.set("from_date", fromDate);
        }
        if (toDate) {
            query.set("to_date", toDate);
        }
        if (search) {
            query.set("search", search);
        }

        showLoadingOverlayFn();
        try {
            const res = await fetchWithAuth(`/api/transactions/journal-queue?${query.toString()}`);
            const payload = await res.json().catch(() => null);
            if (currentSequence !== queueFetchSequence) {
                return;
            }
            if (!res.ok) {
                throw new Error(payload?.errorCode || payload?.error || "ERR_INTERNAL_SERVER");
            }
            queueTotal = payload?.pagination?.total ?? 0;
            updateQueuePaginationDisplay();
            renderQueueRows(payload?.journal_entries || []);
            markQueueUpdated();
        } catch (error) {
            if (currentSequence !== queueFetchSequence) {
                return;
            }
            renderQueueRows([]);
            showErrorModalFn(error?.message || "ERR_INTERNAL_SERVER", false);
        } finally {
            hideLoadingOverlayFn();
        }
    };

    const submitQueueDecision = async (decision) => {
        if (!canApproveQueueEntries || queueModalBusy) {
            return;
        }
        const journalEntryId = activeQueueJournalEntryId;
        if (!Number.isSafeInteger(Number(journalEntryId)) || Number(journalEntryId) <= 0) {
            showErrorModalFn("ERR_INVALID_SELECTION", false);
            return;
        }

        const managerComment = String(queueModalManagerCommentInput?.value || "").trim();
        if (decision === "reject" && !managerComment) {
            queueModalManagerCommentInput?.focus();
            showErrorModalFn("ERR_JOURNAL_REJECTION_REASON_REQUIRED", false);
            return;
        }

        const endpoint = decision === "approve" ? `/api/transactions/journal-entry/${journalEntryId}/approve` : `/api/transactions/journal-entry/${journalEntryId}/reject`;

        queueModalBusy = true;
        setQueueDecisionButtonsState({ pending: true, busy: true });
        showLoadingOverlayFn();
        try {
            const res = await fetchWithAuth(endpoint, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    manager_comment: managerComment || null,
                }),
            });
            const payload = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(payload?.errorCode || payload?.error || "ERR_INTERNAL_SERVER");
            }
            await showMessageModalFn(payload?.messageCode || "MSG_JOURNAL_QUEUE_REFRESHED", true);
            closeQueueModal();
            await loadJournalQueue(1);
        } catch (error) {
            showErrorModalFn(error?.message || "ERR_INTERNAL_SERVER", false);
            setQueueDecisionButtonsState({ pending: true, busy: false });
        } finally {
            queueModalBusy = false;
            hideLoadingOverlayFn();
        }
    };

    if (journalQueueTableBody) {
        journalQueueTableBody.addEventListener("click", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }
            const viewButton = target.closest("[data-journal-queue-view-button]");
            if (!viewButton) {
                return;
            }
            const journalEntryId = viewButton.getAttribute("data-journal-entry-id");
            void openQueueModalForJournalEntry(journalEntryId);
        });
    }

    queueModal?.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        const downloadLink = target.closest("[data-document-download-url]");
        if (!(downloadLink instanceof HTMLElement)) {
            return;
        }
        event.preventDefault();
        const downloadUrl = downloadLink.getAttribute("data-document-download-url") || "";
        const downloadName = downloadLink.getAttribute("data-document-download-name") || "journal-document";
        void downloadDocumentFromUrl(downloadUrl, downloadName);
    });

    queueApplyFiltersButton?.addEventListener("click", () => {
        void loadJournalQueue(1);
    });

    queueClearFiltersButton?.addEventListener("click", () => {
        if (queueStatusFilter) {
            queueStatusFilter.value = "pending";
        }
        if (queueFromDateInput) {
            queueFromDateInput.value = "";
        }
        if (queueToDateInput) {
            queueToDateInput.value = "";
        }
        if (queueSearchInput) {
            queueSearchInput.value = "";
        }
        void loadJournalQueue(1);
    });

    queueRefreshButton?.addEventListener("click", () => {
        void loadJournalQueue(1);
    });

    queueSearchInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            void loadJournalQueue(1);
        }
    });

    queuePerPageSelect?.addEventListener("change", () => {
        queuePerPage = parseInt(queuePerPageSelect.value, 10);
        void loadJournalQueue(1);
    });

    queuePageDownBtn?.addEventListener("click", () => {
        if (queueCurrentPage > 1) {
            void loadJournalQueue(queueCurrentPage - 1);
        }
    });

    queuePageUpBtn?.addEventListener("click", () => {
        if (queueCurrentPage * queuePerPage < queueTotal) {
            void loadJournalQueue(queueCurrentPage + 1);
        }
    });

    closeQueueModalButtonTop?.addEventListener("click", closeQueueModal);
    closeQueueModalButtonBottom?.addEventListener("click", closeQueueModal);
    queueModalApproveButton?.addEventListener("click", () => {
        void submitQueueDecision("approve");
    });
    queueModalRejectButton?.addEventListener("click", () => {
        void submitQueueDecision("reject");
    });

    if (journalQueueTableBody) {
        await loadJournalQueue();
        const urlParamsHelper = await loadUrlParamHelper();
        const journalIdFromUrl = urlParamsHelper.getUrlParam("journal_id");
        if (journalIdFromUrl) {
            const parsedJournalIdFromUrl = Number(journalIdFromUrl);
            if (Number.isSafeInteger(parsedJournalIdFromUrl) && parsedJournalIdFromUrl > 0) {
                void openQueueModalForJournalEntry(parsedJournalIdFromUrl);
            }
        }
    }

    const setLedgerAccountOptions = () => {
        if (!ledgerAccountFilterSelect) {
            return;
        }
        const previousValue = ledgerAccountFilterSelect.value || "all";
        ledgerAccountFilterSelect.replaceChildren();

        const allAccountsOption = document.createElement("option");
        allAccountsOption.value = "all";
        allAccountsOption.textContent = "All Accounts";
        ledgerAccountFilterSelect.appendChild(allAccountsOption);

        accountsList
            .slice()
            .sort((a, b) => String(a.account_name || "").localeCompare(String(b.account_name || "")))
            .forEach((account) => {
                const option = document.createElement("option");
                option.value = String(account.id);
                option.textContent = account.account_name || `Account ${account.id}`;
                ledgerAccountFilterSelect.appendChild(option);
            });

        const selectedCandidate = String(previousValue);
        const hasPreviousOption = Array.from(ledgerAccountFilterSelect.options).some((option) => option.value === selectedCandidate);
        ledgerAccountFilterSelect.value = hasPreviousOption ? selectedCandidate : "all";
    };

    const buildPostingReferenceLabel = (row) => {
        if (row?.pr_journal_ref) {
            return String(row.pr_journal_ref);
        }
        if (row?.reference_code) {
            return String(row.reference_code);
        }
        if (row?.journal_entry_id) {
            return `JE-${String(row.journal_entry_id).padStart(8, "0")}`;
        }
        return "--";
    };

    const appendPostingReferenceElement = (cell, row) => {
        const postingReferenceLabel = buildPostingReferenceLabel(row);
        const journalEntryId = Number(row?.journal_entry_id);
        const canNavigateToQueueEntry = !!journalQueueTableBody && Number.isSafeInteger(journalEntryId) && journalEntryId > 0;
        if (!canNavigateToQueueEntry) {
            cell.textContent = postingReferenceLabel;
            return;
        }
        const link = document.createElement("a");
        link.href = `#/transactions?journal_id=${journalEntryId}`;
        link.textContent = postingReferenceLabel;
        cell.appendChild(link);
    };

    const renderLedgerRows = (entries = []) => {
        if (!ledgerRowsBody) {
            return;
        }
        ledgerRowsBody.replaceChildren();
        if (!Array.isArray(entries) || entries.length === 0) {
            const row = document.createElement("tr");
            const cell = createCell({ text: "No posted ledger entries found." });
            cell.colSpan = 7;
            cell.className = "meta";
            row.appendChild(cell);
            ledgerRowsBody.appendChild(row);
            return;
        }

        entries.forEach((entry) => {
            const row = document.createElement("tr");
            const dateCell = createCell({ text: formatDateForDisplay(entry.entry_date) });
            const accountCell = createCell({ text: entry.account_name || "-" });
            const descriptionCell = createCell({ text: entry.description || "-", isLongText: true });
            const postingReferenceCell = createCell({});
            appendPostingReferenceElement(postingReferenceCell, entry);
            const debitCell = createCell({ text: entry.dc === "debit" ? formatCurrencyDisplay(entry.amount) : "$0.00" });
            const creditCell = createCell({ text: entry.dc === "credit" ? formatCurrencyDisplay(entry.amount) : "$0.00" });
            const balanceCell = createCell({ text: formatCurrencyDisplay(entry.running_balance) });

            row.appendChild(dateCell);
            row.appendChild(accountCell);
            row.appendChild(descriptionCell);
            row.appendChild(postingReferenceCell);
            row.appendChild(debitCell);
            row.appendChild(creditCell);
            row.appendChild(balanceCell);
            ledgerRowsBody.appendChild(row);
        });
    };

    const renderTAccountRows = (targetBody, entries = [], emptyMessage = "No activity for current filters.") => {
        if (!targetBody) {
            return;
        }
        targetBody.replaceChildren();
        if (!Array.isArray(entries) || entries.length === 0) {
            const row = document.createElement("tr");
            const cell = createCell({ text: emptyMessage });
            cell.colSpan = 3;
            cell.className = "meta";
            row.appendChild(cell);
            targetBody.appendChild(row);
            return;
        }

        entries.forEach((entry) => {
            const row = document.createElement("tr");
            const dateCell = createCell({ text: formatDateForDisplay(entry.entry_date) });
            const postingReferenceCell = createCell({});
            appendPostingReferenceElement(postingReferenceCell, entry);
            const amountCell = createCell({ text: formatCurrencyDisplay(entry.amount) });

            row.appendChild(dateCell);
            row.appendChild(postingReferenceCell);
            row.appendChild(amountCell);
            targetBody.appendChild(row);
        });
    };

    const loadLedgerEntries = async (page = ledgerCurrentPage) => {
        if (!ledgerRowsBody) {
            return;
        }
        ledgerCurrentPage = page;
        const currentSequence = ++ledgerFetchSequence;
        const accountId = String(ledgerAccountFilterSelect?.value || "all").trim();
        const fromDate = String(ledgerFromDateInput?.value || "").trim();
        const toDate = String(ledgerToDateInput?.value || "").trim();
        const search = String(ledgerSearchInput?.value || "").trim();
        const offset = (page - 1) * ledgerPerPage;
        const query = new URLSearchParams({
            limit: String(ledgerPerPage),
            offset: String(offset),
        });
        if (accountId && accountId !== "all") {
            query.set("account_id", accountId);
        }
        if (fromDate) {
            query.set("from_date", fromDate);
        }
        if (toDate) {
            query.set("to_date", toDate);
        }
        if (search) {
            query.set("search", search);
        }

        showLoadingOverlayFn();
        try {
            const res = await fetchWithAuth(`/api/transactions/ledger?${query.toString()}`);
            const payload = await res.json().catch(() => null);
            if (currentSequence !== ledgerFetchSequence) {
                return;
            }
            if (!res.ok) {
                throw new Error(payload?.errorCode || payload?.error || "ERR_INTERNAL_SERVER");
            }
            ledgerTotal = payload?.pagination?.total ?? 0;
            updateLedgerPaginationDisplay();
            renderLedgerRows(payload?.ledger_entries || []);
            renderTAccountRows(ledgerDebitRowsBody, payload?.t_account?.debit_entries || [], "No debit activity for current filters.");
            renderTAccountRows(ledgerCreditRowsBody, payload?.t_account?.credit_entries || [], "No credit activity for current filters.");
        } catch (error) {
            if (currentSequence !== ledgerFetchSequence) {
                return;
            }
            renderLedgerRows([]);
            renderTAccountRows(ledgerDebitRowsBody, [], "No debit activity for current filters.");
            renderTAccountRows(ledgerCreditRowsBody, [], "No credit activity for current filters.");
            showErrorModalFn(error?.message || "ERR_INTERNAL_SERVER", false);
        } finally {
            hideLoadingOverlayFn();
        }
    };

    if (ledgerRowsBody) {
        const ledgerSection = document.querySelector('[aria-labelledby="ledger_title"]');
        let shouldScrollToLedger = false;
        setLedgerAccountOptions();
        const urlParamsHelper = await loadUrlParamHelper();
        const accountIdFromUrl = String(urlParamsHelper.getUrlParam("account_id") || "").trim();
        if (accountIdFromUrl && ledgerAccountFilterSelect) {
            const hasMatchingAccountOption = Array.from(ledgerAccountFilterSelect.options).some((option) => option.value === accountIdFromUrl);
            if (hasMatchingAccountOption) {
                ledgerAccountFilterSelect.value = accountIdFromUrl;
                shouldScrollToLedger = true;
            }
        }
        await loadLedgerEntries();
        if (shouldScrollToLedger && ledgerSection) {
            requestAnimationFrame(() => {
                ledgerSection.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        }
    }

    ledgerApplyFiltersButton?.addEventListener("click", () => {
        void loadLedgerEntries(1);
    });
    ledgerClearFiltersButton?.addEventListener("click", () => {
        if (ledgerAccountFilterSelect) {
            ledgerAccountFilterSelect.value = "all";
        }
        if (ledgerFromDateInput) {
            ledgerFromDateInput.value = "";
        }
        if (ledgerToDateInput) {
            ledgerToDateInput.value = "";
        }
        if (ledgerSearchInput) {
            ledgerSearchInput.value = "";
        }
        void loadLedgerEntries(1);
    });
    ledgerSearchInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            void loadLedgerEntries(1);
        }
    });

    ledgerPerPageSelect?.addEventListener("change", () => {
        ledgerPerPage = parseInt(ledgerPerPageSelect.value, 10);
        void loadLedgerEntries(1);
    });

    ledgerPageDownBtn?.addEventListener("click", () => {
        if (ledgerCurrentPage > 1) {
            void loadLedgerEntries(ledgerCurrentPage - 1);
        }
    });

    ledgerPageUpBtn?.addEventListener("click", () => {
        if (ledgerCurrentPage * ledgerPerPage < ledgerTotal) {
            void loadLedgerEntries(ledgerCurrentPage + 1);
        }
    });

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
            const resolvedMessage = await messagesHelper.getMessage(JOURNAL_REFERENCE_NOT_AVAILABLE_ERROR_CODE, {}, journalReferenceUnavailableTipMessage);
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
            const lineNo = Number.isSafeInteger(Number(lineNoText)) ? Number(lineNoText) : index + 1;
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

async function loadUrlParamHelper() {
    const moduleUrl = new URL("/js/utils/url_params.js", window.location.origin).href;
    const module = await import(moduleUrl);
    return { getUrlParam: module.default };
}
