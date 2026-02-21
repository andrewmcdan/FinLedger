const { getMessageByCode } = require("../services/message_catalog");

const sendApiError = async (res, statusCode, errorCode, replacements = {}, extra = {}) => {
    const error = await getMessageByCode(errorCode, replacements);
    return res.status(statusCode).json({
        ...extra,
        error,
        errorCode,
    });
};

const sendApiSuccess = async (res, messageCode, payload = {}, statusCode = 200, replacements = {}) => {
    const message = await getMessageByCode(messageCode, replacements);
    return res.status(statusCode).json({
        ...payload,
        message,
        messageCode,
    });
};

module.exports = {
    sendApiError,
    sendApiSuccess,
};
