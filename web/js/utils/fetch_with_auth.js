export const fetchWithAuth = async (url, options = {}) => {
    const authToken = localStorage.getItem("auth_token") || "";
    const userId = localStorage.getItem("user_id") || "";
    const mergedHeaders = {
        Authorization: `Bearer ${authToken}`,
        "X-User-Id": `${userId}`,
        ...(options.headers || {}),
    };

    const response = await fetch(url, {
        ...options,
        credentials: options.credentials || "include",
        headers: mergedHeaders,
    });
    if (window.FinLedgerSession?.applyExpiryHeaders) {
        window.FinLedgerSession.applyExpiryHeaders(response);
    }
    return response;
};
