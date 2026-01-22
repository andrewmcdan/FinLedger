function getCallerInfo() {
    const stack = new Error().stack;
    const lines = stack.split("\n").map((l) => l.trim());

    const caller = lines[2] || lines[1];

    const match = caller.match(/\((.*):(\d+):(\d+)\)$/) || caller.match(/at (.*):(\d+):(\d+)$/);

    if (!match) return null;

    return {
        file: match[1],
        line: Number(match[2]),
        column: Number(match[3]),
    };
}

function sanitizeInput(input) {
    if (typeof input !== "string") {
        return input;
    }
    return input.replace(/[<>&"'`]/g, (char) => {
        switch (char) {
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
            case "&":
                return "&amp;";
            case '"':
                return "&quot;";
            case "'":
                return "&#x27;";
            case "`":
                return "&#x60;";
            default:
                return char;
        }
    });
}

module.exports = {
    getCallerInfo,
    sanitizeInput,
};
