/**
 * Account seed script
 *
 * Seeds accounts from a hardcoded chart of accounts list.
 * Update the SEEDED_ACCOUNTS array below if the chart changes.
 *
 * Usage:
 *   node scripts/accounts-seed.js
 *   node scripts/accounts-seed.js --dry-run
 *   node scripts/accounts-seed.js --replace-existing
 */

const db = require("../src/db/db");
const accountsController = require("../src/controllers/accounts");

const SEEDED_ACCOUNTS = [
    {
        sourceAccountNumber: "1010",
        accountName: "Cash",
        accountDescription: "Physical cash kept on hand for small daily transactions.",
        category: "Assets",
        subcategory: "Current Assets",
        normalSide: "debit",
        statementType: "Balance Sheet",
        comment: "Cash is held in the office safe during non-business hours.",
    },
    {
        sourceAccountNumber: "1020",
        accountName: "Checking Account",
        accountDescription: "Primary operating bank account used for routine payments and deposits.",
        category: "Assets",
        subcategory: "Current Assets",
        normalSide: "debit",
        statementType: "Balance Sheet",
        comment: "Daily disbursements and customer deposits clear through this account.",
    },
    {
        sourceAccountNumber: "1100",
        accountName: "Accounts Receivable",
        accountDescription: "Amounts owed by customers for invoiced goods or services.",
        category: "Assets",
        subcategory: "Current Assets",
        normalSide: "debit",
        statementType: "Balance Sheet",
        comment: "Aging is reviewed weekly to follow up on overdue balances.",
    },
    {
        sourceAccountNumber: "1200",
        accountName: "Inventory",
        accountDescription: "Goods held for sale in the normal course of business.",
        category: "Assets",
        subcategory: "Current Assets",
        normalSide: "debit",
        statementType: "Balance Sheet",
        comment: "Cycle counts are performed monthly to validate on-hand quantities.",
    },
    {
        sourceAccountNumber: "1300",
        accountName: "Prepaid Expenses",
        accountDescription: "Payments made in advance for future operating benefits.",
        category: "Assets",
        subcategory: "Current Assets",
        normalSide: "debit",
        statementType: "Balance Sheet",
        comment: "Balances are amortized at month-end based on coverage periods.",
    },
    {
        sourceAccountNumber: "1500",
        accountName: "Property and Equipment",
        accountDescription: "Capitalized long-lived assets used in business operations.",
        category: "Assets",
        subcategory: "Fixed Assets",
        normalSide: "debit",
        statementType: "Balance Sheet",
        comment: "Only purchases above the capitalization threshold are posted here.",
    },
    {
        sourceAccountNumber: "1510",
        accountName: "Computer Hardware",
        accountDescription: "Computers, servers, and related hardware with multi-year use.",
        category: "Assets",
        subcategory: "Fixed Assets",
        normalSide: "debit",
        statementType: "Balance Sheet",
        comment: "Serial numbers are tracked in the fixed asset register.",
    },
    {
        sourceAccountNumber: "1520",
        accountName: "Furniture and Fixtures",
        accountDescription: "Office furniture and installed fixtures used over multiple periods.",
        category: "Assets",
        subcategory: "Fixed Assets",
        normalSide: "debit",
        statementType: "Balance Sheet",
        comment: "Large office setup purchases are grouped by location for tracking.",
    },
    {
        sourceAccountNumber: "1530",
        accountName: "Vehicles",
        accountDescription: "Company-owned vehicles used in operations and logistics.",
        category: "Assets",
        subcategory: "Fixed Assets",
        normalSide: "debit",
        statementType: "Balance Sheet",
        comment: "Vehicle additions and disposals require management approval.",
    },
    {
        sourceAccountNumber: "1590",
        accountName: "Accumulated Depreciation",
        accountDescription: "Contra-asset account capturing cumulative depreciation to date.",
        category: "Assets",
        subcategory: "Fixed Assets",
        normalSide: "credit",
        statementType: "Balance Sheet",
        comment: "Monthly depreciation entries are posted through the close process.",
    },
    {
        sourceAccountNumber: "2010",
        accountName: "Accounts Payable",
        accountDescription: "Amounts owed to vendors for goods and services received.",
        category: "Liabilities",
        subcategory: "Current Liabilities",
        normalSide: "credit",
        statementType: "Balance Sheet",
        comment: "Vendor terms are monitored to optimize payment timing.",
    },
    {
        sourceAccountNumber: "2020",
        accountName: "Credit Card Payable",
        accountDescription: "Outstanding balances due on company credit cards.",
        category: "Liabilities",
        subcategory: "Current Liabilities",
        normalSide: "credit",
        statementType: "Balance Sheet",
        comment: "Statements are reconciled monthly before payment processing.",
    },
    {
        sourceAccountNumber: "2100",
        accountName: "Accrued Expenses",
        accountDescription: "Expenses incurred but not yet billed or paid.",
        category: "Liabilities",
        subcategory: "Current Liabilities",
        normalSide: "credit",
        statementType: "Balance Sheet",
        comment: "Recurring accrual templates are reversed at the start of each month.",
    },
    {
        sourceAccountNumber: "2200",
        accountName: "Sales Tax Payable",
        accountDescription: "Sales taxes collected from customers and owed to tax authorities.",
        category: "Liabilities",
        subcategory: "Current Liabilities",
        normalSide: "credit",
        statementType: "Balance Sheet",
        comment: "Jurisdictional filings are prepared from monthly tax summaries.",
    },
    {
        sourceAccountNumber: "2500",
        accountName: "Long Term Loan Payable",
        accountDescription: "Principal obligations on loans due beyond one year.",
        category: "Liabilities",
        subcategory: "Long-term Liabilities",
        normalSide: "credit",
        statementType: "Balance Sheet",
        comment: "Debt covenant metrics are reviewed each quarter.",
    },
    {
        sourceAccountNumber: "2600",
        accountName: "Mortgage Payable",
        accountDescription: "Outstanding principal due on property mortgage agreements.",
        category: "Liabilities",
        subcategory: "Long-term Liabilities",
        normalSide: "credit",
        statementType: "Balance Sheet",
        comment: "Amortization schedules are updated after each refinancing event.",
    },
    {
        sourceAccountNumber: "2700",
        accountName: "Notes Payable",
        accountDescription: "Promissory note balances owed to lenders.",
        category: "Liabilities",
        subcategory: "Long-term Liabilities",
        normalSide: "credit",
        statementType: "Balance Sheet",
        comment: "Interest terms are validated against executed note agreements.",
    },
    {
        sourceAccountNumber: "3010",
        accountName: "Common Stock",
        accountDescription: "Par and stated value of issued common equity shares.",
        category: "Equity",
        subcategory: "Common Stock",
        normalSide: "credit",
        statementType: "Balance Sheet",
        comment: "Equity issuances are recorded only after legal documentation is complete.",
    },
    {
        sourceAccountNumber: "3100",
        accountName: "Retained Earnings",
        accountDescription: "Cumulative net earnings retained in the business.",
        category: "Equity",
        subcategory: "Retained Earnings",
        normalSide: "credit",
        statementType: "Retained Earnings Statement",
        comment: "Year-end close entries roll net income into retained earnings.",
    },
    {
        sourceAccountNumber: "4010",
        accountName: "Product Sales Revenue",
        accountDescription: "Revenue earned from the sale of products.",
        category: "Revenue",
        subcategory: "Sales Revenue",
        normalSide: "credit",
        statementType: "Income Statement",
        comment: "Sales are recognized when control transfers to the customer.",
    },
    {
        sourceAccountNumber: "4020",
        accountName: "Service Revenue",
        accountDescription: "Revenue earned from delivering professional or support services.",
        category: "Revenue",
        subcategory: "Service Revenue",
        normalSide: "credit",
        statementType: "Income Statement",
        comment: "Service revenue follows contractual performance obligations.",
    },
    {
        sourceAccountNumber: "5010",
        accountName: "Rent Expense",
        accountDescription: "Periodic occupancy costs for leased facilities.",
        category: "Expenses",
        subcategory: "Operating Expenses",
        normalSide: "debit",
        statementType: "Income Statement",
        comment: "Monthly rent is posted on the first business day of each month.",
    },
    {
        sourceAccountNumber: "5020",
        accountName: "Utilities Expense",
        accountDescription: "Electricity, water, gas, and related utility service costs.",
        category: "Expenses",
        subcategory: "Operating Expenses",
        normalSide: "debit",
        statementType: "Income Statement",
        comment: "Utility variance reviews are performed during monthly close.",
    },
    {
        sourceAccountNumber: "5030",
        accountName: "Salaries and Wages Expense",
        accountDescription: "Compensation expense for employee labor and payroll.",
        category: "Expenses",
        subcategory: "Operating Expenses",
        normalSide: "debit",
        statementType: "Income Statement",
        comment: "Payroll journals are imported after each payroll run is finalized.",
    },
    {
        sourceAccountNumber: "5040",
        accountName: "Office Supplies Expense",
        accountDescription: "Consumable office materials used in daily operations.",
        category: "Expenses",
        subcategory: "Operating Expenses",
        normalSide: "debit",
        statementType: "Income Statement",
        comment: "Small recurring supply orders are batched weekly for posting.",
    },
    {
        sourceAccountNumber: "5050",
        accountName: "Software Subscriptions Expense",
        accountDescription: "Recurring subscription costs for business software tools.",
        category: "Expenses",
        subcategory: "Operating Expenses",
        normalSide: "debit",
        statementType: "Income Statement",
        comment: "Subscription renewals are reviewed quarterly to remove unused seats.",
    },
    {
        sourceAccountNumber: "5200",
        accountName: "Interest Expense",
        accountDescription: "Borrowing costs incurred on debt obligations.",
        category: "Expenses",
        subcategory: "Non-operating Expenses",
        normalSide: "debit",
        statementType: "Income Statement",
        comment: "Interest accruals are reconciled to lender statements each month.",
    },
    {
        sourceAccountNumber: "5300",
        accountName: "Loss on Asset Disposal",
        accountDescription: "Loss recognized when an asset is sold below carrying value.",
        category: "Expenses",
        subcategory: "Non-operating Expenses",
        normalSide: "debit",
        statementType: "Income Statement",
        comment: "Disposal support is retained with the fixed asset retirement file.",
    },
    {
        sourceAccountNumber: "5400",
        accountName: "Bank Fees Expense",
        accountDescription: "Service charges and fees assessed by banking institutions.",
        category: "Expenses",
        subcategory: "Non-operating Expenses",
        normalSide: "debit",
        statementType: "Income Statement",
        comment: "Fee trends are reviewed to identify opportunities for cost reduction.",
    },
];

const VALID_STATEMENT_TYPES = new Set(["Income Statement", "Balance Sheet", "Retained Earnings Statement"]);

function parseSourceAccountNumber(sourceAccountNumber) {
    const parsed = Number.parseInt(String(sourceAccountNumber ?? "").trim(), 10);
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function applyGroupedAccountOrders(entries) {
    const groupedByCategoryAndSubcategory = new Map();
    for (const entry of entries) {
        const groupKey = `${entry.category}::${entry.subcategory}`;
        if (!groupedByCategoryAndSubcategory.has(groupKey)) {
            groupedByCategoryAndSubcategory.set(groupKey, []);
        }
        groupedByCategoryAndSubcategory.get(groupKey).push(entry);
    }

    for (const groupEntries of groupedByCategoryAndSubcategory.values()) {
        groupEntries.sort((left, right) => {
            const byNumber = parseSourceAccountNumber(left.sourceAccountNumber) - parseSourceAccountNumber(right.sourceAccountNumber);
            if (byNumber !== 0) {
                return byNumber;
            }
            return String(left.accountName).localeCompare(String(right.accountName));
        });

        const step = groupEntries.length <= 9 ? 10 : 1;
        groupEntries.forEach((entry, index) => {
            entry.accountOrder = step === 10 ? (index + 1) * 10 : index + 1;
        });
    }

    return entries;
}

function validateSeedEntry(entry, index) {
    const requiredFields = [
        "sourceAccountNumber",
        "accountName",
        "accountDescription",
        "category",
        "subcategory",
        "normalSide",
        "statementType",
        "comment",
    ];
    for (const field of requiredFields) {
        const value = String(entry[field] ?? "").trim();
        if (!value) {
            throw new Error(`Seed entry #${index + 1} is missing required field "${field}".`);
        }
    }
    const normalSide = String(entry.normalSide).toLowerCase();
    if (normalSide !== "debit" && normalSide !== "credit") {
        throw new Error(`Seed entry #${index + 1} has invalid normalSide "${entry.normalSide}".`);
    }
    if (!VALID_STATEMENT_TYPES.has(entry.statementType)) {
        throw new Error(`Seed entry #${index + 1} has invalid statementType "${entry.statementType}".`);
    }
}

async function findSeedOwnerId() {
    const adminResult = await db.query("SELECT id FROM users WHERE role = 'administrator' ORDER BY id ASC LIMIT 1");
    if (adminResult.rows.length > 0) {
        return Number(adminResult.rows[0].id);
    }
    const anyUserResult = await db.query("SELECT id FROM users ORDER BY id ASC LIMIT 1");
    if (anyUserResult.rows.length > 0) {
        return Number(anyUserResult.rows[0].id);
    }
    throw new Error("No users found. Create at least one user before running account seed.");
}

async function accountAlreadyExists(entry) {
    const result = await db.query(
        `
        SELECT accounts.id, accounts.account_number
        FROM accounts
        JOIN account_categories ON account_categories.id = accounts.account_category_id
        JOIN account_subcategories ON account_subcategories.id = accounts.account_subcategory_id
        WHERE accounts.account_name = $1
          AND account_categories.name = $2
          AND account_subcategories.name = $3
        LIMIT 1
        `,
        [entry.accountName, entry.category, entry.subcategory],
    );
    return result.rows[0] || null;
}

async function run() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes("--dry-run");
    const replaceExisting = args.includes("--replace-existing");
    const entries = applyGroupedAccountOrders(SEEDED_ACCOUNTS.map((entry, index) => {
        validateSeedEntry(entry, index);
        return {
            sourceAccountNumber: String(entry.sourceAccountNumber),
            accountName: String(entry.accountName),
            accountDescription: String(entry.accountDescription),
            category: String(entry.category),
            subcategory: String(entry.subcategory),
            normalSide: String(entry.normalSide).toLowerCase(),
            statementType: String(entry.statementType),
            comment: String(entry.comment),
        };
    }));

    if (entries.length === 0) {
        throw new Error("No hardcoded accounts found in SEEDED_ACCOUNTS.");
    }

    const ownerId = await findSeedOwnerId();
    console.log(`[accounts-seed] Loaded ${entries.length} hardcoded account(s) from scripts/accounts-seed.js`);
    console.log(`[accounts-seed] Seed owner user id: ${ownerId}`);
    if (isDryRun) {
        console.log("[accounts-seed] Running in dry-run mode (no inserts will be made).");
    }
    if (replaceExisting) {
        console.log("[accounts-seed] Existing matching accounts will be replaced.");
    }

    let createdCount = 0;
    let skippedCount = 0;
    let replacedCount = 0;

    for (const entry of entries) {
        const existing = await accountAlreadyExists(entry);
        if (existing) {
            if (!replaceExisting) {
                skippedCount += 1;
                console.log(`[accounts-seed] Skipping existing account "${entry.accountName}" (${entry.category} / ${entry.subcategory})`);
                continue;
            }
            if (isDryRun) {
                replacedCount += 1;
                createdCount += 1;
                console.log(`[accounts-seed] Would replace existing account "${entry.accountName}" from source #${entry.sourceAccountNumber}`);
                continue;
            }
            await db.query("DELETE FROM accounts WHERE id = $1", [existing.id]);
            replacedCount += 1;
            console.log(`[accounts-seed] Replaced existing account "${entry.accountName}"`);
        }

        if (isDryRun) {
            createdCount += 1;
            console.log(`[accounts-seed] Would create "${entry.accountName}" from source #${entry.sourceAccountNumber}`);
            continue;
        }

        const created = await accountsController.createAccount(
            ownerId,
            entry.accountName,
            entry.accountDescription,
            entry.normalSide,
            entry.category,
            entry.subcategory,
            0,
            0,
            0,
            0,
            entry.accountOrder,
            entry.statementType,
            entry.comment,
            ownerId,
        );
        createdCount += 1;
        console.log(`[accounts-seed] Created "${entry.accountName}" -> account_number ${created.account_number}`);
    }

    console.log("[accounts-seed] Complete.");
    console.log(`[accounts-seed] Created: ${createdCount}`);
    console.log(`[accounts-seed] Skipped existing: ${skippedCount}`);
    console.log(`[accounts-seed] Replaced existing: ${replacedCount}`);
}

run()
    .catch((error) => {
        console.error("[accounts-seed] Failed.");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await db.closePool();
        } catch (error) {
            console.error("[accounts-seed] Failed to close DB pool:", error.message);
        }
    });
