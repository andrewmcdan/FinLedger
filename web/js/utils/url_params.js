// url_params.js

/**
 * Get a query parameter regardless of whether it appears
 * in the normal query string or after a hash-based route.
 *
 * Supports:
 *   ?key=value
 *   #/route?key=value
 *   ?key=value#/route
 *
 * @param {string} name
 * @returns {string|null}
 */
export default function getUrlParam(name) {
    // 1. Normal query string: ?key=value
    const searchParams = new URLSearchParams(window.location.search);
    const fromSearch = searchParams.get(name);
    if (fromSearch !== null) {
        return fromSearch;
    }

    // 2. Hash-based query: #/route?key=value
    const hash = window.location.hash;
    const queryIndex = hash.indexOf("?");
    if (queryIndex !== -1) {
        const hashParams = new URLSearchParams(hash.substring(queryIndex + 1));
        const fromHash = hashParams.get(name);
        if (fromHash !== null) {
            return fromHash;
        }
    }

    return null;
}
