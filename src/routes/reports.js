const express = require("express");
const { isAdmin, isManager } = require("../controllers/users");
const { generateTrialBalance, generateIncomeStatement, generateBalanceSheet, generateRetainedEarnings } = require("../controllers/reports");
const { sendApiError, sendApiSuccess } = require("../utils/api_messages");
const { log } = require("../utils/logger");
const utilities = require("../utils/utilities");
const { sendTemplatedEmail } = require("../services/email");

const router = express.Router();

const ensureReportsAccess = async (req, res, next) => {
    const isAdminUser = await isAdmin(req.user.id, req.user.token);
    if (isAdminUser) {
        return next();
    }
    const isManagerUser = await isManager(req.user.id, req.user.token);
    if (isManagerUser) {
        return next();
    }
    log("warn", "User lacks report-generation permissions", { userId: req.user?.id }, utilities.getCallerInfo(), req.user?.id);
    return sendApiError(res, 403, "ERR_FORBIDDEN");
};

const REPORT_GENERATORS = {
    trial_balance: ({ userId, as_of, run_type }) => generateTrialBalance({ userId, asOfDate: as_of, runType: run_type }),
    income_statement: ({ userId, from_date, to_date }) => generateIncomeStatement({ userId, fromDate: from_date, toDate: to_date }),
    balance_sheet: ({ userId, as_of }) => generateBalanceSheet({ userId, asOfDate: as_of }),
    retained_earnings: ({ userId, from_date, to_date }) => generateRetainedEarnings({ userId, fromDate: from_date, toDate: to_date }),
};

const buildCsvFromRows = (rows = []) => {
    if (!Array.isArray(rows) || rows.length === 0) {
        return "";
    }
    const headers = Object.keys(rows[0]);
    const headerRow = headers.map((header) => `"${String(header).replace(/\"/g, '""')}"`).join(",");
    const dataRows = rows.map((row) =>
        headers
            .map((key) => {
                const value = row[key] === null || row[key] === undefined ? "" : String(row[key]);
                return `"${value.replace(/\"/g, '""')}"`;
            })
            .join(","),
    );
    return [headerRow, ...dataRows].join("\n");
};

const rowsForReportCsv = (reportType, report) => {
    if (reportType === "trial_balance") {
        return (report.lines || []).map((line) => ({
            account_number: line.account_number,
            account_name: line.account_name,
            statement_type: line.statement_type,
            debit_balance: line.debit_balance,
            credit_balance: line.credit_balance,
        }));
    }
    if (reportType === "income_statement") {
        return [
            ...(report.revenue_lines || []).map((line) => ({ section: "Revenue", account_number: line.account_number, account_name: line.account_name, amount: line.amount })),
            ...(report.expense_lines || []).map((line) => ({ section: "Expense", account_number: line.account_number, account_name: line.account_name, amount: line.amount })),
            { section: "Total", account_number: "", account_name: "Net Income", amount: report?.totals?.net_income || 0 },
        ];
    }
    if (reportType === "balance_sheet") {
        return [...(report.assets || []).map((line) => ({ section: "Assets", account_number: line.account_number, account_name: line.account_name, amount: line.amount })), ...(report.liabilities_and_equity || []).map((line) => ({ section: "Liabilities and Equity", account_number: line.account_number, account_name: line.account_name, amount: line.amount }))];
    }
    if (reportType === "retained_earnings") {
        return [
            { metric: "Beginning Retained Earnings", amount: report?.values?.beginning_retained_earnings || 0 },
            { metric: "Net Income", amount: report?.values?.net_income || 0 },
            { metric: "Distributions", amount: report?.values?.distributions || 0 },
            { metric: "Ending Retained Earnings", amount: report?.values?.ending_retained_earnings || 0 },
        ];
    }
    return [];
};

router.get("/trial-balance", ensureReportsAccess, async (req, res) => {
    try {
        const report = await generateTrialBalance({
            userId: req.user.id,
            asOfDate: req.query?.as_of,
            runType: req.query?.run_type,
        });
        return res.json(report);
    } catch (error) {
        if (error?.code === "ERR_INVALID_SELECTION") {
            return sendApiError(res, 400, "ERR_INVALID_SELECTION");
        }
        log("error", "Failed to generate trial balance report", { userId: req.user?.id, error: error.message }, utilities.getCallerInfo(), req.user?.id);
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

router.get("/income-statement", ensureReportsAccess, async (req, res) => {
    try {
        const report = await generateIncomeStatement({
            userId: req.user.id,
            fromDate: req.query?.from_date,
            toDate: req.query?.to_date,
        });
        return res.json(report);
    } catch (error) {
        if (error?.code === "ERR_INVALID_SELECTION") {
            return sendApiError(res, 400, "ERR_INVALID_SELECTION");
        }
        log("error", "Failed to generate income statement report", { userId: req.user?.id, error: error.message }, utilities.getCallerInfo(), req.user?.id);
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

router.get("/balance-sheet", ensureReportsAccess, async (req, res) => {
    try {
        const report = await generateBalanceSheet({
            userId: req.user.id,
            asOfDate: req.query?.as_of,
        });
        return res.json(report);
    } catch (error) {
        if (error?.code === "ERR_INVALID_SELECTION") {
            return sendApiError(res, 400, "ERR_INVALID_SELECTION");
        }
        log("error", "Failed to generate balance sheet report", { userId: req.user?.id, error: error.message }, utilities.getCallerInfo(), req.user?.id);
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

router.get("/retained-earnings", ensureReportsAccess, async (req, res) => {
    try {
        const report = await generateRetainedEarnings({
            userId: req.user.id,
            fromDate: req.query?.from_date,
            toDate: req.query?.to_date,
        });
        return res.json(report);
    } catch (error) {
        if (error?.code === "ERR_INVALID_SELECTION") {
            return sendApiError(res, 400, "ERR_INVALID_SELECTION");
        }
        log("error", "Failed to generate retained earnings report", { userId: req.user?.id, error: error.message }, utilities.getCallerInfo(), req.user?.id);
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

router.post("/email", ensureReportsAccess, async (req, res) => {
    const to = String(req.body?.to || "").trim();
    const reportType = String(req.body?.report_type || "")
        .trim()
        .toLowerCase();

    if (!to || !reportType) {
        return sendApiError(res, 400, "ERR_PLEASE_FILL_ALL_FIELDS");
    }

    const generator = REPORT_GENERATORS[reportType];
    if (!generator) {
        return sendApiError(res, 400, "ERR_INVALID_SELECTION");
    }

    try {
        const report = await generator({
            userId: req.user.id,
            as_of: req.body?.as_of,
            from_date: req.body?.from_date,
            to_date: req.body?.to_date,
            run_type: req.body?.run_type,
        });

        const csvRows = rowsForReportCsv(reportType, report);
        const csvContent = buildCsvFromRows(csvRows);
        const dateStamp = new Date().toISOString().slice(0, 10);
        const attachmentName = `${reportType}_${dateStamp}.csv`;

        await sendTemplatedEmail({
            to,
            subject: `FinLedger Report: ${reportType.replace(/_/g, " ")}`,
            templateName: "direct_message",
            templateData: {
                firstName: "Team",
                senderName: "FinLedger Reports",
                message: `Your requested ${reportType.replace(/_/g, " ")} report has been generated and attached as CSV.`,
            },
            attachments: [
                {
                    filename: attachmentName,
                    content: Buffer.from(csvContent || "", "utf8"),
                    contentType: "text/csv",
                },
            ],
        });

        return sendApiSuccess(res, "MSG_EMAIL_SENT_SUCCESS", {
            report_type: reportType,
            recipient: to,
            attachment_name: attachmentName,
        });
    } catch (error) {
        if (error?.code === "ERR_INVALID_SELECTION") {
            return sendApiError(res, 400, "ERR_INVALID_SELECTION");
        }
        log("error", "Failed to email report", { userId: req.user?.id, reportType, to, error: error.message }, utilities.getCallerInfo(), req.user?.id);
        return sendApiError(res, 500, "ERR_FAILED_TO_SEND_EMAIL");
    }
});

module.exports = router;
