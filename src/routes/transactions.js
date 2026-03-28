const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const userDocsRoot = path.resolve(__dirname, "./../../user-docs/");
const allowedDocumentExts = new Set([".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".txt", ".csv", ".xls", ".xlsx", ".doc", ".docx"]);
const documentMimeToExt = new Map([
    ["application/pdf", ".pdf"],
    ["image/png", ".png"],
    ["image/jpeg", ".jpg"],
    ["image/gif", ".gif"],
    ["image/webp", ".webp"],
    ["text/plain", ".txt"],
    ["text/csv", ".csv"],
    ["application/msword", ".doc"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
    ["application/vnd.ms-excel", ".xls"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
]);

fs.mkdirSync(userDocsRoot, { recursive: true });

const router = express.Router();
const { createJournalEntry, isReferenceCodeAvailable, listJournalQueue, listLedgerEntries, getJournalEntryDetail, getJournalDocumentDownloadInfo, approveJournalEntry, rejectJournalEntry } = require("../controllers/transactions");
const { log } = require("../utils/logger.js");
const utilities = require("../utils/utilities.js");
const { sendApiError, sendApiSuccess } = require("../utils/api_messages");
const { isAdmin, isManager, listAdministratorContacts, listManagerContacts, getUserById } = require("../controllers/users.js");
const { sendEmail } = require("../services/email.js");

const getDocumentExtension = (file) => {
    const ext = path.extname(file?.originalname || "").toLowerCase();
    if (allowedDocumentExts.has(ext)) {
        return ext;
    }
    const mimeExtension = documentMimeToExt.get((file?.mimetype || "").toLowerCase());
    if (mimeExtension && allowedDocumentExts.has(mimeExtension)) {
        return mimeExtension;
    }
    return "";
};

const docStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, userDocsRoot),
    filename: (req, file, cb) => {
        const extension = getDocumentExtension(file);
        if (!extension || !allowedDocumentExts.has(extension)) {
            return cb(new Error("ERR_INVALID_FILE_TYPE"));
        }
        const temporaryName = `upload-${Date.now()}-${crypto.randomBytes(12).toString("hex")}${extension}`;
        return cb(null, temporaryName);
    },
});

const uploadDoc = multer({
    storage: docStorage,
    limits: { fileSize: 15 * 1024 * 1024, files: 50 },
    fileFilter: (req, file, cb) => {
        if (!getDocumentExtension(file)) {
            return cb(new Error("ERR_INVALID_FILE_TYPE"));
        }
        return cb(null, true);
    },
});

const removeUploadedFiles = (files = []) => {
    for (const file of files) {
        if (!file?.path || !fs.existsSync(file.path)) {
            continue;
        }
        // Check that file is within the userDocsRoot directory before attempting to delete.
        if (!path.resolve(file.path).startsWith(userDocsRoot)) {
            log("warn", "Attempted to remove file outside of user documents directory", { path: file.path }, utilities.getCallerInfo());
            continue;
        }
        try {
            fs.unlinkSync(file.path);
        } catch (error) {
            log("warn", "Failed to remove uploaded journal document after request failure", { path: file.path, error: error.message }, utilities.getCallerInfo());
        }
    }
};

const buildSafeDownloadFileName = (document = {}) => {
    const fallbackBase = "journal-document";
    const rawBase = String(document.title || path.basename(document.original_file_name || "", document.file_extension || "") || fallbackBase).trim();
    const normalizedBase =
        rawBase
            .replace(/[^a-zA-Z0-9._ -]/g, "_")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 120) || fallbackBase;
    const normalizedExtension = String(document.file_extension || "")
        .replace(/[^a-zA-Z0-9.]/g, "")
        .trim();
    if (!normalizedExtension) {
        return normalizedBase;
    }
    return normalizedExtension.startsWith(".") ? `${normalizedBase}${normalizedExtension}` : `${normalizedBase}.${normalizedExtension}`;
};

const ensureNotAdminUser = async (req, res, next) => {
    if (await isAdmin(req.user.id, req.user.token)) {
        log("warn", "Admin users are not allowed to perform this action", { userId: req.user.id }, utilities.getCallerInfo());
        return sendApiError(res, 403, "ERR_FORBIDDEN");
    }
    return next();
};

const ensureManagerUser = async (req, res, next) => {
    if (await isAdmin(req.user.id, req.user.token)) {
        log("warn", "Admin users are not allowed to perform manager journal approval actions", { userId: req.user.id }, utilities.getCallerInfo());
        return sendApiError(res, 403, "ERR_FORBIDDEN");
    }
    const manager = await isManager(req.user.id, req.user.token);
    if (!manager) {
        log("warn", "Non-manager attempted manager-only journal approval action", { userId: req.user.id }, utilities.getCallerInfo(), req.user.id);
        return sendApiError(res, 403, "ERR_FORBIDDEN_MANAGER_APPROVAL_REQUIRED");
    }
    return next();
};

const notifyManagersOfJournalSubmission = async ({ submitterUserId, journalEntry }) => {
    try {
        const managerContacts = await listManagerContacts();
        const administratorContacts = await listAdministratorContacts();
        const recipients = [...managerContacts, ...administratorContacts].filter((contact) => {
            const email = String(contact?.email || "").trim();
            return email.length > 0;
        });
        const uniqueRecipients = Array.from(new Map(recipients.map((contact) => [String(contact.email).toLowerCase(), contact])).values());

        if (!Array.isArray(uniqueRecipients) || uniqueRecipients.length === 0) {
            return;
        }

        const submitter = await getUserById(submitterUserId);
        const submitterLabel = submitter?.username || `User #${submitterUserId}`;
        const entryDate = journalEntry?.entry_date ? new Date(journalEntry.entry_date).toISOString().slice(0, 10) : "N/A";
        const referenceCode = journalEntry?.reference_code || `JE-${journalEntry?.id || "N/A"}`;
        const subject = `Journal Entry Submitted for Approval: ${referenceCode}`;
        const body = [
            "A journal entry has been submitted and is awaiting manager approval.",
            "",
            `Reference: ${referenceCode}`,
            `Journal Entry ID: ${journalEntry?.id || "N/A"}`,
            `Entry Date: ${entryDate}`,
            `Submitted By: ${submitterLabel}`,
            `Description: ${journalEntry?.description || "(none)"}`,
            `Total Debits: ${journalEntry?.total_debits || "0.00"}`,
            `Total Credits: ${journalEntry?.total_credits || "0.00"}`,
            "",
            "Please review this entry in FinLedger > Transactions > Journal Queue.",
        ].join("\n");

        const sendResults = await Promise.allSettled(uniqueRecipients.map((recipient) => sendEmail(recipient.email, subject, body)));

        sendResults.forEach((result, index) => {
            if (result.status === "fulfilled") {
                return;
            }
            const recipient = uniqueRecipients[index];
            log(
                "warn",
                "Failed to notify submission stakeholder",
                {
                    recipientId: recipient?.id,
                    recipientEmail: recipient?.email,
                    journalEntryId: journalEntry?.id,
                    error: result.reason?.message || "unknown error",
                },
                utilities.getCallerInfo(),
                submitterUserId,
            );
        });
    } catch (error) {
        log(
            "warn",
            "Manager journal submission notification failed",
            {
                submitterUserId,
                journalEntryId: journalEntry?.id,
                error: error.message,
            },
            utilities.getCallerInfo(),
            submitterUserId,
        );
    }
};

const notifyJournalCreatorOfDecision = async ({ journalEntry, decision, managerComment }) => {
    try {
        const creatorUserId = Number(journalEntry?.created_by);
        if (!Number.isSafeInteger(creatorUserId) || creatorUserId <= 0) {
            return;
        }

        const creator = await getUserById(creatorUserId);
        const creatorEmail = String(creator?.email || "").trim();
        if (!creatorEmail) {
            return;
        }

        const normalizedDecision = String(decision || "")
            .trim()
            .toLowerCase();
        if (!normalizedDecision) {
            return;
        }

        const referenceCode = journalEntry?.reference_code || `JE-${journalEntry?.id || "N/A"}`;
        const entryDate = journalEntry?.entry_date ? new Date(journalEntry.entry_date).toISOString().slice(0, 10) : "N/A";
        const statusLabel = normalizedDecision === "approved" ? "approved" : "rejected";
        const subject = `Journal Entry ${statusLabel.toUpperCase()}: ${referenceCode}`;
        const bodyLines = [`Your journal entry has been ${statusLabel}.`, "", `Reference: ${referenceCode}`, `Journal Entry ID: ${journalEntry?.id || "N/A"}`, `Entry Date: ${entryDate}`, `Status: ${statusLabel}`, `Total Debits: ${journalEntry?.total_debits || "0.00"}`, `Total Credits: ${journalEntry?.total_credits || "0.00"}`];

        if (normalizedDecision === "rejected") {
            bodyLines.push(`Manager Comment: ${managerComment || "(none provided)"}`);
        }

        bodyLines.push("", "Please review this entry in FinLedger > Transactions > Journal Queue.");

        await sendEmail(creatorEmail, subject, bodyLines.join("\n"));
    } catch (error) {
        log(
            "warn",
            "Failed to notify journal creator about decision",
            {
                journalEntryId: journalEntry?.id,
                decision,
                error: error.message,
            },
            utilities.getCallerInfo(),
            journalEntry?.created_by,
        );
    }
};

router.get("/reference-code-available", ensureNotAdminUser, async (req, res) => {
    const referenceCode = String(req.query?.reference_code || "").trim();
    if (!referenceCode) {
        return sendApiError(res, 400, "ERR_PLEASE_FILL_ALL_FIELDS");
    }

    const excludeJournalEntryId = req.query?.exclude_journal_entry_id;
    const parsedExcludeJournalEntryId = excludeJournalEntryId === undefined || excludeJournalEntryId === null || String(excludeJournalEntryId).trim() === "" ? null : Number(excludeJournalEntryId);
    if (parsedExcludeJournalEntryId !== null && (!Number.isSafeInteger(parsedExcludeJournalEntryId) || parsedExcludeJournalEntryId <= 0)) {
        return sendApiError(res, 400, "ERR_INVALID_SELECTION");
    }

    try {
        const available = await isReferenceCodeAvailable(referenceCode, parsedExcludeJournalEntryId);
        return res.json({
            reference_code: referenceCode,
            is_available: available,
        });
    } catch (error) {
        if (error?.code === "ERR_PLEASE_FILL_ALL_FIELDS" || error?.code === "ERR_INVALID_SELECTION") {
            return sendApiError(res, 400, error.code);
        }
        log(
            "error",
            "Failed to validate journal reference code availability",
            {
                userId: req.user?.id,
                referenceCode,
                error: error.message,
            },
            utilities.getCallerInfo(),
            req.user?.id,
        );
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

router.get("/ledger", async (req, res) => {
    try {
        const ledgerResult = await listLedgerEntries({
            accountId: req.query?.account_id,
            fromDate: req.query?.from_date,
            toDate: req.query?.to_date,
            search: req.query?.search,
            limit: req.query?.limit,
            offset: req.query?.offset,
        });
        return res.json({
            ledger_entries: ledgerResult.rows,
            pagination: {
                total: ledgerResult.total,
                limit: ledgerResult.limit,
                offset: ledgerResult.offset,
            },
            t_account: ledgerResult.t_account,
        });
    } catch (error) {
        if (error?.code === "ERR_INVALID_SELECTION") {
            return sendApiError(res, 400, "ERR_INVALID_SELECTION");
        }
        log("error", "Failed to list ledger entries", { userId: req.user?.id, error: error.message }, utilities.getCallerInfo(), req.user?.id);
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

router.get("/journal-queue", ensureNotAdminUser, async (req, res) => {
    try {
        const queueResult = await listJournalQueue({
            status: req.query?.status,
            journalType: req.query?.journal_type,
            fromDate: req.query?.from_date,
            toDate: req.query?.to_date,
            search: req.query?.search,
            limit: req.query?.limit,
            offset: req.query?.offset,
        });
        return res.json({
            journal_entries: queueResult.rows,
            pagination: {
                total: queueResult.total,
                limit: queueResult.limit,
                offset: queueResult.offset,
            },
        });
    } catch (error) {
        if (error?.code === "ERR_INVALID_SELECTION") {
            return sendApiError(res, 400, "ERR_INVALID_SELECTION");
        }
        log("error", "Failed to list journal queue", { userId: req.user?.id, error: error.message }, utilities.getCallerInfo(), req.user?.id);
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

router.get("/journal-entry/:journalEntryId", ensureNotAdminUser, async (req, res) => {
    try {
        const detail = await getJournalEntryDetail(req.params.journalEntryId);
        return res.json(detail);
    } catch (error) {
        if (error?.code === "ERR_INVALID_SELECTION") {
            return sendApiError(res, 400, "ERR_INVALID_SELECTION");
        }
        if (error?.code === "ERR_JOURNAL_ENTRY_NOT_FOUND") {
            return sendApiError(res, 404, "ERR_JOURNAL_ENTRY_NOT_FOUND");
        }
        log(
            "error",
            "Failed to fetch journal entry detail",
            {
                userId: req.user?.id,
                journalEntryId: req.params?.journalEntryId,
                error: error.message,
            },
            utilities.getCallerInfo(),
            req.user?.id,
        );
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

router.get("/journal-entry/:journalEntryId/documents/:documentId/download", ensureNotAdminUser, async (req, res) => {
    try {
        const document = await getJournalDocumentDownloadInfo({
            journalEntryId: req.params.journalEntryId,
            documentId: req.params.documentId,
        });
        const suggestedFileName = buildSafeDownloadFileName(document);
        const encodedFileName = encodeURIComponent(suggestedFileName);
        res.setHeader("Content-Disposition", `attachment; filename="${suggestedFileName.replace(/"/g, "")}"; filename*=UTF-8''${encodedFileName}`);
        return res.sendFile(document.file_path);
    } catch (error) {
        if (error?.code === "ERR_INVALID_SELECTION") {
            return sendApiError(res, 400, "ERR_INVALID_SELECTION");
        }
        if (error?.code === "ERR_JOURNAL_ENTRY_NOT_FOUND") {
            return sendApiError(res, 404, "ERR_JOURNAL_ENTRY_NOT_FOUND");
        }
        log(
            "error",
            "Failed to download journal document",
            {
                userId: req.user?.id,
                journalEntryId: req.params?.journalEntryId,
                documentId: req.params?.documentId,
                error: error.message,
            },
            utilities.getCallerInfo(),
            req.user?.id,
        );
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

router.patch("/journal-entry/:journalEntryId/approve", ensureManagerUser, async (req, res) => {
    try {
        const approvalResult = await approveJournalEntry({
            journalEntryId: req.params.journalEntryId,
            managerUserId: req.user.id,
            managerComment: req.body?.manager_comment,
        });

        // Non-blocking notification path. Approval remains successful if email dispatch fails.
        await notifyJournalCreatorOfDecision({
            journalEntry: approvalResult,
            decision: "approved",
            managerComment: req.body?.manager_comment,
        });

        return sendApiSuccess(res, "MSG_JOURNAL_ENTRY_APPROVED_SUCCESS", { journal_entry: approvalResult });
    } catch (error) {
        if (error?.code === "ERR_INVALID_SELECTION") {
            return sendApiError(res, 400, "ERR_INVALID_SELECTION");
        }
        if (error?.code === "ERR_JOURNAL_ENTRY_NOT_FOUND") {
            return sendApiError(res, 404, "ERR_JOURNAL_ENTRY_NOT_FOUND");
        }
        if (error?.code === "ERR_JOURNAL_ENTRY_NOT_PENDING") {
            return sendApiError(res, 400, "ERR_JOURNAL_ENTRY_NOT_PENDING");
        }
        log(
            "error",
            "Failed to approve journal entry",
            {
                userId: req.user?.id,
                journalEntryId: req.params?.journalEntryId,
                error: error.message,
            },
            utilities.getCallerInfo(),
            req.user?.id,
        );
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

router.patch("/journal-entry/:journalEntryId/reject", ensureManagerUser, async (req, res) => {
    try {
        const rejectionResult = await rejectJournalEntry({
            journalEntryId: req.params.journalEntryId,
            managerUserId: req.user.id,
            managerComment: req.body?.manager_comment,
        });

        // Non-blocking notification path. Rejection remains successful if email dispatch fails.
        await notifyJournalCreatorOfDecision({
            journalEntry: rejectionResult,
            decision: "rejected",
            managerComment: req.body?.manager_comment,
        });

        return sendApiSuccess(res, "MSG_JOURNAL_ENTRY_REJECTED_SUCCESS", { journal_entry: rejectionResult });
    } catch (error) {
        if (error?.code === "ERR_INVALID_SELECTION") {
            return sendApiError(res, 400, "ERR_INVALID_SELECTION");
        }
        if (error?.code === "ERR_JOURNAL_ENTRY_NOT_FOUND") {
            return sendApiError(res, 404, "ERR_JOURNAL_ENTRY_NOT_FOUND");
        }
        if (error?.code === "ERR_JOURNAL_ENTRY_NOT_PENDING") {
            return sendApiError(res, 400, "ERR_JOURNAL_ENTRY_NOT_PENDING");
        }
        if (error?.code === "ERR_JOURNAL_REJECTION_REASON_REQUIRED") {
            return sendApiError(res, 400, "ERR_JOURNAL_REJECTION_REASON_REQUIRED");
        }
        log(
            "error",
            "Failed to reject journal entry",
            {
                userId: req.user?.id,
                journalEntryId: req.params?.journalEntryId,
                error: error.message,
            },
            utilities.getCallerInfo(),
            req.user?.id,
        );
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

router.post("/new-journal-entry", ensureNotAdminUser, uploadDoc.array("documents", 20), async (req, res) => {
    const payloadRaw = req.body?.payload;
    if (!payloadRaw) {
        removeUploadedFiles(req.files);
        return sendApiError(res, 400, "ERR_PLEASE_FILL_ALL_FIELDS");
    }

    let payload;
    try {
        payload = typeof payloadRaw === "string" ? JSON.parse(payloadRaw) : payloadRaw;
    } catch (error) {
        removeUploadedFiles(req.files);
        return sendApiError(res, 400, "ERR_INVALID_SELECTION");
    }

    if (!Array.isArray(req.files) || req.files.length === 0) {
        return sendApiError(res, 400, "ERR_NO_FILE_UPLOADED");
    }

    const uploadedDocuments = req.files.map((file, index) => ({
        upload_index: index,
        temporary_path: file.path,
        original_name: file.originalname,
        file_extension: getDocumentExtension(file),
        mime_type: file.mimetype,
        file_size: file.size,
    }));

    try {
        const creationResult = await createJournalEntry(req.user.id, {
            ...payload,
            uploaded_documents: uploadedDocuments,
        });

        // Non-blocking notification path. Journal creation remains successful if email dispatch fails.
        await notifyManagersOfJournalSubmission({
            submitterUserId: req.user.id,
            journalEntry: creationResult,
        });

        return sendApiSuccess(res, "MSG_JOURNAL_ENTRY_CREATED_SUCCESS", {
            journal_entry: creationResult,
            uploaded_documents: creationResult?.documents || [],
        });
    } catch (error) {
        removeUploadedFiles(req.files);
        log("error", "Failed to create journal entry", { userId: req.user.id, error: error.message }, utilities.getCallerInfo(), req.user.id);
        if (error?.code === "ERR_UNAUTHORIZED") {
            return sendApiError(res, 401, "ERR_UNAUTHORIZED");
        }
        if (
            error?.code === "ERR_PLEASE_FILL_ALL_FIELDS"
            || error?.code === "ERR_INVALID_SELECTION"
            || error?.code === "ERR_NO_FILE_UPLOADED"
            || error?.code === "ERR_INVALID_FILE_TYPE"
            || error?.code === "ERR_JOURNAL_REFERENCE_CODE_NOT_AVAILABLE"
            || error?.code === "ERR_JOURNAL_ENTRY_NOT_BALANCED"
        ) {
            return sendApiError(res, 400, error.code);
        }
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

router.use((error, req, res, next) => {
    if (!error) {
        return next();
    }
    if (error?.message === "ERR_INVALID_FILE_TYPE") {
        return sendApiError(res, 400, "ERR_INVALID_FILE_TYPE");
    }
    if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
            return sendApiError(res, 400, "ERR_INVALID_FILE_TYPE");
        }
        if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
            return sendApiError(res, 400, "ERR_INVALID_SELECTION");
        }
    }
    return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
});

module.exports = router;
