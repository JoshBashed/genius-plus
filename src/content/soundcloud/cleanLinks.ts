import { observeSubtree } from "@/utilities/dom";
import {
    readSettings,
    type Settings,
    watchSettings,
} from "@/utilities/settings";
import {
    cleanSoundcloudUrl,
    cleanSoundcloudUrlsInText,
    isCleanableSoundcloudUrl,
    needsCleaning,
} from "@/utilities/soundcloudUrl";

/** Channel the main world half listens on. Keep both sides in sync. */
export const CLEAN_LINKS_CHANNEL = "genius-plus:soundcloud-clean";

/** The share sheet renders the link into a plain text field. */
const LINK_FIELDS = [
    "input[type='text']",
    "input[type='url']",
    "input:not([type])",
    "textarea",
].join(",");

/** Only the share sheet, so no framework-controlled input is fought. */
const SHARE_SHEET = "[class*='shareDialog'],[class*='sharePanel']";

/** The selection API reports nothing for text inside a form field. */
const selectedText = (): string | null => {
    const active = document.activeElement;

    if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement
    ) {
        const { selectionEnd, selectionStart, value } = active;

        if (
            selectionStart !== null &&
            selectionEnd !== null &&
            selectionEnd > selectionStart
        ) {
            return value.slice(selectionStart, selectionEnd);
        }
    }

    const selection = getSelection()?.toString() ?? "";
    return selection === "" ? null : selection;
};

/** Cleans the share sheet's link so it matches what you copy. */
const cleanLinkFields = (): void => {
    for (const sheet of document.querySelectorAll(SHARE_SHEET)) {
        const fields = sheet.querySelectorAll<
            HTMLInputElement | HTMLTextAreaElement
        >(LINK_FIELDS);

        for (const field of fields) {
            if (!isCleanableSoundcloudUrl(field.value)) {
                continue;
            }

            const cleaned = cleanSoundcloudUrl(field.value);

            if (cleaned !== field.value) {
                field.value = cleaned;
            }
        }
    }
};

/**
 * Cleans copied links, the share field, and optionally the address bar.
 * @returns A function that removes every listener it added.
 */
export const startCleanLinks = (): (() => void) => {
    let settings: Settings | null = null;

    const onCopy = (event: ClipboardEvent): void => {
        if (settings?.cleanSoundcloudLinks !== true) {
            return;
        }

        const text = selectedText();

        if (text === null || !needsCleaning(text)) {
            return;
        }

        event.clipboardData?.setData(
            "text/plain",
            cleanSoundcloudUrlsInText(text),
        );
        event.preventDefault();
    };

    const cleanAddressBar = (): void => {
        if (settings?.cleanAddressBar !== true) {
            return;
        }

        const cleaned = cleanSoundcloudUrl(location.href);

        if (cleaned !== location.href) {
            history.replaceState(history.state, "", cleaned);
        }
    };

    /** The two settings are independent, exactly as the popup shows them. */
    const onMutation = (): void => {
        if (settings?.cleanSoundcloudLinks === true) {
            cleanLinkFields();
        }

        cleanAddressBar();
    };

    /** The main world half cannot read storage, so it is told instead. */
    const publish = (): void => {
        postMessage(
            {
                channel: CLEAN_LINKS_CHANNEL,
                enabled: settings?.cleanSoundcloudLinks === true,
            },
            location.origin,
        );
    };

    const adopt = (next: Settings): void => {
        settings = next;
        publish();
        onMutation();
    };

    void readSettings().then(adopt);
    const unwatch = watchSettings(adopt);

    document.addEventListener("copy", onCopy, { capture: true });
    const unobserve = observeSubtree(onMutation);

    return () => {
        unwatch();
        unobserve();
        document.removeEventListener("copy", onCopy, { capture: true });
    };
};
