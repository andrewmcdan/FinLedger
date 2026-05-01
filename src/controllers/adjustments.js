const db = require("../db/db");
const { approveJournalEntry, rejectJournalEntry } = require("./transactions");

const ALLOWED_REASONS = new Set(["prepaid_expense", "accrual", "depreciation", "other"]);

const createCodeError = (code) => {
    const error = new Error(code);
    error.code = code;
    return error;
};

const normalizeDate = (dateValue) => {
    const normalized = String(dateValue || "").trim();
    if (!normalized) {
        throw createCodeError("ERR_PLEASE_FILL_ALL_FIELDS");
    }
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return parsed;
};

const normalizeAmount = (amount) => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return Number(parsed.toFixed(2));
};

const normalizePositiveInteger = (value, { required = true } = {}) => {
    const normalized = String(value || "").trim();
    if (!normalized) {
        if (required) {
            throw createCodeError("ERR_PLEASE_FILL_ALL_FIELDS");
        }
        return null;
    }
    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return parsed;
};

const normalizeStatus = (value) => {
    const normalized = String(value || "pending")
        .trim()
        .toLowerCase();
    if (!["pending", "approved", "rejected", "all"].includes(normalized)) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return normalized;
};

const parseLimit = (value) => {
    if (value === undefined || value === null || String(value).trim() === "") {
        return 50;
    }
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return Math.min(parsed, 200);
};

const parseOffset = (value) => {
    if (value === undefined || value === null || String(value).trim() === "") {
        return 0;
    }
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return parsed;
};

const normalizeReason = (value) => {
    const reason = String(value || "")
        .trim()
        .toLowerCase();
    if (!ALLOWED_REASONS.has(reason)) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return reason;
};

const ensureUniqueAccountIds = (lines = []) => {
    const seenAccountIds = new Set();
    for (const line of lines) {
        if (seenAccountIds.has(line.account_id)) {
            throw createCodeError("ERR_JOURNAL_DUPLICATE_ACCOUNT");
        }
        seenAccountIds.add(line.account_id);
    }
};

const createAdjustmentEntry = async (userId, payload = {}) => {
    const createdBy = normalizePositiveInteger(userId);
    const description = String(payload.description || "").trim();
    const notes = String(payload.notes || "").trim();
    const reason = normalizeReason(payload.adjustment_reason);
    const periodEndDate = normalizeDate(payload.period_end_date);
    const entryDate = payload.entry_date ? normalizeDate(payload.entry_date) : periodEndDate;
    const lines = Array.isArray(payload.lines) ? payload.lines : [];

    if (!description || lines.length < 2) {
        throw createCodeError("ERR_PLEASE_FILL_ALL_FIELDS");
    }

    let totalDebits = 0;
    let totalCredits = 0;

    const normalizedLines = lines.map((line, index) => {
        const accountId = normalizePositiveInteger(line?.account_id);
        const dc = String(line?.dc || "")
            .trim()
            .toLowerCase();
        if (!["debit", "credit"].includes(dc)) {
            throw createCodeError("ERR_INVALID_SELECTION");
        }
        const amount = normalizeAmount(line?.amount);
        const lineDescription = String(line?.line_description || "").trim() || null;
        const lineNo = index + 1;

        if (dc === "debit") {
            totalDebits += amount;
        } else {
            totalCredits += amount;
        }

        return {
            line_no: lineNo,
            account_id: accountId,
            dc,
            amount,
            line_description: lineDescription,
        };
    });

    ensureUniqueAccountIds(normalizedLines);

    totalDebits = Number(totalDebits.toFixed(2));
    totalCredits = Number(totalCredits.toFixed(2));

    if (totalDebits !== totalCredits) {
        throw createCodeError("ERR_JOURNAL_ENTRY_NOT_BALANCED");
    }

    return db.transaction(async (client) => {
        const headerResult = await client.query(
            `INSERT INTO journal_entries
                (journal_type, entry_date, description, status, total_debits, total_credits, created_by, updated_by)
             VALUES
                ('adjusting', $1, $2, 'pending', $3, $4, $5, $5)
             RETURNING id, journal_type, entry_date, description, status, total_debits, total_credits, created_by, created_at`,
            [entryDate, description, totalDebits, totalCredits, createdBy],
        );

        const journalEntry = headerResult.rows[0];

        const metadataResult = await client.query(
            `INSERT INTO adjustment_metadata
                (journal_entry_id, adjustment_reason, period_end_date, created_by, notes)
             VALUES
                ($1, $2, $3, $4, $5)
             RETURNING id, adjustment_reason, period_end_date, notes, created_at`,
            [journalEntry.id, reason, periodEndDate, createdBy, notes || null],
        );

        const metadata = metadataResult.rows[0];

        for (const line of normalizedLines) {
            const lineInsertResult = await client.query(
                `INSERT INTO journal_entry_lines
                    (journal_entry_id, line_no, account_id, dc, amount, line_description, created_by, updated_by)
                 VALUES
                    ($1, $2, $3, $4, $5, $6, $7, $7)
                 RETURNING id, line_no, account_id, dc, amount, line_description`,
                [journalEntry.id, line.line_no, line.account_id, line.dc, line.amount, line.line_description, createdBy],
            );

            const journalLine = lineInsertResult.rows[0];

            await client.query(
                `INSERT INTO adjustment_lines
                    (adjustment_metadata_id, account_id, dc, amount, line_description, created_by)
                 VALUES
                    ($1, $2, $3, $4, $5, $6)`,
                [metadata.id, line.account_id, line.dc, line.amount, line.line_description, createdBy],
            );

            journalLine.amount = Number(journalLine.amount);
        }

        const detailResult = await client.query(
            `SELECT
                je.id,
                je.journal_type,
                je.entry_date,
                je.description,
                je.status,
                je.total_debits,
                je.total_credits,
                am.id AS adjustment_metadata_id,
                am.adjustment_reason,
                am.period_end_date,
                am.notes
             FROM journal_entries je
             INNER JOIN adjustment_metadata am ON am.journal_entry_id = je.id
             WHERE je.id = $1`,
            [journalEntry.id],
        );

        const lineRows = await client.query(
            `SELECT line_no, account_id, dc, amount, line_description
             FROM journal_entry_lines
             WHERE journal_entry_id = $1
             ORDER BY line_no ASC`,
            [journalEntry.id],
        );

        return {
            adjustment_entry: {
                ...detailResult.rows[0],
                total_debits: Number(detailResult.rows[0].total_debits),
                total_credits: Number(detailResult.rows[0].total_credits),
            },
            lines: lineRows.rows.map((row) => ({ ...row, amount: Number(row.amount) })),
        };
    }, createdBy);
};

const listAdjustmentEntries = async ({ status, fromDate, toDate, search, limit, offset } = {}) => {
    const normalizedStatus = normalizeStatus(status);
    const normalizedFromDate = fromDate ? normalizeDate(fromDate) : null;
    const normalizedToDate = toDate ? normalizeDate(toDate) : null;
    const normalizedSearch = String(search || "")
        .trim()
        .slice(0, 120);
    const parsedLimit = parseLimit(limit);
    const parsedOffset = parseOffset(offset);

    const values = [normalizedStatus, normalizedFromDate, normalizedToDate, normalizedSearch, parsedLimit, parsedOffset];

    const rowsResult = await db.query(
        `SELECT
            je.id,
            je.entry_date,
            je.description,
            je.status,
            je.total_debits,
            je.total_credits,
            je.created_at,
            je.approved_at,
            je.posted_at,
            je.reference_code,
            am.adjustment_reason,
            am.period_end_date,
            am.notes,
            creator.username AS created_by_username,
            approver.username AS approved_by_username
         FROM journal_entries je
         INNER JOIN adjustment_metadata am ON am.journal_entry_id = je.id
         LEFT JOIN users creator ON creator.id = je.created_by
         LEFT JOIN users approver ON approver.id = je.approved_by
         WHERE je.journal_type = 'adjusting'
           AND ($1 = 'all' OR je.status = $1)
           AND ($2::TIMESTAMP IS NULL OR je.entry_date >= $2)
           AND ($3::TIMESTAMP IS NULL OR je.entry_date <= $3)
           AND (
               $4 = ''
               OR je.description ILIKE '%' || $4 || '%'
               OR am.adjustment_reason ILIKE '%' || $4 || '%'
               OR COALESCE(je.reference_code, '') ILIKE '%' || $4 || '%'
           )
         ORDER BY je.entry_date DESC, je.id DESC
         LIMIT $5 OFFSET $6`,
        values,
    );

    const totalResult = await db.query(
        `SELECT COUNT(*)::INT AS total
         FROM journal_entries je
         INNER JOIN adjustment_metadata am ON am.journal_entry_id = je.id
         WHERE je.journal_type = 'adjusting'
           AND ($1 = 'all' OR je.status = $1)
           AND ($2::TIMESTAMP IS NULL OR je.entry_date >= $2)
           AND ($3::TIMESTAMP IS NULL OR je.entry_date <= $3)
           AND (
               $4 = ''
               OR je.description ILIKE '%' || $4 || '%'
               OR am.adjustment_reason ILIKE '%' || $4 || '%'
               OR COALESCE(je.reference_code, '') ILIKE '%' || $4 || '%'
           )`,
        values.slice(0, 4),
    );

    return {
        rows: rowsResult.rows.map((row) => ({
            ...row,
            total_debits: Number(row.total_debits),
            total_credits: Number(row.total_credits),
        })),
        total: Number(totalResult.rows[0]?.total || 0),
        limit: parsedLimit,
        offset: parsedOffset,
    };
};

const ensureAdjustingEntry = async (journalEntryId) => {
    const parsedId = normalizePositiveInteger(journalEntryId);
    const result = await db.query("SELECT id, journal_type FROM journal_entries WHERE id = $1", [parsedId]);
    if (result.rowCount === 0) {
        throw createCodeError("ERR_JOURNAL_ENTRY_NOT_FOUND");
    }
    if (result.rows[0].journal_type !== "adjusting") {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return parsedId;
};

const approveAdjustmentEntry = async ({ journalEntryId, managerUserId, managerComment }) => {
    const parsedId = await ensureAdjustingEntry(journalEntryId);
    return approveJournalEntry({
        journalEntryId: parsedId,
        managerUserId,
        managerComment,
    });
};

const rejectAdjustmentEntry = async ({ journalEntryId, managerUserId, managerComment }) => {
    const parsedId = await ensureAdjustingEntry(journalEntryId);
    return rejectJournalEntry({
        journalEntryId: parsedId,
        managerUserId,
        managerComment,
    });
};

module.exports = {
    createAdjustmentEntry,
    listAdjustmentEntries,
    approveAdjustmentEntry,
    rejectAdjustmentEntry,
};
