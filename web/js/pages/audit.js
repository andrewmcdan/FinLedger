const authHelpers = await loadFetchWithAuth();
const { fetchWithAuth } = authHelpers;

export default async function initAudit({ showLoadingOverlay, hideLoadingOverlay, showErrorModal }) {
    const auditDataEl = document.getElementById("audit-data");
    const auditData = auditDataEl ? JSON.parse(auditDataEl.textContent || "{}") : {};
    const allUsers = Array.isArray(auditData?.allUsers) ? auditData.allUsers : [];
    const allAccounts = Array.isArray(auditData?.allAccounts) ? auditData.allAccounts : [];
    const allEventTypes = Array.isArray(auditData?.allEventTypes) ? auditData.allEventTypes : [];
    const allEntityTypes = Array.isArray(auditData?.allEntityTypes) ? auditData.allEntityTypes : [];

    const fromDateInput = document.querySelector("[data-audit-from-date]");
    const toDateInput = document.querySelector("[data-audit-to-date]");
    const accountSelect = document.querySelector("[data-audit-account-select]");
    const entityTypeSelect = document.querySelector("[data-audit-entity-type-select]");
    const userSelect = document.querySelector("[data-audit-user-select]");
    const eventTypeSelect = document.querySelector("[data-audit-event-type-select]");
    const actionSelect = document.querySelector("[data-audit-action-select]");
    const perPageSelect = document.querySelector("[data-audit-per-page-select]");
    const generateButton = document.querySelector("[data-audit-generate-report]");
    const clearFiltersButton = document.querySelector("[data-audit-clear-filters]");
    const saveCsvButton = document.querySelector("[data-audit-save-csv]");
    const printButton = document.querySelector("[data-audit-print-report]");
    const filterSummaryEl = document.querySelector("[data-audit-filter-summary]");
    const reportTitleEl = document.querySelector("[data-audit-report-title]");
    const reportPeriodEl = document.querySelector("[data-audit-report-period]");
    const reportHighlightEl = document.querySelector("[data-audit-report-highlight]");
    const summaryGridEl = document.querySelector("[data-audit-summary-grid]");
    const reportOutputEl = document.querySelector("[data-audit-report-output]");
    const currentPageEl = document.querySelector("[data-audit-current-page]");
    const totalPagesEl = document.querySelector("[data-audit-total-pages]");
    const pageDownButton = document.querySelector("[data-audit-page-down]");
    const pageUpButton = document.querySelector("[data-audit-page-up]");

    const accountById = new Map(allAccounts.map((account) => [String(account.id), account]));
    const userById = new Map(allUsers.map((user) => [String(user.id), user]));

    let currentPage = 1;
    let totalRows = 0;
    let currentRows = [];
    let currentFilters = null;
    let hasLoadedReport = false;

    const parseHashQuery = () => {
        const hash = window.location.hash || "";
        const [, queryPart = ""] = hash.split("?");
        return new URLSearchParams(queryPart);
    };

    const createDateTimeValue = (dateValue, endOfDay = false) => {
        const trimmed = String(dateValue || "").trim();
        if (!trimmed) {
            return "";
        }
        return `${trimmed}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`;
    };

    const formatTimestamp = (value) => {
        if (!value) {
            return "Unknown";
        }
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return String(value);
        }
        return parsed.toLocaleString();
    };

    const formatAccountLabel = (accountId) => {
        const normalized = String(accountId || "").trim();
        if (!normalized) {
            return "All Accounts";
        }
        const account = accountById.get(normalized);
        if (!account) {
            return `Account ${normalized}`;
        }
        return `${account.account_number} - ${account.account_name}`;
    };

    const formatUserLabel = (userId) => {
        const normalized = String(userId || "").trim();
        if (!normalized) {
            return "All Users";
        }
        const user = userById.get(normalized);
        if (!user) {
            return `User ${normalized}`;
        }
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
        return fullName ? `${user.username} (${fullName})` : user.username;
    };

    const formatTokenLabel = (value, fallback) => {
        const normalized = String(value || "").trim();
        if (!normalized) {
            return fallback;
        }
        return normalized
            .split(/[_\s-]+/)
            .filter(Boolean)
            .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
            .join(" ");
    };

    const formatEntityTypeLabel = (entityType) => formatTokenLabel(entityType, "All Record Types");
    const formatEventTypeLabel = (eventType) => formatTokenLabel(eventType, "All Event Types");

    const formatActionLabel = (action) => {
        const normalized = String(action || "").trim().toLowerCase();
        if (!normalized) {
            return "All Actions";
        }
        return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
    };

    const formatEntityLabel = (entityType, entityId) => {
        const normalizedType = String(entityType || "").trim();
        const normalizedId = String(entityId || "").trim();
        if (normalizedType === "accounts") {
            return formatAccountLabel(normalizedId);
        }
        if (normalizedType === "users") {
            return formatUserLabel(normalizedId);
        }
        if (!normalizedType) {
            return normalizedId || "Unknown Record";
        }
        return normalizedId ? `${normalizedType} #${normalizedId}` : normalizedType;
    };

    const formatJsonValue = (value) => {
        if (value === null || value === undefined) {
            return "No data";
        }
        if (typeof value === "string") {
            return value;
        }
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    };

    const toCsv = (rows = []) => {
        if (!Array.isArray(rows) || rows.length === 0) {
            return "";
        }
        const headers = Object.keys(rows[0]);
        const headerRow = headers.map((header) => `"${String(header).replace(/"/g, "\"\"")}"`).join(",");
        const bodyRows = rows.map((row) =>
            headers
                .map((key) => {
                    const value = row[key] === undefined || row[key] === null ? "" : String(row[key]);
                    return `"${value.replace(/"/g, "\"\"")}"`;
                })
                .join(","),
        );
        return [headerRow, ...bodyRows].join("\n");
    };

    const triggerDownload = (content, fileName) => {
        const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
    };

    const getFiltersFromInputs = () => ({
        accountId: String(accountSelect?.value || "").trim(),
        entityType: String(entityTypeSelect?.value || "").trim(),
        changedBy: String(userSelect?.value || "").trim(),
        eventType: String(eventTypeSelect?.value || "").trim(),
        action: String(actionSelect?.value || "").trim(),
        fromDate: String(fromDateInput?.value || "").trim(),
        toDate: String(toDateInput?.value || "").trim(),
    });

    const updatePagination = () => {
        const perPage = Number.parseInt(perPageSelect?.value || "25", 10) || 25;
        const totalPages = Math.max(1, Math.ceil(totalRows / perPage) || 1);
        if (currentPageEl) {
            currentPageEl.textContent = String(currentPage);
        }
        if (totalPagesEl) {
            totalPagesEl.textContent = String(totalPages);
        }
        if (pageDownButton) {
            pageDownButton.disabled = currentPage <= 1;
        }
        if (pageUpButton) {
            pageUpButton.disabled = currentPage >= totalPages;
        }
    };

    const renderSummary = () => {
        const filters = currentFilters || getFiltersFromInputs();
        const entityTypeLabel = formatEntityTypeLabel(filters.entityType);
        const accountLabel = formatAccountLabel(filters.accountId);
        const userLabel = formatUserLabel(filters.changedBy);
        const eventTypeLabel = formatEventTypeLabel(filters.eventType);
        const actionLabel = formatActionLabel(filters.action);
        const fromLabel = filters.fromDate || "Beginning";
        const toLabel = filters.toDate || "Now";
        const perPage = Number.parseInt(perPageSelect?.value || "25", 10) || 25;
        const totalPages = Math.max(1, Math.ceil(totalRows / perPage) || 1);

        if (filterSummaryEl) {
            filterSummaryEl.textContent = `Current filters: ${entityTypeLabel}, ${accountLabel}, ${userLabel}, ${eventTypeLabel}, ${actionLabel}, ${fromLabel} to ${toLabel}.`;
        }
        if (reportTitleEl) {
            reportTitleEl.textContent = filters.accountId ? `Audit Summary: ${accountLabel}` : "Audit Summary";
        }
        if (reportPeriodEl) {
            reportPeriodEl.textContent = `${fromLabel} to ${toLabel}`;
        }
        if (reportHighlightEl) {
            if (!hasLoadedReport) {
                reportHighlightEl.textContent = "No audit report generated yet.";
            } else if (totalRows === 0) {
                reportHighlightEl.textContent = "No audit entries matched the selected filters.";
            } else {
                reportHighlightEl.textContent = `Showing ${currentRows.length} row(s) on page ${currentPage} of ${totalPages}. ${totalRows} total matching audit entr${totalRows === 1 ? "y" : "ies"}.`;
            }
        }
        if (summaryGridEl) {
            summaryGridEl.replaceChildren();
            const summaryItems = [
                `Rows: ${totalRows}`,
                `Record Type: ${entityTypeLabel}`,
                `Account: ${accountLabel}`,
                `Changed By: ${userLabel}`,
                `Event Type: ${eventTypeLabel}`,
                `Action: ${actionLabel}`,
            ];
            summaryItems.forEach((text) => {
                const item = document.createElement("article");
                item.className = "notice";
                item.textContent = text;
                summaryGridEl.appendChild(item);
            });
        }
        updatePagination();
    };

    const createReadonlyField = (labelText, value, rows = 8) => {
        const field = document.createElement("div");
        field.className = "field";
        const label = document.createElement("label");
        label.textContent = labelText;
        const textarea = document.createElement("textarea");
        textarea.rows = rows;
        textarea.readOnly = true;
        textarea.value = value;
        field.appendChild(label);
        field.appendChild(textarea);
        return field;
    };

    const renderReportRows = (rows = []) => {
        if (!reportOutputEl) {
            return;
        }
        reportOutputEl.replaceChildren();
        if (!Array.isArray(rows) || rows.length === 0) {
            const emptyState = document.createElement("p");
            emptyState.className = "meta";
            emptyState.textContent = hasLoadedReport ? "No audit entries matched the selected filters." : "No audit report generated yet.";
            reportOutputEl.appendChild(emptyState);
            return;
        }

        rows.forEach((row) => {
            const card = document.createElement("article");
            card.className = "card stack";

            const title = document.createElement("h2");
            const actionLabel = formatActionLabel(row.action);
            title.textContent = `${actionLabel} ${formatEntityLabel(row.entity_type, row.entity_id)}`;
            card.appendChild(title);

            const summaryGrid = document.createElement("div");
            summaryGrid.className = "grid";
            const summaryEntries = [
                `Changed At: ${formatTimestamp(row.changed_at)}`,
                `Changed By: ${formatUserLabel(row.changed_by)}`,
                `Record Type: ${formatEntityTypeLabel(row.entity_type || "")}`,
                `Event Type: ${formatEventTypeLabel(row.event_type || "")}`,
                `Record: ${formatEntityLabel(row.entity_type, row.entity_id)}`,
            ];
            summaryEntries.forEach((entryText) => {
                const summaryItem = document.createElement("article");
                summaryItem.className = "notice";
                summaryItem.textContent = entryText;
                summaryGrid.appendChild(summaryItem);
            });
            card.appendChild(summaryGrid);

            const detailsGrid = document.createElement("div");
            detailsGrid.className = "grid";
            detailsGrid.appendChild(createReadonlyField("Before Image", formatJsonValue(row.b_image)));
            detailsGrid.appendChild(createReadonlyField("After Image", formatJsonValue(row.a_image)));
            card.appendChild(detailsGrid);

            const metadataValue =
                row.metadata && typeof row.metadata === "object" && Object.keys(row.metadata).length > 0
                    ? formatJsonValue(row.metadata)
                    : "";
            if (metadataValue) {
                card.appendChild(createReadonlyField("Metadata", metadataValue, 4));
            }

            reportOutputEl.appendChild(card);
        });
    };

    const populateSelects = () => {
        if (accountSelect) {
            const sortedAccounts = allAccounts
                .slice()
                .sort((left, right) => String(left.account_name || "").localeCompare(String(right.account_name || "")));
            sortedAccounts.forEach((account) => {
                const option = document.createElement("option");
                option.value = String(account.id);
                option.textContent = `${account.account_number} - ${account.account_name}`;
                accountSelect.appendChild(option);
            });
        }

        if (userSelect) {
            const sortedUsers = allUsers
                .slice()
                .sort((left, right) => String(left.username || "").localeCompare(String(right.username || "")));
            sortedUsers.forEach((user) => {
                const option = document.createElement("option");
                option.value = String(user.id);
                option.textContent = formatUserLabel(user.id);
                userSelect.appendChild(option);
            });
        }

        if (entityTypeSelect) {
            const entityTypeValues = [...new Set([...allEntityTypes, ...(allAccounts.length ? ["accounts"] : []), ...(allUsers.length ? ["users"] : [])])]
                .filter((value) => String(value || "").trim())
                .sort((left, right) => String(left).localeCompare(String(right)));
            entityTypeValues.forEach((entityType) => {
                const option = document.createElement("option");
                option.value = String(entityType);
                option.textContent = formatEntityTypeLabel(entityType);
                entityTypeSelect.appendChild(option);
            });
        }

        if (eventTypeSelect) {
            const eventTypeValues = [...new Set(allEventTypes)]
                .filter((value) => String(value || "").trim())
                .sort((left, right) => String(left).localeCompare(String(right)));
            eventTypeValues.forEach((eventType) => {
                const option = document.createElement("option");
                option.value = String(eventType);
                option.textContent = formatEventTypeLabel(eventType);
                eventTypeSelect.appendChild(option);
            });
        }
    };

    const applyFiltersFromHash = () => {
        const params = parseHashQuery();
        const accountId = String(params.get("account_id") || "").trim();
        const entityTypeFromHash = String(params.get("entity_type") || "").trim();
        const changedBy = String(params.get("changed_by") || "").trim();
        const eventType = String(params.get("event_type") || "").trim();
        const action = String(params.get("action") || "").trim().toLowerCase();
        const fromDate = String(params.get("from_date") || "").trim();
        const toDate = String(params.get("to_date") || "").trim();
        const entityType = entityTypeFromHash || (accountId ? "accounts" : "");

        if (accountSelect) {
            const hasAccountOption = Array.from(accountSelect.options).some((option) => option.value === accountId);
            accountSelect.value = hasAccountOption ? accountId : "";
        }
        if (entityTypeSelect) {
            const hasEntityTypeOption = Array.from(entityTypeSelect.options).some((option) => option.value === entityType);
            entityTypeSelect.value = hasEntityTypeOption ? entityType : "";
        }
        if (userSelect) {
            const hasUserOption = Array.from(userSelect.options).some((option) => option.value === changedBy);
            userSelect.value = hasUserOption ? changedBy : "";
        }
        if (eventTypeSelect) {
            const hasEventTypeOption = Array.from(eventTypeSelect.options).some((option) => option.value === eventType);
            eventTypeSelect.value = hasEventTypeOption ? eventType : "";
        }
        if (actionSelect) {
            actionSelect.value = Array.from(actionSelect.options).some((option) => option.value === action) ? action : "";
        }
        if (fromDateInput) {
            fromDateInput.value = fromDate;
        }
        if (toDateInput) {
            toDateInput.value = toDate;
        }

        return {
            hasPresetFilters: Boolean(accountId || entityType || changedBy || eventType || action || fromDate || toDate),
        };
    };

    const replaceHashQuery = (filters) => {
        const params = new URLSearchParams();
        if (filters.accountId) {
            params.set("account_id", filters.accountId);
        }
        if (filters.entityType) {
            params.set("entity_type", filters.entityType);
        }
        if (filters.changedBy) {
            params.set("changed_by", filters.changedBy);
        }
        if (filters.eventType) {
            params.set("event_type", filters.eventType);
        }
        if (filters.action) {
            params.set("action", filters.action);
        }
        if (filters.fromDate) {
            params.set("from_date", filters.fromDate);
        }
        if (filters.toDate) {
            params.set("to_date", filters.toDate);
        }
        const url = new URL(window.location.href);
        url.hash = params.toString() ? `#/audit?${params.toString()}` : "#/audit";
        window.history.replaceState({}, "", url);
    };

    const buildApiQuery = (filters, page) => {
        const perPage = Number.parseInt(perPageSelect?.value || "25", 10) || 25;
        const params = new URLSearchParams({
            limit: String(perPage),
            offset: String((page - 1) * perPage),
        });
        if (filters.accountId) {
            params.set("entity_type", "accounts");
            params.set("entity_id", filters.accountId);
        } else if (filters.entityType) {
            params.set("entity_type", filters.entityType);
        }
        if (filters.changedBy) {
            params.set("changed_by", filters.changedBy);
        }
        if (filters.eventType) {
            params.set("event_type", filters.eventType);
        }
        if (filters.action) {
            params.set("action", filters.action);
        }
        if (filters.fromDate) {
            params.set("start_at", createDateTimeValue(filters.fromDate));
        }
        if (filters.toDate) {
            params.set("end_at", createDateTimeValue(filters.toDate, true));
        }
        return params;
    };

    const buildCsvRows = (rows) =>
        rows.map((row) => ({
            changed_at: formatTimestamp(row.changed_at),
            event_type: row.event_type || "",
            action: row.action || "",
            entity_type: row.entity_type || "",
            entity_id: row.entity_id || "",
            entity_label: formatEntityLabel(row.entity_type, row.entity_id),
            changed_by: row.changed_by || "",
            changed_by_label: formatUserLabel(row.changed_by),
            before_image: formatJsonValue(row.b_image),
            after_image: formatJsonValue(row.a_image),
            metadata: formatJsonValue(row.metadata),
        }));

    const loadAuditReport = async ({ page = 1, syncUrl = true } = {}) => {
        const filters = getFiltersFromInputs();
        if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
            showErrorModal("ERR_INVALID_SELECTION");
            return;
        }
        currentPage = page;
        if (syncUrl) {
            replaceHashQuery(filters);
        }

        showLoadingOverlay();
        try {
            const query = buildApiQuery(filters, currentPage);
            const response = await fetchWithAuth(`/api/audit-logs?${query.toString()}`);
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || "ERR_INTERNAL_SERVER");
            }
            currentFilters = filters;
            totalRows = Number(payload?.pagination?.total || 0);
            currentRows = Array.isArray(payload?.audit_logs) ? payload.audit_logs : [];
            hasLoadedReport = true;
            renderSummary();
            renderReportRows(currentRows);
        } catch (error) {
            hasLoadedReport = true;
            totalRows = 0;
            currentRows = [];
            renderSummary();
            renderReportRows([]);
            showErrorModal(error.message || "ERR_INTERNAL_SERVER");
        } finally {
            hideLoadingOverlay();
        }
    };

    const resetReportState = () => {
        currentPage = 1;
        totalRows = 0;
        currentRows = [];
        currentFilters = null;
        hasLoadedReport = false;
        renderSummary();
        renderReportRows([]);
    };

    populateSelects();
    const { hasPresetFilters } = applyFiltersFromHash();
    renderSummary();
    renderReportRows([]);

    generateButton?.addEventListener("click", () => {
        void loadAuditReport({ page: 1, syncUrl: true });
    });

    clearFiltersButton?.addEventListener("click", () => {
        if (fromDateInput) {
            fromDateInput.value = "";
        }
        if (toDateInput) {
            toDateInput.value = "";
        }
        if (accountSelect) {
            accountSelect.value = "";
        }
        if (entityTypeSelect) {
            entityTypeSelect.value = "";
        }
        if (userSelect) {
            userSelect.value = "";
        }
        if (eventTypeSelect) {
            eventTypeSelect.value = "";
        }
        if (actionSelect) {
            actionSelect.value = "";
        }
        replaceHashQuery({
            accountId: "",
            entityType: "",
            changedBy: "",
            eventType: "",
            action: "",
            fromDate: "",
            toDate: "",
        });
        resetReportState();
    });

    saveCsvButton?.addEventListener("click", () => {
        if (!currentRows.length) {
            showErrorModal("ERR_INVALID_SELECTION");
            return;
        }
        const csvContent = toCsv(buildCsvRows(currentRows));
        triggerDownload(csvContent, "audit-report.csv");
    });

    printButton?.addEventListener("click", () => {
        window.print();
    });

    perPageSelect?.addEventListener("change", () => {
        currentPage = 1;
        if (hasLoadedReport) {
            void loadAuditReport({ page: 1, syncUrl: true });
        } else {
            renderSummary();
        }
    });

    accountSelect?.addEventListener("change", () => {
        if (accountSelect.value && entityTypeSelect) {
            entityTypeSelect.value = "accounts";
        }
    });

    entityTypeSelect?.addEventListener("change", () => {
        if (entityTypeSelect.value && entityTypeSelect.value !== "accounts" && accountSelect?.value) {
            accountSelect.value = "";
        }
    });

    pageDownButton?.addEventListener("click", () => {
        if (currentPage > 1) {
            void loadAuditReport({ page: currentPage - 1, syncUrl: false });
        }
    });

    pageUpButton?.addEventListener("click", () => {
        const perPage = Number.parseInt(perPageSelect?.value || "25", 10) || 25;
        if (currentPage * perPage < totalRows) {
            void loadAuditReport({ page: currentPage + 1, syncUrl: false });
        }
    });

    if (hasPresetFilters) {
        await loadAuditReport({ page: 1, syncUrl: false });
    }
}

async function loadFetchWithAuth() {
    const moduleUrl = new URL("/js/utils/fetch_with_auth.js", window.location.origin).href;
    const module = await import(moduleUrl);
    const { fetchWithAuth } = module;
    return { fetchWithAuth };
}
