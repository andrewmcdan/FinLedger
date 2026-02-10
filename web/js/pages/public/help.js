export default function initHelp() {
    const stamp = document.querySelector("[data-last-updated]");
    if (stamp) {
        stamp.textContent = new Date().toLocaleString();
    }

    const triggers = Array.from(document.querySelectorAll("[data-accordion-trigger]"));
    const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const panelFinishTimers = new WeakMap();

    const getTransitionDurationMs = (element) => {
        const styles = window.getComputedStyle(element);
        const properties = styles.transitionProperty.split(",").map((value) => value.trim());
        const durations = styles.transitionDuration.split(",").map((value) => value.trim());
        const delays = styles.transitionDelay.split(",").map((value) => value.trim());
        const parseTime = (value) => {
            if (value.endsWith("ms")) {
                return Number.parseFloat(value);
            }
            if (value.endsWith("s")) {
                return Number.parseFloat(value) * 1000;
            }
            return Number.parseFloat(value) || 0;
        };
        let max = 0;
        properties.forEach((property, index) => {
            if (property !== "height" && property !== "all") {
                return;
            }
            const duration = parseTime(durations[index % durations.length]);
            const delay = parseTime(delays[index % delays.length]);
            max = Math.max(max, duration + delay);
        });
        return max;
    };

    const syncOpenAncestorPanels = (panel) => {
        let ancestor = panel?.parentElement?.closest(".accordion-panel");
        while (ancestor) {
            if (!ancestor.hidden && ancestor.getAttribute("data-accordion-animating") !== "true") {
                ancestor.style.height = "auto";
            }
            ancestor = ancestor.parentElement?.closest(".accordion-panel");
        }
    };

    const setFinishTimer = (panel, duration, finish) => {
        const existing = panelFinishTimers.get(panel);
        if (existing) {
            clearTimeout(existing);
        }
        const timeoutId = setTimeout(() => {
            panelFinishTimers.delete(panel);
            finish();
        }, duration);
        panelFinishTimers.set(panel, timeoutId);
        return timeoutId;
    };

    const openPanel = (panel) => {
        if (!panel) {
            return;
        }
        if (prefersReducedMotion) {
            panel.hidden = false;
            panel.classList.add("is-open");
            panel.style.height = "auto";
            return;
        }
        panel.hidden = false;
        panel.classList.add("is-open");
        panel.setAttribute("data-accordion-animating", "true");
        panel.style.height = "0px";
        panel.style.opacity = "0";
        panel.style.transform = "translateY(-4px)";
        requestAnimationFrame(() => {
            const targetHeight = panel.scrollHeight;
            panel.style.height = `${targetHeight}px`;
            panel.style.opacity = "1";
            panel.style.transform = "translateY(0)";
        });
        const finishOpen = () => {
            panel.style.height = "auto";
            panel.removeAttribute("data-accordion-animating");
            syncOpenAncestorPanels(panel);
        };
        const fallbackDuration = Math.max(50, getTransitionDurationMs(panel));
        const fallbackTimerId = setFinishTimer(panel, fallbackDuration, finishOpen);
        panel.addEventListener(
            "transitionend",
            (event) => {
                if (event.propertyName !== "height") {
                    return;
                }
                clearTimeout(fallbackTimerId);
                panel.style.height = "auto";
                panel.removeAttribute("data-accordion-animating");
                syncOpenAncestorPanels(panel);
            },
            { once: true },
        );
    };

    const closePanel = (panel) => {
        if (!panel) {
            return;
        }
        if (prefersReducedMotion) {
            panel.hidden = true;
            panel.classList.remove("is-open");
            panel.style.height = "";
            return;
        }
        panel.setAttribute("data-accordion-animating", "true");
        panel.style.height = `${panel.scrollHeight}px`;
        panel.style.opacity = "1";
        panel.style.transform = "translateY(0)";
        requestAnimationFrame(() => {
            panel.style.height = "0px";
            panel.style.opacity = "0";
            panel.style.transform = "translateY(-4px)";
        });
        const finishClose = () => {
            panel.hidden = true;
            panel.classList.remove("is-open");
            panel.style.height = "";
            panel.removeAttribute("data-accordion-animating");
            syncOpenAncestorPanels(panel);
        };
        const fallbackDuration = Math.max(50, getTransitionDurationMs(panel));
        const fallbackTimerId = setFinishTimer(panel, fallbackDuration, finishClose);
        panel.addEventListener(
            "transitionend",
            (event) => {
                if (event.propertyName !== "height") {
                    return;
                }
                clearTimeout(fallbackTimerId);
                panel.hidden = true;
                panel.classList.remove("is-open");
                panel.style.height = "";
                panel.removeAttribute("data-accordion-animating");
                syncOpenAncestorPanels(panel);
            },
            { once: true },
        );
    };

    const toggleAccordion = (trigger) => {
        const panelId = trigger.getAttribute("aria-controls");
        const panel = panelId ? document.getElementById(panelId) : null;
        const isExpanded = trigger.getAttribute("aria-expanded") === "true";
        const nextState = !isExpanded;
        trigger.setAttribute("aria-expanded", String(nextState));
        if (panel) {
            if (nextState) {
                openPanel(panel);
            } else {
                closePanel(panel);
            }
        }
        const wrapper = trigger.closest("[data-accordion]");
        if (wrapper) {
            wrapper.classList.toggle("is-open", nextState);
        }
    };

    triggers.forEach((trigger) => {
        trigger.addEventListener("click", () => {
            toggleAccordion(trigger);
        });
        trigger.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleAccordion(trigger);
            }
        });
    });
}
