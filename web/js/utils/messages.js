const messageCache = new Map();

const applyReplacements = (template, replacements = {}) => {
    if (!template || typeof template !== "string") {
        return "";
    }
    return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
        if (Object.prototype.hasOwnProperty.call(replacements, key)) {
            return String(replacements[key] ?? "");
        }
        return "";
    });
};

export async function getMessages(codes = []) {
    const uniqueCodes = Array.from(new Set((codes || []).filter(Boolean)));
    const uncachedCodes = uniqueCodes.filter((code) => !messageCache.has(code));
    if (uncachedCodes.length > 0) {
        const query = encodeURIComponent(uncachedCodes.join(","));
        const response = await fetch(`/api/messages?codes=${query}`);
        if (response.ok) {
            const data = await response.json().catch(() => ({}));
            const messages = data?.messages || {};
            for (const [code, value] of Object.entries(messages)) {
                messageCache.set(code, value);
            }
        }
    }
    const result = {};
    for (const code of uniqueCodes) {
        result[code] = messageCache.get(code) || "";
    }
    return result;
}

export async function getMessage(code, replacements = {}, fallback = "") {
    if (!code) {
        return fallback;
    }
    try {
        const messages = await getMessages([code]);
        const template = messages[code] || fallback || code;
        return applyReplacements(template, replacements);
    } catch (error) {
        return fallback || code;
    }
}
