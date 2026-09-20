/** Runs before their 404 paints, and does nothing else. */
import { HIDE_STYLE_ID, IMPORT_PATH, NOT_FOUND } from "./importRoute";

/**
 * Hides their 404 body before it is painted.
 *
 * At `document_start` there is no body to replace anything in yet, so a
 * stylesheet on the root element is the only thing that beats the first
 * paint. The import page removes both the rule and the markup once it
 * has something of its own to show, and puts them back if it cannot.
 */
if (location.pathname === IMPORT_PATH) {
    const style = document.createElement("style");
    style.id = HIDE_STYLE_ID;
    style.textContent = `${NOT_FOUND}{display:none!important}`;
    document.documentElement.append(style);
}
