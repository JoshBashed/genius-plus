const PREFIX = "%c genius+ ";
const STYLE = "background:#ffff64;color:#000;border-radius:3px;";

/** Console output behind the extension's own badge. */
export const log = {
    debug: (...args: readonly unknown[]): void => {
        console.debug(PREFIX, STYLE, ...args);
    },
    info: (...args: readonly unknown[]): void => {
        console.info(PREFIX, STYLE, ...args);
    },
    warn: (...args: readonly unknown[]): void => {
        console.warn(PREFIX, STYLE, ...args);
    },
    error: (...args: readonly unknown[]): void => {
        console.error(PREFIX, STYLE, ...args);
    },
};
