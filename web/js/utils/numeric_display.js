export function formatNumberAsCurrency(value) {
    let number;
    if(typeof value === "string") {
        number = parseFloat(value.replace(/[^0-9.-]/g, ""));
    } else {
        number = parseFloat(value);
    }
    if (isNaN(number)) {
        console.warn(`Value "${value}" is not a valid number for currency formatting.`);
        return value;
    }
    return number.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export function formatNumberWithCommas(value) {
    const number = parseFloat(value.replace(/[^0-9.-]/g, ""));
    if (isNaN(number)) {
        return value;
    }
    return number.toLocaleString();
}
