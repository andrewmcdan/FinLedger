const messageLine = document.getElementById("global_message_line");
const messageText = document.getElementById("global_message_text");
const messageCloseButton = document.getElementById("global_message_close");
let autoClearBound = false;
let dismissBound = false;
let resizeBound = false;
let getMessageFn = null;
const OFFSET_CSS_VAR = "--global-message-offset";

async function loadMessageHelper() {
    if (getMessageFn) {
        return getMessageFn;
    }
    const moduleUrl = new URL("/js/utils/messages.js", window.location.origin).href;
    const module = await import(moduleUrl);
    getMessageFn = module.getMessage;
    return getMessageFn;
}

async function resolveMessage(message) {
    const value = `${message ?? ""}`.trim();
    if (value.startsWith("ERR_") || value.startsWith("MSG_")) {
        const getMessage = await loadMessageHelper();
        return getMessage(value, {}, value);
    }
    return value;
}

function setPageOffset(px) {
    const value = Math.max(0, Math.ceil(Number(px) || 0));
    document.documentElement.style.setProperty(OFFSET_CSS_VAR, `${value}px`);
}

function syncPageOffset() {
    if (!messageLine || !messageLine.classList.contains("message-line--active")) {
        setPageOffset(0);
        return;
    }
    setPageOffset(messageLine.getBoundingClientRect().height);
}

function clearMessageLine() {
    if (!messageLine) {
        return;
    }
    if (messageText) {
        messageText.textContent = "";
    } else {
        messageLine.textContent = "";
    }
    messageLine.classList.remove("message-line--active");
    messageLine.classList.remove("message-line--error");
    messageLine.classList.remove("message-line--success");
    messageLine.setAttribute("role", "status");
    messageLine.setAttribute("aria-live", "polite");
    setPageOffset(0);
}

function showMessageLine(message, type = "error") {
    if (!messageLine) {
        return;
    }
    if (!message || `${message}`.trim() === "") {
        clearMessageLine();
        return;
    }
    if (messageText) {
        messageText.textContent = `${message}`.trim();
    } else {
        messageLine.textContent = `${message}`.trim();
    }
    messageLine.classList.remove("message-line--error");
    messageLine.classList.remove("message-line--success");
    if (type === "success") {
        messageLine.classList.add("message-line--success");
        messageLine.setAttribute("role", "status");
        messageLine.setAttribute("aria-live", "polite");
    } else {
        messageLine.classList.add("message-line--error");
        messageLine.setAttribute("role", "alert");
        messageLine.setAttribute("aria-live", "assertive");
    }
    messageLine.classList.add("message-line--active");
    requestAnimationFrame(syncPageOffset);
}

function bindAutoClearOnInput() {
    if (autoClearBound) {
        return;
    }
    document.addEventListener("input", (event) => {
        const target = event.target;
        if (!target || !(target instanceof HTMLElement)) {
            return;
        }
        if (!target.matches("input, textarea, select")) {
            return;
        }
        clearMessageLine();
    });
    autoClearBound = true;
}

function bindDismissButton() {
    if (dismissBound || !messageCloseButton) {
        return;
    }
    messageCloseButton.addEventListener("click", clearMessageLine);
    dismissBound = true;
}

function bindResizeSync() {
    if (resizeBound) {
        return;
    }
    window.addEventListener("resize", syncPageOffset);
    resizeBound = true;
}

async function showErrorModal(message) {
    bindAutoClearOnInput();
    bindDismissButton();
    bindResizeSync();
    const resolved = await resolveMessage(message);
    showMessageLine(resolved, "error");
}

async function showMessageModal(message) {
    bindAutoClearOnInput();
    bindDismissButton();
    bindResizeSync();
    const resolved = await resolveMessage(message);
    showMessageLine(resolved, "success");
}

export { showErrorModal, showMessageModal, showMessageLine, clearMessageLine };
