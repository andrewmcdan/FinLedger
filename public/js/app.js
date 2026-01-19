const routes = {
    dashboard: { title: "Dashboard", page: "dashboard", module: "dashboard" },
    transactions: { title: "Transactions", page: "transactions", module: "transactions" },
    reports: { title: "Reports", page: "reports", module: "reports" },
    login: { title: "Login", page: "login", module: "login" },
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
    const response = await fetch(`pages/${pageName}.html`);
    if (!response.ok) {
        throw new Error(`Unable to load ${pageName}`);
    }
    return response.text();
}

async function loadModule(moduleName) {
    if (!moduleName) {
        return;
    }

    try {
        const module = await import(`./pages/${moduleName}.js`);
        if (typeof module.default === "function") {
            module.default();
        }
    } catch (error) {
        console.error(`Failed to load module ${moduleName}`, error);
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
    const pageName = route ? route.page : "not-found";

    try {
        const markup = await fetchPageMarkup(pageName);
        view.innerHTML = markup;
    } catch (error) {
        try {
            const markup = await fetchPageMarkup("not-found");
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
