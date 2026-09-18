import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { type GlassOptions, GlassSurface } from "@/components/GlassSurface";
import { usePressGlass } from "@/components/usePressGlass";
import { type SpringChannel, useSpring } from "@/components/useSpring";
import {
    resolveArtwork,
    sanitizeFilename,
    saveBlob,
} from "@/utilities/artwork";
import { describeError } from "@/utilities/result";
import type { Store } from "@/utilities/store";
import type { HoverTarget } from "./hover";

type Status =
    | { readonly kind: "idle" }
    | { readonly kind: "working" }
    | { readonly kind: "done"; readonly note: string }
    | { readonly kind: "error"; readonly note: string };

/** Artwork smaller than this is a list thumbnail, not something to grab. */
const MIN_SIZE = 56;

const RESULT_LINGER_MS = 2600;

/** The glass is generated per geometry, so the lozenge is a fixed size. */
const BUTTON_HEIGHT = 28;

/** The switch's thumb optics, with both lengths scaled to this lozenge. */
const GLASS: GlassOptions = {
    bezel: 7,
    blur: 0.2,
    highlightAngle: 60,
    highlightOpacity: 0.5,
    highlightWidth: 2,
    profile: "lip",
    refractiveIndex: 1.5,
    resolution: 2,
    saturation: 6,
    thickness: 14,
};

/**
 * Refraction at rest and at the bottom of a press.
 *
 * Both are well above the switch's, because nothing is hiding this panel:
 * the thumb is opaque white until it is touched, and this is glass the
 * whole time.
 */
const REST_STRENGTH = 0.3;
const PRESSED_STRENGTH = 0.55;

/** How far a press compresses the lozenge. */
const PRESS_SCALE = 0.88;

/**
 * Ratio 0.22, so a release overshoots by half and rings on the way down.
 *
 * Measured against the integrator: a 90 ms press compresses to 0.82, the
 * release peaks at 1.09, and it swings past rest every 200 ms or so as
 * the ring fades. The same channel carries the refraction, which deepens
 * as the panel compresses and thins again on every overshoot.
 */
const BOUNCE: SpringChannel = {
    damping: 14,
    rest: 1e-4,
    restVelocity: 1e-3,
    stiffness: 1000,
};

/** A state's colour, as glass rather than paint. */
interface Tone {
    /** Multiplied into the refracted backdrop, for the cast. */
    readonly tint: string;
    /** Screened back over it, so a dark cover still reads as brand. */
    readonly lift: string;
    /** Painted over the refraction, and what carries the brand colour. */
    readonly body: string;
    /** Wide enough for this state's label and no wider. */
    readonly width: number;
}

const TONE: Record<Status["kind"], Tone> = {
    done: {
        body: "rgba(125, 255, 176, 0.8)",
        lift: "#5fd98f",
        tint: "#7dffb0",
        width: 60,
    },
    error: {
        body: "rgba(255, 158, 158, 0.8)",
        lift: "#e87a7a",
        tint: "#ff9e9e",
        width: 60,
    },
    idle: {
        body: "rgba(255, 255, 100, 0.8)",
        lift: "#dcdc3c",
        tint: "#ffff64",
        width: 60,
    },
    working: {
        body: "rgba(255, 255, 100, 0.8)",
        lift: "#dcdc3c",
        tint: "#ffff64",
        width: 82,
    },
};

const mix = (from: number, to: number, amount: number): number =>
    from + (to - from) * amount;

const DownloadIcon = () => (
    <svg
        aria-hidden="true"
        className="size-3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.25"
        viewBox="0 0 24 24"
    >
        <path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5" />
        <path d="M4 17.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5" />
    </svg>
);

const Spinner = () => (
    <span
        aria-hidden="true"
        className="size-3 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
);

/** The overlay reads its target from a store, not from props. */
export interface ArtworkOverlayProps {
    readonly store: Store<HoverTarget | null>;
}

/**
 * The download button, pinned to the corner of the hovered artwork.
 * @returns Nothing while no artwork is hovered, or it is too small.
 */
export const ArtworkOverlay = ({ store }: ArtworkOverlayProps) => {
    const hovered = useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        () => null,
    );
    /** Keeps the button on screen while a download is in flight. */
    const [held, setHeld] = useState<HoverTarget | null>(null);
    const [status, setStatus] = useState<Status>({ kind: "idle" });
    // No tail on the press: the bounce is the feedback, and holding the
    // compression past the release would read as lag.
    const press = usePressGlass(0);

    const target = hovered ?? held;
    const element = target?.element ?? null;
    const working = status.kind === "working";

    // A disabled button stops sending pointer events, so a press that
    // starts the download would otherwise never be released.
    const bounce = useSpring(!working && press.pressed ? 1 : 0, BOUNCE);

    // Adjusted during render: no wasted paint of the previous result.
    const [lastElement, setLastElement] = useState(element);

    if (element !== lastElement) {
        setLastElement(element);
        setStatus({ kind: "idle" });
    }

    const download = useCallback(async () => {
        if (target === null) {
            return;
        }

        setHeld(target);
        setStatus({ kind: "working" });

        const artwork = await resolveArtwork(target.candidates);
        const hoveredNow = store.getSnapshot();

        // Another artwork owns the overlay now, so this note is not its own.
        if (hoveredNow !== null && hoveredNow.element !== target.element) {
            setHeld(null);
            return;
        }

        if (artwork.isErr()) {
            setStatus({
                kind: "error",
                note: describeError(artwork.error),
            });
            return;
        }

        saveBlob(artwork.value.blob, `${sanitizeFilename(target.name)}.png`);

        setStatus({
            kind: "done",
            note: `${artwork.value.width}x${artwork.value.height} PNG saved`,
        });
    }, [store.getSnapshot, target]);

    useEffect(() => {
        if (status.kind !== "done" && status.kind !== "error") {
            return;
        }

        const timer = setTimeout(() => {
            setHeld(null);
            setStatus({ kind: "idle" });
        }, RESULT_LINGER_MS);

        return () => clearTimeout(timer);
    }, [status]);

    if (target === null || element === null) {
        return null;
    }

    const { rect } = target;

    if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) {
        return null;
    }

    const note =
        status.kind === "done" || status.kind === "error" ? status.note : null;
    const tone = TONE[status.kind];

    return (
        <div
            className="pointer-events-none fixed flex -translate-x-full -translate-y-full flex-col items-end gap-1.5"
            style={{ left: rect.right - 10, top: rect.bottom - 10 }}
        >
            {note !== null && (
                <span className="max-w-64 rounded-md bg-black/90 px-2 py-1 text-right text-[11px] leading-snug font-medium text-white">
                    {note}
                </span>
            )}
            {/* No `disabled:opacity`: an ancestor below full opacity is a
                backdrop root, and would cut the glass off from the cover
                it is sitting on. The spinner says it is busy instead. */}
            <button
                className="pointer-events-auto relative cursor-pointer rounded-full outline-offset-2 select-none focus-visible:outline-2 focus-visible:outline-genius disabled:cursor-progress"
                disabled={working}
                onClick={() => {
                    void download();
                }}
                style={{ height: BUTTON_HEIGHT, width: tone.width }}
                title={`Download "${target.name}" as a full quality PNG`}
                type="button"
                {...press.handlers}
            >
                <GlassSurface
                    className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-full text-[11px] font-semibold tracking-wide text-genius-ink"
                    glass={{ ...GLASS, lift: tone.lift, tint: tone.tint }}
                    height={BUTTON_HEIGHT}
                    radius={BUTTON_HEIGHT / 2}
                    strength={mix(REST_STRENGTH, PRESSED_STRENGTH, bounce)}
                    style={{
                        background: tone.body,
                        transform: `scale(${mix(1, PRESS_SCALE, bounce).toFixed(
                            4,
                        )})`,
                    }}
                    width={tone.width}
                >
                    {working ? <Spinner /> : <DownloadIcon />}
                    <span>{working ? "Fetching" : "PNG"}</span>
                </GlassSurface>
            </button>
        </div>
    );
};
