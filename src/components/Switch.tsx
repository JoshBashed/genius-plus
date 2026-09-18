import type { PointerEvent } from "react";
import { useRef, useState } from "react";
import { type GlassOptions, GlassSurface } from "./GlassSurface";
import { usePressGlass } from "./usePressGlass";
import { useSwitchMotion } from "./useSwitchMotion";

/** The measured reference control, in its own pixels. */
const REFERENCE = {
    bezel: 24,
    inset: 3.6,
    thickness: 47,
    thumbHeight: 92,
    thumbWidth: 146,
    trackHeight: 67,
    trackWidth: 160,
} as const;

/** Our track height. Every other length scales uniformly from it. */
const TRACK_HEIGHT = 28;

const SCALE = TRACK_HEIGHT / REFERENCE.trackHeight;

const TRACK_WIDTH = REFERENCE.trackWidth * SCALE;
const THUMB_WIDTH = REFERENCE.thumbWidth * SCALE;
const THUMB_HEIGHT = REFERENCE.thumbHeight * SCALE;
const INSET = REFERENCE.inset * SCALE;

/** The thumb rests at 0.65 and swells past the track to 0.9 when held. */
const REST_SCALE = 0.65;
const PRESS_SCALE = 0.9;

/** Falls out of the geometry, and is what keeps the inset symmetric. */
const TRAVEL =
    TRACK_WIDTH - TRACK_HEIGHT - (THUMB_WIDTH - THUMB_HEIGHT) * REST_SCALE;

const THUMB_LEFT = INSET - (THUMB_WIDTH * (1 - REST_SCALE)) / 2;
const THUMB_TOP = (TRACK_HEIGHT - THUMB_HEIGHT) / 2;

const TRACK_OFF = "rgba(148,148,159,0.467)";
const TRACK_ON = "rgba(255,255,100,0.933)";

/** Opaque plastic until it is touched, then 10% white over the glass. */
const THUMB_ALPHA = 1;
const THUMB_PRESSED_ALPHA = 0.1;

/** Below this much pointer movement the gesture is still a click. */
const DRAG_THRESHOLD = 4;

/** The thumb creeps past either end at a twenty second of pointer speed. */
const RUBBER_BAND = 22;

/** Weight of the newest pointer sample in the running velocity. */
const VELOCITY_BLEND = 0.6;

/** A pointer that has not moved for this long, in seconds, is at rest. */
const VELOCITY_STALE = 0.08;

/**
 * Seconds of the release velocity that count toward where it lands.
 *
 * Chosen, not measured: the spring's own coast is a third of this, but a
 * flick is a statement of intent, so 250 px a second commits from a
 * standing start and a drift of a few pixels a second does not.
 */
const FLICK_PROJECTION = 0.05;

/** How long a click left over from a drag has to arrive, in ms. */
const CLICK_GRACE_MS = 250;

/** Scales a reference length, which the CSS scale then shrinks again. */
const scaled = (value: number): string => `${(value * SCALE).toFixed(3)}px`;

const DROP_SHADOW = `0 ${scaled(4)} ${scaled(22)} 0 rgba(0, 0, 0, 0.1)`;

/** Peak alpha of the two inset shadows the press fades in. */
const PRESSED_SHADOW_ALPHA = 0.09;

const mix = (from: number, to: number, amount: number): number =>
    from + (to - from) * amount;

/** Held, the lens also reads as having depth: dark down right, light up. */
const thumbShadow = (press: number): string => {
    const alpha = (PRESSED_SHADOW_ALPHA * press).toFixed(4);

    return [
        DROP_SHADOW,
        `inset ${scaled(2)} ${scaled(7)} ${scaled(24)} rgba(0, 0, 0, ${alpha})`,
        `inset ${scaled(-2)} ${scaled(-7)} ${scaled(24)} ` +
            `rgba(255, 255, 255, ${alpha})`,
    ].join(", ");
};

/**
 * Fraction of the computed peak displacement the filter delivers.
 *
 * The reference normalises its map by a hardcoded constant while taking
 * `scale` from the true peak, so it ships 11% of its own optics at rest
 * and 25% held. We normalise by the peak, for the full channel, and carry
 * those two fractions here so the delivered displacement still matches.
 */
const REST_STRENGTH = 0.11;
const PRESSED_STRENGTH = 0.25;

/** Appearance of the lens, which is the thumb. */
export interface SwitchGlass extends GlassOptions {
    /** Multiplies the displacement at rest and while held. */
    readonly strength: number;
    readonly pressedStrength: number;
}

/**
 * The reference's own values, with the two lengths scaled to our track.
 *
 * The specular thread is deliberately not scaled: it is an absolute 2 px
 * in the thumb's own space, which the 0.65 rest scale renders as the same
 * 1.3 px of screen the reference draws, and scaling it would put it under
 * a device pixel and lose the only edge definition the thumb has.
 */
const DEFAULT_GLASS: SwitchGlass = {
    bezel: REFERENCE.bezel * SCALE,
    blur: 0.2,
    highlightAngle: 60,
    highlightOpacity: 0.5,
    highlightWidth: 2,
    pressedStrength: PRESSED_STRENGTH,
    profile: "lip",
    refractiveIndex: 1.5,
    resolution: 2,
    saturation: 6,
    strength: REST_STRENGTH,
    thickness: REFERENCE.thickness * SCALE,
};

/** One press, from the pointer going down to wherever it ends up. */
interface Gesture {
    /** False until the pointer passes the threshold, a click until it. */
    dragging: boolean;
    lastTime: number;
    lastX: number;
    pointerId: number;
    /** Where the thumb sat when the press landed, as 0 or 1. */
    startRatio: number;
    startX: number;
    velocity: number;
}

/**
 * Thumb offset for a pointer at `x`, rubber banded past either end.
 *
 * The ratio is relative to where the thumb already was, so a press on the
 * far side of the track steers it rather than teleporting it.
 */
const positionFor = (gesture: Gesture, x: number): number => {
    const raw = gesture.startRatio + (x - gesture.startX) / TRAVEL;
    const clamped = Math.min(Math.max(raw, 0), 1);

    return (clamped + (raw - clamped) / RUBBER_BAND) * TRAVEL;
};

/**
 * Swallows the click a drag leaves behind, so nothing toggles twice.
 *
 * Only the next click on or around the control is taken, and only for a
 * moment, so a click that was never part of a drag still lands.
 */
const suppressClick = (root: HTMLElement): void => {
    let timer = 0;

    const swallow = (event: MouseEvent): void => {
        const target = event.target;

        if (
            target instanceof Node &&
            !root.contains(target) &&
            !target.contains(root)
        ) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        window.clearTimeout(timer);
        window.removeEventListener("click", swallow, true);
    };

    timer = window.setTimeout(() => {
        window.removeEventListener("click", swallow, true);
    }, CLICK_GRACE_MS);
    window.addEventListener("click", swallow, true);
};

export interface SwitchProps {
    readonly checked: boolean;
    /** Accessible name, unless an ancestor already provides one. */
    readonly label?: string;
    readonly onChange?: (checked: boolean) => void;
    /** Inert visuals for when an ancestor owns the switch role. */
    readonly presentational?: boolean;
    /** Press state from an ancestor that owns it, via `usePressGlass`. */
    readonly pressed?: boolean;
    readonly glass?: Partial<SwitchGlass>;
}

/**
 * A switch whose thumb is a lozenge of glass.
 *
 * The thumb carries the backdrop filter, so it refracts the coloured
 * track it slides along, and the track does not clip: held, the lens
 * swells past the groove at both ends and along both edges. At rest the
 * thumb is opaque white and the glass is all but invisible, which is the
 * point. Pressing drops it to a tenth and reveals the lens. A press
 * anywhere on the control, thumb included, reveals the glass and begins a
 * potential drag; past 4 px it steers the thumb, and under that it stays
 * a click for whichever element owns the switch role.
 */
export const Switch = ({
    checked,
    glass,
    label,
    onChange,
    presentational = false,
    pressed,
}: SwitchProps) => {
    const [dragged, setDragged] = useState<number | null>(null);
    const own = usePressGlass();
    const root = useRef<HTMLSpanElement>(null);
    const gesture = useRef<Gesture | null>(null);
    const dragging = dragged !== null;
    const held = dragging || (pressed ?? own.pressed);
    const options: SwitchGlass = { ...DEFAULT_GLASS, ...glass };
    const motion = useSwitchMotion({
        dragging,
        press: held ? 1 : 0,
        strength: held ? options.pressedStrength : options.strength,
        travel: dragged ?? (checked ? TRAVEL : 0),
    });

    // The colour leads the commitment: it flips as the thumb crosses.
    const lit = dragging ? dragged > TRAVEL / 2 : checked;

    const onPointerDown = (event: PointerEvent<HTMLSpanElement>): void => {
        if (event.button !== 0) {
            return;
        }

        event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current = {
            dragging: false,
            lastTime: event.timeStamp,
            lastX: event.clientX,
            pointerId: event.pointerId,
            startRatio: checked ? 1 : 0,
            startX: event.clientX,
            velocity: 0,
        };
    };

    const onPointerMove = (event: PointerEvent<HTMLSpanElement>): void => {
        const current = gesture.current;

        if (current === null || current.pointerId !== event.pointerId) {
            return;
        }

        if (
            !current.dragging &&
            Math.abs(event.clientX - current.startX) < DRAG_THRESHOLD
        ) {
            return;
        }

        current.dragging = true;

        const elapsed = (event.timeStamp - current.lastTime) / 1000;

        if (elapsed > 0) {
            const instant = (event.clientX - current.lastX) / elapsed;

            current.velocity =
                current.velocity * (1 - VELOCITY_BLEND) +
                instant * VELOCITY_BLEND;
            current.lastTime = event.timeStamp;
            current.lastX = event.clientX;
        }

        setDragged(positionFor(current, event.clientX));
    };

    const onPointerUp = (event: PointerEvent<HTMLSpanElement>): void => {
        const current = gesture.current;

        if (current === null || current.pointerId !== event.pointerId) {
            return;
        }

        gesture.current = null;

        // Under the threshold it stays a click, for whoever owns one.
        if (!current.dragging) {
            return;
        }

        const position = positionFor(current, event.clientX);
        const stale = (event.timeStamp - current.lastTime) / 1000;
        const velocity = stale > VELOCITY_STALE ? 0 : current.velocity;
        const next = position + velocity * FLICK_PROJECTION > TRAVEL / 2;

        motion.handOff(position, velocity);
        setDragged(null);

        if (root.current !== null) {
            suppressClick(root.current);
        }

        if (next !== checked) {
            onChange?.(next);
        }
    };

    /** The spring picks the thumb up from wherever the drag left it. */
    const onPointerLost = (): void => {
        gesture.current = null;
        setDragged(null);
    };

    const face = (
        <span
            aria-hidden={presentational ? "true" : undefined}
            className="relative block shrink-0 touch-none rounded-full transition-colors duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] select-none"
            onLostPointerCapture={onPointerLost}
            onPointerCancel={onPointerLost}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            ref={root}
            style={{
                background: lit ? TRACK_ON : TRACK_OFF,
                height: TRACK_HEIGHT,
                width: TRACK_WIDTH,
            }}
        >
            <span
                className="absolute"
                style={{
                    height: THUMB_HEIGHT,
                    left: THUMB_LEFT,
                    top: THUMB_TOP,
                    transform: `translateX(${motion.travel.toFixed(3)}px)`,
                    width: THUMB_WIDTH,
                }}
            >
                <GlassSurface
                    className="block size-full rounded-full"
                    glass={options}
                    height={THUMB_HEIGHT}
                    radius={THUMB_HEIGHT / 2}
                    strength={motion.strength}
                    style={{
                        background: `rgba(255, 255, 255, ${mix(
                            THUMB_ALPHA,
                            THUMB_PRESSED_ALPHA,
                            motion.press,
                        ).toFixed(4)})`,
                        boxShadow: thumbShadow(motion.press),
                        transform: `scale(${mix(
                            REST_SCALE,
                            PRESS_SCALE,
                            motion.press,
                        ).toFixed(4)})`,
                    }}
                    width={THUMB_WIDTH}
                />
            </span>
        </span>
    );

    if (presentational) {
        return face;
    }

    return (
        <button
            aria-checked={checked}
            aria-label={label}
            className="flex cursor-pointer rounded-full outline-offset-8 select-none focus-visible:outline-2 focus-visible:outline-genius"
            onClick={() => onChange?.(!checked)}
            role="switch"
            type="button"
            {...own.handlers}
        >
            {face}
        </button>
    );
};
