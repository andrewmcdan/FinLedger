const db = require("../db/db");
const path = require("path");
const fs = require("fs");
const { log } = require("./../utils/logger");
const utilities = require("./../utils/utilities");

const userDocsRoot = path.resolve(__dirname, "./../../user-docs/");

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

const buildAutoReferenceCode = (journalEntryId) => {
    return `JE-${String(journalEntryId).padStart(8, "0")}`;
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
            for (const line of normalizedLines) {
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
            throw createCodeError("ERR_INVALID_SELECTION");
        }
        throw error;
    }
};

module.exports = {
    createJournalEntry,
    isReferenceCodeAvailable,
};
