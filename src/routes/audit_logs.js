const express = require("express");
const router = express.Router();
const { isAdmin, isManager } = require("../controllers/users");
const { listAuditLogs, listAuditLogsForEntity } = require("../controllers/audit_logs");
const { log } = require("../utils/logger");
const utilities = require("../utils/utilities");
const { sendApiError } = require("../utils/api_messages");

async function canViewAuditLogs(userId, token) {
    return (await isAdmin(userId, token)) || (await isManager(userId, token));
}

router.get("/", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return sendApiError(res, 401, "ERR_UNAUTHORIZED");
    }
    if (!(await canViewAuditLogs(requestingUserId, req.user.token))) {
        return sendApiError(res, 403, "ERR_ACCESS_DENIED_ADMIN_REQUIRED");
    }

    try {
        const { entity_type, entity_id, changed_by, action, start_at, end_at, limit, offset } = req.query;
        const result = await listAuditLogs({
            entity_type,
            entity_id,
            changed_by,
            action,
            start_at,
            end_at,
            limit,
            offset,
        });
        log("debug", "Audit log query completed", { requestingUserId, total: result.total }, utilities.getCallerInfo(), requestingUserId);
        return res.json({
            audit_logs: result.rows,
            pagination: {
                total: result.total,
                limit: result.limit,
                offset: result.offset,
            },
        });
    } catch (error) {
        log("error", `Audit log query failed: ${error.message}`, { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

router.get("/entity/:entityType/:entityId", async (req, res) => {
    const requestingUserId = req.user.id;
    if (!requestingUserId) {
        return sendApiError(res, 401, "ERR_UNAUTHORIZED");
    }
    if (!(await canViewAuditLogs(requestingUserId, req.user.token))) {
        return sendApiError(res, 403, "ERR_ACCESS_DENIED_ADMIN_REQUIRED");
    }

    try {
        const { entityType, entityId } = req.params;
        const { changed_by, action, start_at, end_at, limit, offset } = req.query;
        const result = await listAuditLogsForEntity(entityType, entityId, {
            changed_by,
            action,
            start_at,
            end_at,
            limit,
            offset,
        });
        log("debug", "Entity audit log query completed", { requestingUserId, entityType, entityId, total: result.total }, utilities.getCallerInfo(), requestingUserId);
        return res.json({
            audit_logs: result.rows,
            pagination: {
                total: result.total,
                limit: result.limit,
                offset: result.offset,
            },
        });
    } catch (error) {
        log("error", `Entity audit log query failed: ${error.message}`, { requestingUserId }, utilities.getCallerInfo(), requestingUserId);
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

module.exports = router;
