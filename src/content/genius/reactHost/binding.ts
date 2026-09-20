/** A binding that is read when it is used, not when its module loads. */
import { Result } from "@resulted/results";
import {
    type Binding,
    type BindingError,
    type ChunkError,
    describeBindingError,
} from "@/bindings";
import { log } from "@/utilities/log";

export interface Slot<Value> {
    /** The bound value. */
    readonly get: () => Value;
    /** The bound value, or `null` when nothing has bound it. */
    readonly peek: () => Value | null;
    readonly set: (value: Value) => void;
    /** Records why a lookup could not fill it, for `get` to report. */
    readonly fail: (reason: string) => void;
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
    /** Set when a lookup ran and could not find it. */
    let refused: string | null = null;

    return {
        fail: (reason: string): void => {
            refused = reason;
        },
        get: (): Value => {
            if (current === null) {
                const error: BindingError = {
                    kind: "binding",
                    target,
                    // Never installed, and installed but not found, are
                    // different problems; only one is a missing call.
                    reason: refused ?? "no install on this page asked for it",
                };

                // A component cannot return a `Result`, so this throws.
                throw new Error(describeBindingError(error));
            }

            return current;
        },
        peek: () => current,
        set: (value: Value): void => {
            current = value;
            refused = null;
        },
    };
};

/** One binding's whole job: look it up, and put it in its slot. */
export type Install = () => Promise<Result<null, ChunkError>>;

/** Pairs a lookup with the setter it feeds. */
export const installs =
    <Value>(load: Binding<Value>, into: Slot<Value>): Install =>
    () =>
        load().then((found) => {
            if (found.isErr()) {
                into.fail(describeBindingError(found.error));
                return found;
            }

            return found.map((value) => {
                into.set(value);
                return null;
            });
        });

/**
 * Runs every install at once.
 * @returns The first failure, or `null` when they all bound.
 */
export const installAll = async (
    bindings: readonly Install[],
): Promise<Result<null, ChunkError>> => {
    const results = await Promise.all(bindings.map((run) => run()));
    const failed = results.find((result) => result.isErr());

    return failed ?? Result.ok(null);
};

/** The same, for bindings a page can do without. */
export const installOptional = async (
    bindings: readonly Install[],
): Promise<void> => {
    const results = await Promise.all(bindings.map((run) => run()));

    for (const result of results) {
        if (result.isErr()) {
            log.debug(
                "genius: optional binding",
                describeBindingError(result.error),
            );
        }
    }
};
