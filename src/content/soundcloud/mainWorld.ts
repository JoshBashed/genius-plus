/** Page world: an isolated world sees a different `navigator`. */
import { cleanSoundcloudUrlsInText } from "@/utilities/soundcloudUrl";

const CHANNEL = "genius-plus:soundcloud-clean";

/** Inactive until the isolated world publishes the stored setting. */
let enabled = false;

addEventListener("message", (event) => {
    // Same window only; nothing else may switch this on. Narrowed by
    // hand, so this page script does not carry a schema library.
    const data: unknown = event.source === window ? event.data : null;

    if (
        typeof data === "object" &&
        data !== null &&
        "channel" in data &&
        data.channel === CHANNEL &&
        "enabled" in data &&
        typeof data.enabled === "boolean"
    ) {
        enabled = data.enabled;
    }
});

const { clipboard } = navigator;

if (clipboard !== undefined) {
    const write = clipboard.writeText.bind(clipboard);

    clipboard.writeText = async (text: string): Promise<void> =>
        write(enabled ? cleanSoundcloudUrlsInText(text) : text);
}
