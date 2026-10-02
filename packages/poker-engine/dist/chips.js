export const minChips = (a, b) => (a < b ? a : b);
export const maxChips = (a, b) => (a > b ? a : b);
export const sumChips = (values) => {
    let total = 0n;
    for (const v of values)
        total += v;
    return total;
};
export const compareChips = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
//# sourceMappingURL=chips.js.map