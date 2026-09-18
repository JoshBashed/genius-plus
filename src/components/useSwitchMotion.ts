import { useCallback, useEffect, useRef, useState } from "react";
import {
    advance,
    MAX_FRAME,
    type SpringChannel,
    SUBSTEP,
    settled,
} from "./useSpring";

/**
 * Damping ratio 1.265, overdamped, so the thumb arrives without a bounce.
 *
 * Its thresholds are in pixels rather than the other two channels' 0 to 1,
 * and a hundredth of a pixel is already well under a device pixel.
 */
const TRAVEL_SPRING: SpringChannel = {
    damping: 80,
    rest: 0.01,
    restVelocity: 0.1,
    stiffness: 1000,
};

/** Ratio 0.894: a 0.2% overshoot nobody can see, in about 120 ms. */
const PRESS_SPRING: SpringChannel = {
    damping: 80,
    rest: 1e-4,
    restVelocity: 1e-3,
    stiffness: 2000,
};

/** Ratio 0.5, so the refraction overshoots by 16% and eases back. */
const STRENGTH_SPRING: SpringChannel = {
    damping: 10,
    rest: 1e-4,
    restVelocity: 1e-3,
    stiffness: 100,
};

/** Where each animated quantity is being asked to go. */
export interface SwitchTargets {
    /** True while a pointer steers `travel` directly, suspending it. */
    readonly dragging: boolean;
    /** 0 released, 1 held. */
    readonly press: number;
    readonly strength: number;
    /** Thumb offset in px, or the pointer's own while `dragging`. */
    readonly travel: number;
}

export interface SwitchMotion {
    readonly press: number;
    readonly strength: number;
    readonly travel: number;
    /** Resumes travel from a released drag, at the pointer's velocity. */
    readonly handOff: (position: number, velocity: number) => void;
}

/**
 * Integrates every animated quantity of the switch on one frame tick.
 *
 * Velocity lives in a ref that outlives a target change, so flipping a
 * target mid flight carries the motion through rather than restarting it
 * from a standstill, which is the one thing a CSS transition cannot do.
 * The three run together so they never drift a frame apart.
 * @returns Each quantity's current value, re-rendering until all rest.
 */
export const useSwitchMotion = ({
    dragging,
    press,
    strength,
    travel,
}: SwitchTargets): SwitchMotion => {
    const [values, setValues] = useState(() => ({ press, strength, travel }));
    const state = useRef({
        press: { value: press, velocity: 0 },
        strength: { value: strength, velocity: 0 },
        travel: { value: travel, velocity: 0 },
    });

    const handOff = useCallback((position: number, velocity: number): void => {
        state.current.travel.value = position;
        state.current.travel.velocity = velocity;
    }, []);

    useEffect(() => {
        const current = state.current;

        // A dragged thumb is the pointer's, not the spring's.
        if (dragging) {
            current.travel.value = travel;
            current.travel.velocity = 0;
        }

        let frame = 0;
        let previous = performance.now();

        const tick = (now: number): void => {
            let remaining = Math.min((now - previous) / 1000, MAX_FRAME);
            previous = now;

            while (remaining > 0) {
                const step = Math.min(remaining, SUBSTEP);

                advance(current.press, press, PRESS_SPRING, step);
                advance(current.strength, strength, STRENGTH_SPRING, step);

                if (!dragging) {
                    advance(current.travel, travel, TRAVEL_SPRING, step);
                }

                remaining -= step;
            }

            const done =
                settled(current.press, press, PRESS_SPRING) &&
                settled(current.strength, strength, STRENGTH_SPRING) &&
                (dragging || settled(current.travel, travel, TRAVEL_SPRING));

            if (done) {
                current.press = { value: press, velocity: 0 };
                current.strength = { value: strength, velocity: 0 };

                if (!dragging) {
                    current.travel = { value: travel, velocity: 0 };
                }

                setValues({
                    press,
                    strength,
                    travel: current.travel.value,
                });
                return;
            }

            setValues({
                press: current.press.value,
                strength: current.strength.value,
                travel: current.travel.value,
            });
            frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [dragging, press, strength, travel]);

    return {
        handOff,
        press: values.press,
        strength: values.strength,
        travel: dragging ? travel : values.travel,
    };
};
