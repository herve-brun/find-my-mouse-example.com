export const LogLevel = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

export let currentLogLevel = LogLevel.INFO;

export function setLogLevel(level) {
    currentLogLevel = level;
}

export function debugLog(message, level = LogLevel.DEBUG) {
    if (level <= currentLogLevel) {
        const levelPrefix = {
            [LogLevel.ERROR]: "ERROR",
            [LogLevel.WARN]: "WARN",
            [LogLevel.INFO]: "INFO",
            [LogLevel.DEBUG]: "DEBUG"
        }[level] || "LOG";
        console.log(`Find My Mouse [${levelPrefix}]: ${message}`);
    }
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
