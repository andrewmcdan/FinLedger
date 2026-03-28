const express = require("express");
const { isAdmin, isManager } = require("../controllers/users");
const { createAdjustmentEntry, listAdjustmentEntries, approveAdjustmentEntry, rejectAdjustmentEntry } = require("../controllers/adjustments");
const { sendApiError, sendApiSuccess } = require("../utils/api_messages");
const { log } = require("../utils/logger");
const utilities = require("../utils/utilities");

const router = express.Router();

const ensureNotAdminUser = async (req, res, next) => {
    if (await isAdmin(req.user.id, req.user.token)) {
        log("warn", "Admin users are not allowed to perform this action", { userId: req.user.id }, utilities.getCallerInfo());
        return sendApiError(res, 403, "ERR_FORBIDDEN");
    }
    return next();
};

const ensureManagerUser = async (req, res, next) => {
    if (await isAdmin(req.user.id, req.user.token)) {
        log("warn", "Admin users are not allowed to perform manager adjustment actions", { userId: req.user.id }, utilities.getCallerInfo());
        return sendApiError(res, 403, "ERR_FORBIDDEN");
    }

    if (!(await isManager(req.user.id, req.user.token))) {
        log("warn", "Non-manager attempted manager-only adjustment action", { userId: req.user.id }, utilities.getCallerInfo(), req.user.id);
        return sendApiError(res, 403, "ERR_FORBIDDEN_MANAGER_APPROVAL_REQUIRED");
    }

    return next();
};

router.get("/", ensureNotAdminUser, async (req, res) => {
    try {
        const result = await listAdjustmentEntries({
            status: req.query?.status,
            fromDate: req.query?.from_date,
            toDate: req.query?.to_date,
            search: req.query?.search,
            limit: req.query?.limit,
            offset: req.query?.offset,
        });
        return res.json({
            adjustment_entries: result.rows,
            pagination: {
                total: result.total,
                limit: result.limit,
                offset: result.offset,
            },
        });
    } catch (error) {
        if (error?.code === "ERR_INVALID_SELECTION") {
            return sendApiError(res, 400, "ERR_INVALID_SELECTION");
        }
        log("error", "Failed to list adjustment entries", { userId: req.user?.id, error: error.message }, utilities.getCallerInfo(), req.user?.id);
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

router.post("/", ensureNotAdminUser, async (req, res) => {
    try {
        const result = await createAdjustmentEntry(req.user.id, req.body || {});
        return sendApiSuccess(res, "MSG_JOURNAL_ENTRY_CREATED_SUCCESS", result);
    } catch (error) {
        if (["ERR_PLEASE_FILL_ALL_FIELDS", "ERR_INVALID_SELECTION", "ERR_JOURNAL_ENTRY_NOT_BALANCED"].includes(error?.code)) {
            return sendApiError(res, 400, error.code);
        }
        log("error", "Failed to create adjustment entry", { userId: req.user?.id, error: error.message }, utilities.getCallerInfo(), req.user?.id);
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

router.patch("/:journalEntryId/approve", ensureManagerUser, async (req, res) => {
    try {
        const result = await approveAdjustmentEntry({
            journalEntryId: req.params.journalEntryId,
            managerUserId: req.user.id,
            managerComment: req.body?.manager_comment,
        });
        return sendApiSuccess(res, "MSG_JOURNAL_ENTRY_APPROVED_SUCCESS", { adjustment_entry: result });
    } catch (error) {
        if (["ERR_INVALID_SELECTION", "ERR_JOURNAL_ENTRY_NOT_PENDING"].includes(error?.code)) {
            return sendApiError(res, 400, error.code);
        }
        if (error?.code === "ERR_JOURNAL_ENTRY_NOT_FOUND") {
            return sendApiError(res, 404, "ERR_JOURNAL_ENTRY_NOT_FOUND");
        }
        log("error", "Failed to approve adjustment entry", { userId: req.user?.id, journalEntryId: req.params?.journalEntryId, error: error.message }, utilities.getCallerInfo(), req.user?.id);
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

router.patch("/:journalEntryId/reject", ensureManagerUser, async (req, res) => {
    try {
        const result = await rejectAdjustmentEntry({
            journalEntryId: req.params.journalEntryId,
            managerUserId: req.user.id,
            managerComment: req.body?.manager_comment,
        });
        return sendApiSuccess(res, "MSG_JOURNAL_ENTRY_REJECTED_SUCCESS", { adjustment_entry: result });
    } catch (error) {
        if (["ERR_INVALID_SELECTION", "ERR_JOURNAL_ENTRY_NOT_PENDING", "ERR_JOURNAL_REJECTION_REASON_REQUIRED"].includes(error?.code)) {
            return sendApiError(res, 400, error.code);
        }
        if (error?.code === "ERR_JOURNAL_ENTRY_NOT_FOUND") {
            return sendApiError(res, 404, "ERR_JOURNAL_ENTRY_NOT_FOUND");
        }
        log("error", "Failed to reject adjustment entry", { userId: req.user?.id, journalEntryId: req.params?.journalEntryId, error: error.message }, utilities.getCallerInfo(), req.user?.id);
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

module.exports = router;
