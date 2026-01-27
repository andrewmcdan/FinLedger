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
let profileMenuInitialized = false;
let userIconBlobUrl = null;

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

function fetchWithAuth(url, options = {}) {
    const authToken = localStorage.getItem("auth_token") || "";
    const userId = localStorage.getItem("user_id") || "";
    const mergedHeaders = {
        Authorization: `Bearer ${authToken}`,
        "X-User-Id": `${userId}`,
        ...(options.headers || {}),
    };

    return fetch(url, {
        ...options,
        credentials: options.credentials || "include",
        headers: mergedHeaders,
    });
}

async function fetchPageMarkup(pageName) {
    const response = await fetchWithAuth(`${pageName}.html`);
    if (response.ok) return response.text();
    console.log("Fetch page markup failed:", response.status);
    if (response.status === 401) {
        // Unauthorized
        // if the returned content is {"error": "Missing Authorization header"}, then redirect to not_logged_in.html
        let resJson = await response.clone().json();
        if (resJson.error == "Missing Authorization header" || resJson.error == "Invalid Authorization header" || resJson.error == "Missing X-User-Id header" || resJson.error == "Invalid or expired token") {
            window.location.hash = "#/not_logged_in";
            return;
        }
        if (resJson.error === "Role not permitted") {
            window.location.hash = "#/not_authorized";
            return;
        }
        if(resJson?.error === "NOT_LOGGED_IN") {
            window.location.hash = "#/not_logged_in";
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
        if (resJson?.error === "TEMP_PASSWORD_CHANGE_REQUIRED") {
            window.location.hash = "#/force_password_change";
            return;
        }
        if (resJson?.error === "Role not permitted") {
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
                if (resJson?.error === "TEMP_PASSWORD_REQUIRED") {
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
            module.default({showLoadingOverlay, hideLoadingOverlay, userIconBlobUrl});
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
        if (profileNameSpan && !profileMenuInitialized) {
            const username = localStorage.getItem("username") || "None";
            profileNameSpan.textContent = "Profile: " + username;
            if(username == "None") {
                // disable the profile hover activation
                const menuWrapper = document.querySelector("[data-profile-menu]");
                if (menuWrapper) {
                    menuWrapper.style.pointerEvents = "none";
                }
            }else{
                const menuWrapper = document.querySelector("[data-profile-menu]");
                if (menuWrapper) {
                    menuWrapper.style.pointerEvents = "auto";
                }
            }
        }

        const userIconTargets = Array.from(document.querySelectorAll("[data-user-icon], [data-user-icon-menu]"));
        if (userIconTargets.length > 0 && !profileMenuInitialized) {
            // Use fetch with auth headers to get the user icon
            fetchWithAuth("/images/user-icon.png")
                .then((response) => {
                    if (response.ok) {
                        return response.blob();
                    }
                    // if the response if 401 Unauthorized use the default icon at /public_images/user-icon.png
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
                    const objectURL = URL.createObjectURL(blob);
                    userIconBlobUrl = objectURL;
                    userIconTargets.forEach((img) => {
                        img.src = objectURL;
                    });
                })
                .catch((error) => {
                    console.error("Error loading user icon:", error);
                });
        }
        profileMenuInitialized = true;

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
window.addEventListener("DOMContentLoaded", renderRoute);
window.addEventListener("DOMContentLoaded", setupProfileMenu);

import { updateLoginLogoutButton } from "./utils/login_logout_button.js";

window.addEventListener("DOMContentLoaded", updateLoginLogoutButton);
window.addEventListener("hashchange", updateLoginLogoutButton);


