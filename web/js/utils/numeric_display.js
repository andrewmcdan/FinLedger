export function formatNumberAsCurrency(value) {
    const number = parseFloat(value);
    if (isNaN(number)) {
        return value;
    }
    return number.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export function formatNumberWithCommas(value) {
    const number = parseFloat(value);
    if (isNaN(number)) {
        return value;
    }
    return number.toLocaleString();
}
