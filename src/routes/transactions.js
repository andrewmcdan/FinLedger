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
const { createJournalEntry } = require("../controllers/transactions");
const { log } = require("../utils/logger.js");
const utilities = require("../utils/utilities.js");
const { sendApiError, sendApiSuccess } = require("../utils/api_messages");
const { getUserLoggedInStatus, isAdmin } = require("../controllers/users.js");

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

/*
 * uploadDoc payload contract (multipart/form-data)
 *
 * Required form-data fields:
 *   - payload: JSON string with journal entry data (schema below)
 *   - documents: one or more files (uploaded as repeated "documents" fields)
 *   - each file is persisted on disk as <documents.file_name UUID from DB><file_extension>
 *
 * JSON schema for "payload":
 * {
 *   "journal_type": "general" | "adjusting",
 *   "entry_date": "YYYY-MM-DD",
 *   "description": "string",
 *   "documents": [
 *     {
 *       "client_document_id": "string",
 *       "title": "string",
 *       "upload_index": 0,
 *       "meta_data": { "category": "invoice", "source": "vendor_portal" }
 *     }
 *   ],
 *   "journal_entry_document_ids": ["client_document_id", "..."],
 *   "lines": [
 *     {
 *       "line_no": 1,
 *       "account_id": 1200,
 *       "dc": "debit" | "credit",
 *       "amount": "123.45",
 *       "line_description": "Optional line memo",
 *       "document_ids": ["client_document_id", "..."]
 *     }
 *   ]
 * }
 *
 * Full example payload JSON:
 * {
 *   "journal_type": "general",
 *   "entry_date": "2026-02-25",
 *   "description": "Office supplies purchase",
 *   "documents": [
 *     {
 *       "client_document_id": "doc-invoice-001",
 *       "title": "Vendor Invoice 1023",
 *       "upload_index": 0,
 *       "meta_data": {
 *         "category": "invoice",
 *         "source": "vendor_portal"
 *       }
 *     },
 *     {
 *       "client_document_id": "doc-receipt-001",
 *       "title": "Credit Card Receipt",
 *       "upload_index": 1,
 *       "meta_data": {
 *         "category": "receipt",
 *         "vendor": "Office Supply Co."
 *       }
 *     }
 *   ],
 *   "journal_entry_document_ids": ["doc-invoice-001", "doc-receipt-001"],
 *   "lines": [
 *     {
 *       "line_no": 1,
 *       "account_id": 6100,
 *       "dc": "debit",
 *       "amount": "149.99",
 *       "line_description": "Office supplies expense",
 *       "document_ids": ["doc-invoice-001", "doc-receipt-001"]
 *     },
 *     {
 *       "line_no": 2,
 *       "account_id": 1010,
 *       "dc": "credit",
 *       "amount": "149.99",
 *       "line_description": "Cash paid",
 *       "document_ids": ["doc-receipt-001"]
 *     }
 *   ]
 * }
 */
const uploadDoc = multer({
    storage: docStorage,
    limits: { fileSize: 15 * 1024 * 1024, files: 20 },
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
        // Check that file is within the userDocsRoot directory before attempting to delete
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

const ensureAuthenticatedUser = async (req, res, next) => {
    if (!req.user?.id || !req.user?.token) {
        log("warn", "Unauthorized upload request", { path: req.path }, utilities.getCallerInfo());
        return sendApiError(res, 401, "ERR_UNAUTHORIZED");
    }
    if (!(await getUserLoggedInStatus(req.user.id, req.user.token))) {
        log("warn", "Invalid token for authenticated user", { userId: req.user.id }, utilities.getCallerInfo());
        return sendApiError(res, 401, "ERR_UNAUTHORIZED");
    }
    return next();
};

const ensureNotAdminUser = async (req, res, next) => {
    if (await isAdmin(req.user.id, req.user.token)) {
        log("warn", "Admin users are not allowed to perform this action", { userId: req.user.id }, utilities.getCallerInfo());
        return sendApiError(res, 403, "ERR_FORBIDDEN");
    }
    return next();
};

router.post("/new-journal-entry", ensureAuthenticatedUser, ensureNotAdminUser, uploadDoc.array("documents", 20), async (req, res) => {
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
        return sendApiSuccess(res, "MSG_FILE_UPLOADED_SUCCESS", {
            journal_entry: creationResult,
            uploaded_documents: creationResult?.documents || [],
        });
    } catch (error) {
        removeUploadedFiles(req.files);
        log("error", "Failed to create journal entry", { userId: req.user.id, error: error.message }, utilities.getCallerInfo(), req.user.id);
        if (error?.code === "ERR_UNAUTHORIZED") {
            return sendApiError(res, 401, "ERR_UNAUTHORIZED");
        }
        if (error?.code === "ERR_PLEASE_FILL_ALL_FIELDS" || error?.code === "ERR_INVALID_SELECTION" || error?.code === "ERR_NO_FILE_UPLOADED" || error?.code === "ERR_INVALID_FILE_TYPE") {
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
