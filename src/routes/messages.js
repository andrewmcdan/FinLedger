const express = require("express");
const { getMessageByCode, getMessagesByCodes } = require("../services/message_catalog");
const { sendApiError } = require("../utils/api_messages");

const router = express.Router();

router.get("/", async (req, res) => {
    const rawCodes = `${req.query.codes || req.query.code || ""}`
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

    if (rawCodes.length === 0) {
        return sendApiError(res, 400, "ERR_INVALID_SELECTION");
    }

    try {
        const messages = await getMessagesByCodes(rawCodes);
        return res.json({ messages });
    } catch (error) {
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

router.get("/:code", async (req, res) => {
    const code = req.params.code;
    if (!code) {
        return sendApiError(res, 400, "ERR_INVALID_SELECTION");
    }
    try {
        const replacements = req.query || {};
        const message = await getMessageByCode(code, replacements);
        return res.json({ code, message });
    } catch (error) {
        return sendApiError(res, 500, "ERR_INTERNAL_SERVER");
    }
});

module.exports = router;
