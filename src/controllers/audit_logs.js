const db = require("../db/db");

function normalizeInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
}

async function listAuditLogs(filters = {}) {
    const params = [];
    const where = [];

    if (filters.entity_type) {
        params.push(String(filters.entity_type).trim());
        where.push(`entity_type = $${params.length}`);
    }
    if (filters.entity_id !== undefined && filters.entity_id !== null && String(filters.entity_id).trim() !== "") {
        const parsedEntityId = Number.parseInt(filters.entity_id, 10);
        if (Number.isFinite(parsedEntityId)) {
            params.push(parsedEntityId);
            where.push(`entity_id = $${params.length}`);
        }
    }
    if (filters.changed_by !== undefined && filters.changed_by !== null && String(filters.changed_by).trim() !== "") {
        const parsedChangedBy = Number.parseInt(filters.changed_by, 10);
        if (Number.isFinite(parsedChangedBy)) {
            params.push(parsedChangedBy);
            where.push(`changed_by = $${params.length}`);
        }
    }
    if (filters.action) {
        params.push(String(filters.action).trim().toLowerCase());
        where.push(`action = $${params.length}`);
    }
    if (filters.start_at) {
        params.push(filters.start_at);
        where.push(`changed_at >= $${params.length}`);
    }
    if (filters.end_at) {
        params.push(filters.end_at);
        where.push(`changed_at <= $${params.length}`);
    }

    const limit = normalizeInteger(filters.limit, 100, { min: 1, max: 500 });
    const offset = normalizeInteger(filters.offset, 0, { min: 0, max: Number.MAX_SAFE_INTEGER });

    const whereClause = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
    const countSql = `SELECT COUNT(*)::int AS total FROM audit_logs${whereClause}`;
    const dataSql = `
        SELECT
            id,
            event_type,
            action,
            changed_by,
            changed_at,
            entity_type,
            entity_id,
            b_image,
            a_image,
            metadata
        FROM audit_logs
        ${whereClause}
        ORDER BY changed_at DESC, id DESC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
    `;

    const countResult = await db.query(countSql, params);
    const dataParams = [...params, limit, offset];
    const dataResult = await db.query(dataSql, dataParams);
    return {
        total: countResult.rows[0]?.total || 0,
        limit,
        offset,
        rows: dataResult.rows,
    };
}

async function listAuditLogsForEntity(entityType, entityId, filters = {}) {
    return listAuditLogs({
        ...filters,
        entity_type: entityType,
        entity_id: entityId,
    });
}

module.exports = {
    listAuditLogs,
    listAuditLogsForEntity,
};
