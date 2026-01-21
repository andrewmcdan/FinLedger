const routes = {
    dashboard: { title: "Dashboard", page: "pages/dashboard", module: "pages/dashboard" },
    transactions: { title: "Transactions", page: "pages/transactions", module: "pages/transactions" },
    reports: { title: "Reports", page: "pages/reports", module: "pages/reports" },
    login: { title: "Login", page: "pages/public/login", module: "pages/public/login" },
    help: { title: "Help", page: "pages/public/help", module: "pages/public/help" },
    logout: { title: "Logout", page: "pages/public/logout", module: "pages/public/logout" },
    not_logged_in: { title: "Not Logged In", page: "pages/public/not_logged_in", module: null },
    not_found: { title: "Page Not Found", page: "pages/public/not_found", module: null },
    not_authorized: { title: "Not Authorized", page: "pages/public/not_authorized", module: null }
};

const DEFAULT_ROUTE = "dashboard";
const view = document.getElementById("app");
const navLinks = Array.from(document.querySelectorAll(".app-nav [data-route]"));

function getRouteFromHash() {
    const hash = window.location.hash.replace(/^#\/?/, "");
    const routeKey = hash.split("?")[0].split("/")[0];
    return routeKey || DEFAULT_ROUTE;
}

function setActiveNav(routeKey) {
    navLinks.forEach((link) => {
        const isActive = link.dataset.route === routeKey;
        link.classList.toggle("is-active", isActive);
        if (isActive) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });
}

async function fetchPageMarkup(pageName) {
    const response = await fetch(`${pageName}.html`);
    if (response.ok) return response.text();
    console.log("Fetch page markup failed:", response.status);
    if (response.status === 401) { // Unauthorized
        // if the returned content is {"error": "Missing Authorization header"}, then redirect to not_logged_in.html
        let resJson = await response.clone().json();
        if (resJson.error == "Missing Authorization header" || resJson.error == "Invalid Authorization header" || resJson.error == "Missing User_ID header" || resJson.error == "Invalid or expired token") {
            window.location.hash = "#/not_logged_in";
            return;
        }if(resJson.error === "Role not permitted") {
            window.location.hash = "#/not_authorized";
            return;
        }
        console.log("Unauthorized access, redirecting to login");
        window.location.hash = "#/login";
        return;
    }
    throw new Error(`Unable to load ${pageName}`);
}

async function loadModule(moduleName) {
    if (!moduleName) {
        return;
    }

    try {
        const module = await import(`./${moduleName}.js`);
        if (typeof module.default === "function") {
            module.default();
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
    view.classList.add("page-enter");
}

async function renderRoute() {
    if (!view) {
        return;
    }

    const routeKey = getRouteFromHash();
    const route = routes[routeKey];
    const pageName = route ? route.page : routes.not_found.page;

    try {
        const markup = await fetchPageMarkup(pageName);
        view.innerHTML = markup;
    } catch (error) {
        try {
            const markup = await fetchPageMarkup("pages/public/not_found");
            view.innerHTML = markup;
        } catch (fallbackError) {
            view.innerHTML = '<section class="page"><h1>Page not found</h1></section>';
        }
    }

    document.title = route ? `FinLedger - ${route.title}` : "FinLedger";
    setActiveNav(route ? routeKey : null);
    await loadModule(route ? route.module : null);
    animateView();
}

window.addEventListener("hashchange", renderRoute);
window.addEventListener("DOMContentLoaded", renderRoute);

import { updateLoginLogoutButton } from "./utils/login_logout_button.js";

window.addEventListener("DOMContentLoaded", updateLoginLogoutButton);
window.addEventListener("hashchange", updateLoginLogoutButton);
