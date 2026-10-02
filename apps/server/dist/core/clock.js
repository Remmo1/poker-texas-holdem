export const CLOCK = Symbol('CLOCK');
export const systemClock = {
    now: () => Date.now(),
    setTimeout(fn, ms) {
        return { id: setTimeout(fn, ms) };
    },
    clearTimeout(handle) {
        clearTimeout(handle.id);
    },
};
//# sourceMappingURL=clock.js.map