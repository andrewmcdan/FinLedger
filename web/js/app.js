const routes = {
    dashboard: { title: "Dashboard", page: "pages/dashboard", module: "js/pages/dashboard" },
    transactions: { title: "Transactions", page: "pages/transactions", module: "js/pages/transactions" },
    reports: { title: "Reports", page: "pages/reports", module: "js/pages/reports" },
    login: { title: "Login", page: "pages/public/login", module: "js/pages/public/login" },
    help: { title: "Help", page: "pages/public/help", module: "js/pages/public/help" },
    logout: { title: "Logout", page: "pages/public/logout", module: "js/pages/public/logout" },
    not_logged_in: { title: "Not Logged In", page: "pages/public/not_logged_in", module: null },
    not_found: { title: "Page Not Found", page: "pages/public/not_found", module: null },
    not_authorized: { title: "Not Authorized", page: "pages/public/not_authorized", module: null },
    profile: { title: "Profile", page: "pages/profile", module: "js/pages/profile" },
    force_password_change: { title: "Change Password", page: "pages/force_password_change", module: "js/pages/force_password_change" },
    accounts_list: { title: "Accounts List", page: "pages/accounts_list", module: "js/pages/accounts_list" },
};

const DEFAULT_ROUTE = "dashboard";
const view = document.getElementById("app");
const navLinks = Array.from(document.querySelectorAll(".app-nav [data-route]"));
const loadingOverlay = document.getElementById("loading_overlay");
const loadingLabel = loadingOverlay?.querySelector("[data-loading-label]") || loadingOverlay?.querySelector("div:last-child");
let loadingCount = 0;
let userIconBlobUrl = null;
let userIconOwnerId = null;

let modalApiPromise = null;

function loadModalApi() {
    if (!modalApiPromise) {
        modalApiPromise = import("./utils/message_modal.js").then((module) => ({
            showErrorModal: module.showErrorModal,
            showMessageModal: module.showMessageModal,
        }));
    }
    return modalApiPromise;
}

async function showErrorModal(message, autoHide) {
    const { showErrorModal: showErrorModalImpl } = await loadModalApi();
    return showErrorModalImpl(message, autoHide);
}

async function showMessageModal(message, autoHide) {
    const { showMessageModal: showMessageModalImpl } = await loadModalApi();
    return showMessageModalImpl(message, autoHide);
}

async function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function setLoadingOverlayVisible(isVisible) {
    if (!loadingOverlay) {
        return;
    }
    loadingOverlay.classList.toggle("is-visible", isVisible);
    setTimeout(() => {
        loadingOverlay.setAttribute("aria-hidden", isVisible ? "false" : "true");
    }, 200);
}

function showLoadingOverlay(message) {
    loadingCount += 1;
    if (loadingLabel && message) {
        loadingLabel.textContent = message;
    }
    setLoadingOverlayVisible(true);
}

function hideLoadingOverlay() {
    loadingCount = Math.max(0, loadingCount - 1);
    if (loadingCount === 0) {
        setLoadingOverlayVisible(false);
    }
}

function withLoadingOverlay(task, message) {
    showLoadingOverlay(message);
    try {
        const result = typeof task === "function" ? task() : task;
        return Promise.resolve(result).finally(() => {
            hideLoadingOverlay();
        });
    } catch (error) {
        hideLoadingOverlay();
        throw error;
    }
}

window.FinLedgerLoading = {
    show: showLoadingOverlay,
    hide: hideLoadingOverlay,
    withLoading: withLoadingOverlay,
};
const brandLogo = document.querySelector("[data-brand-logo]");
if (brandLogo) {
    brandLogo.addEventListener("click", () => {
        window.location.hash = `#/${DEFAULT_ROUTE}`;
    });
    brandLogo.style.cursor = "pointer";
}

function setUpHeaderUsername() {
    const headerUsername = document.querySelector("[data-header-username]");
    const headerUsernameWrapper = document.querySelector("[data-header-user-info]");
    if (headerUsername && headerUsernameWrapper) {
        const username = localStorage.getItem("username");
        const fullName = localStorage.getItem("full_name");
        let displayName = null;
        if (fullName && fullName !== "undefined undefined") {
            displayName = fullName;
        } else if (username) {
            displayName = username;
        }
        if (displayName) {
            headerUsername.textContent = `You are logged in as ${displayName}`;
        } else {
            headerUsername.textContent = "You are not logged in";
        }
    }
}

function setupProfileMenu() {
    const menuWrapper = document.querySelector("[data-profile-menu]");
    if (!menuWrapper) {
        return;
    }

    const menuPanel = menuWrapper.querySelector("[data-profile-menu-panel]");
    const profileButton = menuWrapper.querySelector("[data-user-profile-button]");
    const profileAction = menuWrapper.querySelector('[data-profile-action="profile"]');
    const logoutAction = menuWrapper.querySelector('[data-profile-action="logout"]');

    if (!menuPanel || !profileButton) {
        return;
    }

    const openMenu = () => {
        menuWrapper.classList.add("is-open");
        profileButton.setAttribute("aria-expanded", "true");
        menuPanel.setAttribute("aria-hidden", "false");
    };

    const closeMenu = () => {
        menuWrapper.classList.remove("is-open");
        profileButton.setAttribute("aria-expanded", "false");
        menuPanel.setAttribute("aria-hidden", "true");
    };

    menuWrapper.addEventListener("mouseenter", openMenu);
    menuWrapper.addEventListener("mouseleave", closeMenu);
    menuWrapper.addEventListener("focusin", openMenu);
    menuWrapper.addEventListener("focusout", (event) => {
        if (!menuWrapper.contains(event.relatedTarget)) {
            closeMenu();
        }
    });

    profileAction?.addEventListener("click", () => {
        window.location.hash = "#/profile";
        closeMenu();
    });

    logoutAction?.addEventListener("click", () => {
        window.location.hash = "#/logout";
        closeMenu();
    });

    window.addEventListener("hashchange", closeMenu);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeMenu();
        }
    });
}

const popupCalendarContainer = document.getElementById("popup_calendar_container");
if (popupCalendarContainer) {
    const calendarButton = document.getElementById("calendar_button");
    if (calendarButton) {
        calendarButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            popupCalendarContainer.classList.toggle("hidden");
            console.log("Toggled calendar visibility");
        });
    }

    document.addEventListener("click", (event) => {
        if (!popupCalendarContainer.contains(event.target) && event.target !== calendarButton && !calendarButton?.contains(event.target)) {
            popupCalendarContainer.classList.add("hidden");
        }
    });
}

function getRouteFromHash() {
    const hash = window.location.hash.replace(/^#\/?/, "");
    const routeKey = hash.split("?")[0].split("/")[0];
    return routeKey || DEFAULT_ROUTE;
}

function setActiveNav(routeKey) {
    navLinks.forEach((link) => {
        const isActive = link.dataset.route === routeKey || link.dataset.route2 === routeKey;
        link.classList.toggle("is-active", isActive);
        if (isActive) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });
}

const SESSION_WARNING_MS = 5 * 60 * 1000;
let sessionWarningTimeoutId = null;
let sessionLogoutTimeoutId = null;
let sessionExpiresAtMs = null;
let sessionWarnedForExpiresAtMs = null;
let sessionLogoutInProgress = false;

function clearSessionTimers() {
    if (sessionWarningTimeoutId) {
        clearTimeout(sessionWarningTimeoutId);
        sessionWarningTimeoutId = null;
    }
    if (sessionLogoutTimeoutId) {
        clearTimeout(sessionLogoutTimeoutId);
        sessionLogoutTimeoutId = null;
    }
}

function triggerSessionWarning(timeLeftMs) {
    if (timeLeftMs <= 0) {
        return;
    }
    const minutesLeft = Math.max(1, Math.round(timeLeftMs / 60000));
    alert(`Your session will expire in about ${minutesLeft} minute(s). You will be logged out automatically.`);
}

function performClientLogout() {
    if (sessionLogoutInProgress) {
        return;
    }
    sessionLogoutInProgress = true;
    clearSessionTimers();

    const authToken = localStorage.getItem("auth_token") || "";
    const userId = localStorage.getItem("user_id") || "";
    if (authToken && userId) {
        fetch("/api/auth/logout", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authToken}`,
                "X-User-Id": `${userId}`,
            },
        }).catch(() => {});
    }

    localStorage.removeItem("user_id");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("username");
    localStorage.removeItem("must_change_password");
    localStorage.removeItem("full_name");
    window.location.hash = "#/login";
    window.location.reload();
}

function scheduleSessionTimers(expiresAtMs) {
    if (!Number.isFinite(expiresAtMs)) {
        return;
    }
    sessionExpiresAtMs = expiresAtMs;
    clearSessionTimers();
    const timeLeftMs = expiresAtMs - Date.now();
    if (timeLeftMs <= 0) {
        performClientLogout();
        return;
    }
    const warningDelay = timeLeftMs - SESSION_WARNING_MS;
    if (warningDelay <= 0) {
        if (sessionWarnedForExpiresAtMs !== expiresAtMs) {
            sessionWarnedForExpiresAtMs = expiresAtMs;
            triggerSessionWarning(timeLeftMs);
        }
    } else {
        sessionWarningTimeoutId = setTimeout(() => {
            if (sessionWarnedForExpiresAtMs === expiresAtMs) {
                return;
            }
            sessionWarnedForExpiresAtMs = expiresAtMs;
            triggerSessionWarning(expiresAtMs - Date.now());
        }, warningDelay);
    }
    sessionLogoutTimeoutId = setTimeout(() => {
        if (sessionExpiresAtMs !== expiresAtMs) {
            return;
        }
        performClientLogout();
    }, timeLeftMs);
}

function applySessionExpiryHeaders(response) {
    if (!response || !response.headers) {
        return;
    }
    const expiresAtHeader = response.headers.get("X-Session-Expires-At");
    const expiresInHeader = response.headers.get("X-Session-Expires-In");
    if (!expiresAtHeader && !expiresInHeader) {
        return;
    }
    let expiresAtMs = Number.NaN;
    if (expiresAtHeader) {
        const parsed = Date.parse(expiresAtHeader);
        if (!Number.isNaN(parsed)) {
            expiresAtMs = parsed;
        }
    }
    if (!Number.isFinite(expiresAtMs) && expiresInHeader) {
        const seconds = Number.parseInt(expiresInHeader, 10);
        if (!Number.isNaN(seconds)) {
            expiresAtMs = Date.now() + seconds * 1000;
        }
    }
    if (Number.isFinite(expiresAtMs)) {
        scheduleSessionTimers(expiresAtMs);
    }
}

window.FinLedgerSession = {
    applyExpiryHeaders: applySessionExpiryHeaders,
    scheduleSessionTimers,
    clearSessionTimers,
    performClientLogout,
};

async function fetchWithAuth(url, options = {}) {
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
    applySessionExpiryHeaders(response);
    return response;
}

async function fetchPageMarkup(pageName) {
    const response = await fetchWithAuth(`${pageName}.html`);
    if (response.ok) return response.text();
    console.log("Fetch page markup failed:", response.status);
    if (response.status === 401) {
        let resJson = await response.clone().json();
        const errorCode = resJson?.errorCode;
        const unauthenticatedCodes = new Set([
            "ERR_MISSING_AUTH_HEADER",
            "ERR_INVALID_AUTH_HEADER",
            "ERR_MISSING_USER_ID_HEADER",
            "ERR_INVALID_OR_EXPIRED_TOKEN",
            "ERR_NOT_LOGGED_IN",
        ]);
        if (unauthenticatedCodes.has(errorCode)) {
            window.location.hash = "#/not_logged_in";
            return;
        }
        if (errorCode === "ERR_ACCESS_DENIED_ADMIN_REQUIRED") {
            window.location.hash = "#/not_authorized";
            return;
        }
        console.log("Unauthorized access, redirecting to login");
        window.location.hash = "#/login";
        return;
    }
    if (response.status === 403) {
        let resJson = null;
        try {
            resJson = await response.clone().json();
        } catch (error) {
            resJson = null;
        }
        if (resJson?.errorCode === "ERR_TEMP_PASSWORD_CHANGE_REQUIRED") {
            window.location.hash = "#/force_password_change";
            return;
        }
        if (resJson?.errorCode === "ERR_ACCESS_DENIED_ADMIN_REQUIRED") {
            window.location.hash = "#/not_authorized";
            return;
        }
    }
    throw new Error(`Unable to load ${pageName}`);
}

async function loadModule(moduleName) {
    if (!moduleName) {
        return;
    }

    try {
        const response = await fetchWithAuth(`./${moduleName}.js`);
        if (!response.ok) {
            if (response.status === 401) {
                return;
            }
            if (response.status === 403) {
                let resJson = null;
                try {
                    resJson = await response.clone().json();
                } catch (error) {
                    resJson = null;
                }
                if (resJson?.errorCode === "ERR_TEMP_PASSWORD_CHANGE_REQUIRED") {
                    window.location.hash = "#/force_password_change";
                    return;
                }
            }
            throw new Error(`Unable to load module ${moduleName}: ${response.status}`);
        }
        const moduleText = await response.text();
        const blob = new Blob([moduleText], { type: "application/javascript" });
        const moduleUrl = URL.createObjectURL(blob);
        const module = await import(moduleUrl);
        URL.revokeObjectURL(moduleUrl);
        if (typeof module.default === "function") {
            module.default({ showLoadingOverlay, hideLoadingOverlay, showErrorModal, showMessageModal, userIconBlobUrl });
        }
    } catch (error) {
        console.error(`Failed to load module ${moduleName}`, error);
        if (error.message.includes("404")) {
            return;
        }
        if (error.message.includes("401")) {
            window.location.hash = "#/login";
        }
    }
}

function animateView() {
    view.classList.remove("page-enter");
    void view.offsetWidth;
    view.classList.remove("page-enter-prep");
    view.classList.add("page-enter");
}

async function renderRoute() {
    if (!view) {
        return;
    }

    view.classList.remove("page-enter");
    view.classList.add("page-enter-prep");

    const routeKey = getRouteFromHash();
    const route = routes[routeKey];
    const pageName = route ? route.page : routes.not_found.page;
    let shouldAnimate = false;
    let overlayActive = false;

    showLoadingOverlay("Loading...");
    const startTime = performance.now();
    overlayActive = true;
    try {
        try {
            const markup = await fetchPageMarkup(pageName);
            if (markup == null) {
                return;
            }
            view.innerHTML = markup;
            shouldAnimate = true;
            if (overlayActive) {
                await delay(Math.max(0, 500 - (performance.now() - startTime)));
                hideLoadingOverlay();
                overlayActive = false;
            }
        } catch (error) {
            try {
                const markup = await fetchPageMarkup("pages/public/not_found");
                view.innerHTML = markup;
                shouldAnimate = true;
                if (overlayActive) {
                    await delay(Math.max(0, 500 - (performance.now() - startTime)));
                    hideLoadingOverlay();
                    overlayActive = false;
                }
            } catch (fallbackError) {
                view.innerHTML = '<section class="page"><h1>Page not found</h1></section>';
                shouldAnimate = true;
                if (overlayActive) {
                    await delay(Math.max(0, 500 - (performance.now() - startTime)));
                    hideLoadingOverlay();
                    overlayActive = false;
                }
            }
        }

        const profileNameSpan = document.querySelector("[data-profile-name]");
        if (profileNameSpan) {
            const username = localStorage.getItem("username") || "None";
            profileNameSpan.textContent = "Profile: " + username;
            const menuWrapper = document.querySelector("[data-profile-menu]");
            if (menuWrapper) {
                menuWrapper.style.pointerEvents = username === "None" ? "none" : "auto";
            }
        }

        const userIconTargets = Array.from(document.querySelectorAll("[data-user-icon], [data-user-icon-menu]"));
        if (userIconTargets.length > 0) {
            const currentUserId = localStorage.getItem("user_id");
            const authToken = localStorage.getItem("auth_token");
            const shouldReloadIcon = !userIconBlobUrl || userIconOwnerId !== currentUserId;

            if (!authToken || !currentUserId) {
                if (userIconBlobUrl) {
                    URL.revokeObjectURL(userIconBlobUrl);
                    userIconBlobUrl = null;
                }
                userIconOwnerId = null;
                userIconTargets.forEach((img) => {
                    img.src = "/public_images/default.png";
                });
            } else if (shouldReloadIcon) {
                fetchWithAuth("/images/user-icon.png")
                    .then((response) => {
                        if (response.ok) {
                            return response.blob();
                        }
                        if (response.status === 401) {
                            return fetch("/public_images/default.png").then((res) => {
                                if (res.ok) {
                                    return res.blob();
                                }
                                throw new Error("Failed to load default user icon");
                            });
                        }
                        throw new Error("Failed to load user icon");
                    })
                    .then((blob) => {
                        if (userIconBlobUrl) {
                            URL.revokeObjectURL(userIconBlobUrl);
                        }
                        const objectURL = URL.createObjectURL(blob);
                        userIconBlobUrl = objectURL;
                        userIconOwnerId = currentUserId;
                        userIconTargets.forEach((img) => {
                            img.src = objectURL;
                        });
                    })
                    .catch((error) => {
                        console.error("Error loading user icon:", error);
                    });
            }
        }
        document.title = route ? `FinLedger - ${route.title}` : "FinLedger";
        setActiveNav(route ? routeKey : null);
        if (shouldAnimate) {
            animateView();
        } else {
            view.classList.remove("page-enter-prep");
        }
        await loadModule(route ? route.module : null);
    } finally {
        if (overlayActive) {
            await delay(Math.max(0, 500 - (performance.now() - startTime)));
            hideLoadingOverlay();
        }
        if (!shouldAnimate) {
            view.classList.remove("page-enter-prep");
        }
    }
}

window.addEventListener("hashchange", renderRoute);

const onDomReady = (handler) => {
    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", handler);
    } else {
        handler();
    }
};

onDomReady(renderRoute);
onDomReady(setupProfileMenu);
onDomReady(setUpHeaderUsername);
window.addEventListener("hashchange", setUpHeaderUsername);

import { updateLoginLogoutButton } from "./utils/login_logout_button.js";

onDomReady(updateLoginLogoutButton);
window.addEventListener("hashchange", updateLoginLogoutButton);

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dowNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const monthTitle = document.getElementById("monthTitle");
const dowRow = document.getElementById("dowRow");
const daysGrid = document.getElementById("daysGrid");
const monthSelect = document.getElementById("monthSelect");
const yearSelect = document.getElementById("yearSelect");
const meta = document.getElementById("meta");

const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const todayBtn = document.getElementById("todayBtn");

dowRow.innerHTML = dowNames.map((d) => `<div class="dow">${d}</div>`).join("");
monthSelect.innerHTML = monthNames.map((m, i) => `<option value="${i}">${m}</option>`).join("");

const now = new Date();
const currentYear = now.getFullYear();
const startYear = currentYear - 50;
const endYear = currentYear + 50;

let yearOptions = "";
for (let y = startYear; y <= endYear; y++) {
    yearOptions += `<option value="${y}">${y}</option>`;
}
yearSelect.innerHTML = yearOptions;

let viewYear = currentYear;
let viewMonth = now.getMonth();

function isSameDate(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
}

function renderCalendar() {
    monthTitle.textContent = `${monthNames[viewMonth]} ${viewYear}`;
    monthSelect.value = String(viewMonth);
    yearSelect.value = String(viewYear);
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const firstDow = firstOfMonth.getDay();
    const dim = daysInMonth(viewYear, viewMonth);
    const totalCells = 42;
    const prevMonth = (viewMonth + 11) % 12;
    const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    const dimPrev = daysInMonth(prevYear, prevMonth);

    const today = new Date();

    let html = "";
    for (let cell = 0; cell < totalCells; cell++) {
        const dayOffset = cell - firstDow;
        let displayNum;
        let muted = false;
        let dateObj;

        if (dayOffset < 0) {
            displayNum = dimPrev + dayOffset + 1;
            muted = true;
            dateObj = new Date(prevYear, prevMonth, displayNum);
        } else if (dayOffset >= dim) {
            displayNum = dayOffset - dim + 1;
            muted = true;
            const nextMonth = (viewMonth + 1) % 12;
            const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
            dateObj = new Date(nextYear, nextMonth, displayNum);
        } else {
            displayNum = dayOffset + 1;
            dateObj = new Date(viewYear, viewMonth, displayNum);
        }

        const classes = ["cell"];
        if (muted) classes.push("muted");
        if (isSameDate(dateObj, today)) classes.push("today");

        html += `
            <div class="${classes.join(" ")}" role="gridcell" aria-label="${dateObj.toDateString()}">
              <div class="day-number">${displayNum}</div>
            </div>
          `;
    }

    daysGrid.innerHTML = html;
    const first = new Date(viewYear, viewMonth, 1);
    const last = new Date(viewYear, viewMonth, dim);
    meta.textContent = `${first.toDateString()} to ${last.toDateString()}`;
}
function shiftMonth(delta) {
    const newMonthIndex = viewMonth + delta;
    viewYear = viewYear + Math.floor(newMonthIndex / 12);
    viewMonth = ((newMonthIndex % 12) + 12) % 12;
    renderCalendar();
}
prevBtn.addEventListener("click", () => shiftMonth(-1));
nextBtn.addEventListener("click", () => shiftMonth(1));
todayBtn.addEventListener("click", () => {
    const t = new Date();
    viewYear = t.getFullYear();
    viewMonth = t.getMonth();
    renderCalendar();
});
monthSelect.addEventListener("change", (e) => {
    viewMonth = Number(e.target.value);
    renderCalendar();
});
yearSelect.addEventListener("change", (e) => {
    viewYear = Number(e.target.value);
    renderCalendar();
});
renderCalendar();
