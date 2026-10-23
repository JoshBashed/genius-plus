/**
 * Shapes shared by the bindings: a chunk's namespace, and the checks a
 * borrowed value passes before it is typed.
 *
 * TypeScript cannot see into Genius's bundles. Each check below proves
 * at runtime what can be proven there: that a value is a component, a
 * function, a context, or a module with the right keys. The props and
 * signatures it is then typed with are ours, read from their chunks.
 */
import { Result } from "@resulted/results";
import type { Context, FC } from "react";
import type { BindingError } from "@/bindings/errors";
import { isContext, isElementType, missingKeys } from "@/bindings/finders";
import { isRecord } from "@/utilities/record";

/** The namespace object a dynamic `import()` resolves to. */
export type ModuleNamespace = Readonly<Record<string, unknown>>;

const refused = (target: string, reason: string): BindingError => ({
    kind: "binding",
    target,
    reason,
});

const isComponent = <Props>(value: unknown): value is FC<Props> =>
    typeof value === "function" || isElementType(value);

const isFunction = <Fn extends (...args: never[]) => unknown>(
    value: unknown,
): value is Fn => typeof value === "function";

const isContextOf = <Value>(value: unknown): value is Context<Value> =>
    isContext(value);

const hasKeys = <Module>(
    value: unknown,
    keys: readonly string[],
): value is Module => isRecord(value) && missingKeys(value, keys).length === 0;

/** A borrowed component: a function, or a `memo` or `forwardRef`. */
export const borrowComponent = <Props>(
    value: unknown,
    target: string,
): Result<FC<Props>, BindingError> =>
    isComponent<Props>(value)
        ? Result.ok(value)
        : Result.err(refused(target, "the match is not a component"));

/** A borrowed function, such as a hook. */
export const borrowFunction = <Fn extends (...args: never[]) => unknown>(
    value: unknown,
    target: string,
): Result<Fn, BindingError> =>
    isFunction<Fn>(value)
        ? Result.ok(value)
        : Result.err(refused(target, "the match is not a function"));

/** A borrowed React context. */
export const borrowContext = <Value>(
    value: unknown,
    target: string,
): Result<Context<Value>, BindingError> =>
    isContextOf<Value>(value)
        ? Result.ok(value)
        : Result.err(refused(target, "the match is not a context"));

/**
 * A borrowed module, such as React itself.
 * @param keys Every member this extension calls on it.
 */
export const borrowModule = <Module>(
    value: unknown,
    target: string,
    keys: readonly string[],
): Result<Module, BindingError> => {
    if (hasKeys<Module>(value, keys)) {
        return Result.ok(value);
    }

    return Result.err(
        refused(
            target,
            `found the module but it is missing ${missingKeys(value, keys).join(", ")}`,
        ),
    );
};
