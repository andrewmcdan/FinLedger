/**
 * Solved accounting-problem seed script
 *
 * Seeds the Addams & Family Inc. solved problem from
 * accounting_solved_problem_markdown.md into the FinLedger database.
 *
 * Notes:
 * - The source markdown mixes April 2002 transaction dates with some 2010 statement headings.
 *   This script uses the transaction period stated in the narrative: April 2002.
 * - The source closing entry is dated April 30. FinLedger reports are date-granular, not time-granular,
 *   so the optional closing entry is posted on 2002-05-01 by default to preserve the April adjusted reports.
 *
 * Usage:
 *   node --env-file=.env scripts/solved-data-seed.js
 *   node --env-file=.env scripts/solved-data-seed.js --skip-closing
 *   node --env-file=.env.test scripts/solved-data-seed.js
 */

const db = require("../src/db/db");
const accountsController = require("../src/controllers/accounts");
const reportsController = require("../src/controllers/reports");
const transactionsController = require("../src/controllers/transactions");

const SOURCE_FILE = "accounting_solved_problem_markdown.md";
const SOURCE_LABEL = "Addams & Family Inc. solved problem";
const SEED_TAG = "solved-data-seed.js";
const APRIL_START = "2002-04-01";
const APRIL_END = "2002-04-30";
const CLOSING_POST_DATE = "2002-05-01";
const APPROVAL_COMMENT = "Auto-approved by solved-data-seed.js";
const VALID_ADJUSTMENT_REASONS = new Set(["prepaid_expense", "accrual", "depreciation", "other"]);

const ACCOUNT_DEFINITIONS = [
    {
        accountName: "Cash",
        accountDescription: "Operating cash for the Addams & Family solved seed.",
        normalSide: "debit",
        category: "Assets",
        subcategory: "Current Assets",
        statementType: "BS",
        accountOrder: 10,
    },
    {
        accountName: "Accounts Receivable",
        accountDescription: "Client receivables for the Addams & Family solved seed.",
        normalSide: "debit",
        category: "Assets",
        subcategory: "Current Assets",
        statementType: "BS",
        accountOrder: 11,
    },
    {
        accountName: "Supplies",
        accountDescription: "Office supplies on hand for the Addams & Family solved seed.",
        normalSide: "debit",
        category: "Assets",
        subcategory: "Current Assets",
        statementType: "BS",
        accountOrder: 12,
    },
    {
        accountName: "Prepaid Rent",
        accountDescription: "Prepaid rent asset for the Addams & Family solved seed.",
        normalSide: "debit",
        category: "Assets",
        subcategory: "Current Assets",
        statementType: "BS",
        accountOrder: 13,
    },
    {
        accountName: "Prepaid Insurance",
        accountDescription: "Prepaid insurance asset for the Addams & Family solved seed.",
        normalSide: "debit",
        category: "Assets",
        subcategory: "Current Assets",
        statementType: "BS",
        accountOrder: 14,
    },
    {
        accountName: "Office Equipment",
        accountDescription: "Office equipment and furniture for the Addams & Family solved seed.",
        normalSide: "debit",
        category: "Assets",
        subcategory: "Fixed Assets",
        statementType: "BS",
        accountOrder: 20,
    },
    {
        accountName: "Accumulated Depreciation",
        accountDescription: "Accumulated depreciation on office equipment for the Addams & Family solved seed.",
        normalSide: "credit",
        category: "Assets",
        subcategory: "Fixed Assets",
        statementType: "BS",
        accountOrder: 21,
    },
    {
        accountName: "Accounts Payable",
        accountDescription: "Vendor balances payable for the Addams & Family solved seed.",
        normalSide: "credit",
        category: "Liabilities",
        subcategory: "Current Liabilities",
        statementType: "BS",
        accountOrder: 10,
    },
    {
        accountName: "Salaries Payable",
        accountDescription: "Accrued salaries payable for the Addams & Family solved seed.",
        normalSide: "credit",
        category: "Liabilities",
        subcategory: "Current Liabilities",
        statementType: "BS",
        accountOrder: 11,
    },
    {
        accountName: "Unearned Revenue",
        accountDescription: "Client advances not yet earned for the Addams & Family solved seed.",
        normalSide: "credit",
        category: "Liabilities",
        subcategory: "Current Liabilities",
        statementType: "BS",
        accountOrder: 12,
    },
    {
        accountName: "Contributed Capital",
        accountDescription: "Owner contribution account for the Addams & Family solved seed.",
        normalSide: "credit",
        category: "Equity",
        subcategory: "Common Stock",
        statementType: "BS",
        accountOrder: 10,
    },
    {
        accountName: "Retained Earnings",
        accountDescription: "Retained earnings for the Addams & Family solved seed.",
        normalSide: "credit",
        category: "Equity",
        subcategory: "Retained Earnings",
        statementType: "RE",
        accountOrder: 10,
    },
    {
        accountName: "Service Revenue",
        accountDescription: "Service revenue for the Addams & Family solved seed.",
        normalSide: "credit",
        category: "Revenue",
        subcategory: "Service Revenue",
        statementType: "IS",
        accountOrder: 10,
    },
    {
        accountName: "Insurance Expense",
        accountDescription: "Insurance expense for the Addams & Family solved seed.",
        normalSide: "debit",
        category: "Expenses",
        subcategory: "Operating Expenses",
        statementType: "IS",
        accountOrder: 10,
    },
    {
        accountName: "Depreciation Expense",
        accountDescription: "Depreciation expense for the Addams & Family solved seed.",
        normalSide: "debit",
        category: "Expenses",
        subcategory: "Operating Expenses",
        statementType: "IS",
        accountOrder: 11,
    },
    {
        accountName: "Rent Expense",
        accountDescription: "Rent expense for the Addams & Family solved seed.",
        normalSide: "debit",
        category: "Expenses",
        subcategory: "Operating Expenses",
        statementType: "IS",
        accountOrder: 12,
    },
    {
        accountName: "Supplies Expense",
        accountDescription: "Supplies expense for the Addams & Family solved seed.",
        normalSide: "debit",
        category: "Expenses",
        subcategory: "Operating Expenses",
        statementType: "IS",
        accountOrder: 13,
    },
    {
        accountName: "Salaries Expense",
        accountDescription: "Salary expense for the Addams & Family solved seed.",
        normalSide: "debit",
        category: "Expenses",
        subcategory: "Operating Expenses",
        statementType: "IS",
        accountOrder: 14,
    },
    {
        accountName: "Telephone Expense",
        accountDescription: "Telephone expense for the Addams & Family solved seed.",
        normalSide: "debit",
        category: "Expenses",
        subcategory: "Operating Expenses",
        statementType: "IS",
        accountOrder: 15,
    },
    {
        accountName: "Utilities Expense",
        accountDescription: "Utilities expense for the Addams & Family solved seed.",
        normalSide: "debit",
        category: "Expenses",
        subcategory: "Operating Expenses",
        statementType: "IS",
        accountOrder: 16,
    },
    {
        accountName: "Advertising Expense",
        accountDescription: "Advertising expense for the Addams & Family solved seed.",
        normalSide: "debit",
        category: "Expenses",
        subcategory: "Operating Expenses",
        statementType: "IS",
        accountOrder: 17,
    },
];

const GENERAL_ENTRIES = [
    {
        referenceCode: "ADDAMS-2002-GJ-01",
        journalType: "general",
        entryDate: "2002-04-04",
        description: "Owner contributed beginning assets to Addams & Family Inc.",
        lines: [
            { accountName: "Cash", dc: "debit", amount: 10000.0 },
            { accountName: "Accounts Receivable", dc: "debit", amount: 1500.0 },
            { accountName: "Supplies", dc: "debit", amount: 1250.0 },
            { accountName: "Office Equipment", dc: "debit", amount: 7500.0 },
            { accountName: "Contributed Capital", dc: "credit", amount: 20250.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-02",
        journalType: "general",
        entryDate: "2002-04-04",
        description: "Paid three months of rent in advance.",
        lines: [
            { accountName: "Prepaid Rent", dc: "debit", amount: 4500.0 },
            { accountName: "Cash", dc: "credit", amount: 4500.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-03",
        journalType: "general",
        entryDate: "2002-04-04",
        description: "Paid annual property and casualty insurance premium.",
        lines: [
            { accountName: "Prepaid Insurance", dc: "debit", amount: 1800.0 },
            { accountName: "Cash", dc: "credit", amount: 1800.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-04",
        journalType: "general",
        entryDate: "2002-04-06",
        description: "Received client advance payment for services to be provided.",
        lines: [
            { accountName: "Cash", dc: "debit", amount: 3000.0 },
            { accountName: "Unearned Revenue", dc: "credit", amount: 3000.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-05",
        journalType: "general",
        entryDate: "2002-04-07",
        description: "Purchased additional office furniture on account from Morrilton Company.",
        lines: [
            { accountName: "Office Equipment", dc: "debit", amount: 1800.0 },
            { accountName: "Accounts Payable", dc: "credit", amount: 1800.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-06",
        journalType: "general",
        entryDate: "2002-04-08",
        description: "Collected cash from clients on account.",
        lines: [
            { accountName: "Cash", dc: "debit", amount: 800.0 },
            { accountName: "Accounts Receivable", dc: "credit", amount: 800.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-07",
        journalType: "general",
        entryDate: "2002-04-11",
        description: "Paid newspaper advertising cost.",
        lines: [
            { accountName: "Advertising Expense", dc: "debit", amount: 120.0 },
            { accountName: "Cash", dc: "credit", amount: 120.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-08",
        journalType: "general",
        entryDate: "2002-04-12",
        description: "Paid part of the Morrilton Company balance.",
        lines: [
            { accountName: "Accounts Payable", dc: "debit", amount: 800.0 },
            { accountName: "Cash", dc: "credit", amount: 800.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-09",
        journalType: "general",
        entryDate: "2002-04-15",
        description: "Recorded services provided on account for April 4-15.",
        lines: [
            { accountName: "Accounts Receivable", dc: "debit", amount: 2250.0 },
            { accountName: "Service Revenue", dc: "credit", amount: 2250.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-10",
        journalType: "general",
        entryDate: "2002-04-15",
        description: "Paid part-time receptionist for two weeks of salary.",
        lines: [
            { accountName: "Salaries Expense", dc: "debit", amount: 400.0 },
            { accountName: "Cash", dc: "credit", amount: 400.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-11",
        journalType: "general",
        entryDate: "2002-04-15",
        description: "Recorded cash fees earned from cash clients for April 4-15.",
        lines: [
            { accountName: "Cash", dc: "debit", amount: 3175.0 },
            { accountName: "Service Revenue", dc: "credit", amount: 3175.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-12",
        journalType: "general",
        entryDate: "2002-04-18",
        description: "Paid cash for additional supplies.",
        lines: [
            { accountName: "Supplies", dc: "debit", amount: 750.0 },
            { accountName: "Cash", dc: "credit", amount: 750.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-13",
        journalType: "general",
        entryDate: "2002-04-22",
        description: "Recorded services provided on account for April 18-22.",
        lines: [
            { accountName: "Accounts Receivable", dc: "debit", amount: 1100.0 },
            { accountName: "Service Revenue", dc: "credit", amount: 1100.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-14",
        journalType: "general",
        entryDate: "2002-04-22",
        description: "Recorded cash fees earned from cash clients for April 18-22.",
        lines: [
            { accountName: "Cash", dc: "debit", amount: 1850.0 },
            { accountName: "Service Revenue", dc: "credit", amount: 1850.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-15",
        journalType: "general",
        entryDate: "2002-04-25",
        description: "Collected cash from clients on account.",
        lines: [
            { accountName: "Cash", dc: "debit", amount: 1600.0 },
            { accountName: "Accounts Receivable", dc: "credit", amount: 1600.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-16",
        journalType: "general",
        entryDate: "2002-04-27",
        description: "Paid part-time receptionist for two more weeks of salary.",
        lines: [
            { accountName: "Salaries Expense", dc: "debit", amount: 400.0 },
            { accountName: "Cash", dc: "credit", amount: 400.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-17",
        journalType: "general",
        entryDate: "2002-04-28",
        description: "Paid April telephone bill.",
        lines: [
            { accountName: "Telephone Expense", dc: "debit", amount: 130.0 },
            { accountName: "Cash", dc: "credit", amount: 130.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-18",
        journalType: "general",
        entryDate: "2002-04-29",
        description: "Paid April electric bill.",
        lines: [
            { accountName: "Utilities Expense", dc: "debit", amount: 200.0 },
            { accountName: "Cash", dc: "credit", amount: 200.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-19",
        journalType: "general",
        entryDate: "2002-04-29",
        description: "Recorded cash fees earned from cash clients for April 25-29.",
        lines: [
            { accountName: "Cash", dc: "debit", amount: 2050.0 },
            { accountName: "Service Revenue", dc: "credit", amount: 2050.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-20",
        journalType: "general",
        entryDate: "2002-04-29",
        description: "Recorded services provided on account for April 25-29.",
        lines: [
            { accountName: "Accounts Receivable", dc: "debit", amount: 1000.0 },
            { accountName: "Service Revenue", dc: "credit", amount: 1000.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-GJ-21",
        journalType: "general",
        entryDate: "2002-04-29",
        description: "Recorded salary paid to John from the company.",
        lines: [
            { accountName: "Salaries Expense", dc: "debit", amount: 4500.0 },
            { accountName: "Cash", dc: "credit", amount: 4500.0 },
        ],
    },
];

const ADJUSTING_ENTRIES = [
    {
        referenceCode: "ADDAMS-2002-AJ-01",
        journalType: "adjusting",
        entryDate: "2002-04-30",
        description: "Record expired insurance for April 2002.",
        adjustmentReason: "prepaid_expense",
        periodEndDate: "2002-04-30",
        notes: "Source adjustment a: Insurance expired in April, $150.",
        lines: [
            { accountName: "Insurance Expense", dc: "debit", amount: 150.0 },
            { accountName: "Prepaid Insurance", dc: "credit", amount: 150.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-AJ-02",
        journalType: "adjusting",
        entryDate: "2002-04-30",
        description: "Record supplies used during April 2002.",
        adjustmentReason: "prepaid_expense",
        periodEndDate: "2002-04-30",
        notes: "Source adjustment b: Supplies on hand April 29 were $1,020, so supplies used were $980.",
        lines: [
            { accountName: "Supplies Expense", dc: "debit", amount: 980.0 },
            { accountName: "Supplies", dc: "credit", amount: 980.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-AJ-03",
        journalType: "adjusting",
        entryDate: "2002-04-30",
        description: "Record April 2002 depreciation on office equipment.",
        adjustmentReason: "depreciation",
        periodEndDate: "2002-04-30",
        notes: "Source adjustment c: Depreciation for the office equipment in April, $500.",
        lines: [
            { accountName: "Depreciation Expense", dc: "debit", amount: 500.0 },
            { accountName: "Accumulated Depreciation", dc: "credit", amount: 500.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-AJ-04",
        journalType: "adjusting",
        entryDate: "2002-04-30",
        description: "Accrue unpaid receptionist salary at April 30, 2002.",
        adjustmentReason: "accrual",
        periodEndDate: "2002-04-30",
        notes: "Source adjustment d: Accrued receptionist salary on April 30, $20.",
        lines: [
            { accountName: "Salaries Expense", dc: "debit", amount: 20.0 },
            { accountName: "Salaries Payable", dc: "credit", amount: 20.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-AJ-05",
        journalType: "adjusting",
        entryDate: "2002-04-30",
        description: "Recognize rent expired during April 2002.",
        adjustmentReason: "prepaid_expense",
        periodEndDate: "2002-04-30",
        notes: "Source adjustment e: Rent expired in April, $1,500.",
        lines: [
            { accountName: "Rent Expense", dc: "debit", amount: 1500.0 },
            { accountName: "Prepaid Rent", dc: "credit", amount: 1500.0 },
        ],
    },
    {
        referenceCode: "ADDAMS-2002-AJ-06",
        journalType: "adjusting",
        entryDate: "2002-04-30",
        description: "Recognize services earned from the April 6 client advance.",
        adjustmentReason: "other",
        periodEndDate: "2002-04-30",
        notes: "Source adjustment f: Earned $2,000 of services previously paid for on April 6.",
        lines: [
            { accountName: "Unearned Revenue", dc: "debit", amount: 2000.0 },
            { accountName: "Service Revenue", dc: "credit", amount: 2000.0 },
        ],
    },
];

const CLOSING_ENTRIES = [
    {
        referenceCode: "ADDAMS-2002-CL-01",
        journalType: "general",
        entryDate: CLOSING_POST_DATE,
        description: "Close April 2002 revenue and expense accounts to Retained Earnings.",
        lines: [
            { accountName: "Service Revenue", dc: "debit", amount: 13425.0 },
            { accountName: "Insurance Expense", dc: "credit", amount: 150.0 },
            { accountName: "Depreciation Expense", dc: "credit", amount: 500.0 },
            { accountName: "Rent Expense", dc: "credit", amount: 1500.0 },
            { accountName: "Supplies Expense", dc: "credit", amount: 980.0 },
            { accountName: "Salaries Expense", dc: "credit", amount: 5320.0 },
            { accountName: "Telephone Expense", dc: "credit", amount: 130.0 },
            { accountName: "Utilities Expense", dc: "credit", amount: 200.0 },
            { accountName: "Advertising Expense", dc: "credit", amount: 120.0 },
            { accountName: "Retained Earnings", dc: "credit", amount: 4525.0 },
        ],
    },
];

const EXPECTED_ADJUSTED_BALANCES = {
    Cash: 8875.0,
    "Accounts Receivable": 3450.0,
    Supplies: 1020.0,
    "Prepaid Rent": 3000.0,
    "Prepaid Insurance": 1650.0,
    "Office Equipment": 9300.0,
    "Accumulated Depreciation": 500.0,
    "Accounts Payable": 1000.0,
    "Salaries Payable": 20.0,
    "Unearned Revenue": 1000.0,
    "Contributed Capital": 20250.0,
    "Retained Earnings": 0.0,
    "Service Revenue": 13425.0,
    "Insurance Expense": 150.0,
    "Depreciation Expense": 500.0,
    "Rent Expense": 1500.0,
    "Supplies Expense": 980.0,
    "Salaries Expense": 5320.0,
    "Telephone Expense": 130.0,
    "Utilities Expense": 200.0,
    "Advertising Expense": 120.0,
};

const EXPECTED_POST_CLOSING_BALANCES = {
    Cash: 8875.0,
    "Accounts Receivable": 3450.0,
    Supplies: 1020.0,
    "Prepaid Rent": 3000.0,
    "Prepaid Insurance": 1650.0,
    "Office Equipment": 9300.0,
    "Accumulated Depreciation": 500.0,
    "Accounts Payable": 1000.0,
    "Salaries Payable": 20.0,
    "Unearned Revenue": 1000.0,
    "Contributed Capital": 20250.0,
    "Retained Earnings": 4525.0,
    "Service Revenue": 0.0,
    "Insurance Expense": 0.0,
    "Depreciation Expense": 0.0,
    "Rent Expense": 0.0,
    "Supplies Expense": 0.0,
    "Salaries Expense": 0.0,
    "Telephone Expense": 0.0,
    "Utilities Expense": 0.0,
    "Advertising Expense": 0.0,
};

const ACCOUNT_DEFINITIONS_BY_NAME = new Map(ACCOUNT_DEFINITIONS.map((definition) => [definition.accountName, definition]));

const EXPECTED_REPORT_TOTALS = {
    trialBalance: {
        totalDebits: 36195.0,
        totalCredits: 36195.0,
    },
    balanceSheet: {
        totalAssets: 26795.0,
        totalLiabilities: 2020.0,
        totalEquity: 24775.0,
        totalLiabilitiesAndEquity: 26795.0,
    },
    retainedEarnings: {
        beginningRetainedEarnings: 0.0,
        netIncome: 4525.0,
        distributions: 0.0,
        endingRetainedEarnings: 4525.0,
    },
};

function parseArgs(argv) {
    return {
        includeClosing: !argv.includes("--skip-closing"),
    };
}

function roundMoney(value) {
    return Number(Number(value || 0).toFixed(2));
}

function assertBalancedLines(lines, referenceCode) {
    let debits = 0;
    let credits = 0;
    for (const line of lines) {
        const amount = roundMoney(line.amount);
        if (line.dc === "debit") {
            debits += amount;
        } else if (line.dc === "credit") {
            credits += amount;
        } else {
            throw new Error(`Unsupported dc "${line.dc}" on ${referenceCode}`);
        }
    }
    debits = roundMoney(debits);
    credits = roundMoney(credits);
    if (debits !== credits) {
        throw new Error(`Entry ${referenceCode} is not balanced. Debits=${debits} Credits=${credits}`);
    }
    return { totalDebits: debits, totalCredits: credits };
}

async function findSeedUsers() {
    const creatorResult = await db.query(
        `SELECT id, username, role
         FROM users
         WHERE status = 'active'
         ORDER BY
             CASE role
                 WHEN 'accountant' THEN 1
                 WHEN 'manager' THEN 2
                 WHEN 'administrator' THEN 3
                 ELSE 99
             END,
             id ASC
         LIMIT 1`,
    );
    if (creatorResult.rowCount === 0) {
        throw new Error("No active users found. Run the database init first so at least one user exists.");
    }

    const approverResult = await db.query(
        `SELECT id, username, role
         FROM users
         WHERE status = 'active'
           AND role IN ('manager', 'administrator')
         ORDER BY
             CASE role
                 WHEN 'manager' THEN 1
                 WHEN 'administrator' THEN 2
                 ELSE 99
             END,
             id ASC
         LIMIT 1`,
    );

    const creator = creatorResult.rows[0];
    const approver = approverResult.rows[0] || creator;
    return { creator, approver };
}

async function findAccountByName(accountName) {
    const result = await db.query(
        `SELECT
            a.*,
            c.name AS category_name,
            s.name AS subcategory_name
         FROM accounts a
         LEFT JOIN account_categories c ON c.id = a.account_category_id
         LEFT JOIN account_subcategories s ON s.id = a.account_subcategory_id
         WHERE a.account_name = $1
         LIMIT 1`,
        [accountName],
    );
    return result.rows[0] || null;
}

function validateExistingAccount(existingAccount, definition) {
    const mismatches = [];
    if (String(existingAccount.normal_side) !== String(definition.normalSide)) {
        mismatches.push(`normal_side=${existingAccount.normal_side}`);
    }
    if (String(existingAccount.statement_type) !== String(definition.statementType)) {
        mismatches.push(`statement_type=${existingAccount.statement_type}`);
    }
    if (String(existingAccount.category_name) !== String(definition.category)) {
        mismatches.push(`category=${existingAccount.category_name}`);
    }
    if (String(existingAccount.subcategory_name) !== String(definition.subcategory)) {
        mismatches.push(`subcategory=${existingAccount.subcategory_name}`);
    }
    if (mismatches.length > 0) {
        throw new Error(`Existing account "${definition.accountName}" does not match the solved-problem definition (${mismatches.join(", ")}).`);
    }
}

async function ensureAccounts(ownerId, changedByUserId) {
    const accountsByName = new Map();
    let createdCount = 0;
    let reusedCount = 0;

    for (const definition of ACCOUNT_DEFINITIONS) {
        const existing = await findAccountByName(definition.accountName);
        if (existing) {
            validateExistingAccount(existing, definition);
            accountsByName.set(definition.accountName, existing);
            reusedCount += 1;
            continue;
        }

        const created = await accountsController.createAccount(ownerId, definition.accountName, definition.accountDescription, definition.normalSide, definition.category, definition.subcategory, 0, 0, 0, 0, definition.accountOrder, definition.statementType, `${SOURCE_LABEL} seeded from ${SOURCE_FILE}`, changedByUserId);
        accountsByName.set(definition.accountName, created);
        createdCount += 1;
    }

    return { accountsByName, createdCount, reusedCount };
}

async function findEntryByReference(referenceCode) {
    const result = await db.query(
        `SELECT id, reference_code, status, journal_type, entry_date
         FROM journal_entries
         WHERE reference_code = $1
         LIMIT 1`,
        [referenceCode],
    );
    return result.rows[0] || null;
}

async function insertPendingJournalEntry({ entry, accountMap, createdByUserId }) {
    if (entry.journalType === "adjusting" && !VALID_ADJUSTMENT_REASONS.has(entry.adjustmentReason)) {
        throw new Error(`Unsupported adjustment reason "${entry.adjustmentReason}" on ${entry.referenceCode}`);
    }

    const normalizedLines = entry.lines.map((line) => {
        const account = accountMap.get(line.accountName);
        if (!account) {
            throw new Error(`Account "${line.accountName}" was not found for ${entry.referenceCode}.`);
        }
        return {
            accountId: Number(account.id),
            dc: String(line.dc),
            amount: roundMoney(line.amount),
            lineDescription: line.lineDescription || null,
        };
    });

    const totals = assertBalancedLines(normalizedLines, entry.referenceCode);

    return db.transaction(async (client) => {
        const headerResult = await client.query(
            `INSERT INTO journal_entries
                (journal_type, entry_date, description, status, total_debits, total_credits, created_by, updated_by, reference_code)
             VALUES
                ($1, $2::timestamp, $3, 'pending', $4, $5, $6, $6, $7)
             RETURNING id`,
            [entry.journalType, entry.entryDate, entry.description, totals.totalDebits, totals.totalCredits, createdByUserId, entry.referenceCode],
        );

        const journalEntryId = Number(headerResult.rows[0].id);
        const persistedLines = [];

        for (let index = 0; index < normalizedLines.length; index += 1) {
            const line = normalizedLines[index];
            const lineResult = await client.query(
                `INSERT INTO journal_entry_lines
                    (journal_entry_id, line_no, account_id, dc, amount, line_description, created_by, updated_by)
                 VALUES
                    ($1, $2, $3, $4, $5, $6, $7, $7)
                 RETURNING id`,
                [journalEntryId, index + 1, line.accountId, line.dc, line.amount, line.lineDescription, createdByUserId],
            );
            persistedLines.push({
                id: Number(lineResult.rows[0].id),
                accountId: line.accountId,
                dc: line.dc,
                amount: line.amount,
                lineDescription: line.lineDescription,
            });
        }

        if (entry.journalType === "adjusting") {
            const metadataResult = await client.query(
                `INSERT INTO adjustment_metadata
                    (journal_entry_id, adjustment_reason, period_end_date, created_by, notes)
                 VALUES
                    ($1, $2, $3::timestamp, $4, $5)
                 RETURNING id`,
                [journalEntryId, entry.adjustmentReason, entry.periodEndDate, createdByUserId, entry.notes || null],
            );

            const adjustmentMetadataId = Number(metadataResult.rows[0].id);
            for (const line of persistedLines) {
                await client.query(
                    `INSERT INTO adjustment_lines
                        (adjustment_metadata_id, account_id, dc, amount, line_description, created_by)
                     VALUES
                        ($1, $2, $3, $4, $5, $6)`,
                    [adjustmentMetadataId, line.accountId, line.dc, line.amount, line.lineDescription, createdByUserId],
                );
            }
        }

        return { journalEntryId };
    }, createdByUserId);
}

async function seedAndApproveEntry({ entry, accountMap, createdByUserId, approvedByUserId }) {
    const existing = await findEntryByReference(entry.referenceCode);
    if (existing) {
        if (existing.status === "approved") {
            return { created: false, approved: false, reusedExisting: true, journalEntryId: Number(existing.id) };
        }
        if (existing.status === "pending") {
            await transactionsController.approveJournalEntry({
                journalEntryId: Number(existing.id),
                managerUserId: approvedByUserId,
                managerComment: APPROVAL_COMMENT,
            });
            return { created: false, approved: true, reusedExisting: true, journalEntryId: Number(existing.id) };
        }
        throw new Error(`Seed entry ${entry.referenceCode} already exists with rejected status. Remove or fix it before rerunning.`);
    }

    const inserted = await insertPendingJournalEntry({
        entry,
        accountMap,
        createdByUserId,
    });

    await transactionsController.approveJournalEntry({
        journalEntryId: inserted.journalEntryId,
        managerUserId: approvedByUserId,
        managerComment: APPROVAL_COMMENT,
    });

    return { created: true, approved: true, reusedExisting: false, journalEntryId: inserted.journalEntryId };
}

async function computeBalancesAsOf(asOfDate) {
    const result = await db.query(
        `WITH ledger_sums AS (
            SELECT
                le.account_id,
                COALESCE(SUM(CASE WHEN le.dc = 'debit' THEN le.amount ELSE 0 END), 0)::numeric(18,2) AS debits,
                COALESCE(SUM(CASE WHEN le.dc = 'credit' THEN le.amount ELSE 0 END), 0)::numeric(18,2) AS credits
            FROM ledger_entries le
            WHERE le.entry_date::date <= $1::date
            GROUP BY le.account_id
        )
        SELECT
            a.account_name,
            a.normal_side,
            a.statement_type,
            CASE
                WHEN a.normal_side = 'debit'
                    THEN COALESCE(a.initial_balance, 0) + COALESCE(ls.debits, 0) - COALESCE(ls.credits, 0)
                ELSE COALESCE(a.initial_balance, 0) - COALESCE(ls.debits, 0) + COALESCE(ls.credits, 0)
            END::numeric(18,2) AS balance
        FROM accounts a
        LEFT JOIN ledger_sums ls ON ls.account_id = a.id`,
        [asOfDate],
    );

    return new Map(result.rows.map((row) => [row.account_name, roundMoney(row.balance)]));
}

async function computeIncomeStatementTotals(fromDate, toDate) {
    const result = await db.query(
        `SELECT
            a.account_name,
            a.normal_side,
            COALESCE(SUM(CASE WHEN le.dc = 'debit' THEN le.amount ELSE 0 END), 0)::numeric(18,2) AS debits,
            COALESCE(SUM(CASE WHEN le.dc = 'credit' THEN le.amount ELSE 0 END), 0)::numeric(18,2) AS credits
         FROM accounts a
         LEFT JOIN ledger_entries le
           ON le.account_id = a.id
          AND le.entry_date::date >= $1::date
          AND le.entry_date::date <= $2::date
         WHERE a.statement_type = 'IS'
         GROUP BY a.id
         ORDER BY a.account_name ASC`,
        [fromDate, toDate],
    );

    let totalRevenue = 0;
    let totalExpense = 0;
    for (const row of result.rows) {
        const debits = roundMoney(row.debits);
        const credits = roundMoney(row.credits);
        const net = row.normal_side === "credit" ? roundMoney(credits - debits) : roundMoney(debits - credits);
        if (row.normal_side === "credit") {
            totalRevenue = roundMoney(totalRevenue + net);
        } else {
            totalExpense = roundMoney(totalExpense + net);
        }
    }

    return {
        totalRevenue,
        totalExpense,
        netIncome: roundMoney(totalRevenue - totalExpense),
    };
}

function assertExpectedBalanceMap(label, actualMap, expectedMap) {
    const mismatches = [];
    for (const [accountName, expected] of Object.entries(expectedMap)) {
        const actual = roundMoney(actualMap.get(accountName));
        if (actual !== roundMoney(expected)) {
            mismatches.push(`${accountName}: expected ${roundMoney(expected)}, got ${actual}`);
        }
    }
    if (mismatches.length > 0) {
        throw new Error(`${label} verification failed:\n${mismatches.join("\n")}`);
    }
}

function assertExpectedTotals(label, actual, expected) {
    const fields = ["totalRevenue", "totalExpense", "netIncome"];
    const mismatches = fields.filter((field) => roundMoney(actual[field]) !== roundMoney(expected[field])).map((field) => `${field}: expected ${roundMoney(expected[field])}, got ${roundMoney(actual[field])}`);

    if (mismatches.length > 0) {
        throw new Error(`${label} verification failed:\n${mismatches.join("\n")}`);
    }
}

function assertStatementHeadingMetadata(label, report) {
    if (!report?.company_name || !report?.title_line || !report?.subtitle_line) {
        throw new Error(`${label} verification failed:\nReport is missing formal heading metadata.`);
    }
    if (!Array.isArray(report.heading_lines) || report.heading_lines.length !== 3) {
        throw new Error(`${label} verification failed:\nExpected exactly three heading lines, got ${Array.isArray(report?.heading_lines) ? report.heading_lines.length : 0}.`);
    }
}

function assertExpectedLineAmounts(label, actualMap, expectedMap) {
    const mismatches = [];
    for (const [name, expected] of Object.entries(expectedMap)) {
        const actual = roundMoney(actualMap.get(name));
        if (actual !== roundMoney(expected)) {
            mismatches.push(`${name}: expected ${roundMoney(expected)}, got ${actual}`);
        }
    }
    if (mismatches.length > 0) {
        throw new Error(`${label} verification failed:\n${mismatches.join("\n")}`);
    }
}

function buildExpectedTrialBalanceLines(balanceMap) {
    const expected = {};
    for (const [accountName, balance] of Object.entries(balanceMap)) {
        const definition = ACCOUNT_DEFINITIONS_BY_NAME.get(accountName);
        if (!definition) {
            continue;
        }
        const amount = roundMoney(balance);
        expected[accountName] = definition.normalSide === "credit" ? { debit: 0.0, credit: amount } : { debit: amount, credit: 0.0 };
    }
    return expected;
}

function buildExpectedIncomeStatementLines(balanceMap) {
    const revenue = {};
    const expense = {};
    for (const [accountName, balance] of Object.entries(balanceMap)) {
        const definition = ACCOUNT_DEFINITIONS_BY_NAME.get(accountName);
        if (!definition || definition.statementType !== "IS") {
            continue;
        }
        if (definition.normalSide === "credit") {
            revenue[accountName] = roundMoney(balance);
        } else {
            expense[accountName] = roundMoney(balance);
        }
    }
    return { revenue, expense };
}

function buildExpectedBalanceSheetLines(balanceMap) {
    const assets = {};
    const liabilities = {};
    const equity = {};

    for (const [accountName, balance] of Object.entries(balanceMap)) {
        const definition = ACCOUNT_DEFINITIONS_BY_NAME.get(accountName);
        if (!definition || !["BS", "RE"].includes(definition.statementType)) {
            continue;
        }

        const amount = roundMoney(balance);
        if (definition.category === "Assets") {
            assets[accountName] = definition.normalSide === "credit" ? -amount : amount;
            continue;
        }
        if (definition.category === "Liabilities") {
            liabilities[accountName] = definition.normalSide === "debit" ? -amount : amount;
            continue;
        }
        if (/retained earnings/i.test(accountName)) {
            equity[accountName] = EXPECTED_REPORT_TOTALS.retainedEarnings.endingRetainedEarnings;
            continue;
        }
        equity[accountName] = definition.normalSide === "debit" ? -amount : amount;
    }

    return { assets, liabilities, equity };
}

async function verifyGeneratedReports({ userId }) {
    const trialBalanceReport = await reportsController.generateTrialBalance({
        userId,
        asOfDate: APRIL_END,
        runType: "adjusted",
    });
    assertStatementHeadingMetadata("Trial balance report", trialBalanceReport);

    const expectedTrialBalanceLines = buildExpectedTrialBalanceLines(EXPECTED_ADJUSTED_BALANCES);
    const actualTrialBalanceLines = new Map(
        (trialBalanceReport.lines || []).map((line) => [
            line.account_name,
            {
                debit: roundMoney(line.debit_balance),
                credit: roundMoney(line.credit_balance),
            },
        ]),
    );
    const tbLineMismatches = [];
    for (const [accountName, expected] of Object.entries(expectedTrialBalanceLines)) {
        const actual = actualTrialBalanceLines.get(accountName) || { debit: 0.0, credit: 0.0 };
        if (roundMoney(actual.debit) !== roundMoney(expected.debit) || roundMoney(actual.credit) !== roundMoney(expected.credit)) {
            tbLineMismatches.push(`${accountName}: expected debit ${roundMoney(expected.debit)} / credit ${roundMoney(expected.credit)}, got debit ${roundMoney(actual.debit)} / credit ${roundMoney(actual.credit)}`);
        }
    }
    if (tbLineMismatches.length > 0) {
        throw new Error(`Trial balance report verification failed:\n${tbLineMismatches.join("\n")}`);
    }
    if (roundMoney(trialBalanceReport?.totals?.total_debits) !== EXPECTED_REPORT_TOTALS.trialBalance.totalDebits || roundMoney(trialBalanceReport?.totals?.total_credits) !== EXPECTED_REPORT_TOTALS.trialBalance.totalCredits) {
        throw new Error(`Trial balance totals verification failed:\nexpected debits ${EXPECTED_REPORT_TOTALS.trialBalance.totalDebits} / credits ${EXPECTED_REPORT_TOTALS.trialBalance.totalCredits}, got debits ${roundMoney(trialBalanceReport?.totals?.total_debits)} / credits ${roundMoney(trialBalanceReport?.totals?.total_credits)}`);
    }

    const incomeStatementReport = await reportsController.generateIncomeStatement({
        userId,
        fromDate: APRIL_START,
        toDate: APRIL_END,
    });
    assertStatementHeadingMetadata("Income statement report", incomeStatementReport);
    const expectedIncomeStatementLines = buildExpectedIncomeStatementLines(EXPECTED_ADJUSTED_BALANCES);
    assertExpectedLineAmounts("Income statement revenue lines", new Map((incomeStatementReport.revenue_lines || []).map((line) => [line.account_name, roundMoney(line.amount)])), expectedIncomeStatementLines.revenue);
    assertExpectedLineAmounts("Income statement expense lines", new Map((incomeStatementReport.expense_lines || []).map((line) => [line.account_name, roundMoney(line.amount)])), expectedIncomeStatementLines.expense);
    assertExpectedTotals(
        "Income statement totals",
        {
            totalRevenue: incomeStatementReport?.totals?.total_revenue,
            totalExpense: incomeStatementReport?.totals?.total_expense,
            netIncome: incomeStatementReport?.totals?.net_income,
        },
        {
            totalRevenue: 13425.0,
            totalExpense: 8900.0,
            netIncome: 4525.0,
        },
    );

    const balanceSheetReport = await reportsController.generateBalanceSheet({
        userId,
        asOfDate: APRIL_END,
    });
    assertStatementHeadingMetadata("Balance sheet report", balanceSheetReport);
    const expectedBalanceSheetLines = buildExpectedBalanceSheetLines(EXPECTED_ADJUSTED_BALANCES);
    assertExpectedLineAmounts("Balance sheet asset lines", new Map((balanceSheetReport.assets || []).map((line) => [line.account_name, roundMoney(line.display_amount ?? line.amount)])), expectedBalanceSheetLines.assets);
    assertExpectedLineAmounts("Balance sheet liability lines", new Map((balanceSheetReport.liabilities || []).map((line) => [line.account_name, roundMoney(line.display_amount ?? line.amount)])), expectedBalanceSheetLines.liabilities);
    assertExpectedLineAmounts("Balance sheet equity lines", new Map((balanceSheetReport.equity || []).map((line) => [line.account_name, roundMoney(line.display_amount ?? line.amount)])), expectedBalanceSheetLines.equity);
    if (
        roundMoney(balanceSheetReport?.totals?.total_assets) !== EXPECTED_REPORT_TOTALS.balanceSheet.totalAssets ||
        roundMoney(balanceSheetReport?.totals?.total_liabilities) !== EXPECTED_REPORT_TOTALS.balanceSheet.totalLiabilities ||
        roundMoney(balanceSheetReport?.totals?.total_equity) !== EXPECTED_REPORT_TOTALS.balanceSheet.totalEquity ||
        roundMoney(balanceSheetReport?.totals?.total_liabilities_and_equity) !== EXPECTED_REPORT_TOTALS.balanceSheet.totalLiabilitiesAndEquity
    ) {
        throw new Error(
            `Balance sheet totals verification failed:\nexpected assets ${EXPECTED_REPORT_TOTALS.balanceSheet.totalAssets}, liabilities ${EXPECTED_REPORT_TOTALS.balanceSheet.totalLiabilities}, equity ${EXPECTED_REPORT_TOTALS.balanceSheet.totalEquity}, liabilities and equity ${EXPECTED_REPORT_TOTALS.balanceSheet.totalLiabilitiesAndEquity}; got assets ${roundMoney(balanceSheetReport?.totals?.total_assets)}, liabilities ${roundMoney(balanceSheetReport?.totals?.total_liabilities)}, equity ${roundMoney(balanceSheetReport?.totals?.total_equity)}, liabilities and equity ${roundMoney(balanceSheetReport?.totals?.total_liabilities_and_equity)}`,
        );
    }

    const retainedEarningsReport = await reportsController.generateRetainedEarnings({
        userId,
        fromDate: APRIL_START,
        toDate: APRIL_END,
    });
    assertStatementHeadingMetadata("Retained earnings report", retainedEarningsReport);
    const actualRetainedEarnings = retainedEarningsReport?.values || {};
    const expectedRetainedEarnings = EXPECTED_REPORT_TOTALS.retainedEarnings;
    const retainedEarningsMismatches = [
        ["beginningRetainedEarnings", roundMoney(actualRetainedEarnings.beginning_retained_earnings), expectedRetainedEarnings.beginningRetainedEarnings],
        ["netIncome", roundMoney(actualRetainedEarnings.net_income), expectedRetainedEarnings.netIncome],
        ["distributions", roundMoney(actualRetainedEarnings.distributions), expectedRetainedEarnings.distributions],
        ["endingRetainedEarnings", roundMoney(actualRetainedEarnings.ending_retained_earnings), expectedRetainedEarnings.endingRetainedEarnings],
    ].filter(([, actual, expected]) => actual !== expected);

    if (retainedEarningsMismatches.length > 0) {
        throw new Error(`Retained earnings report verification failed:\n${retainedEarningsMismatches.map(([field, actual, expected]) => `${field}: expected ${expected}, got ${actual}`).join("\n")}`);
    }

    return {
        trialBalanceReport,
        incomeStatementReport,
        balanceSheetReport,
        retainedEarningsReport,
    };
}

async function verifySeed({ includeClosing, userId }) {
    const adjustedBalances = await computeBalancesAsOf(APRIL_END);
    assertExpectedBalanceMap("Adjusted balance verification", adjustedBalances, EXPECTED_ADJUSTED_BALANCES);

    const aprilIncomeStatement = await computeIncomeStatementTotals(APRIL_START, APRIL_END);
    assertExpectedTotals("Income statement verification", aprilIncomeStatement, {
        totalRevenue: 13425.0,
        totalExpense: 8900.0,
        netIncome: 4525.0,
    });

    if (includeClosing) {
        const postClosingBalances = await computeBalancesAsOf(CLOSING_POST_DATE);
        assertExpectedBalanceMap("Post-closing verification", postClosingBalances, EXPECTED_POST_CLOSING_BALANCES);
    }

    const generatedReports = await verifyGeneratedReports({ userId });

    return {
        adjustedBalances,
        aprilIncomeStatement,
        generatedReports,
    };
}

async function run() {
    const options = parseArgs(process.argv.slice(2));
    const { creator, approver } = await findSeedUsers();

    console.log(`[${SEED_TAG}] Source: ${SOURCE_FILE}`);
    console.log(`[${SEED_TAG}] Using creator user ${creator.username} (#${creator.id}, ${creator.role})`);
    console.log(`[${SEED_TAG}] Using approver user ${approver.username} (#${approver.id}, ${approver.role})`);
    console.log(`[${SEED_TAG}] Closing entry enabled: ${options.includeClosing ? "yes" : "no"}`);

    const { accountsByName, createdCount, reusedCount } = await ensureAccounts(Number(creator.id), Number(approver.id));
    console.log(`[${SEED_TAG}] Accounts created: ${createdCount}`);
    console.log(`[${SEED_TAG}] Accounts reused: ${reusedCount}`);

    const allEntries = [...GENERAL_ENTRIES, ...ADJUSTING_ENTRIES, ...(options.includeClosing ? CLOSING_ENTRIES : [])];

    const seedResults = {
        created: 0,
        approved: 0,
        reusedExisting: 0,
    };

    for (const entry of allEntries) {
        const result = await seedAndApproveEntry({
            entry,
            accountMap: accountsByName,
            createdByUserId: Number(creator.id),
            approvedByUserId: Number(approver.id),
        });

        if (result.created) {
            seedResults.created += 1;
        }
        if (result.approved) {
            seedResults.approved += 1;
        }
        if (result.reusedExisting) {
            seedResults.reusedExisting += 1;
        }
    }

    const verification = await verifySeed({ includeClosing: options.includeClosing, userId: Number(creator.id) });

    console.log(`[${SEED_TAG}] Journal entries created this run: ${seedResults.created}`);
    console.log(`[${SEED_TAG}] Journal entries approved this run: ${seedResults.approved}`);
    console.log(`[${SEED_TAG}] Existing seed entries reused: ${seedResults.reusedExisting}`);
    console.log(`[${SEED_TAG}] Verified adjusted balances as of ${APRIL_END}`);
    console.log(`[${SEED_TAG}] Verified April income statement (${APRIL_START} to ${APRIL_END}): revenue ${verification.aprilIncomeStatement.totalRevenue.toFixed(2)}, expense ${verification.aprilIncomeStatement.totalExpense.toFixed(2)}, net income ${verification.aprilIncomeStatement.netIncome.toFixed(2)}`);
    console.log(`[${SEED_TAG}] Verified generated trial balance, income statement, balance sheet, and retained earnings statement against the solved problem.`);
    if (options.includeClosing) {
        console.log(`[${SEED_TAG}] Verified post-closing balances as of ${CLOSING_POST_DATE}`);
        console.log(`[${SEED_TAG}] Closing entries are posted on ${CLOSING_POST_DATE} to keep April 2002 adjusted reports intact.`);
    }
    console.log(`[${SEED_TAG}] Complete.`);
}

if (require.main === module) {
    run()
        .catch((error) => {
            console.error(`[${SEED_TAG}] Failed.`);
            console.error(error.message || error);
            process.exitCode = 1;
        })
        .finally(async () => {
            try {
                await db.closePool();
            } catch (error) {
                console.error(`[${SEED_TAG}] Failed to close DB pool: ${error.message}`);
            }
        });
}

module.exports = {
    ACCOUNT_DEFINITIONS,
    EXPECTED_ADJUSTED_BALANCES,
    EXPECTED_POST_CLOSING_BALANCES,
    ensureAccounts,
    findSeedUsers,
    seedAndApproveEntry,
    verifyGeneratedReports,
    verifySeed,
};
