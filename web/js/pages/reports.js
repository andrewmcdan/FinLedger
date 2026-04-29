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

const formatFinancialAmount = (value, { blankZero = false } = {}) => {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) {
        return "0.00";
    }
    if (blankZero && Math.abs(numeric) < 0.0005) {
        return "";
    }
    const formatted = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Math.abs(numeric));
    return numeric < 0 ? `(${formatted})` : formatted;
};

const formatStatementDate = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized) {
        return "";
    }
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
        return normalized;
    }
    return new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        month: "long",
        day: "numeric",
        year: "numeric",
    }).format(parsed);
};

const isMonthEndRange = (fromDate, toDate) => {
    const from = new Date(`${fromDate}T00:00:00.000Z`);
    const to = new Date(`${toDate}T00:00:00.000Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return false;
    }
    const lastDay = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0)).getUTCDate();
    return from.getUTCFullYear() === to.getUTCFullYear() && from.getUTCMonth() === to.getUTCMonth() && from.getUTCDate() === 1 && to.getUTCDate() === lastDay;
};

const buildStatementDateLine = ({ asOfDate = "", fromDate = "", toDate = "" } = {}) => {
    if (asOfDate) {
        return `As of ${formatStatementDate(asOfDate)}`;
    }
    if (fromDate && toDate) {
        if (isMonthEndRange(fromDate, toDate)) {
            return `For the Month Ended ${formatStatementDate(toDate)}`;
        }
        return `For the Period ${formatStatementDate(fromDate)} to ${formatStatementDate(toDate)}`;
    }
    return "";
};

const renderStatementHeader = ({ companyName, title, dateLine }) => `
    <header class="statement-header">
        <p class="statement-header__company">${escapeHtml(companyName)}</p>
        <p class="statement-header__title">${escapeHtml(title)}</p>
        <p class="statement-header__date">${escapeHtml(dateLine)}</p>
    </header>
`;

const renderStatementTable = ({ rowsHtml, totalLabel = "", totalAmount = null, emptyMessage = "No data available.", totalModifierClass = "" } = {}) => `
    <table class="statement-table">
        <tbody>
            ${rowsHtml || `<tr><td>${escapeHtml(emptyMessage)}</td><td class="statement-table__amount"></td></tr>`}
            ${totalLabel ? `<tr class="statement-table__total ${totalModifierClass}"><th scope="row">${escapeHtml(totalLabel)}</th><td class="statement-table__amount"><strong>${formatFinancialAmount(totalAmount)}</strong></td></tr>` : ""}
        </tbody>
    </table>
`;

const renderSingleAmountRows = (lines = [], amountSelector) =>
    lines
        .map((line) => {
            const amount = typeof amountSelector === "function" ? amountSelector(line) : line?.amount;
            return `<tr><td>${escapeHtml(line.account_name || line.label || line.metric || "")}</td><td class="statement-table__amount">${formatFinancialAmount(amount)}</td></tr>`;
        })
        .join("");

const renderGroupedStatementSection = ({ heading, groups = [], totalLabel, totalAmount, emptyMessage }) => {
    const hasGroups = Array.isArray(groups) && groups.length > 0;
    return `
        <section class="statement-section">
            <h3 class="statement-section__title">${escapeHtml(heading)}</h3>
            ${
                hasGroups
                    ? groups
                          .map(
                              (group) => `
                                <div class="statement-group">
                                    <h4 class="statement-group__title">${escapeHtml(group.title)}</h4>
                                    ${renderStatementTable({
                                        rowsHtml: renderSingleAmountRows(group.lines, (line) => line.display_amount ?? line.amount),
                                        totalLabel: group.total_label,
                                        totalAmount: group.total,
                                    })}
                                </div>
                            `,
                          )
                          .join("")
                    : renderStatementTable({ emptyMessage })
            }
            <div class="statement-section__grand-total">
                <span>${escapeHtml(totalLabel)}</span>
                <strong>${formatFinancialAmount(totalAmount)}</strong>
            </div>
        </section>
    `;
};

const buildReportChrome = ({ companyName, title, dateLine, bodyHtml, modifierClass = "" }) => `
    <article class="report-sheet ${modifierClass}">
        ${renderStatementHeader({ companyName, title, dateLine })}
        ${bodyHtml}
    </article>
`;

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
                <td>${escapeHtml(line.account_name)}</td>
                <td class="statement-table__amount">${formatFinancialAmount(line.debit_balance, { blankZero: true })}</td>
                <td class="statement-table__amount">${formatFinancialAmount(line.credit_balance, { blankZero: true })}</td>
            </tr>`,
        )
        .join("");

    const dateLine = buildStatementDateLine({ asOfDate: report?.as_of_date || "" });
    const title = report?.title_line || "Adjusted Trial Balance";
    const companyName = report?.company_name || "FinLedger";

    return {
        title,
        periodLabel: dateLine,
        highlight: report?.totals?.is_balanced ? "Trial balance is balanced." : "Trial balance is not balanced.",
        csvRows: rows.map((line) => ({
            account_number: line.account_number,
            account_name: line.account_name,
            statement_type: line.statement_type,
            debit_balance: line.debit_balance,
            credit_balance: line.credit_balance,
        })),
        html: buildReportChrome({
            companyName,
            title,
            dateLine,
            modifierClass: "report-sheet--trial-balance",
            bodyHtml: `
                <table class="statement-table statement-table--trial-balance">
                    <thead>
                        <tr>
                            <th>Account</th>
                            <th class="statement-table__amount">Debit</th>
                            <th class="statement-table__amount">Credit</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${htmlRows || '<tr><td>No data available.</td><td class="statement-table__amount"></td><td class="statement-table__amount"></td></tr>'}
                    </tbody>
                    <tfoot>
                        <tr class="statement-table__total statement-table__total--double-rule">
                            <th scope="row">Totals</th>
                            <td class="statement-table__amount"><strong>${formatFinancialAmount(report?.totals?.total_debits)}</strong></td>
                            <td class="statement-table__amount"><strong>${formatFinancialAmount(report?.totals?.total_credits)}</strong></td>
                        </tr>
                    </tfoot>
                </table>
            `,
        }),
    };
};

const renderIncomeStatement = (report) => {
    const revenueRows = renderSingleAmountRows(report?.revenue_lines || []);
    const expenseRows = renderSingleAmountRows(report?.expense_lines || []);
    const dateLine = buildStatementDateLine({ fromDate: report?.from_date || "", toDate: report?.to_date || "" });
    const title = report?.title_line || "Income Statement";
    const companyName = report?.company_name || "FinLedger";

    const csvRows = [
        ...(report?.revenue_lines || []).map((line) => ({ section: "Revenue", account_number: line.account_number, account_name: line.account_name, amount: line.amount })),
        ...(report?.expense_lines || []).map((line) => ({ section: "Expense", account_number: line.account_number, account_name: line.account_name, amount: line.amount })),
        { section: "Total", account_number: "", account_name: "Net Income", amount: report?.totals?.net_income || 0 },
    ];

    return {
        title,
        periodLabel: dateLine,
        highlight: `Net Income: ${formatFinancialAmount(report?.totals?.net_income || 0)}`,
        csvRows,
        html: buildReportChrome({
            companyName,
            title,
            dateLine,
            bodyHtml: `
                <section class="statement-section">
                    <h3 class="statement-section__title">Revenues</h3>
                    ${renderStatementTable({
                        rowsHtml: revenueRows,
                        totalLabel: "Total Revenues",
                        totalAmount: report?.totals?.total_revenue || 0,
                        emptyMessage: "No revenue data.",
                    })}
                </section>
                <section class="statement-section">
                    <h3 class="statement-section__title">Expenses</h3>
                    ${renderStatementTable({
                        rowsHtml: expenseRows,
                        totalLabel: "Total Expenses",
                        totalAmount: report?.totals?.total_expense || 0,
                        emptyMessage: "No expense data.",
                    })}
                </section>
                <div class="statement-callout">
                    <span>Net Income</span>
                    <strong>${formatFinancialAmount(report?.totals?.net_income || 0)}</strong>
                </div>
            `,
        }),
    };
};

const renderBalanceSheet = (report) => {
    const dateLine = buildStatementDateLine({ asOfDate: report?.as_of_date || "" });
    const title = report?.title_line || "Balance Sheet";
    const companyName = report?.company_name || "FinLedger";
    const equityRows = renderSingleAmountRows(report?.equity || [], (line) => line.display_amount ?? line.amount);

    const csvRows = [...(report?.assets || []).map((line) => ({ section: "Assets", account_number: line.account_number, account_name: line.account_name, amount: line.amount })), ...(report?.liabilities_and_equity || []).map((line) => ({ section: "Liabilities and Equity", account_number: line.account_number, account_name: line.account_name, amount: line.amount }))];

    return {
        title,
        periodLabel: dateLine,
        highlight: report?.totals?.is_balanced ? "Balance Sheet is balanced." : "Balance Sheet is not balanced.",
        csvRows,
        html: buildReportChrome({
            companyName,
            title,
            dateLine,
            modifierClass: "report-sheet--balance-sheet",
            bodyHtml: `
                <div class="balance-sheet-grid">
                    ${renderGroupedStatementSection({
                        heading: "Assets",
                        groups: report?.asset_groups || [],
                        totalLabel: "Total Assets",
                        totalAmount: report?.totals?.total_assets || 0,
                        emptyMessage: "No asset data.",
                    })}
                    <section class="statement-section">
                        <h3 class="statement-section__title">Liabilities</h3>
                        ${
                            (report?.liability_groups || []).length
                                ? (report.liability_groups || [])
                                      .map(
                                          (group) => `
                                            <div class="statement-group">
                                                <h4 class="statement-group__title">${escapeHtml(group.title)}</h4>
                                                ${renderStatementTable({
                                                    rowsHtml: renderSingleAmountRows(group.lines, (line) => line.display_amount ?? line.amount),
                                                    totalLabel: group.total_label,
                                                    totalAmount: group.total,
                                                })}
                                            </div>
                                        `,
                                      )
                                      .join("")
                                : renderStatementTable({ emptyMessage: "No liability data." })
                        }
                        <div class="statement-section__grand-total">
                            <span>Total Liabilities</span>
                            <strong>${formatFinancialAmount(report?.totals?.total_liabilities || 0)}</strong>
                        </div>

                        <h3 class="statement-section__title statement-section__title--spaced">Stockholders' Equity</h3>
                        ${renderStatementTable({
                            rowsHtml: equityRows,
                            totalLabel: "Total Stockholders' Equity",
                            totalAmount: report?.totals?.total_equity || 0,
                            emptyMessage: "No equity data.",
                        })}

                        <div class="statement-section__grand-total statement-section__grand-total--double-rule">
                            <span>Total Liabilities and Stockholders' Equity</span>
                            <strong>${formatFinancialAmount(report?.totals?.total_liabilities_and_equity || 0)}</strong>
                        </div>
                    </section>
                </div>
            `,
        }),
    };
};

const renderRetainedEarnings = (report) => {
    const values = report?.values || {};
    const rows =
        Array.isArray(report?.lines) && report.lines.length
            ? report.lines
            : [
                  { label: "Beginning Retained Earnings", amount: values.beginning_retained_earnings || 0, kind: "base" },
                  { label: "Add: Net Income", amount: values.net_income || 0, kind: "addition" },
                  { label: "Less: Distributions", amount: values.distributions || 0, kind: "deduction" },
                  { label: "Ending Retained Earnings", amount: values.ending_retained_earnings || 0, kind: "total" },
              ];
    const dateLine = buildStatementDateLine({ fromDate: report?.from_date || "", toDate: report?.to_date || "" });
    const title = report?.title_line || "Statement of Retained Earnings";
    const companyName = report?.company_name || "FinLedger";
    return {
        title,
        periodLabel: dateLine,
        highlight: `Ending Retained Earnings: ${formatFinancialAmount(values.ending_retained_earnings || 0)}`,
        csvRows: [
            { metric: "Beginning Retained Earnings", amount: values.beginning_retained_earnings || 0 },
            { metric: "Net Income", amount: values.net_income || 0 },
            { metric: "Distributions", amount: values.distributions || 0 },
            { metric: "Ending Retained Earnings", amount: values.ending_retained_earnings || 0 },
        ],
        html: buildReportChrome({
            companyName,
            title,
            dateLine,
            bodyHtml: `
                ${renderStatementTable({
                    rowsHtml: rows
                        .map(
                            (line) => `
                                <tr class="${line.kind === "total" ? "statement-table__emphasis" : ""}">
                                    <td>${escapeHtml(line.label)}</td>
                                    <td class="statement-table__amount">${formatFinancialAmount(line.amount)}</td>
                                </tr>
                            `,
                        )
                        .join(""),
                })}
            `,
        }),
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
