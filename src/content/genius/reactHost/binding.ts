/** A binding that is read when it is used, not when its module loads. */
import { Result } from "@resulted/results";
import {
    type AppError,
    type AppResult,
    describeError,
} from "@/utilities/result";

export interface Slot<Value> {
    /** The bound value. */
    readonly get: () => Value;
    /** The bound value, or `null` when nothing has bound it. */
    readonly peek: () => Value | null;
    readonly set: (value: Value) => void;
}

/**
 * One late bound value.
 *
 * Reading happens at the call, so a module that holds a slot can be
 * imported before anything is bound, and a rebind reaches everything
 * that already imported it.
 *
 * @param target Named in the error a read before binding throws.
 */
export const slot = <Value>(target: string): Slot<Value> => {
    let current: Value | null = null;

    return {
        get: (): Value => {
            if (current === null) {
                const error: AppError = {
                    kind: "binding",
                    target,
                    reason: "nothing bound it on this page",
                };

                // A component cannot return a `Result`, so this throws.
                throw new Error(describeError(error));
            }

            return current;
        },
        peek: () => current,
        set: (value: Value): void => {
            current = value;
        },
    };
};

/** One binding's whole job: look it up, and put it in its slot. */
export type Install = () => Promise<AppResult<null>>;

/** Pairs a lookup with the setter it feeds. */
export const installs =
    <Value>(
        load: () => Promise<AppResult<Value>>,
        set: (value: Value) => void,
    ): Install =>
    () =>
        load().then((found) =>
            found.map((value) => {
                set(value);
                return null;
            }),
        );

/**
 * Runs every install at once.
 * @returns The first failure, or `null` when they all bound.
 */
export const installAll = async (
    bindings: readonly Install[],
): Promise<AppResult<null>> => {
    const results = await Promise.all(bindings.map((run) => run()));
    const failed = results.find((result) => result.isErr());

    return failed ?? Result.ok(null);
};

/** The same, for bindings a page can do without. */
export const installOptional = async (
    bindings: readonly Install[],
): Promise<void> => {
    await Promise.all(bindings.map((run) => run()));
};
