import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/** How long the glass stays up after a press that was not a hold. */
const LINGER_MS = 280;

export interface PressHandlers {
    readonly onBlur: () => void;
    readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
    readonly onKeyUp: () => void;
    readonly onPointerCancel: () => void;
    readonly onPointerDown: () => void;
    readonly onPointerLeave: () => void;
    readonly onPointerUp: () => void;
}

export interface PressState {
    /** True while the control is held, and briefly after a click. */
    readonly pressed: boolean;
    readonly handlers: PressHandlers;
}

/**
 * Tracks whether a control is being pressed, with a short tail.
 * @param lingerMs How long a click holds the press; 0 releases at once.
 * @returns Handlers to spread onto whichever element owns the press.
 */
export const usePressGlass = (lingerMs: number = LINGER_MS): PressState => {
    const [pressed, setPressed] = useState(false);
    const timer = useRef<number | null>(null);

    const stop = useCallback((): void => {
        if (timer.current !== null) {
            window.clearTimeout(timer.current);
            timer.current = null;
        }
    }, []);

    useEffect(() => stop, [stop]);

    const hold = useCallback((): void => {
        stop();
        setPressed(true);
    }, [stop]);

    const release = useCallback((): void => {
        stop();
        timer.current = window.setTimeout(() => {
            timer.current = null;
            setPressed(false);
        }, lingerMs);
    }, [lingerMs, stop]);

    const onKeyDown = useCallback(
        (event: KeyboardEvent<HTMLElement>): void => {
            if (event.key === " " || event.key === "Enter") {
                hold();
            }
        },
        [hold],
    );

    return {
        handlers: {
            onBlur: release,
            onKeyDown,
            onKeyUp: release,
            onPointerCancel: release,
            onPointerDown: hold,
            onPointerLeave: release,
            onPointerUp: release,
        },
        pressed,
    };
};
