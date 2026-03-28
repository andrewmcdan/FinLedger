const db = require("../db/db");

const DEFAULT_COMPANY_NAME = process.env.REPORT_COMPANY_NAME || "FinLedger";

const createCodeError = (code) => {
    const error = new Error(code);
    error.code = code;
    return error;
};

const normalizeDateValue = (value, { required = false } = {}) => {
    const normalized = String(value || "").trim();
    if (!normalized) {
        if (required) {
            throw createCodeError("ERR_INVALID_SELECTION");
        }
        return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return normalized;
};

const resolveAsOfDate = ({ asOfDate, toDate } = {}) => {
    const normalizedAsOf = normalizeDateValue(asOfDate);
    const normalizedToDate = normalizeDateValue(toDate);
    if (normalizedAsOf) {
        return normalizedAsOf;
    }
    if (normalizedToDate) {
        return normalizedToDate;
    }
    return new Date().toISOString().slice(0, 10);
};

const resolvePeriod = ({ fromDate, toDate } = {}) => {
    const normalizedToDate = normalizeDateValue(toDate) || new Date().toISOString().slice(0, 10);
    const normalizedFromDate = normalizeDateValue(fromDate) || `${normalizedToDate.slice(0, 4)}-01-01`;
    if (normalizedFromDate > normalizedToDate) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return {
        fromDate: normalizedFromDate,
        toDate: normalizedToDate,
    };
};

const normalizeRunType = (value) => {
    const normalized = String(value || "adjusted")
        .trim()
        .toLowerCase();
    if (!["unadjusted", "adjusted"].includes(normalized)) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return normalized;
};

const formatSignedAmount = (amount) => Number((Number(amount) || 0).toFixed(2));

const computeAccountBalancesAsOf = async ({ asOfDate, statementTypes = [] }) => {
    const statementTypesFilter = Array.isArray(statementTypes) && statementTypes.length > 0 ? statementTypes : null;
    const result = await db.query(
        `WITH ledger_sums AS (
            SELECT
                le.account_id,
                SUM(CASE WHEN le.dc = 'debit' THEN le.amount ELSE 0 END) AS period_debits,
                SUM(CASE WHEN le.dc = 'credit' THEN le.amount ELSE 0 END) AS period_credits
            FROM ledger_entries le
            WHERE le.entry_date::date <= $1::date
            GROUP BY le.account_id
        )
        SELECT
            a.id,
            a.account_name,
            a.account_number,
            a.normal_side,
            a.statement_type,
            a.account_order,
            COALESCE(ac.name, '') AS account_category_name,
            COALESCE(a.initial_balance, 0)::numeric(18,2) AS initial_balance,
            COALESCE(ls.period_debits, 0)::numeric(18,2) AS period_debits,
            COALESCE(ls.period_credits, 0)::numeric(18,2) AS period_credits,
            CASE
                WHEN a.normal_side = 'debit'
                    THEN COALESCE(a.initial_balance, 0) + COALESCE(ls.period_debits, 0) - COALESCE(ls.period_credits, 0)
                ELSE COALESCE(a.initial_balance, 0) - COALESCE(ls.period_debits, 0) + COALESCE(ls.period_credits, 0)
            END::numeric(18,2) AS computed_balance
        FROM accounts a
        LEFT JOIN ledger_sums ls ON ls.account_id = a.id
        LEFT JOIN account_categories ac ON ac.id = a.account_category_id
        WHERE ($2::text[] IS NULL OR a.statement_type = ANY($2::text[]))
        ORDER BY a.account_order ASC, a.account_number ASC, a.id ASC`,
        [asOfDate, statementTypesFilter],
    );
    return result.rows;
};

const computePeriodMovements = async ({ fromDate, toDate, statementTypes = [] }) => {
    const statementTypesFilter = Array.isArray(statementTypes) && statementTypes.length > 0 ? statementTypes : null;
    const result = await db.query(
        `SELECT
            a.id,
            a.account_name,
            a.account_number,
            a.normal_side,
            a.statement_type,
            a.account_order,
            COALESCE(ac.name, '') AS account_category_name,
            COALESCE(SUM(CASE WHEN le.dc = 'debit' THEN le.amount ELSE 0 END), 0)::numeric(18,2) AS period_debits,
            COALESCE(SUM(CASE WHEN le.dc = 'credit' THEN le.amount ELSE 0 END), 0)::numeric(18,2) AS period_credits
         FROM accounts a
         LEFT JOIN ledger_entries le
             ON le.account_id = a.id
            AND le.entry_date::date >= $1::date
            AND le.entry_date::date <= $2::date
         LEFT JOIN account_categories ac ON ac.id = a.account_category_id
         WHERE ($3::text[] IS NULL OR a.statement_type = ANY($3::text[]))
         GROUP BY a.id, ac.name
         ORDER BY a.account_order ASC, a.account_number ASC, a.id ASC`,
        [fromDate, toDate, statementTypesFilter],
    );
    return result.rows;
};

const toDebitCreditColumns = (balance, normalSide) => {
    const amount = Number(balance);
    if (Number.isNaN(amount)) {
        return { debit: 0, credit: 0 };
    }
    if (amount === 0) {
        return { debit: 0, credit: 0 };
    }
    const amountAbs = Math.abs(amount);
    if (amount > 0) {
        return normalSide === "debit" ? { debit: amountAbs, credit: 0 } : { debit: 0, credit: amountAbs };
    }
    return normalSide === "debit" ? { debit: 0, credit: amountAbs } : { debit: amountAbs, credit: 0 };
};

const generateTrialBalance = async ({ userId, asOfDate, runType }) => {
    const normalizedAsOfDate = resolveAsOfDate({ asOfDate });
    const normalizedRunType = normalizeRunType(runType);
    const balances = await computeAccountBalancesAsOf({ asOfDate: normalizedAsOfDate });

    const lines = balances
        .map((row) => {
            const sides = toDebitCreditColumns(row.computed_balance, row.normal_side);
            return {
                account_id: row.id,
                account_name: row.account_name,
                account_number: row.account_number,
                account_order: row.account_order,
                statement_type: row.statement_type,
                account_category_name: row.account_category_name,
                debit_balance: formatSignedAmount(sides.debit),
                credit_balance: formatSignedAmount(sides.credit),
                balance: formatSignedAmount(row.computed_balance),
            };
        })
        .filter((line) => line.debit_balance !== 0 || line.credit_balance !== 0);

    const totalDebits = formatSignedAmount(lines.reduce((sum, line) => sum + line.debit_balance, 0));
    const totalCredits = formatSignedAmount(lines.reduce((sum, line) => sum + line.credit_balance, 0));

    const runInsert = await db.query(
        `INSERT INTO trial_balance_runs (run_type, as_of_date, created_by, total_debits, total_credits)
         VALUES ($1, $2::timestamp, $3, $4, $5)
         RETURNING id, created_at`,
        [normalizedRunType, normalizedAsOfDate, Number(userId), totalDebits, totalCredits],
    );

    const runId = runInsert.rows[0].id;

    for (const line of lines) {
        await db.query(
            `INSERT INTO trial_balance_lines (trial_balance_run_id, account_id, debit_balance, credit_balance, liquidity_order_used)
             VALUES ($1, $2, $3, $4, $5)`,
            [runId, line.account_id, line.debit_balance, line.credit_balance, Number(line.account_order || 0)],
        );
    }

    return {
        report_type: "trial_balance",
        run_id: runId,
        generated_at: runInsert.rows[0].created_at,
        as_of_date: normalizedAsOfDate,
        run_type: normalizedRunType,
        totals: {
            total_debits: totalDebits,
            total_credits: totalCredits,
            is_balanced: totalDebits === totalCredits,
        },
        lines,
    };
};

const calculateIncomeStatement = async ({ fromDate, toDate }) => {
    const period = resolvePeriod({ fromDate, toDate });
    const movements = await computePeriodMovements({ fromDate: period.fromDate, toDate: period.toDate, statementTypes: ["IS"] });

    const revenueLines = [];
    const expenseLines = [];

    for (const row of movements) {
        const debits = Number(row.period_debits || 0);
        const credits = Number(row.period_credits || 0);
        const net = row.normal_side === "credit" ? credits - debits : debits - credits;
        const normalizedNet = formatSignedAmount(net);
        if (normalizedNet === 0) {
            continue;
        }

        const line = {
            account_id: row.id,
            account_name: row.account_name,
            account_number: row.account_number,
            account_category_name: row.account_category_name,
            amount: Math.abs(normalizedNet),
            signed_amount: normalizedNet,
        };

        if (row.normal_side === "credit") {
            revenueLines.push(line);
        } else {
            expenseLines.push(line);
        }
    }

    const totalRevenue = formatSignedAmount(revenueLines.reduce((sum, line) => sum + line.amount, 0));
    const totalExpense = formatSignedAmount(expenseLines.reduce((sum, line) => sum + line.amount, 0));
    const netIncome = formatSignedAmount(totalRevenue - totalExpense);

    return {
        from_date: period.fromDate,
        to_date: period.toDate,
        revenue_lines: revenueLines,
        expense_lines: expenseLines,
        totals: {
            total_revenue: totalRevenue,
            total_expense: totalExpense,
            net_income: netIncome,
        },
    };
};

const generateIncomeStatement = async ({ userId, fromDate, toDate }) => {
    const report = await calculateIncomeStatement({ fromDate, toDate });
    const runInsert = await db.query(
        `INSERT INTO statement_runs (statement_type, company_name, title_line, data_line_type, date_value, created_by)
         VALUES ('IS', $1, $2, 'period_ending', $3::timestamp, $4)
         RETURNING id, created_at`,
        [DEFAULT_COMPANY_NAME, "Income Statement", report.to_date, Number(userId)],
    );

    return {
        report_type: "income_statement",
        run_id: runInsert.rows[0].id,
        generated_at: runInsert.rows[0].created_at,
        ...report,
    };
};

const generateBalanceSheet = async ({ userId, asOfDate }) => {
    const normalizedAsOfDate = resolveAsOfDate({ asOfDate });
    const balances = await computeAccountBalancesAsOf({ asOfDate: normalizedAsOfDate, statementTypes: ["BS", "RE"] });

    const assets = [];
    const liabilitiesAndEquity = [];

    for (const row of balances) {
        const amount = formatSignedAmount(Math.abs(Number(row.computed_balance || 0)));
        if (amount === 0) {
            continue;
        }
        const line = {
            account_id: row.id,
            account_name: row.account_name,
            account_number: row.account_number,
            statement_type: row.statement_type,
            account_category_name: row.account_category_name,
            amount,
        };

        if (row.normal_side === "debit") {
            assets.push(line);
        } else {
            liabilitiesAndEquity.push(line);
        }
    }

    const totalAssets = formatSignedAmount(assets.reduce((sum, line) => sum + line.amount, 0));
    const totalLiabilitiesAndEquity = formatSignedAmount(liabilitiesAndEquity.reduce((sum, line) => sum + line.amount, 0));

    const runInsert = await db.query(
        `INSERT INTO statement_runs (statement_type, company_name, title_line, data_line_type, date_value, created_by)
         VALUES ('BS', $1, $2, 'as_of_date', $3::timestamp, $4)
         RETURNING id, created_at`,
        [DEFAULT_COMPANY_NAME, "Balance Sheet", normalizedAsOfDate, Number(userId)],
    );

    return {
        report_type: "balance_sheet",
        run_id: runInsert.rows[0].id,
        generated_at: runInsert.rows[0].created_at,
        as_of_date: normalizedAsOfDate,
        assets,
        liabilities_and_equity: liabilitiesAndEquity,
        totals: {
            total_assets: totalAssets,
            total_liabilities_and_equity: totalLiabilitiesAndEquity,
            is_balanced: totalAssets === totalLiabilitiesAndEquity,
        },
    };
};

const generateRetainedEarnings = async ({ userId, fromDate, toDate }) => {
    const period = resolvePeriod({ fromDate, toDate });
    const periodIncome = await calculateIncomeStatement({ fromDate: period.fromDate, toDate: period.toDate });

    const beginningBalances = await computeAccountBalancesAsOf({
        asOfDate: period.fromDate,
        statementTypes: ["RE"],
    });
    const endingBalances = await computeAccountBalancesAsOf({
        asOfDate: period.toDate,
        statementTypes: ["RE"],
    });

    const toCreditNormalAmount = (rows) =>
        formatSignedAmount(
            rows.reduce((sum, row) => {
                const balance = Number(row.computed_balance || 0);
                return sum + (row.normal_side === "credit" ? balance : -balance);
            }, 0),
        );

    const beginningRetainedEarnings = toCreditNormalAmount(beginningBalances);
    const endingRetainedEarnings = toCreditNormalAmount(endingBalances);
    const netIncome = formatSignedAmount(periodIncome.totals.net_income);
    const distributions = formatSignedAmount(beginningRetainedEarnings + netIncome - endingRetainedEarnings);

    const runInsert = await db.query(
        `INSERT INTO statement_runs (statement_type, company_name, title_line, data_line_type, date_value, created_by)
         VALUES ('RE', $1, $2, 'period_ending', $3::timestamp, $4)
         RETURNING id, created_at`,
        [DEFAULT_COMPANY_NAME, "Retained Earnings", period.toDate, Number(userId)],
    );

    return {
        report_type: "retained_earnings",
        run_id: runInsert.rows[0].id,
        generated_at: runInsert.rows[0].created_at,
        from_date: period.fromDate,
        to_date: period.toDate,
        values: {
            beginning_retained_earnings: beginningRetainedEarnings,
            net_income: netIncome,
            distributions,
            ending_retained_earnings: endingRetainedEarnings,
        },
    };
};

module.exports = {
    generateTrialBalance,
    generateIncomeStatement,
    generateBalanceSheet,
    generateRetainedEarnings,
};
