import { ArtworkOverlay } from "@/content/shared/ArtworkOverlay";
import { type ArtworkSite, createArtworkHover } from "@/content/shared/hover";
import { mountOverlay } from "@/content/shared/mount";
import tailwind from "@/styles/tailwind.css";
import { readSettings, watchSettings } from "@/utilities/settings";

/**
 * Wires hover tracking to the download button, tracking the setting.
 * @returns A function that stops watching and unmounts the overlay.
 */
export const startArtworkDownloads = (site: ArtworkSite): (() => void) => {
    let teardown: (() => void) | null = null;

    const enable = (): void => {
        if (teardown !== null) {
            return;
        }

        const hover = createArtworkHover(site);
        const unmount = mountOverlay(
            `genius-plus-artwork-${site.id}`,
            tailwind,
            <ArtworkOverlay store={hover.store} />,
        );

        teardown = () => {
            hover.stop();
            unmount();
        };
    };

    const disable = (): void => {
        teardown?.();
        teardown = null;
    };

    const apply = (enabled: boolean): void => {
        if (enabled) {
            enable();
        } else {
            disable();
        }
    };

    let stopped = false;

    void readSettings().then((settings) => {
        // The caller may have torn this down before storage answered.
        if (!stopped) {
            apply(settings.artworkDownloads);
        }
    });

    const unwatch = watchSettings((settings) => {
        apply(settings.artworkDownloads);
    });

    return () => {
        stopped = true;
        unwatch();
        disable();
    };
};
