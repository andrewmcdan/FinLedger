const db = require("../db/db");

const TONES = {
    good: { className: "dashboard-tone--good", label: "Good", priority: 1 },
    warning: { className: "dashboard-tone--warning", label: "Warning", priority: 2 },
    review: { className: "dashboard-tone--review", label: "Review", priority: 3 },
    neutral: { className: "dashboard-tone--neutral", label: "Info", priority: 0 },
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

const percentFormatter = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
});

const ratioFormatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const toNumber = (value) => Number((Number(value) || 0).toFixed(2));

const normalizeText = (value) =>
    String(value || "")
        .trim()
        .toLowerCase();

const textMatchesAny = (value, patterns = []) => {
    const normalizedValue = normalizeText(value);
    return patterns.some((pattern) => normalizedValue.includes(pattern));
};

const formatCurrency = (value) => currencyFormatter.format(Number(value || 0));
const formatRatio = (value) => `${ratioFormatter.format(Number(value || 0))}x`;
const formatPercent = (value) => percentFormatter.format(Number(value || 0));

const getTodayIsoDate = () => new Date().toISOString().slice(0, 10);

const resolveTone = (toneKey) => TONES[toneKey] || TONES.neutral;

const makeCard = ({ title, value, detail, tone = "neutral", statusLabel = null }) => {
    const toneMeta = resolveTone(tone);
    return {
        title,
        value,
        detail,
        tone,
        toneClass: toneMeta.className,
        statusLabel: statusLabel || toneMeta.label,
    };
};

const makeMessage = ({ title, body, tone = "neutral", linkHref = "", linkLabel = "" }) => {
    const toneMeta = resolveTone(tone);
    return {
        title,
        body,
        tone,
        toneClass: toneMeta.className,
        priority: toneMeta.priority,
        linkHref,
        linkLabel,
    };
};

const makeQuickLink = ({ title, body, href = "", label, scrollTarget = "" }) => ({
    title,
    body,
    href,
    label,
    scrollTarget,
});

const loadAccountBalances = async () => {
    const result = await db.query(
        `SELECT
            a.id,
            a.account_name,
            a.account_description,
            a.balance,
            a.normal_side,
            a.statement_type,
            COALESCE(ac.name, '') AS account_category_name,
            COALESCE(asub.name, '') AS account_subcategory_name
         FROM accounts a
         LEFT JOIN account_categories ac ON ac.id = a.account_category_id
         LEFT JOIN account_subcategories asub ON asub.id = a.account_subcategory_id
         WHERE a.status = 'active'
         ORDER BY a.account_order ASC, a.account_number ASC, a.id ASC`,
    );
    return result.rows.map((row) => ({
        ...row,
        balance: toNumber(row.balance),
    }));
};

const loadIncomeStatementSnapshot = async ({ fromDate, toDate }) => {
    const result = await db.query(
        `SELECT
            a.id,
            a.account_name,
            a.account_description,
            a.normal_side,
            COALESCE(ac.name, '') AS account_category_name,
            COALESCE(asub.name, '') AS account_subcategory_name,
            COALESCE(SUM(CASE WHEN le.dc = 'debit' THEN le.amount ELSE 0 END), 0)::numeric(18,2) AS period_debits,
            COALESCE(SUM(CASE WHEN le.dc = 'credit' THEN le.amount ELSE 0 END), 0)::numeric(18,2) AS period_credits
         FROM accounts a
         LEFT JOIN ledger_entries le
           ON le.account_id = a.id
          AND le.entry_date::date >= $1::date
          AND le.entry_date::date <= $2::date
         LEFT JOIN account_categories ac ON ac.id = a.account_category_id
         LEFT JOIN account_subcategories asub ON asub.id = a.account_subcategory_id
         WHERE a.statement_type = 'IS'
         GROUP BY a.id, ac.name, asub.name
         ORDER BY a.id ASC`,
        [fromDate, toDate],
    );
    return result.rows.map((row) => ({
        ...row,
        period_debits: toNumber(row.period_debits),
        period_credits: toNumber(row.period_credits),
    }));
};

const loadJournalAlertCounts = async ({ userId }) => {
    const result = await db.query(
        `SELECT
            COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_total,
            COUNT(*) FILTER (WHERE status = 'pending' AND journal_type = 'adjusting')::int AS pending_adjusting_total,
            COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected_total,
            COUNT(*) FILTER (WHERE status = 'pending' AND created_by = $1)::int AS pending_mine,
            COUNT(*) FILTER (WHERE status = 'rejected' AND created_by = $1)::int AS rejected_mine
         FROM journal_entries`,
        [Number(userId)],
    );
    return result.rows[0] || {
        pending_total: 0,
        pending_adjusting_total: 0,
        rejected_total: 0,
        pending_mine: 0,
        rejected_mine: 0,
    };
};

const isCurrentAsset = (row) => textMatchesAny(row.account_subcategory_name, ["current asset"]);
const isCurrentLiability = (row) => textMatchesAny(row.account_subcategory_name, ["current liabil"]);
const isAsset = (row) => textMatchesAny(row.account_category_name, ["asset"]);
const isLiability = (row) => textMatchesAny(row.account_category_name, ["liabil"]);
const isEquity = (row) => textMatchesAny(row.account_category_name, ["equity"]) || row.statement_type === "RE";
const isCashLike = (row) => textMatchesAny(`${row.account_name} ${row.account_description}`, ["cash", "checking", "savings", "bank"]);
const isReceivable = (row) => textMatchesAny(`${row.account_name} ${row.account_description}`, ["receivable", "a/r"]);
const isPayable = (row) => textMatchesAny(`${row.account_name} ${row.account_description}`, ["payable", "a/p"]);
const isQuickAssetExclusion = (row) => textMatchesAny(`${row.account_name} ${row.account_description}`, ["inventory", "prepaid", "supplies"]);
const isCostOfGoods = (row) => textMatchesAny(`${row.account_name} ${row.account_description} ${row.account_category_name} ${row.account_subcategory_name}`, ["cost of goods", "cost of sales", "cogs"]);

const classifyCurrentRatio = (value) => {
    if (value >= 2) return "good";
    if (value >= 1) return "warning";
    return "review";
};

const classifyQuickRatio = (value) => {
    if (value >= 1) return "good";
    if (value >= 0.75) return "warning";
    return "review";
};

const classifyDebtToEquity = (value) => {
    if (value <= 1) return "good";
    if (value <= 2) return "warning";
    return "review";
};

const classifyMargin = (value) => {
    if (value >= 0.15) return "good";
    if (value >= 0.05) return "warning";
    return "review";
};

const classifyRoa = (value) => {
    if (value >= 0.08) return "good";
    if (value >= 0.03) return "warning";
    return "review";
};

const classifyRoe = (value) => {
    if (value >= 0.15) return "good";
    if (value >= 0.08) return "warning";
    return "review";
};

const classifyWorkingCapital = (value) => {
    if (value > 0) return "good";
    if (value === 0) return "warning";
    return "review";
};

const summarizeBalances = (rows = []) => {
    const totals = {
        cashOnHand: 0,
        receivables: 0,
        payables: 0,
        currentAssets: 0,
        currentLiabilities: 0,
        totalAssets: 0,
        totalLiabilities: 0,
        totalEquity: 0,
        quickAssets: 0,
    };

    for (const row of rows) {
        const amount = toNumber(row.balance);
        if (isAsset(row)) {
            totals.totalAssets += amount;
        }
        if (isLiability(row)) {
            totals.totalLiabilities += amount;
        }
        if (isEquity(row)) {
            totals.totalEquity += amount;
        }
        if (isCurrentAsset(row)) {
            totals.currentAssets += amount;
            if (!isQuickAssetExclusion(row)) {
                totals.quickAssets += amount;
            }
        }
        if (isCurrentLiability(row)) {
            totals.currentLiabilities += amount;
        }
        if (isCashLike(row)) {
            totals.cashOnHand += amount;
        }
        if (isReceivable(row)) {
            totals.receivables += amount;
        }
        if (isPayable(row)) {
            totals.payables += amount;
        }
    }

    return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, toNumber(value)]));
};

const summarizeIncomeStatement = (rows = []) => {
    let revenue = 0;
    let expenses = 0;
    let costOfGoodsSold = 0;

    for (const row of rows) {
        const debits = toNumber(row.period_debits);
        const credits = toNumber(row.period_credits);
        const netAmount = row.normal_side === "credit" ? toNumber(credits - debits) : toNumber(debits - credits);
        if (row.normal_side === "credit") {
            revenue += netAmount;
            continue;
        }
        expenses += netAmount;
        if (isCostOfGoods(row)) {
            costOfGoodsSold += netAmount;
        }
    }

    const totalRevenue = toNumber(revenue);
    const totalExpenses = toNumber(expenses);
    const grossProfit = toNumber(totalRevenue - costOfGoodsSold);
    const netIncome = toNumber(totalRevenue - totalExpenses);

    return {
        totalRevenue,
        totalExpenses,
        grossProfit,
        netIncome,
        hasCostOfGoodsData: costOfGoodsSold > 0,
    };
};

const buildRatioCards = ({ balances, incomeStatement }) => {
    const ratioCards = [];

    if (balances.currentLiabilities > 0) {
        const currentRatio = balances.currentAssets / balances.currentLiabilities;
        ratioCards.push(
            makeCard({
                title: "Current Ratio",
                value: formatRatio(currentRatio),
                detail: "General benchmark: 2.00x or higher is healthy; under 1.00x needs attention.",
                tone: classifyCurrentRatio(currentRatio),
            }),
        );

        const quickRatio = balances.quickAssets / balances.currentLiabilities;
        ratioCards.push(
            makeCard({
                title: "Quick Ratio",
                value: formatRatio(quickRatio),
                detail: "General benchmark: 1.00x or higher is strong for near-term liquidity.",
                tone: classifyQuickRatio(quickRatio),
            }),
        );
    }

    if (balances.totalEquity > 0) {
        const debtToEquity = balances.totalLiabilities / balances.totalEquity;
        ratioCards.push(
            makeCard({
                title: "Debt-to-Equity",
                value: formatRatio(debtToEquity),
                detail: "General benchmark: 1.00x or lower is conservative; above 2.00x is higher risk.",
                tone: classifyDebtToEquity(debtToEquity),
            }),
        );
    }

    if (incomeStatement.totalRevenue > 0) {
        if (incomeStatement.hasCostOfGoodsData) {
            const grossMargin = incomeStatement.grossProfit / incomeStatement.totalRevenue;
            ratioCards.push(
                makeCard({
                    title: "Gross Margin",
                    value: formatPercent(grossMargin),
                    detail: "General benchmark: 15%+ is strong; under 5% needs review.",
                    tone: classifyMargin(grossMargin),
                }),
            );
        }

        const netProfitMargin = incomeStatement.netIncome / incomeStatement.totalRevenue;
        ratioCards.push(
            makeCard({
                title: "Net Profit Margin",
                value: formatPercent(netProfitMargin),
                detail: "General benchmark: 15%+ is strong; under 5% is thin.",
                tone: classifyMargin(netProfitMargin),
            }),
        );
    }

    if (balances.totalAssets > 0) {
        const returnOnAssets = incomeStatement.netIncome / balances.totalAssets;
        ratioCards.push(
            makeCard({
                title: "Return on Assets",
                value: formatPercent(returnOnAssets),
                detail: "General benchmark: 8%+ is strong; under 3% needs review.",
                tone: classifyRoa(returnOnAssets),
            }),
        );
    }

    if (balances.totalEquity > 0) {
        const returnOnEquity = incomeStatement.netIncome / balances.totalEquity;
        ratioCards.push(
            makeCard({
                title: "Return on Equity",
                value: formatPercent(returnOnEquity),
                detail: "General benchmark: 15%+ is strong; under 8% needs review.",
                tone: classifyRoe(returnOnEquity),
            }),
        );
    }

    return ratioCards;
};

const buildSummaryCards = ({ balances, incomeStatement }) => {
    const workingCapital = toNumber(balances.currentAssets - balances.currentLiabilities);
    return [
        makeCard({
            title: "Cash on Hand",
            value: formatCurrency(balances.cashOnHand),
            detail: "Cash and bank balances currently available.",
            tone: balances.cashOnHand > 0 ? "good" : balances.cashOnHand === 0 ? "warning" : "review",
        }),
        makeCard({
            title: "Accounts Receivable",
            value: formatCurrency(balances.receivables),
            detail: "Open receivable balances identified from active accounts.",
            tone: balances.receivables > 0 ? "warning" : "good",
            statusLabel: balances.receivables > 0 ? "Monitor" : "Clear",
        }),
        makeCard({
            title: "Accounts Payable",
            value: formatCurrency(balances.payables),
            detail: "Open payable balances identified from active accounts.",
            tone: balances.payables > 0 ? "warning" : "good",
            statusLabel: balances.payables > 0 ? "Due" : "Clear",
        }),
        makeCard({
            title: "Year-to-Date Net Income",
            value: formatCurrency(incomeStatement.netIncome),
            detail: `Revenue ${formatCurrency(incomeStatement.totalRevenue)} less expenses ${formatCurrency(incomeStatement.totalExpenses)}.`,
            tone: incomeStatement.netIncome > 0 ? "good" : incomeStatement.netIncome === 0 ? "warning" : "review",
        }),
        makeCard({
            title: "Working Capital",
            value: formatCurrency(workingCapital),
            detail: `${formatCurrency(balances.currentAssets)} current assets vs ${formatCurrency(balances.currentLiabilities)} current liabilities.`,
            tone: classifyWorkingCapital(workingCapital),
        }),
    ];
};

const buildImportantMessages = ({ role, journalAlerts, users = [] }) => {
    const messages = [];
    const pendingUsers = users.filter((user) => user.status === "pending").length;
    const expiredPasswords = users.filter((user) => user.password_expires_at && new Date(user.password_expires_at) < new Date()).length;

    if (role === "manager") {
        if (journalAlerts.pending_total > 0) {
            messages.push(
                makeMessage({
                    title: "Journal approvals waiting",
                    body: `${journalAlerts.pending_total} journal entr${journalAlerts.pending_total === 1 ? "y is" : "ies are"} waiting for manager review.`,
                    tone: journalAlerts.pending_total >= 5 ? "review" : "warning",
                    linkHref: "#/transactions",
                    linkLabel: "Open Transactions",
                }),
            );
        }
        if (journalAlerts.pending_adjusting_total > 0) {
            messages.push(
                makeMessage({
                    title: "Adjusting entries pending",
                    body: `${journalAlerts.pending_adjusting_total} adjusting entr${journalAlerts.pending_adjusting_total === 1 ? "y is" : "ies are"} still awaiting approval.`,
                    tone: "warning",
                    linkHref: "#/transactions",
                    linkLabel: "Review Queue",
                }),
            );
        }
    }

    if (role === "accountant") {
        if (journalAlerts.pending_mine > 0) {
            messages.push(
                makeMessage({
                    title: "Your submissions are pending",
                    body: `${journalAlerts.pending_mine} of your journal entr${journalAlerts.pending_mine === 1 ? "y is" : "ies are"} awaiting manager approval.`,
                    tone: "warning",
                    linkHref: "#/transactions",
                    linkLabel: "Open Transactions",
                }),
            );
        }
        if (journalAlerts.rejected_mine > 0) {
            messages.push(
                makeMessage({
                    title: "Rejected journals need revision",
                    body: `${journalAlerts.rejected_mine} of your journal entr${journalAlerts.rejected_mine === 1 ? "y has" : "ies have"} been rejected and should be corrected.`,
                    tone: "review",
                    linkHref: "#/transactions",
                    linkLabel: "Review Queue",
                }),
            );
        }
    }

    if (role === "administrator") {
        if (pendingUsers > 0) {
            messages.push(
                makeMessage({
                    title: "User approvals waiting",
                    body: `${pendingUsers} user account${pendingUsers === 1 ? " is" : "s are"} waiting for approval.`,
                    tone: pendingUsers >= 5 ? "review" : "warning",
                    linkHref: "#/dashboard",
                    linkLabel: "Review Users",
                }),
            );
        }
        if (expiredPasswords > 0) {
            messages.push(
                makeMessage({
                    title: "Expired passwords found",
                    body: `${expiredPasswords} user account${expiredPasswords === 1 ? " has" : "s have"} an expired password.`,
                    tone: "review",
                    linkHref: "#/dashboard",
                    linkLabel: "Open User Management",
                }),
            );
        }
        if (journalAlerts.pending_total > 0) {
            messages.push(
                makeMessage({
                    title: "Accounting queue is active",
                    body: `${journalAlerts.pending_total} journal entr${journalAlerts.pending_total === 1 ? "y is" : "ies are"} pending in the accounting workflow.`,
                    tone: "warning",
                    linkHref: "#/transactions",
                    linkLabel: "View Transactions",
                }),
            );
        }
    }

    if (messages.length === 0) {
        messages.push(
            makeMessage({
                title: "No urgent alerts",
                body: "No approval, rejection, or password-expiration issues need attention right now.",
                tone: "good",
            }),
        );
    }

    return messages.sort((left, right) => right.priority - left.priority);
};

const buildQuickLinks = (role) => {
    const transactionBodyByRole = {
        administrator: "Open ledger activity and review the accounting workflow from a read-only administrator view.",
        manager: "Create journal entries, review the approval queue, and monitor posted ledger activity.",
        accountant: "Create journal entries, submit work for approval, and review queue and ledger status.",
    };

    const links = [
        makeQuickLink({
            title: "Accounts",
            body: "Open the chart of accounts and account maintenance tools.",
            href: "#/accounts_list",
            label: "Open Accounts",
        }),
        makeQuickLink({
            title: "Transactions",
            body: transactionBodyByRole[role] || "Open journal and ledger workflows.",
            href: "#/transactions",
            label: "Open Transactions",
        }),
        makeQuickLink({
            title: "Reports",
            body: "Generate the trial balance and financial statements.",
            href: "#/reports",
            label: "Open Reports",
        }),
        makeQuickLink({
            title: "Audit",
            body: "Review audit logs and export filtered audit reports.",
            href: "#/audit",
            label: "Open Audit",
        }),
        makeQuickLink({
            title: "Profile",
            body: "Manage your profile, password, and security questions.",
            href: "#/profile",
            label: "Open Profile",
        }),
        makeQuickLink({
            title: "Help",
            body: "Open the in-app user manual and workflow guidance.",
            href: "#/help",
            label: "Open Help",
        }),
    ];

    if (role === "administrator") {
        links.unshift(
            makeQuickLink({
                title: "User Management",
                body: "Jump straight to user approvals, account status controls, and admin-only forms below.",
                label: "Open User Management",
                scrollTarget: "user-management",
            }),
        );
    }

    return links;
};

const buildDashboardSummary = async ({ userId, role, users = [] }) => {
    const asOfDate = getTodayIsoDate();
    const fromDate = `${asOfDate.slice(0, 4)}-01-01`;
    const [accountBalances, incomeStatementRows, journalAlerts] = await Promise.all([
        loadAccountBalances(),
        loadIncomeStatementSnapshot({ fromDate, toDate: asOfDate }),
        loadJournalAlertCounts({ userId }),
    ]);

    const balances = summarizeBalances(accountBalances);
    const incomeStatement = summarizeIncomeStatement(incomeStatementRows);
    const summaryCards = buildSummaryCards({ balances, incomeStatement });
    const ratioCards = buildRatioCards({ balances, incomeStatement });
    const messages = buildImportantMessages({ role, journalAlerts, users });
    const quickLinks = buildQuickLinks(role);

    return {
        generatedAtLabel: new Date().toLocaleString(),
        asOfDate,
        fromDate,
        summaryCards,
        ratioCards,
        messages,
        quickLinks,
    };
};

module.exports = {
    buildDashboardSummary,
};
