export const DEBUG = false;

export function debugLog(message) {
    if (DEBUG) console.log(`Find My Mouse: ${message}`);
}

export function parseColor(colorStr, defaultAlpha = 255) {
    if (!colorStr || colorStr === "") return [0, 0, 0, defaultAlpha];
    const hex = colorStr.replace("#", "");
    if (hex.length >= 6) {
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const a = hex.length >= 8 ? parseInt(hex.substring(6, 8), 16) : defaultAlpha;
        return [r, g, b, a];
    }
    return [0, 0, 0, defaultAlpha];
}
