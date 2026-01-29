export const appendOptions = (selectEl, options, selectedValue) => {
    const selected = String(selectedValue ?? "");
    options.forEach((option) => {
        const opt = document.createElement("option");
        opt.value = String(option.value);
        opt.textContent = option.label;
        if (opt.value === selected) {
            opt.selected = true;
        }
        selectEl.appendChild(opt);
    });
};

export const createSelect = (options, selectedValue, dataAttr) => {
    const select = document.createElement("select");
    if (dataAttr) {
        select.setAttribute(dataAttr, "");
    }
    appendOptions(select, options, selectedValue);
    return select;
};

export const createInput = (type, value, dataAttr) => {
    const input = document.createElement("input");
    input.type = type;
    if (dataAttr) {
        input.setAttribute(dataAttr, "");
    }
    if (value !== undefined && value !== null) {
        input.value = value;
    }
    return input;
};

export const createTextarea = (value, dataAttr, rows = 2) => {
    const textarea = document.createElement("textarea");
    textarea.rows = rows;
    if (dataAttr) {
        textarea.setAttribute(dataAttr, "");
    }
    if (value !== undefined && value !== null) {
        textarea.value = value;
    }
    return textarea;
};

export const createCell = ({ text = "", dataAttr, isCurrency = false, isLongText = false }) => {
    const cell = document.createElement("td");
    if (dataAttr) {
        cell.setAttribute(dataAttr, "");
    }
    if (isCurrency) {
        cell.setAttribute("data-is-currency", "");
    }
    if (isLongText) {
        cell.setAttribute("data-long-text", "");
    }
    cell.textContent = text ?? "";
    return cell;
};
