import { useEffect, useRef, useState } from "react";

/** Fixed substep in seconds, so the result is frame rate independent. */
export const SUBSTEP = 1 / 480;

/** Longest frame the simulation integrates, in seconds. */
export const MAX_FRAME = 1 / 20;

/** One quantity's spring, and how close counts as arrived. */
export interface SpringChannel {
    readonly stiffness: number;
    readonly damping: number;
    /** Settling thresholds, in the value's units and units a second. */
    readonly rest: number;
    readonly restVelocity: number;
}

/** Where a quantity is, and how fast it is going. */
export interface Spring {
    value: number;
    velocity: number;
}

/** Integrates one spring by one substep, in place. */
export const advance = (
    spring: Spring,
    target: number,
    channel: SpringChannel,
    step: number,
): void => {
    const force =
        channel.stiffness * (target - spring.value) -
        channel.damping * spring.velocity;

    spring.velocity += force * step;
    spring.value += spring.velocity * step;
};

export const settled = (
    spring: Spring,
    target: number,
    channel: SpringChannel,
): boolean =>
    Math.abs(target - spring.value) < channel.rest &&
    Math.abs(spring.velocity) < channel.restVelocity;

/**
 * Integrates one quantity toward `target` on a frame tick.
 *
 * Velocity lives in a ref that outlives a target change, so a target that
 * flips mid flight carries the motion through rather than restarting from
 * a standstill, which is the one thing a CSS transition cannot do.
 * @param channel Must be stable; a new object restarts the frame loop.
 * @returns The current value, re-rendering until it comes to rest.
 */
export const useSpring = (target: number, channel: SpringChannel): number => {
    const [value, setValue] = useState(target);
    const spring = useRef<Spring>({ value: target, velocity: 0 });

    useEffect(() => {
        const current = spring.current;

        let frame = 0;
        let previous = performance.now();

        const tick = (now: number): void => {
            let remaining = Math.min((now - previous) / 1000, MAX_FRAME);
            previous = now;

            while (remaining > 0) {
                const step = Math.min(remaining, SUBSTEP);

                advance(current, target, channel, step);
                remaining -= step;
            }

            if (settled(current, target, channel)) {
                current.value = target;
                current.velocity = 0;
                setValue(target);
                return;
            }

            setValue(current.value);
            frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [channel, target]);

    return value;
};
