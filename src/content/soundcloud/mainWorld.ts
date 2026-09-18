/** Page world: an isolated world sees a different `navigator`. */
import { cleanSoundcloudUrlsInText } from "@/utilities/soundcloudUrl";

const CHANNEL = "genius-plus:soundcloud-clean";

/** Inactive until the isolated world publishes the stored setting. */
let enabled = false;

addEventListener("message", (event) => {
    if (event.source !== window || typeof event.data !== "object") {
        return;
    }

    const data = event.data as {
        channel?: unknown;
        enabled?: unknown;
    } | null;

    if (data === null || data.channel !== CHANNEL) {
        return;
    }

    enabled = data.enabled === true;
});

const { clipboard } = navigator;

if (clipboard !== undefined) {
    const write = clipboard.writeText.bind(clipboard);

    clipboard.writeText = async (text: string): Promise<void> =>
        write(enabled ? cleanSoundcloudUrlsInText(text) : text);
}
