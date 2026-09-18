/** The `postMessage` channel between the two Genius content scripts. */

export const GENIUS_CHANNEL = "genius-plus:genius";

/** What the main half reports back, purely so it can be logged once. */
export type GeniusStatus =
    /** The main half is listening; resend the settings. */
    | "ready"
    /** Table mounted. */
    | "rendered"
    /** Table removed, because the switch went off or we navigated away. */
    | "removed"
    /** A Genius album page, but the legacy A/B variant of it. */
    | "legacy"
    /** Not an album page, so there is nothing for us to do. */
    | "skipped"
    /** Something we expected to be there was not. */
    | "failed";

interface Envelope {
    readonly channel: string;
    readonly direction: string;
}

const envelopeOf = (event: MessageEvent): Envelope | null => {
    // Same-window, same-origin only; Genius embeds chatty iframes.
    if (event.source !== window || typeof event.data !== "object") {
        return null;
    }

    const data = event.data as Partial<Envelope> | null;

    if (data === null || data.channel !== GENIUS_CHANNEL) {
        return null;
    }

    return typeof data.direction === "string"
        ? { channel: data.channel, direction: data.direction }
        : null;
};

/** Isolated → main: whether the feature is switched on. */
export const postEnabled = (enabled: boolean): void => {
    postMessage(
        { channel: GENIUS_CHANNEL, direction: "to-main", enabled },
        location.origin,
    );
};

export const readEnabled = (event: MessageEvent): boolean | null => {
    const envelope = envelopeOf(event);

    if (envelope === null || envelope.direction !== "to-main") {
        return null;
    }

    const { enabled } = event.data as { enabled?: unknown };
    return typeof enabled === "boolean" ? enabled : null;
};

export interface StatusReport {
    readonly status: GeniusStatus;
    readonly detail: string | null;
}

/** Main → isolated: one line of diagnostics. */
export const postStatus = (
    status: GeniusStatus,
    detail: string | null = null,
): void => {
    postMessage(
        { channel: GENIUS_CHANNEL, direction: "to-isolated", status, detail },
        location.origin,
    );
};

export const readStatus = (event: MessageEvent): StatusReport | null => {
    const envelope = envelopeOf(event);

    if (envelope === null || envelope.direction !== "to-isolated") {
        return null;
    }

    const { status, detail } = event.data as {
        status?: unknown;
        detail?: unknown;
    };

    if (typeof status !== "string") {
        return null;
    }

    return {
        status: status as GeniusStatus,
        detail: typeof detail === "string" ? detail : null,
    };
};
