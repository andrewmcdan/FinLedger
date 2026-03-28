const db = require("../db/db");
const path = require("path");
const fs = require("fs");
const { log } = require("./../utils/logger");
const utilities = require("./../utils/utilities");

const userDocsRoot = path.resolve(__dirname, "./../../user-docs/");
const JOURNAL_STATUSES = new Set(["pending", "approved", "rejected", "all"]);
const MAX_QUEUE_LIMIT = 200;
const MAX_LEDGER_LIMIT = 500;

const createCodeError = (code) => {
    const error = new Error(code);
    error.code = code;
    return error;
};

const normalizeExtension = (value) => {
    const extension = String(value || "").trim().toLowerCase();
    if (!extension) {
        return "";
    }
    return extension.startsWith(".") ? extension : `.${extension}`;
};

const normalizeEntryDate = (entryDate) => {
    if (!entryDate) {
        return new Date();
    }
    const parsed = new Date(entryDate);
    if (Number.isNaN(parsed.getTime())) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return parsed;
};

const normalizeLineAmount = (amount) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return Number(numericAmount.toFixed(2));
};

const normalizeReferenceCode = (referenceCode) => {
    if (referenceCode === null || referenceCode === undefined) {
        return null;
    }
    const normalizedReferenceCode = String(referenceCode).trim();
    if (!normalizedReferenceCode) {
        return null;
    }
    return normalizedReferenceCode;
};

const normalizeJournalStatus = (status, { allowAll = true } = {}) => {
    const normalizedStatus = String(status || "pending").trim().toLowerCase();
    if (allowAll && normalizedStatus === "all") {
        return "all";
    }
    if (!["pending", "approved", "rejected"].includes(normalizedStatus)) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return normalizedStatus;
};

const normalizeDateFilter = (dateValue) => {
    if (dateValue === undefined || dateValue === null || String(dateValue).trim() === "") {
        return null;
    }
    const normalized = String(dateValue).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return normalized;
};

const parsePositiveInteger = (value, fallback) => {
    if (value === undefined || value === null || String(value).trim() === "") {
        return fallback;
    }
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return parsed;
};

const parseQueueLimit = (value) => {
    const parsed = parsePositiveInteger(value, 25);
    return Math.min(Math.max(parsed, 1), MAX_QUEUE_LIMIT);
};

const parseLedgerLimit = (value) => {
    const parsed = parsePositiveInteger(value, 100);
    return Math.min(Math.max(parsed, 1), MAX_LEDGER_LIMIT);
};

const normalizeSearch = (search) => {
    const normalizedSearch = String(search || "").trim();
    if (!normalizedSearch) {
        return "";
    }
    return normalizedSearch.slice(0, 120);
};

const normalizeAccountFilter = (accountId) => {
    if (accountId === undefined || accountId === null) {
        return null;
    }
    const normalizedAccountId = String(accountId).trim().toLowerCase();
    if (!normalizedAccountId || normalizedAccountId === "all") {
        return null;
    }
    const parsed = Number.parseInt(normalizedAccountId, 10);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return parsed;
};

const normalizeJournalEntryId = (journalEntryId) => {
    const parsed = Number(journalEntryId);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    return parsed;
};

const normalizeManagerComment = (comment, { required = false } = {}) => {
    const normalized = String(comment || "").trim();
    if (required && !normalized) {
        throw createCodeError("ERR_JOURNAL_REJECTION_REASON_REQUIRED");
    }
    if (!normalized) {
        return null;
    }
    return normalized.slice(0, 2000);
};

const buildAutoReferenceCode = (journalEntryId) => {
    return `JE-${String(journalEntryId).padStart(8, "0")}`;
};

const sortJournalLinesDebitsFirst = (lines = []) => {
    return [...lines]
        .sort((left, right) => {
            const leftPriority = left?.dc === "debit" ? 0 : 1;
            const rightPriority = right?.dc === "debit" ? 0 : 1;
            if (leftPriority !== rightPriority) {
                return leftPriority - rightPriority;
            }
            return Number(left?.line_no || 0) - Number(right?.line_no || 0);
        })
        .map((line, index) => ({
            ...line,
            line_no: index + 1,
        }));
};

const buildJournalDocumentDownloadUrl = (journalEntryId, documentId) => {
    const normalizedJournalEntryId = normalizeJournalEntryId(journalEntryId);
    const normalizedDocumentId = normalizeJournalEntryId(documentId);
    return `/api/transactions/journal-entry/${normalizedJournalEntryId}/documents/${normalizedDocumentId}/download`;
};

const isReferenceCodeAvailable = async (referenceCode, excludeJournalEntryId = null) => {
    const normalizedReferenceCode = normalizeReferenceCode(referenceCode);
    if (!normalizedReferenceCode) {
        throw createCodeError("ERR_PLEASE_FILL_ALL_FIELDS");
    }

    let parsedExcludeJournalEntryId = null;
    if (excludeJournalEntryId !== null && excludeJournalEntryId !== undefined && String(excludeJournalEntryId).trim() !== "") {
        const candidate = Number(excludeJournalEntryId);
        if (!Number.isSafeInteger(candidate) || candidate <= 0) {
            throw createCodeError("ERR_INVALID_SELECTION");
        }
        parsedExcludeJournalEntryId = candidate;
    }

    const result = await db.query(
        `SELECT 1
         FROM journal_entries
         WHERE reference_code = $1
           AND ($2::INTEGER IS NULL OR id <> $2)
         LIMIT 1`,
        [normalizedReferenceCode, parsedExcludeJournalEntryId],
    );

    return result.rowCount === 0;
};

const safeDeleteFile = async (filePath) => {
    if (!filePath || !fs.existsSync(filePath)) {
        return;
    }
    try {
        await fs.promises.unlink(filePath);
    } catch (error) {
        log("warn", "Failed to remove file during journal-entry rollback", { filePath, error: error.message }, utilities.getCallerInfo());
    }
};

const applyJournalLinePostingToAccount = async ({ client, accountId, dc, amount }) => {
    const debitAmount = dc === "debit" ? amount : 0;
    const creditAmount = dc === "credit" ? amount : 0;

    await client.query(
        `UPDATE accounts
         SET total_debits = total_debits + $1,
             total_credits = total_credits + $2,
             balance = CASE
                 WHEN normal_side = 'debit'
                     THEN COALESCE(initial_balance, 0) + (total_debits + $1) - (total_credits + $2)
                 ELSE COALESCE(initial_balance, 0) - (total_debits + $1) + (total_credits + $2)
             END
         WHERE id = $3`,
        [debitAmount, creditAmount, accountId],
    );
};

const createJournalEntry = async (userId, entryData = {}) => {
    const numericUserId = Number(userId);
    if (!Number.isSafeInteger(numericUserId) || numericUserId <= 0) {
        throw createCodeError("ERR_UNAUTHORIZED");
    }

    const description = String(entryData.description || "").trim();
    const lines = Array.isArray(entryData.lines) ? entryData.lines : [];
    const uploadedDocuments = Array.isArray(entryData.uploaded_documents) ? entryData.uploaded_documents : [];

    if (!description || lines.length === 0) {
        throw createCodeError("ERR_PLEASE_FILL_ALL_FIELDS");
    }
    if (uploadedDocuments.length === 0) {
        throw createCodeError("ERR_NO_FILE_UPLOADED");
    }

    const journalType = String(entryData.journal_type || "general").toLowerCase();
    if (!["general", "adjusting"].includes(journalType)) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }

    const payloadDocuments = Array.isArray(entryData.documents) ? entryData.documents : [];
    const payloadDocumentsByUploadIndex = new Map();
    payloadDocuments.forEach((doc, index) => {
        const uploadIndex = Number.isInteger(Number(doc?.upload_index)) ? Number(doc.upload_index) : index;
        if (payloadDocumentsByUploadIndex.has(uploadIndex)) {
            throw createCodeError("ERR_INVALID_SELECTION");
        }
        payloadDocumentsByUploadIndex.set(uploadIndex, doc);
    });

    const movedFilePaths = [];
    const temporaryPaths = uploadedDocuments.map((doc) => doc?.temporary_path).filter(Boolean);

    try {
        const result = await db.transaction(async (client) => {
            const documentLookupByClientId = new Map();
            const persistedDocuments = [];

            for (let index = 0; index < uploadedDocuments.length; index += 1) {
                const uploadedDocument = uploadedDocuments[index];
                const payloadDocument = payloadDocumentsByUploadIndex.get(uploadedDocument.upload_index) || payloadDocuments[index] || {};
                const fileExtension = normalizeExtension(uploadedDocument.file_extension || path.extname(uploadedDocument.original_name || ""));
                if (!fileExtension) {
                    throw createCodeError("ERR_INVALID_FILE_TYPE");
                }

                const originalFileName = String(uploadedDocument.original_name || "").trim();
                if (!originalFileName) {
                    throw createCodeError("ERR_INVALID_SELECTION");
                }

                const defaultTitle = path.basename(originalFileName, path.extname(originalFileName));
                const title = String(payloadDocument.title || defaultTitle || `Document ${index + 1}`).trim();
                const clientDocumentId = String(payloadDocument.client_document_id || `upload-${uploadedDocument.upload_index}`);

                if (documentLookupByClientId.has(clientDocumentId)) {
                    throw createCodeError("ERR_INVALID_SELECTION");
                }

                const payloadMetaData = payloadDocument.meta_data && typeof payloadDocument.meta_data === "object" && !Array.isArray(payloadDocument.meta_data)
                    ? payloadDocument.meta_data
                    : {};
                const storedMetaData = {
                    ...payloadMetaData,
                    mime_type: uploadedDocument.mime_type || null,
                    file_size: Number(uploadedDocument.file_size || 0),
                    upload_index: uploadedDocument.upload_index,
                };

                const insertResult = await client.query(
                    `INSERT INTO documents (user_id, title, original_file_name, file_extension, meta_data)
                     VALUES ($1, $2, $3, $4, $5::jsonb)
                     RETURNING id, file_name::text AS file_name, file_extension, upload_at`,
                    [numericUserId, title, originalFileName, fileExtension, JSON.stringify(storedMetaData)],
                );

                const insertedDocument = insertResult.rows[0];
                const finalFileName = `${insertedDocument.file_name}${insertedDocument.file_extension}`;
                const finalFilePath = path.join(userDocsRoot, finalFileName);
                const temporaryPath = uploadedDocument.temporary_path;
                if (!temporaryPath) {
                    throw createCodeError("ERR_INVALID_SELECTION");
                }
                await fs.promises.rename(temporaryPath, finalFilePath);
                movedFilePaths.push(finalFilePath);

                const persistedDocument = {
                    id: insertedDocument.id,
                    client_document_id: clientDocumentId,
                    file_name: insertedDocument.file_name,
                    file_extension: insertedDocument.file_extension,
                    saved_file_name: finalFileName,
                    original_file_name: originalFileName,
                    title,
                    upload_at: insertedDocument.upload_at,
                };
                documentLookupByClientId.set(clientDocumentId, persistedDocument);
                persistedDocuments.push(persistedDocument);
            }

            let totalDebits = 0;
            let totalCredits = 0;
            const normalizedLines = lines.map((line, index) => {
                const lineNo = Number.isInteger(Number(line?.line_no)) ? Number(line.line_no) : index + 1;
                const accountId = Number(line?.account_id);
                const dc = String(line?.dc || "").toLowerCase();
                const amount = normalizeLineAmount(line?.amount);
                const lineDescription = line?.line_description ? String(line.line_description).trim() : null;
                const documentIds = Array.isArray(line?.document_ids) ? line.document_ids.map((docId) => String(docId)) : [];

                if (!Number.isInteger(lineNo) || lineNo <= 0 || !Number.isSafeInteger(accountId) || accountId <= 0 || !["debit", "credit"].includes(dc)) {
                    throw createCodeError("ERR_INVALID_SELECTION");
                }
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
                    document_ids: documentIds,
                };
            });

            totalDebits = Number(totalDebits.toFixed(2));
            totalCredits = Number(totalCredits.toFixed(2));
            if (totalDebits !== totalCredits) {
                throw createCodeError("ERR_INVALID_SELECTION");
            }
            const orderedLines = sortJournalLinesDebitsFirst(normalizedLines);

            const providedReferenceCode = normalizeReferenceCode(entryData.reference_code);

            const journalEntryInsertResult = await client.query(
                `INSERT INTO journal_entries
                    (journal_type, entry_date, description, status, total_debits, total_credits, created_by, updated_by, reference_code)
                 VALUES
                    ($1, $2, $3, 'pending', $4, $5, $6, $6, $7)
                 RETURNING id, journal_type, entry_date, description, status, total_debits, total_credits, created_at, reference_code`,
                [
                    journalType,
                    normalizeEntryDate(entryData.entry_date),
                    description,
                    totalDebits,
                    totalCredits,
                    numericUserId,
                    providedReferenceCode,
                ],
            );
            const journalEntry = { ...journalEntryInsertResult.rows[0] };
            if (!journalEntry.reference_code) {
                const generatedReferenceCode = buildAutoReferenceCode(journalEntry.id);
                const referenceCodeUpdateResult = await client.query(
                    `UPDATE journal_entries
                     SET reference_code = $1,
                         updated_at = now(),
                         updated_by = $2
                     WHERE id = $3
                     RETURNING reference_code`,
                    [generatedReferenceCode, numericUserId, journalEntry.id],
                );
                journalEntry.reference_code = referenceCodeUpdateResult.rows[0]?.reference_code || generatedReferenceCode;
            }

            const persistedLines = [];
            for (const line of orderedLines) {
                const lineInsertResult = await client.query(
                    `INSERT INTO journal_entry_lines
                        (journal_entry_id, line_no, account_id, dc, amount, line_description, created_by, updated_by)
                     VALUES
                        ($1, $2, $3, $4, $5, $6, $7, $7)
                     RETURNING id, line_no, account_id, dc, amount, line_description`,
                    [journalEntry.id, line.line_no, line.account_id, line.dc, line.amount, line.line_description, numericUserId],
                );
                const insertedLine = lineInsertResult.rows[0];
                persistedLines.push({
                    ...insertedLine,
                    document_ids: line.document_ids,
                });
            }

            const journalEntryDocumentIds = Array.isArray(entryData.journal_entry_document_ids) && entryData.journal_entry_document_ids.length > 0
                ? entryData.journal_entry_document_ids.map((id) => String(id))
                : Array.from(documentLookupByClientId.keys());

            const uniqueEntryDocumentIds = new Set(journalEntryDocumentIds);
            for (const clientDocumentId of uniqueEntryDocumentIds) {
                const document = documentLookupByClientId.get(clientDocumentId);
                if (!document) {
                    throw createCodeError("ERR_INVALID_SELECTION");
                }
                await client.query(
                    `INSERT INTO journal_entry_documents
                        (journal_entry_id, document_id, created_by, updated_by)
                     VALUES
                        ($1, $2, $3, $3)
                     ON CONFLICT (journal_entry_id, document_id) DO NOTHING`,
                    [journalEntry.id, document.id, numericUserId],
                );
            }

            for (const persistedLine of persistedLines) {
                const uniqueLineDocumentIds = new Set(Array.isArray(persistedLine.document_ids) ? persistedLine.document_ids : []);
                for (const clientDocumentId of uniqueLineDocumentIds) {
                    const document = documentLookupByClientId.get(String(clientDocumentId));
                    if (!document) {
                        throw createCodeError("ERR_INVALID_SELECTION");
                    }
                    await client.query(
                        `INSERT INTO journal_entry_line_documents
                            (journal_entry_line_id, document_id, created_by, updated_by)
                         VALUES
                            ($1, $2, $3, $3)
                         ON CONFLICT (journal_entry_line_id, document_id) DO NOTHING`,
                        [persistedLine.id, document.id, numericUserId],
                    );
                }
            }

            log("info", "Journal entry created", {
                journal_entry_id: journalEntry.id,
                line_count: persistedLines.length,
                document_count: persistedDocuments.length,
            }, utilities.getCallerInfo(), numericUserId);

            return {
                id: journalEntry.id,
                reference_code: journalEntry.reference_code,
                journal_type: journalEntry.journal_type,
                entry_date: journalEntry.entry_date,
                description: journalEntry.description,
                status: journalEntry.status,
                total_debits: journalEntry.total_debits,
                total_credits: journalEntry.total_credits,
                manager_comment: null,
                documents: persistedDocuments,
                lines: persistedLines,
            };
        }, numericUserId);

        return result;
    } catch (error) {
        const duplicateReferenceCode = error?.code === "23505" && error?.constraint === "journal_entries_reference_code_key";
        for (const filePath of movedFilePaths) {
            await safeDeleteFile(filePath);
        }
        for (const filePath of temporaryPaths) {
            await safeDeleteFile(filePath);
        }
        if (duplicateReferenceCode) {
            throw createCodeError("ERR_JOURNAL_REFERENCE_CODE_NOT_AVAILABLE");
        }
        throw error;
    }
};

const listJournalQueue = async ({ status, fromDate, toDate, search, limit, offset } = {}) => {
    const normalizedStatus = normalizeJournalStatus(status, { allowAll: true });
    const normalizedFromDate = normalizeDateFilter(fromDate);
    const normalizedToDate = normalizeDateFilter(toDate);
    const normalizedSearch = normalizeSearch(search);
    const normalizedLimit = parseQueueLimit(limit);
    const normalizedOffset = parsePositiveInteger(offset, 0);

    const whereClauses = [];
    const params = [];

    if (normalizedStatus !== "all") {
        params.push(normalizedStatus);
        whereClauses.push(`je.status = $${params.length}`);
    }

    if (normalizedFromDate) {
        params.push(normalizedFromDate);
        whereClauses.push(`je.entry_date::date >= $${params.length}::date`);
    }

    if (normalizedToDate) {
        params.push(normalizedToDate);
        whereClauses.push(`je.entry_date::date <= $${params.length}::date`);
    }

    if (normalizedSearch) {
        params.push(`%${normalizedSearch}%`);
        const searchParamRef = `$${params.length}`;
        whereClauses.push(`(
            je.description ILIKE ${searchParamRef}
            OR COALESCE(je.reference_code, '') ILIKE ${searchParamRef}
            OR TO_CHAR(je.entry_date::date, 'YYYY-MM-DD') ILIKE ${searchParamRef}
            OR EXISTS (
                SELECT 1
                FROM journal_entry_lines jel
                JOIN accounts a ON a.id = jel.account_id
                WHERE jel.journal_entry_id = je.id
                  AND (
                      a.account_name ILIKE ${searchParamRef}
                      OR jel.amount::text ILIKE ${searchParamRef}
                  )
            )
        )`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const totalResult = await db.query(
        `SELECT COUNT(*)::int AS total
         FROM journal_entries je
         ${whereSql}`,
        params,
    );

    const rowsParams = [...params, normalizedLimit, normalizedOffset];
    const rowsResult = await db.query(
        `SELECT
            je.id,
            je.reference_code,
            je.journal_type,
            je.entry_date,
            je.description,
            je.status,
            je.manager_comment,
            je.total_debits,
            je.total_credits,
            je.created_by,
            creator.username AS created_by_username,
            je.approved_by,
            approver.username AS approved_by_username,
            je.created_at,
            je.updated_at,
            je.approved_at,
            je.posted_at
         FROM journal_entries je
         JOIN users creator ON creator.id = je.created_by
         LEFT JOIN users approver ON approver.id = je.approved_by
         ${whereSql}
         ORDER BY je.entry_date DESC, je.id DESC
         LIMIT $${rowsParams.length - 1}
         OFFSET $${rowsParams.length}`,
        rowsParams,
    );

    return {
        rows: rowsResult.rows,
        total: totalResult.rows[0]?.total || 0,
        limit: normalizedLimit,
        offset: normalizedOffset,
    };
};

const listLedgerEntries = async ({ accountId, fromDate, toDate, search, limit, offset } = {}) => {
    const normalizedAccountId = normalizeAccountFilter(accountId);
    const normalizedFromDate = normalizeDateFilter(fromDate);
    const normalizedToDate = normalizeDateFilter(toDate);
    const normalizedSearch = normalizeSearch(search);
    const normalizedLimit = parseLedgerLimit(limit);
    const normalizedOffset = parsePositiveInteger(offset, 0);

    const balanceScopeClauses = [];
    const filterClauses = [];
    const params = [];

    if (normalizedAccountId !== null) {
        params.push(normalizedAccountId);
        balanceScopeClauses.push(`le.account_id = $${params.length}`);
    }

    if (normalizedFromDate) {
        params.push(normalizedFromDate);
        filterClauses.push(`lwb.entry_date::date >= $${params.length}::date`);
    }

    if (normalizedToDate) {
        params.push(normalizedToDate);
        filterClauses.push(`lwb.entry_date::date <= $${params.length}::date`);
    }

    if (normalizedSearch) {
        params.push(`%${normalizedSearch}%`);
        const searchParamRef = `$${params.length}`;
        filterClauses.push(`(
            lwb.account_name ILIKE ${searchParamRef}
            OR COALESCE(lwb.description, '') ILIKE ${searchParamRef}
            OR COALESCE(lwb.pr_journal_ref, '') ILIKE ${searchParamRef}
            OR COALESCE(lwb.reference_code, '') ILIKE ${searchParamRef}
            OR TO_CHAR(lwb.entry_date::date, 'YYYY-MM-DD') ILIKE ${searchParamRef}
            OR lwb.amount::text ILIKE ${searchParamRef}
        )`);
    }

    const balanceScopeSql = balanceScopeClauses.length > 0 ? `WHERE ${balanceScopeClauses.join(" AND ")}` : "";
    const filterSql = filterClauses.length > 0 ? `WHERE ${filterClauses.join(" AND ")}` : "";

    const totalResult = await db.query(
        `WITH ledger_with_balances AS (
            SELECT
                le.id,
                le.account_id,
                a.account_name,
                le.entry_date,
                le.description,
                le.dc,
                le.amount,
                le.journal_entry_id,
                le.pr_journal_ref,
                je.reference_code,
                CASE
                    WHEN a.normal_side = 'debit'
                        THEN COALESCE(a.initial_balance, 0)::numeric(18,2)
                            + SUM(CASE WHEN le.dc = 'debit' THEN le.amount ELSE 0 END)
                                OVER (PARTITION BY le.account_id ORDER BY le.entry_date ASC, le.id ASC)
                            - SUM(CASE WHEN le.dc = 'credit' THEN le.amount ELSE 0 END)
                                OVER (PARTITION BY le.account_id ORDER BY le.entry_date ASC, le.id ASC)
                    ELSE COALESCE(a.initial_balance, 0)::numeric(18,2)
                        - SUM(CASE WHEN le.dc = 'debit' THEN le.amount ELSE 0 END)
                            OVER (PARTITION BY le.account_id ORDER BY le.entry_date ASC, le.id ASC)
                        + SUM(CASE WHEN le.dc = 'credit' THEN le.amount ELSE 0 END)
                            OVER (PARTITION BY le.account_id ORDER BY le.entry_date ASC, le.id ASC)
                END AS running_balance
            FROM ledger_entries le
            JOIN accounts a ON a.id = le.account_id
            LEFT JOIN journal_entries je ON je.id = le.journal_entry_id
            ${balanceScopeSql}
        )
        SELECT COUNT(*)::int AS total
        FROM ledger_with_balances lwb
        ${filterSql}`,
        params,
    );

    const rowsParams = [...params, normalizedLimit, normalizedOffset];
    const rowsResult = await db.query(
        `WITH ledger_with_balances AS (
            SELECT
                le.id,
                le.account_id,
                a.account_name,
                le.entry_date,
                le.description,
                le.dc,
                le.amount,
                le.journal_entry_id,
                le.pr_journal_ref,
                je.reference_code,
                CASE
                    WHEN a.normal_side = 'debit'
                        THEN COALESCE(a.initial_balance, 0)::numeric(18,2)
                            + SUM(CASE WHEN le.dc = 'debit' THEN le.amount ELSE 0 END)
                                OVER (PARTITION BY le.account_id ORDER BY le.entry_date ASC, le.id ASC)
                            - SUM(CASE WHEN le.dc = 'credit' THEN le.amount ELSE 0 END)
                                OVER (PARTITION BY le.account_id ORDER BY le.entry_date ASC, le.id ASC)
                    ELSE COALESCE(a.initial_balance, 0)::numeric(18,2)
                        - SUM(CASE WHEN le.dc = 'debit' THEN le.amount ELSE 0 END)
                            OVER (PARTITION BY le.account_id ORDER BY le.entry_date ASC, le.id ASC)
                        + SUM(CASE WHEN le.dc = 'credit' THEN le.amount ELSE 0 END)
                            OVER (PARTITION BY le.account_id ORDER BY le.entry_date ASC, le.id ASC)
                END AS running_balance
            FROM ledger_entries le
            JOIN accounts a ON a.id = le.account_id
            LEFT JOIN journal_entries je ON je.id = le.journal_entry_id
            ${balanceScopeSql}
        )
        SELECT
            lwb.id,
            lwb.account_id,
            lwb.account_name,
            lwb.entry_date,
            lwb.description,
            lwb.dc,
            lwb.amount,
            lwb.journal_entry_id,
            lwb.pr_journal_ref,
            lwb.reference_code,
            lwb.running_balance
        FROM ledger_with_balances lwb
        ${filterSql}
        ORDER BY lwb.entry_date DESC, lwb.id DESC
        LIMIT $${rowsParams.length - 1}
        OFFSET $${rowsParams.length}`,
        rowsParams,
    );

    const debitEntries = [];
    const creditEntries = [];
    for (const row of rowsResult.rows) {
        const tAccountRow = {
            id: row.id,
            account_id: row.account_id,
            account_name: row.account_name,
            entry_date: row.entry_date,
            journal_entry_id: row.journal_entry_id,
            pr_journal_ref: row.pr_journal_ref,
            reference_code: row.reference_code,
            amount: row.amount,
        };
        if (row.dc === "debit") {
            debitEntries.push(tAccountRow);
            continue;
        }
        creditEntries.push(tAccountRow);
    }

    return {
        rows: rowsResult.rows,
        total: totalResult.rows[0]?.total || 0,
        limit: normalizedLimit,
        offset: normalizedOffset,
        t_account: {
            debit_entries: debitEntries,
            credit_entries: creditEntries,
        },
    };
};

const getJournalEntryDetail = async (journalEntryId) => {
    const normalizedJournalEntryId = normalizeJournalEntryId(journalEntryId);

    const entryResult = await db.query(
        `SELECT
            je.id,
            je.reference_code,
            je.journal_type,
            je.entry_date,
            je.description,
            je.status,
            je.manager_comment,
            je.total_debits,
            je.total_credits,
            je.created_by,
            creator.username AS created_by_username,
            je.approved_by,
            approver.username AS approved_by_username,
            je.created_at,
            je.updated_at,
            je.approved_at,
            je.posted_at
         FROM journal_entries je
         JOIN users creator ON creator.id = je.created_by
         LEFT JOIN users approver ON approver.id = je.approved_by
         WHERE je.id = $1`,
        [normalizedJournalEntryId],
    );

    if (entryResult.rowCount === 0) {
        throw createCodeError("ERR_JOURNAL_ENTRY_NOT_FOUND");
    }

    const documentsResult = await db.query(
        `SELECT
            d.id,
            d.title,
            d.original_file_name,
            d.file_extension,
            d.upload_at
         FROM journal_entry_documents jed
         JOIN documents d ON d.id = jed.document_id
         WHERE jed.journal_entry_id = $1
         ORDER BY d.upload_at ASC, d.id ASC`,
        [normalizedJournalEntryId],
    );

    const documents = documentsResult.rows.map((row) => ({
        ...row,
        download_url: buildJournalDocumentDownloadUrl(normalizedJournalEntryId, row.id),
    }));

    const linesResult = await db.query(
        `SELECT
            jel.id,
            jel.line_no,
            jel.account_id,
            a.account_name,
            jel.dc,
            jel.amount,
            jel.line_description
         FROM journal_entry_lines jel
         JOIN accounts a ON a.id = jel.account_id
         WHERE jel.journal_entry_id = $1
         ORDER BY jel.line_no ASC, jel.id ASC`,
        [normalizedJournalEntryId],
    );

    const lineDocumentsResult = await db.query(
        `SELECT
            jeld.journal_entry_line_id,
            d.id,
            d.title,
            d.original_file_name,
            d.file_extension,
            d.upload_at
         FROM journal_entry_line_documents jeld
         JOIN documents d ON d.id = jeld.document_id
         JOIN journal_entry_lines jel ON jel.id = jeld.journal_entry_line_id
         WHERE jel.journal_entry_id = $1
         ORDER BY jeld.journal_entry_line_id ASC, d.upload_at ASC, d.id ASC`,
        [normalizedJournalEntryId],
    );

    const docsByLineId = new Map();
    for (const row of lineDocumentsResult.rows) {
        if (!docsByLineId.has(row.journal_entry_line_id)) {
            docsByLineId.set(row.journal_entry_line_id, []);
        }
        docsByLineId.get(row.journal_entry_line_id).push({
            id: row.id,
            title: row.title,
            original_file_name: row.original_file_name,
            file_extension: row.file_extension,
            upload_at: row.upload_at,
            download_url: buildJournalDocumentDownloadUrl(normalizedJournalEntryId, row.id),
        });
    }

    const lines = linesResult.rows.map((line) => ({
        ...line,
        documents: docsByLineId.get(line.id) || [],
    }));

    return {
        journal_entry: entryResult.rows[0],
        documents,
        lines,
    };
};

const getJournalDocumentDownloadInfo = async ({ journalEntryId, documentId }) => {
    const normalizedJournalEntryId = normalizeJournalEntryId(journalEntryId);
    const normalizedDocumentId = normalizeJournalEntryId(documentId);

    const entryExistsResult = await db.query("SELECT id FROM journal_entries WHERE id = $1", [normalizedJournalEntryId]);
    if (entryExistsResult.rowCount === 0) {
        throw createCodeError("ERR_JOURNAL_ENTRY_NOT_FOUND");
    }

    const documentResult = await db.query(
        `SELECT
            d.id,
            d.title,
            d.original_file_name,
            d.file_extension,
            d.file_name::text AS file_name
         FROM documents d
         WHERE d.id = $2
           AND (
               EXISTS (
                   SELECT 1
                   FROM journal_entry_documents jed
                   WHERE jed.journal_entry_id = $1
                     AND jed.document_id = d.id
               )
               OR EXISTS (
                   SELECT 1
                   FROM journal_entry_line_documents jeld
                   JOIN journal_entry_lines jel
                     ON jel.id = jeld.journal_entry_line_id
                   WHERE jel.journal_entry_id = $1
                     AND jeld.document_id = d.id
               )
           )
         LIMIT 1`,
        [normalizedJournalEntryId, normalizedDocumentId],
    );

    if (documentResult.rowCount === 0) {
        throw createCodeError("ERR_JOURNAL_ENTRY_NOT_FOUND");
    }

    const document = documentResult.rows[0];
    const fileName = `${document.file_name}${document.file_extension || ""}`;
    const resolvedFilePath = path.resolve(userDocsRoot, fileName);
    const normalizedRoot = path.resolve(userDocsRoot);
    const normalizedRootWithSep = normalizedRoot.endsWith(path.sep) ? normalizedRoot : `${normalizedRoot}${path.sep}`;
    if (!resolvedFilePath.startsWith(normalizedRootWithSep)) {
        throw createCodeError("ERR_INVALID_SELECTION");
    }
    if (!fs.existsSync(resolvedFilePath)) {
        throw createCodeError("ERR_JOURNAL_ENTRY_NOT_FOUND");
    }

    return {
        ...document,
        journal_entry_id: normalizedJournalEntryId,
        file_path: resolvedFilePath,
    };
};

const approveJournalEntry = async ({ journalEntryId, managerUserId, managerComment }) => {
    const normalizedJournalEntryId = normalizeJournalEntryId(journalEntryId);
    const normalizedManagerUserId = normalizeJournalEntryId(managerUserId);
    const normalizedManagerComment = normalizeManagerComment(managerComment, { required: false });

    return db.transaction(async (client) => {
        const journalEntryResult = await client.query(
            `SELECT id, status, entry_date, description, reference_code
             FROM journal_entries
             WHERE id = $1
             FOR UPDATE`,
            [normalizedJournalEntryId],
        );

        if (journalEntryResult.rowCount === 0) {
            throw createCodeError("ERR_JOURNAL_ENTRY_NOT_FOUND");
        }

        const journalEntry = journalEntryResult.rows[0];
        if (journalEntry.status !== "pending") {
            throw createCodeError("ERR_JOURNAL_ENTRY_NOT_PENDING");
        }

        let referenceCode = journalEntry.reference_code;
        if (!referenceCode) {
            referenceCode = buildAutoReferenceCode(normalizedJournalEntryId);
            await client.query(
                `UPDATE journal_entries
                 SET reference_code = $1,
                     updated_at = now(),
                     updated_by = $2
                 WHERE id = $3`,
                [referenceCode, normalizedManagerUserId, normalizedJournalEntryId],
            );
        }

        const linesResult = await client.query(
            `SELECT id, account_id, dc, amount, line_description
             FROM journal_entry_lines
             WHERE journal_entry_id = $1
             ORDER BY line_no ASC, id ASC`,
            [normalizedJournalEntryId],
        );

        for (const line of linesResult.rows) {
            const ledgerInsertResult = await client.query(
                `INSERT INTO ledger_entries
                    (account_id, entry_date, dc, amount, description, journal_entry_line_id, journal_entry_id, pr_journal_ref, created_by, updated_by, posted_at, posted_by)
                 VALUES
                    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, now(), $9)
                 ON CONFLICT (journal_entry_line_id) DO NOTHING
                 RETURNING id`,
                [
                    line.account_id,
                    journalEntry.entry_date,
                    line.dc,
                    line.amount,
                    line.line_description || journalEntry.description || null,
                    line.id,
                    normalizedJournalEntryId,
                    referenceCode,
                    normalizedManagerUserId,
                ],
            );

            // Keep posting idempotent: only roll up account totals when the ledger row is newly inserted.
            if (ledgerInsertResult.rowCount === 0) {
                continue;
            }

            await applyJournalLinePostingToAccount({
                client,
                accountId: line.account_id,
                dc: line.dc,
                amount: Number(line.amount),
            });
        }

        const approvedResult = await client.query(
            `UPDATE journal_entries
             SET status = 'approved',
                 manager_comment = $1,
                 approved_by = $2,
                 approved_at = now(),
                 posted_at = now(),
                 updated_by = $2,
                 updated_at = now()
             WHERE id = $3
             RETURNING id, reference_code, journal_type, entry_date, description, status, manager_comment, total_debits, total_credits, created_by, approved_by, approved_at, posted_at`,
            [normalizedManagerComment, normalizedManagerUserId, normalizedJournalEntryId],
        );

        return approvedResult.rows[0];
    }, normalizedManagerUserId);
};

const rejectJournalEntry = async ({ journalEntryId, managerUserId, managerComment }) => {
    const normalizedJournalEntryId = normalizeJournalEntryId(journalEntryId);
    const normalizedManagerUserId = normalizeJournalEntryId(managerUserId);
    const normalizedManagerComment = normalizeManagerComment(managerComment, { required: true });

    return db.transaction(async (client) => {
        const journalEntryResult = await client.query(
            `SELECT id, status
             FROM journal_entries
             WHERE id = $1
             FOR UPDATE`,
            [normalizedJournalEntryId],
        );

        if (journalEntryResult.rowCount === 0) {
            throw createCodeError("ERR_JOURNAL_ENTRY_NOT_FOUND");
        }

        const journalEntry = journalEntryResult.rows[0];
        if (journalEntry.status !== "pending") {
            throw createCodeError("ERR_JOURNAL_ENTRY_NOT_PENDING");
        }

        const rejectResult = await client.query(
            `UPDATE journal_entries
             SET status = 'rejected',
                 manager_comment = $1,
                 updated_by = $2,
                 updated_at = now()
             WHERE id = $3
             RETURNING id, reference_code, journal_type, entry_date, description, status, manager_comment, total_debits, total_credits, created_by, approved_by, approved_at, posted_at`,
            [normalizedManagerComment, normalizedManagerUserId, normalizedJournalEntryId],
        );

        return rejectResult.rows[0];
    }, normalizedManagerUserId);
};

module.exports = {
    JOURNAL_STATUSES,
    createJournalEntry,
    isReferenceCodeAvailable,
    listJournalQueue,
    listLedgerEntries,
    getJournalEntryDetail,
    getJournalDocumentDownloadInfo,
    approveJournalEntry,
    rejectJournalEntry,
};
