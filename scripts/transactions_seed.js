/**
 * Transaction seed script
 *
 * Seeds realistic journal entries through the running FinLedger API.
 * Each journal entry includes generated support documents and, by default,
 * most entries are auto-approved by a manager so they post through to the ledger.
 *
 * Usage:
 *   npm run transactions-seed
 *   npm run transactions-seed -- --help
 *   npm run transactions-seed -- --base-url=http://localhost:3000 --approved=18 --pending=4
 *
 * Environment variables:
 *   FINLEDGER_SEED_BASE_URL
 *   FINLEDGER_MANAGER_USERNAME
 *   FINLEDGER_MANAGER_PASSWORD
 *   FINLEDGER_ACCOUNTANT_USERNAME
 *   FINLEDGER_ACCOUNTANT_PASSWORD
 */

const DEFAULT_BASE_URL = `http://localhost:${process.env.PORT || 3000}`;
const DEFAULT_APPROVED_COUNT = 100;
const DEFAULT_PENDING_COUNT = 10;
const REQUEST_TIMEOUT_MS = 30000;

const CUSTOMER_NAMES = [
    "Blue Mesa Design",
    "Northwind Labs",
    "Oak Trail Market",
    "Harborlight Fitness",
    "Juniper Office Group",
    "Silver Fern Retail",
];

const VENDOR_NAMES = [
    "North Ridge Office Park",
    "Summit Industrial Supply",
    "Pine Street Utilities",
    "Cloud Harbor Software",
    "Metro Office Depot",
    "First Regional Bank",
];

function printHelp() {
    console.log(`
FinLedger transaction seed

Required:
  FINLEDGER_MANAGER_USERNAME
  FINLEDGER_MANAGER_PASSWORD

Optional:
  FINLEDGER_ACCOUNTANT_USERNAME
  FINLEDGER_ACCOUNTANT_PASSWORD
  FINLEDGER_SEED_BASE_URL

CLI options:
  --base-url=<url>       API base URL. Defaults to ${DEFAULT_BASE_URL}
  --approved=<count>     Number of entries to auto-approve. Default: ${DEFAULT_APPROVED_COUNT}
  --pending=<count>      Number of entries to leave pending. Default: ${DEFAULT_PENDING_COUNT}
  --help                 Show this message

Examples:
  npm run transactions-seed
  npm run transactions-seed -- --approved=24 --pending=6
  FINLEDGER_MANAGER_USERNAME=manager FINLEDGER_MANAGER_PASSWORD=secret npm run transactions-seed
`);
}

function parseArgs(argv) {
    const options = {};
    for (const rawArg of argv) {
        const arg = String(rawArg || "").trim();
        if (!arg) {
            continue;
        }
        if (arg === "--help" || arg === "-h") {
            options.help = true;
            continue;
        }
        if (!arg.startsWith("--") || !arg.includes("=")) {
            throw new Error(`Unsupported argument: ${arg}`);
        }
        const [rawKey, ...rest] = arg.slice(2).split("=");
        const key = rawKey.trim();
        const value = rest.join("=").trim();
        options[key] = value;
    }
    return options;
}

function firstNonEmpty(...values) {
    for (const value of values) {
        if (value === undefined || value === null) {
            continue;
        }
        const normalized = String(value).trim();
        if (normalized) {
            return normalized;
        }
    }
    return "";
}

function parseCount(value, fallback, label) {
    if (value === undefined || value === null || String(value).trim() === "") {
        return fallback;
    }
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new Error(`Invalid ${label} count: ${value}`);
    }
    return parsed;
}

function normalizeBaseUrl(value) {
    const raw = firstNonEmpty(value, process.env.FINLEDGER_SEED_BASE_URL, DEFAULT_BASE_URL);
    return raw.replace(/\/+$/, "");
}

function makeRequestSignal() {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
        return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    }
    return undefined;
}

function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

function formatDate(value) {
    return new Date(value).toISOString().slice(0, 10);
}

function daysAgo(dayCount) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - Number(dayCount || 0));
    return date;
}

function roundMoney(value) {
    return Number(Number(value || 0).toFixed(2));
}

function scaleAmount(baseAmount, occurrence, variationStep = 0.045) {
    const factor = 1 + (((occurrence % 5) - 2) * variationStep);
    return roundMoney(baseAmount * factor);
}

function pickFrom(values, index) {
    if (!Array.isArray(values) || values.length === 0) {
        return "";
    }
    return values[index % values.length];
}

function buildUrl(baseUrl, relativePath) {
    return new URL(relativePath, `${baseUrl}/`).toString();
}

async function parseResponse(response) {
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
        return response.json().catch(() => null);
    }
    return response.text().catch(() => null);
}

async function apiRequest(baseUrl, relativePath, { method = "GET", session = null, headers = {}, json = undefined, body = undefined } = {}) {
    const requestHeaders = new Headers(headers);
    let payload = body;

    if (session) {
        requestHeaders.set("Authorization", `Bearer ${session.token}`);
        requestHeaders.set("X-User-Id", String(session.userId));
    }

    if (json !== undefined) {
        requestHeaders.set("Content-Type", "application/json");
        payload = JSON.stringify(json);
    }

    const response = await fetch(buildUrl(baseUrl, relativePath), {
        method,
        headers: requestHeaders,
        body: payload,
        signal: makeRequestSignal(),
    });

    const data = await parseResponse(response);
    if (!response.ok) {
        const errorCode = data && typeof data === "object" ? data.errorCode : "";
        const errorMessage = data && typeof data === "object" ? data.error || JSON.stringify(data) : String(data || response.statusText || "Request failed");
        throw new Error(`${method} ${relativePath} failed (${response.status})${errorCode ? ` [${errorCode}]` : ""}: ${errorMessage}`);
    }

    return data;
}

async function login(baseUrl, username, password, label) {
    const data = await apiRequest(baseUrl, "/api/auth/login", {
        method: "POST",
        json: { username, password },
    });

    if (data.must_change_password) {
        throw new Error(`${label} user "${username}" must change the temporary password before it can be used for API seeding.`);
    }

    return {
        label,
        username,
        token: data.token,
        userId: Number(data.user_id),
    };
}

async function logout(baseUrl, session) {
    if (!session?.token || !session?.userId) {
        return;
    }
    try {
        await apiRequest(baseUrl, "/api/auth/logout", {
            method: "POST",
            session,
        });
    } catch (error) {
        console.warn(`[transactions-seed] Logout failed for ${session.label} "${session.username}": ${error.message}`);
    }
}

async function listAccounts(baseUrl, session) {
    const data = await apiRequest(baseUrl, "/api/accounts/list/0/5000", { session });
    if (!Array.isArray(data)) {
        throw new Error("Account list response was not an array.");
    }
    return data.filter((account) => String(account.status || "").toLowerCase() === "active");
}

function findAccount(accounts, candidateNames) {
    const normalizedCandidates = candidateNames.map((name) => String(name).trim().toLowerCase());
    return accounts.find((account) => normalizedCandidates.includes(String(account.account_name || "").trim().toLowerCase())) || null;
}

function buildAccountSet(accounts) {
    const accountSet = {
        bank: findAccount(accounts, ["Checking Account", "Cash"]),
        receivables: findAccount(accounts, ["Accounts Receivable"]),
        inventory: findAccount(accounts, ["Inventory"]),
        prepaid: findAccount(accounts, ["Prepaid Expenses"]),
        property: findAccount(accounts, ["Property and Equipment", "Computer Hardware", "Furniture and Fixtures", "Vehicles"]),
        payables: findAccount(accounts, ["Accounts Payable"]),
        creditCardPayable: findAccount(accounts, ["Credit Card Payable"]),
        accruedExpenses: findAccount(accounts, ["Accrued Expenses"]),
        salesTaxPayable: findAccount(accounts, ["Sales Tax Payable"]),
        notePayable: findAccount(accounts, ["Notes Payable", "Long Term Loan Payable", "Mortgage Payable"]),
        commonStock: findAccount(accounts, ["Common Stock"]),
        productRevenue: findAccount(accounts, ["Product Sales Revenue"]),
        serviceRevenue: findAccount(accounts, ["Service Revenue", "Product Sales Revenue"]),
        rentExpense: findAccount(accounts, ["Rent Expense"]),
        utilitiesExpense: findAccount(accounts, ["Utilities Expense"]),
        salariesExpense: findAccount(accounts, ["Salaries and Wages Expense"]),
        suppliesExpense: findAccount(accounts, ["Office Supplies Expense"]),
        softwareExpense: findAccount(accounts, ["Software Subscriptions Expense", "Office Supplies Expense"]),
        interestExpense: findAccount(accounts, ["Interest Expense"]),
        bankFeesExpense: findAccount(accounts, ["Bank Fees Expense", "Utilities Expense"]),
    };

    const criticalMissing = [];
    if (!accountSet.bank) criticalMissing.push("Checking Account or Cash");
    if (!accountSet.serviceRevenue && !accountSet.productRevenue) criticalMissing.push("Service Revenue or Product Sales Revenue");
    if (!accountSet.rentExpense && !accountSet.utilitiesExpense && !accountSet.salariesExpense) criticalMissing.push("at least one expense account");

    if (criticalMissing.length > 0) {
        throw new Error(`Missing required accounts: ${criticalMissing.join(", ")}. Seed the chart of accounts before running this script.`);
    }

    return accountSet;
}

function buildSupportDocuments(entry) {
    const baseFileName = `${entry.referenceCode}-${slugify(entry.supportType || entry.description)}`;
    const summaryLines = [
        "FinLedger Seed Support Document",
        `Reference: ${entry.referenceCode}`,
        `Entry Date: ${entry.entryDate}`,
        `Journal Type: ${entry.journalType}`,
        `Status Intent: ${entry.autoApprove ? "Approve and post" : "Leave pending approval"}`,
        `Support Type: ${entry.supportType}`,
        `Counterparty: ${entry.counterparty || "Internal / N/A"}`,
        `Narrative: ${entry.narrative}`,
        "",
        "Journal Lines:",
        ...entry.lines.map((line, index) => {
            return `${index + 1}. ${line.dc.toUpperCase()} ${line.account.account_name} ${line.amount.toFixed(2)}${line.description ? ` | ${line.description}` : ""}`;
        }),
    ].join("\n");

    const csvLines = [
        "line_no,account,dc,amount,line_description",
        ...entry.lines.map((line, index) => {
            const escapedDescription = `"${String(line.description || "").replace(/"/g, '""')}"`;
            return `${index + 1},"${String(line.account.account_name || "").replace(/"/g, '""')}",${line.dc},${line.amount.toFixed(2)},${escapedDescription}`;
        }),
    ].join("\n");

    return [
        {
            filename: `${baseFileName}-support.txt`,
            title: `${entry.supportType} - ${entry.referenceCode}`,
            mimeType: "text/plain",
            content: summaryLines,
            metaData: {
                counterparty: entry.counterparty || null,
                support_type: entry.supportType,
                seeded_by: "transactions_seed.js",
            },
        },
        {
            filename: `${baseFileName}-lines.csv`,
            title: `Line schedule - ${entry.referenceCode}`,
            mimeType: "text/csv",
            content: csvLines,
            metaData: {
                support_type: "line_schedule",
                seeded_by: "transactions_seed.js",
            },
        },
    ];
}

function buildApprovedEntryFactories(accountSet) {
    const factories = [];

    if (accountSet.bank && accountSet.commonStock) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(18000, occurrence, 0.03);
            return {
                journalType: "general",
                entryDate,
                description: "Owner capital contribution received by wire transfer",
                supportType: "Bank transfer advice",
                counterparty: "Owner capital contribution",
                narrative: "Record owner funding deposited into the operating bank account to support ongoing operations.",
                lines: [
                    { account: accountSet.bank, dc: "debit", amount, description: "Operating cash received" },
                    { account: accountSet.commonStock, dc: "credit", amount, description: "Issued owner equity" },
                ],
            };
        });
    }

    if (accountSet.bank && accountSet.serviceRevenue) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(2400, occurrence);
            const customer = pickFrom(CUSTOMER_NAMES, occurrence);
            return {
                journalType: "general",
                entryDate,
                description: `Collected consulting revenue from ${customer}`,
                supportType: "Customer receipt",
                counterparty: customer,
                narrative: "Record same-day cash collection for completed consulting and onboarding services.",
                lines: [
                    { account: accountSet.bank, dc: "debit", amount, description: "ACH deposit received" },
                    { account: accountSet.serviceRevenue, dc: "credit", amount, description: "Consulting services delivered" },
                ],
            };
        });
    }

    if (accountSet.receivables && accountSet.productRevenue) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(4850, occurrence, 0.04);
            const customer = pickFrom(CUSTOMER_NAMES, occurrence + 1);
            return {
                journalType: "general",
                entryDate,
                description: `Issued product invoice to ${customer}`,
                supportType: "Customer invoice",
                counterparty: customer,
                narrative: "Record a shipped product order billed on standard net-30 terms.",
                lines: [
                    { account: accountSet.receivables, dc: "debit", amount, description: "Open customer invoice" },
                    { account: accountSet.productRevenue, dc: "credit", amount, description: "Recognized product sale" },
                ],
            };
        });
    }

    if (accountSet.bank && accountSet.receivables) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(3100, occurrence, 0.05);
            const customer = pickFrom(CUSTOMER_NAMES, occurrence + 2);
            return {
                journalType: "general",
                entryDate,
                description: `Applied customer payment from ${customer} to open receivable`,
                supportType: "Customer remittance advice",
                counterparty: customer,
                narrative: "Record a payment received against previously invoiced receivables.",
                lines: [
                    { account: accountSet.bank, dc: "debit", amount, description: "Cash received from customer" },
                    { account: accountSet.receivables, dc: "credit", amount, description: "Reduce open receivable balance" },
                ],
            };
        });
    }

    if (accountSet.inventory && accountSet.payables) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(1850, occurrence, 0.05);
            const vendor = pickFrom(VENDOR_NAMES, occurrence);
            return {
                journalType: "general",
                entryDate,
                description: `Recorded inventory received from ${vendor} on vendor terms`,
                supportType: "Vendor bill",
                counterparty: vendor,
                narrative: "Record inventory received this week with payment due to the vendor under normal trade terms.",
                lines: [
                    { account: accountSet.inventory, dc: "debit", amount, description: "Inventory replenishment" },
                    { account: accountSet.payables, dc: "credit", amount, description: "Vendor invoice outstanding" },
                ],
            };
        });
    }

    if (accountSet.payables && accountSet.bank) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(1280, occurrence, 0.05);
            const vendor = pickFrom(VENDOR_NAMES, occurrence + 1);
            return {
                journalType: "general",
                entryDate,
                description: `Paid vendor balance to ${vendor} by ACH`,
                supportType: "ACH payment confirmation",
                counterparty: vendor,
                narrative: "Record payment of an approved vendor payable through the operating bank account.",
                lines: [
                    { account: accountSet.payables, dc: "debit", amount, description: "Reduce vendor payable" },
                    { account: accountSet.bank, dc: "credit", amount, description: "ACH disbursement" },
                ],
            };
        });
    }

    if (accountSet.prepaid && accountSet.bank) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(1200, occurrence, 0.03);
            return {
                journalType: "general",
                entryDate,
                description: "Prepaid annual software renewal in advance",
                supportType: "Subscription invoice",
                counterparty: "Cloud Harbor Software",
                narrative: "Record an annual business software renewal paid upfront and capitalized to prepaid expenses.",
                lines: [
                    { account: accountSet.prepaid, dc: "debit", amount, description: "Annual prepaid subscription" },
                    { account: accountSet.bank, dc: "credit", amount, description: "Software renewal paid" },
                ],
            };
        });
    }

    if (accountSet.rentExpense && accountSet.bank) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(2100, occurrence, 0.02);
            return {
                journalType: "general",
                entryDate,
                description: "Paid monthly office rent",
                supportType: "Landlord invoice",
                counterparty: "North Ridge Office Park",
                narrative: "Record the monthly office lease payment for the operating suite.",
                lines: [
                    { account: accountSet.rentExpense, dc: "debit", amount, description: "Monthly office rent" },
                    { account: accountSet.bank, dc: "credit", amount, description: "Rent paid by ACH" },
                ],
            };
        });
    }

    if (accountSet.utilitiesExpense && accountSet.bank) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(465, occurrence, 0.06);
            return {
                journalType: "general",
                entryDate,
                description: "Paid utility bill for office operations",
                supportType: "Utility statement",
                counterparty: "Pine Street Utilities",
                narrative: "Record electricity, water, and connectivity costs for the month.",
                lines: [
                    { account: accountSet.utilitiesExpense, dc: "debit", amount, description: "Utility services consumed" },
                    { account: accountSet.bank, dc: "credit", amount, description: "Utility autopay cleared" },
                ],
            };
        });
    }

    if (accountSet.salariesExpense && accountSet.bank) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(3350, occurrence, 0.04);
            return {
                journalType: "general",
                entryDate,
                description: "Recorded payroll cash disbursement",
                supportType: "Payroll register",
                counterparty: "Internal payroll",
                narrative: "Record payroll funded from the operating account for the current pay period.",
                lines: [
                    { account: accountSet.salariesExpense, dc: "debit", amount, description: "Gross payroll expense funded" },
                    { account: accountSet.bank, dc: "credit", amount, description: "Payroll transfer funded" },
                ],
            };
        });
    }

    if (accountSet.suppliesExpense && accountSet.creditCardPayable) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(275, occurrence, 0.08);
            const vendor = pickFrom(VENDOR_NAMES, occurrence + 3) || "Metro Office Depot";
            return {
                journalType: "general",
                entryDate,
                description: `Charged office supplies to corporate card from ${vendor}`,
                supportType: "Card receipt",
                counterparty: vendor,
                narrative: "Record small office supply purchases placed on the company credit card.",
                lines: [
                    { account: accountSet.suppliesExpense, dc: "debit", amount, description: "Office supplies used in operations" },
                    { account: accountSet.creditCardPayable, dc: "credit", amount, description: "Corporate card balance increased" },
                ],
            };
        });
    }

    if (accountSet.creditCardPayable && accountSet.bank) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(460, occurrence, 0.07);
            return {
                journalType: "general",
                entryDate,
                description: "Paid current corporate card statement",
                supportType: "Card statement payment",
                counterparty: "Corporate card processor",
                narrative: "Record payment of the approved company credit card balance.",
                lines: [
                    { account: accountSet.creditCardPayable, dc: "debit", amount, description: "Reduce card liability" },
                    { account: accountSet.bank, dc: "credit", amount, description: "Bank payment to card issuer" },
                ],
            };
        });
    }

    if (accountSet.bankFeesExpense && accountSet.bank) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(42, occurrence, 0.1);
            return {
                journalType: "general",
                entryDate,
                description: "Recorded monthly bank service charges",
                supportType: "Bank statement detail",
                counterparty: "First Regional Bank",
                narrative: "Record service fees and treasury management charges on the operating account.",
                lines: [
                    { account: accountSet.bankFeesExpense, dc: "debit", amount, description: "Bank service charges" },
                    { account: accountSet.bank, dc: "credit", amount, description: "Charges netted from account" },
                ],
            };
        });
    }

    if (accountSet.bank && accountSet.productRevenue && accountSet.salesTaxPayable) {
        factories.push(({ occurrence, entryDate }) => {
            const saleAmount = scaleAmount(1000, occurrence, 0.05);
            const salesTax = roundMoney(saleAmount * 0.06);
            const cashReceived = roundMoney(saleAmount + salesTax);
            const customer = pickFrom(CUSTOMER_NAMES, occurrence + 4);
            return {
                journalType: "general",
                entryDate,
                description: `Recorded taxable point-of-sale revenue from ${customer}`,
                supportType: "POS settlement report",
                counterparty: customer,
                narrative: "Record a taxable over-the-counter sale with sales tax collected at the time of payment.",
                lines: [
                    { account: accountSet.bank, dc: "debit", amount: cashReceived, description: "Cash and card settlement deposited" },
                    { account: accountSet.productRevenue, dc: "credit", amount: saleAmount, description: "Recognized taxable sale" },
                    { account: accountSet.salesTaxPayable, dc: "credit", amount: salesTax, description: "Sales tax collected for remittance" },
                ],
            };
        });
    }

    if (accountSet.salesTaxPayable && accountSet.bank) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(300, occurrence, 0.04);
            return {
                journalType: "general",
                entryDate,
                description: "Remitted accumulated sales tax to taxing authority",
                supportType: "Tax payment confirmation",
                counterparty: "State revenue department",
                narrative: "Record remittance of collected sales tax from prior customer sales.",
                lines: [
                    { account: accountSet.salesTaxPayable, dc: "debit", amount, description: "Reduce tax liability" },
                    { account: accountSet.bank, dc: "credit", amount, description: "Tax payment cleared" },
                ],
            };
        });
    }

    if (accountSet.property && accountSet.notePayable) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(4600, occurrence, 0.03);
            const assetLabel = accountSet.property.account_name;
            return {
                journalType: "general",
                entryDate,
                description: `Financed purchase of ${assetLabel.toLowerCase()}`,
                supportType: "Equipment financing agreement",
                counterparty: "Regional equipment lender",
                narrative: "Record a financed fixed-asset purchase placed into service for operations.",
                lines: [
                    { account: accountSet.property, dc: "debit", amount, description: "Capitalized equipment purchase" },
                    { account: accountSet.notePayable, dc: "credit", amount, description: "Financing note established" },
                ],
            };
        });
    }

    if (accountSet.notePayable && accountSet.interestExpense && accountSet.bank) {
        factories.push(({ occurrence, entryDate }) => {
            const principal = scaleAmount(850, occurrence, 0.04);
            const interest = scaleAmount(110, occurrence, 0.02);
            const totalPayment = roundMoney(principal + interest);
            return {
                journalType: "general",
                entryDate,
                description: "Recorded scheduled loan payment",
                supportType: "Loan statement",
                counterparty: "Regional equipment lender",
                narrative: "Record the periodic debt payment with separate principal and interest components.",
                lines: [
                    { account: accountSet.notePayable, dc: "debit", amount: principal, description: "Reduce outstanding principal" },
                    { account: accountSet.interestExpense, dc: "debit", amount: interest, description: "Current-period borrowing cost" },
                    { account: accountSet.bank, dc: "credit", amount: totalPayment, description: "Loan payment disbursed" },
                ],
            };
        });
    }

    if (accountSet.receivables && accountSet.serviceRevenue) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(3200, occurrence, 0.05);
            const customer = pickFrom(CUSTOMER_NAMES, occurrence + 5);
            return {
                journalType: "general",
                entryDate,
                description: `Billed implementation services to ${customer}`,
                supportType: "Service invoice",
                counterparty: customer,
                narrative: "Record billable implementation or setup work delivered and invoiced on account.",
                lines: [
                    { account: accountSet.receivables, dc: "debit", amount, description: "Client invoice opened" },
                    { account: accountSet.serviceRevenue, dc: "credit", amount, description: "Implementation services billed" },
                ],
            };
        });
    }

    return factories;
}

function buildPendingEntryFactories(accountSet) {
    const factories = [];

    if (accountSet.salariesExpense && accountSet.accruedExpenses) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(1180, occurrence, 0.04);
            return {
                journalType: "adjusting",
                entryDate,
                description: "Accrued unpaid payroll at period end",
                supportType: "Payroll accrual worksheet",
                counterparty: "Internal payroll",
                narrative: "Adjusting entry to accrue wages earned but not yet paid as of period end.",
                lines: [
                    { account: accountSet.salariesExpense, dc: "debit", amount, description: "Recognize earned payroll cost" },
                    { account: accountSet.accruedExpenses, dc: "credit", amount, description: "Accrue payroll liability" },
                ],
            };
        });
    }

    if (accountSet.softwareExpense && accountSet.prepaid) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(180, occurrence, 0.05);
            return {
                journalType: "adjusting",
                entryDate,
                description: "Recognized monthly prepaid software amortization",
                supportType: "Prepaid amortization schedule",
                counterparty: "Cloud Harbor Software",
                narrative: "Adjust prepaid software asset into current-period expense for the elapsed month.",
                lines: [
                    { account: accountSet.softwareExpense, dc: "debit", amount, description: "Current month software expense" },
                    { account: accountSet.prepaid, dc: "credit", amount, description: "Reduce prepaid balance" },
                ],
            };
        });
    }

    if (accountSet.inventory && accountSet.payables) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(2100, occurrence, 0.05);
            const vendor = pickFrom(VENDOR_NAMES, occurrence + 2);
            return {
                journalType: "general",
                entryDate,
                description: `Inventory receipt from ${vendor} awaiting approval`,
                supportType: "Receiving report",
                counterparty: vendor,
                narrative: "Record a recent inventory receipt prepared for approval before posting into the live books.",
                lines: [
                    { account: accountSet.inventory, dc: "debit", amount, description: "Inventory lot received" },
                    { account: accountSet.payables, dc: "credit", amount, description: "Vendor payable to be confirmed" },
                ],
            };
        });
    }

    if (accountSet.receivables && accountSet.serviceRevenue) {
        factories.push(({ occurrence, entryDate }) => {
            const amount = scaleAmount(2750, occurrence, 0.05);
            const customer = pickFrom(CUSTOMER_NAMES, occurrence + 3);
            return {
                journalType: "general",
                entryDate,
                description: `Drafted client invoice for ${customer} awaiting review`,
                supportType: "Draft client invoice",
                counterparty: customer,
                narrative: "Prepared a customer invoice that is still waiting for manager approval before posting.",
                lines: [
                    { account: accountSet.receivables, dc: "debit", amount, description: "Draft receivable pending approval" },
                    { account: accountSet.serviceRevenue, dc: "credit", amount, description: "Draft revenue posting pending approval" },
                ],
            };
        });
    }

    return factories;
}

function buildEntryPlan({ approvedCount, pendingCount, prefix, accountSet }) {
    const approvedFactories = buildApprovedEntryFactories(accountSet);
    const pendingFactories = buildPendingEntryFactories(accountSet);

    if (approvedFactories.length === 0) {
        throw new Error("No approved-entry templates could be built from the available accounts.");
    }

    const pendingSourceFactories = pendingFactories.length > 0 ? pendingFactories : approvedFactories;
    const approvedDates = [];
    const pendingDates = [];

    for (let index = 0; index < approvedCount; index += 1) {
        const dayOffset = 120 - Math.round(index * 4.5);
        approvedDates.push(formatDate(daysAgo(Math.max(dayOffset, 15))));
    }
    for (let index = 0; index < pendingCount; index += 1) {
        const dayOffset = 12 - (index * 2);
        pendingDates.push(formatDate(daysAgo(Math.max(dayOffset, 1))));
    }

    const entries = [];

    for (let index = 0; index < approvedCount; index += 1) {
        const factory = approvedFactories[index % approvedFactories.length];
        const entry = factory({ occurrence: index, entryDate: approvedDates[index] });
        entries.push({
            ...entry,
            autoApprove: true,
            referenceCode: `${prefix}-A${String(index + 1).padStart(3, "0")}`,
        });
    }

    for (let index = 0; index < pendingCount; index += 1) {
        const factory = pendingSourceFactories[index % pendingSourceFactories.length];
        const entry = factory({ occurrence: index, entryDate: pendingDates[index] });
        entries.push({
            ...entry,
            autoApprove: false,
            referenceCode: `${prefix}-P${String(index + 1).padStart(3, "0")}`,
        });
    }

    return entries.map((entry) => ({
        ...entry,
        documents: buildSupportDocuments(entry),
    }));
}

async function submitJournalEntry(baseUrl, session, entry) {
    const clientDocumentIds = entry.documents.map((document, index) => `${entry.referenceCode}-DOC-${index + 1}`);
    const firstDocumentId = clientDocumentIds[0];
    const payload = {
        journal_type: entry.journalType,
        entry_date: entry.entryDate,
        description: entry.description,
        reference_code: entry.referenceCode,
        documents: entry.documents.map((document, index) => ({
            client_document_id: clientDocumentIds[index],
            title: document.title,
            upload_index: index,
            meta_data: document.metaData,
        })),
        journal_entry_document_ids: clientDocumentIds,
        lines: entry.lines.map((line, index) => ({
            line_no: index + 1,
            account_id: line.account.id,
            dc: line.dc,
            amount: line.amount,
            line_description: line.description,
            document_ids: firstDocumentId ? [firstDocumentId] : [],
        })),
    };

    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    entry.documents.forEach((document) => {
        const blob = new Blob([document.content], { type: document.mimeType });
        formData.append("documents", blob, document.filename);
    });

    const data = await apiRequest(baseUrl, "/api/transactions/new-journal-entry", {
        method: "POST",
        session,
        body: formData,
    });

    return data.journal_entry;
}

async function approveJournalEntry(baseUrl, managerSession, journalEntryId) {
    const data = await apiRequest(baseUrl, `/api/transactions/journal-entry/${journalEntryId}/approve`, {
        method: "PATCH",
        session: managerSession,
        json: {
            manager_comment: "Auto-approved by transactions_seed.js after support documents were generated.",
        },
    });
    return data.journal_entry;
}

async function fetchSeededJournalSummary(baseUrl, managerSession, prefix) {
    const data = await apiRequest(
        baseUrl,
        `/api/transactions/journal-queue?status=all&limit=200&search=${encodeURIComponent(prefix)}`,
        { session: managerSession },
    );
    const entries = Array.isArray(data?.journal_entries) ? data.journal_entries : [];
    const counts = {
        approved: 0,
        pending: 0,
        rejected: 0,
    };
    for (const entry of entries) {
        const status = String(entry.status || "").toLowerCase();
        if (Object.hasOwn(counts, status)) {
            counts[status] += 1;
        }
    }
    return { entries, counts };
}

async function run() {
    if (typeof fetch !== "function" || typeof FormData !== "function" || typeof Blob !== "function") {
        throw new Error("This script requires a Node.js runtime with fetch, FormData, and Blob support.");
    }

    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }

    const baseUrl = normalizeBaseUrl(args["base-url"]);
    const approvedCount = parseCount(args.approved, DEFAULT_APPROVED_COUNT, "approved");
    const pendingCount = parseCount(args.pending, DEFAULT_PENDING_COUNT, "pending");

    const managerUsername = firstNonEmpty(args["manager-username"], process.env.FINLEDGER_MANAGER_USERNAME);
    const managerPassword = firstNonEmpty(args["manager-password"], process.env.FINLEDGER_MANAGER_PASSWORD);
    const accountantUsername = firstNonEmpty(args["accountant-username"], process.env.FINLEDGER_ACCOUNTANT_USERNAME);
    const accountantPassword = firstNonEmpty(args["accountant-password"], process.env.FINLEDGER_ACCOUNTANT_PASSWORD);

    if (!managerUsername || !managerPassword) {
        throw new Error("Manager credentials are required. Set FINLEDGER_MANAGER_USERNAME and FINLEDGER_MANAGER_PASSWORD, or pass --manager-username / --manager-password.");
    }

    const sessionsToLogout = [];
    let managerSession = null;
    let creatorSession = null;

    try {
        console.log(`[transactions-seed] Base URL: ${baseUrl}`);
        managerSession = await login(baseUrl, managerUsername, managerPassword, "manager");
        sessionsToLogout.push(managerSession);
        console.log(`[transactions-seed] Logged in as manager "${managerSession.username}"`);

        if (accountantUsername || accountantPassword) {
            if (!accountantUsername || !accountantPassword) {
                throw new Error("Both accountant username and password are required when providing accountant credentials.");
            }
            creatorSession = await login(baseUrl, accountantUsername, accountantPassword, "accountant");
            sessionsToLogout.push(creatorSession);
            console.log(`[transactions-seed] Logged in as accountant "${creatorSession.username}"`);
        } else {
            creatorSession = managerSession;
            console.log("[transactions-seed] Accountant credentials not provided; manager credentials will create the entries and approve the approved subset.");
        }

        const accounts = await listAccounts(baseUrl, managerSession);
        const accountSet = buildAccountSet(accounts);
        const prefix = `SEED${new Date().toISOString().replace(/[^0-9]/g, "").slice(2, 14)}`;
        const entries = buildEntryPlan({
            approvedCount,
            pendingCount,
            prefix,
            accountSet,
        });

        console.log(`[transactions-seed] Loaded ${accounts.length} active account(s)`);
        console.log(`[transactions-seed] Preparing ${approvedCount} approved and ${pendingCount} pending journal entr${approvedCount + pendingCount === 1 ? "y" : "ies"} with prefix ${prefix}`);

        const createdEntries = [];
        for (const entry of entries) {
            const created = await submitJournalEntry(baseUrl, creatorSession, entry);
            let finalStatus = "pending";
            if (entry.autoApprove) {
                await approveJournalEntry(baseUrl, managerSession, created.id);
                finalStatus = "approved";
            }
            createdEntries.push({
                id: created.id,
                referenceCode: created.reference_code,
                description: entry.description,
                journalType: entry.journalType,
                finalStatus,
            });
            console.log(`[transactions-seed] ${finalStatus.toUpperCase()} ${created.reference_code} (${entry.journalType}) - ${entry.description}`);
        }

        const summary = await fetchSeededJournalSummary(baseUrl, managerSession, prefix);
        console.log("[transactions-seed] Complete.");
        console.log(`[transactions-seed] Created entries: ${createdEntries.length}`);
        console.log(`[transactions-seed] Approved: ${summary.counts.approved}`);
        console.log(`[transactions-seed] Pending: ${summary.counts.pending}`);
        console.log(`[transactions-seed] Rejected: ${summary.counts.rejected}`);

        const sampleLines = createdEntries.slice(0, 5).map((entry) => `  - ${entry.referenceCode} [${entry.finalStatus}] ${entry.description}`);
        if (sampleLines.length > 0) {
            console.log("[transactions-seed] Sample:");
            sampleLines.forEach((line) => console.log(line));
        }
    } finally {
        const uniqueSessions = Array.from(new Map(sessionsToLogout.map((session) => [`${session.userId}:${session.token}`, session])).values());
        for (const session of uniqueSessions.reverse()) {
            await logout(baseUrl, session);
        }
    }
}

run().catch((error) => {
    console.error("[transactions-seed] Failed.");
    console.error(error.message);
    process.exitCode = 1;
});
