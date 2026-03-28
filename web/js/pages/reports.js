const fetchWithAuth = async (url, options = {}) => {
    const authToken = localStorage.getItem("auth_token") || "";
    const userId = localStorage.getItem("user_id") || "";
    const mergedHeaders = {
        Authorization: `Bearer ${authToken}`,
        "X-User-Id": `${userId}`,
        ...(options.headers || {}),
    };

    const response = await fetch(url, {
        ...options,
        credentials: options.credentials || "include",
        headers: mergedHeaders,
    });
    if (window.FinLedgerSession?.applyExpiryHeaders) {
        window.FinLedgerSession.applyExpiryHeaders(response);
    }
    return response;
};

const formatCurrency = (value) => {
    const numeric = Number(value || 0);
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(numeric);
};

const escapeHtml = (value) =>
    String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");

const todayIso = () => new Date().toISOString().slice(0, 10);

const parseHashQuery = () => {
    const hash = window.location.hash || "";
    const [, queryPart = ""] = hash.split("?");
    return new URLSearchParams(queryPart);
};

const toCsv = (rows = []) => {
    if (!Array.isArray(rows) || rows.length === 0) {
        return "";
    }
    const headers = Object.keys(rows[0]);
    const headerRow = headers.map((h) => `"${String(h).replace(/\"/g, '""')}"`).join(",");
    const dataRows = rows.map((row) =>
        headers
            .map((key) => {
                const value = row[key] === undefined || row[key] === null ? "" : String(row[key]);
                return `"${value.replace(/\"/g, '""')}"`;
            })
            .join(","),
    );
    return [headerRow, ...dataRows].join("\n");
};

const triggerDownload = (content, fileName, mimeType = "text/csv;charset=utf-8;") => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
};

const renderTrialBalance = (report) => {
    const rows = report?.lines || [];
    const htmlRows = rows
        .map(
            (line) => `
            <tr>
                <td>${escapeHtml(line.account_number)}</td>
                <td>${escapeHtml(line.account_name)}</td>
                <td>${escapeHtml(line.statement_type)}</td>
                <td>${formatCurrency(line.debit_balance)}</td>
                <td>${formatCurrency(line.credit_balance)}</td>
            </tr>`,
        )
        .join("");

    return {
        title: "Trial Balance",
        periodLabel: `As of ${escapeHtml(report?.as_of_date || "")}`,
        highlight: report?.totals?.is_balanced ? "Trial balance is balanced." : "Trial balance is not balanced.",
        csvRows: rows.map((line) => ({
            account_number: line.account_number,
            account_name: line.account_name,
            statement_type: line.statement_type,
            debit_balance: line.debit_balance,
            credit_balance: line.credit_balance,
        })),
        html: `
            <table class="table table--wide">
                <thead>
                    <tr>
                        <th>Account #</th>
                        <th>Account</th>
                        <th>Statement</th>
                        <th>Debit</th>
                        <th>Credit</th>
                    </tr>
                </thead>
                <tbody>
                    ${htmlRows || '<tr><td colspan="5">No data available.</td></tr>'}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="3"><strong>Totals</strong></td>
                        <td><strong>${formatCurrency(report?.totals?.total_debits)}</strong></td>
                        <td><strong>${formatCurrency(report?.totals?.total_credits)}</strong></td>
                    </tr>
                </tfoot>
            </table>
        `,
    };
};

const renderIncomeStatement = (report) => {
    const revenueRows = (report?.revenue_lines || []).map((line) => `<tr><td>${escapeHtml(line.account_number)}</td><td>${escapeHtml(line.account_name)}</td><td>${formatCurrency(line.amount)}</td></tr>`).join("");
    const expenseRows = (report?.expense_lines || []).map((line) => `<tr><td>${escapeHtml(line.account_number)}</td><td>${escapeHtml(line.account_name)}</td><td>${formatCurrency(line.amount)}</td></tr>`).join("");

    const csvRows = [
        ...(report?.revenue_lines || []).map((line) => ({ section: "Revenue", account_number: line.account_number, account_name: line.account_name, amount: line.amount })),
        ...(report?.expense_lines || []).map((line) => ({ section: "Expense", account_number: line.account_number, account_name: line.account_name, amount: line.amount })),
        { section: "Total", account_number: "", account_name: "Net Income", amount: report?.totals?.net_income || 0 },
    ];

    return {
        title: "Income Statement",
        periodLabel: `${escapeHtml(report?.from_date || "")} to ${escapeHtml(report?.to_date || "")}`,
        highlight: `Net Income: ${formatCurrency(report?.totals?.net_income || 0)}`,
        csvRows,
        html: `
            <div class="stack">
                <h3>Revenue</h3>
                <table class="table table--wide">
                    <thead><tr><th>Account #</th><th>Account</th><th>Amount</th></tr></thead>
                    <tbody>${revenueRows || '<tr><td colspan="3">No revenue data.</td></tr>'}</tbody>
                </table>
                <h3>Expenses</h3>
                <table class="table table--wide">
                    <thead><tr><th>Account #</th><th>Account</th><th>Amount</th></tr></thead>
                    <tbody>${expenseRows || '<tr><td colspan="3">No expense data.</td></tr>'}</tbody>
                </table>
                <div class="notice">
                    Total Revenue: <strong>${formatCurrency(report?.totals?.total_revenue || 0)}</strong>
                    | Total Expense: <strong>${formatCurrency(report?.totals?.total_expense || 0)}</strong>
                    | Net Income: <strong>${formatCurrency(report?.totals?.net_income || 0)}</strong>
                </div>
            </div>
        `,
    };
};

const renderBalanceSheet = (report) => {
    const assetRows = (report?.assets || []).map((line) => `<tr><td>${escapeHtml(line.account_number)}</td><td>${escapeHtml(line.account_name)}</td><td>${formatCurrency(line.amount)}</td></tr>`).join("");
    const liabRows = (report?.liabilities_and_equity || []).map((line) => `<tr><td>${escapeHtml(line.account_number)}</td><td>${escapeHtml(line.account_name)}</td><td>${formatCurrency(line.amount)}</td></tr>`).join("");

    const csvRows = [...(report?.assets || []).map((line) => ({ section: "Assets", account_number: line.account_number, account_name: line.account_name, amount: line.amount })), ...(report?.liabilities_and_equity || []).map((line) => ({ section: "Liabilities and Equity", account_number: line.account_number, account_name: line.account_name, amount: line.amount }))];

    return {
        title: "Balance Sheet",
        periodLabel: `As of ${escapeHtml(report?.as_of_date || "")}`,
        highlight: report?.totals?.is_balanced ? "Balance Sheet is balanced." : "Balance Sheet is not balanced.",
        csvRows,
        html: `
            <div class="stack">
                <h3>Assets</h3>
                <table class="table table--wide">
                    <thead><tr><th>Account #</th><th>Account</th><th>Amount</th></tr></thead>
                    <tbody>${assetRows || '<tr><td colspan="3">No asset data.</td></tr>'}</tbody>
                </table>
                <h3>Liabilities and Equity</h3>
                <table class="table table--wide">
                    <thead><tr><th>Account #</th><th>Account</th><th>Amount</th></tr></thead>
                    <tbody>${liabRows || '<tr><td colspan="3">No liability/equity data.</td></tr>'}</tbody>
                </table>
                <div class="notice">
                    Total Assets: <strong>${formatCurrency(report?.totals?.total_assets || 0)}</strong>
                    | Total Liabilities and Equity: <strong>${formatCurrency(report?.totals?.total_liabilities_and_equity || 0)}</strong>
                </div>
            </div>
        `,
    };
};

const renderRetainedEarnings = (report) => {
    const values = report?.values || {};
    return {
        title: "Retained Earnings Statement",
        periodLabel: `${escapeHtml(report?.from_date || "")} to ${escapeHtml(report?.to_date || "")}`,
        highlight: `Ending Retained Earnings: ${formatCurrency(values.ending_retained_earnings || 0)}`,
        csvRows: [
            { metric: "Beginning Retained Earnings", amount: values.beginning_retained_earnings || 0 },
            { metric: "Net Income", amount: values.net_income || 0 },
            { metric: "Distributions", amount: values.distributions || 0 },
            { metric: "Ending Retained Earnings", amount: values.ending_retained_earnings || 0 },
        ],
        html: `
            <table class="table table--wide">
                <thead><tr><th>Metric</th><th>Amount</th></tr></thead>
                <tbody>
                    <tr><td>Beginning Retained Earnings</td><td>${formatCurrency(values.beginning_retained_earnings || 0)}</td></tr>
                    <tr><td>Net Income</td><td>${formatCurrency(values.net_income || 0)}</td></tr>
                    <tr><td>Distributions</td><td>${formatCurrency(values.distributions || 0)}</td></tr>
                    <tr><td><strong>Ending Retained Earnings</strong></td><td><strong>${formatCurrency(values.ending_retained_earnings || 0)}</strong></td></tr>
                </tbody>
            </table>
        `,
    };
};

const REPORT_CONFIG = {
    trial_balance: {
        endpoint: "/api/reports/trial-balance",
        buildQuery: ({ asOf }) => ({ as_of: asOf }),
        render: renderTrialBalance,
        useAsOf: true,
        useRange: false,
    },
    income_statement: {
        endpoint: "/api/reports/income-statement",
        buildQuery: ({ fromDate, toDate }) => ({ from_date: fromDate, to_date: toDate }),
        render: renderIncomeStatement,
        useAsOf: false,
        useRange: true,
    },
    balance_sheet: {
        endpoint: "/api/reports/balance-sheet",
        buildQuery: ({ asOf }) => ({ as_of: asOf }),
        render: renderBalanceSheet,
        useAsOf: true,
        useRange: false,
    },
    retained_earnings: {
        endpoint: "/api/reports/retained-earnings",
        buildQuery: ({ fromDate, toDate }) => ({ from_date: fromDate, to_date: toDate }),
        render: renderRetainedEarnings,
        useAsOf: false,
        useRange: true,
    },
};

export default function initReports({ showLoadingOverlay, hideLoadingOverlay, showErrorModal } = {}) {
    const reportTypeSelect = document.querySelector("[data-report-type]");
    const asOfInput = document.querySelector("[data-report-as-of]");
    const fromInput = document.querySelector("[data-report-from-date]");
    const toInput = document.querySelector("[data-report-to-date]");
    const asOfField = document.querySelector("[data-as-of-field]");
    const fromField = document.querySelector("[data-from-field]");
    const toField = document.querySelector("[data-to-field]");
    const outputEl = document.querySelector("[data-report-output]");
    const titleEl = document.querySelector("[data-report-title]");
    const periodLabelEl = document.querySelector("[data-report-period-label]");
    const highlightEl = document.querySelector("[data-report-highlight]");
    const generateBtn = document.querySelector("[data-generate-report]");
    const exportBtn = document.querySelector("[data-export-csv]");
    const emailBtn = document.querySelector("[data-email-report]");
    const printBtn = document.querySelector("[data-print-report]");

    if (!reportTypeSelect || !asOfInput || !fromInput || !toInput || !outputEl || !titleEl || !periodLabelEl || !highlightEl || !generateBtn || !exportBtn || !emailBtn || !printBtn) {
        return;
    }

    let lastRenderedCsvRows = [];
    let lastRenderedReportType = reportTypeSelect.value;

    const now = todayIso();
    asOfInput.value = now;
    toInput.value = now;
    fromInput.value = `${now.slice(0, 4)}-01-01`;

    const hashParams = parseHashQuery();
    const hashReport = hashParams.get("report");
    if (hashReport && REPORT_CONFIG[hashReport]) {
        reportTypeSelect.value = hashReport;
    }
    if (hashParams.get("as_of")) {
        asOfInput.value = hashParams.get("as_of");
    }
    if (hashParams.get("from_date")) {
        fromInput.value = hashParams.get("from_date");
    }
    if (hashParams.get("to_date")) {
        toInput.value = hashParams.get("to_date");
    }

    const updateVisibleDateInputs = () => {
        const config = REPORT_CONFIG[reportTypeSelect.value] || REPORT_CONFIG.trial_balance;
        asOfField.classList.toggle("hidden", !config.useAsOf);
        fromField.classList.toggle("hidden", !config.useRange);
        toField.classList.toggle("hidden", !config.useRange);
    };

    const buildReportUrl = () => {
        const config = REPORT_CONFIG[reportTypeSelect.value] || REPORT_CONFIG.trial_balance;
        const query = new URLSearchParams();
        const payload = config.buildQuery({
            asOf: asOfInput.value,
            fromDate: fromInput.value,
            toDate: toInput.value,
        });
        Object.entries(payload).forEach(([key, value]) => {
            if (value) {
                query.set(key, value);
            }
        });
        return `${config.endpoint}?${query.toString()}`;
    };

    const renderReport = (reportData) => {
        const config = REPORT_CONFIG[reportTypeSelect.value] || REPORT_CONFIG.trial_balance;
        const rendered = config.render(reportData);
        titleEl.textContent = rendered.title;
        periodLabelEl.textContent = rendered.periodLabel;
        highlightEl.textContent = rendered.highlight;
        outputEl.innerHTML = rendered.html;
        lastRenderedCsvRows = rendered.csvRows || [];
        lastRenderedReportType = reportTypeSelect.value;
    };

    const generateReport = async () => {
        try {
            if (typeof showLoadingOverlay === "function") {
                showLoadingOverlay("Generating report...");
            }

            const response = await fetchWithAuth(buildReportUrl());
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.errorCode || "ERR_INTERNAL_SERVER");
            }

            renderReport(data);
        } catch (error) {
            if (typeof showErrorModal === "function") {
                showErrorModal(error?.message || "ERR_INTERNAL_SERVER", false);
            }
        } finally {
            if (typeof hideLoadingOverlay === "function") {
                hideLoadingOverlay();
            }
        }
    };

    generateBtn.addEventListener("click", generateReport);
    reportTypeSelect.addEventListener("change", updateVisibleDateInputs);

    exportBtn.addEventListener("click", () => {
        if (!lastRenderedCsvRows.length) {
            if (typeof showErrorModal === "function") {
                showErrorModal("ERR_INVALID_SELECTION", false);
            }
            return;
        }
        const csv = toCsv(lastRenderedCsvRows);
        const dateStamp = todayIso();
        triggerDownload(csv, `${lastRenderedReportType}_${dateStamp}.csv`);
    });

    emailBtn.addEventListener("click", async () => {
        const recipient = window.prompt("Email report to:", "");
        const to = String(recipient || "").trim();
        if (!to) {
            return;
        }
        try {
            if (typeof showLoadingOverlay === "function") {
                showLoadingOverlay("Emailing report...");
            }

            const response = await fetchWithAuth("/api/reports/email", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    to,
                    report_type: reportTypeSelect.value,
                    as_of: asOfInput.value,
                    from_date: fromInput.value,
                    to_date: toInput.value,
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.errorCode || "ERR_FAILED_TO_SEND_EMAIL");
            }
        } catch (error) {
            if (typeof showErrorModal === "function") {
                showErrorModal(error?.message || "ERR_FAILED_TO_SEND_EMAIL", false);
            }
        } finally {
            if (typeof hideLoadingOverlay === "function") {
                hideLoadingOverlay();
            }
        }
    });

    printBtn.addEventListener("click", () => {
        window.print();
    });

    updateVisibleDateInputs();
    generateReport();
}
