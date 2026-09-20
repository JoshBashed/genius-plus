import { Result } from "@resulted/results";
import type { BindingError } from "./errors";
import type { ModuleNamespace } from "./types";

/** Structural export finders; nothing here looks an export up by name. */

const MEMO = Symbol.for("react.memo");
const FORWARD_REF = Symbol.for("react.forward_ref");
const CONTEXT = Symbol.for("react.context");

const bindingError = (target: string, reason: string): BindingError => ({
    kind: "binding",
    target,
    reason,
});

const isObjectLike = (value: unknown): boolean =>
    (typeof value === "object" && value !== null) ||
    typeof value === "function";

/**
 * A property read that survives proxies and throwing getters.
 * @returns `undefined` when the read throws or `value` is primitive.
 */
export const readProperty = (value: unknown, key: string): unknown => {
    if (!isObjectLike(value)) {
        return undefined;
    }

    const got = Result.trySync(() => (value as Record<string, unknown>)[key]);
    return got.isOk() ? got.value : undefined;
};

/**
 * Whether styled-components built this value.
 * @returns `true` when it carries a `styledComponentId`.
 */
export const isStyled = (value: unknown): boolean =>
    typeof readProperty(value, "styledComponentId") === "string";

const typeOfMarker = (value: unknown): unknown =>
    readProperty(value, "$$typeof");

/**
 * Looks through a `memo(X)` wrapper to `X`, which holds the statics.
 * @returns `value` unchanged when it is not a memo.
 */
export const unwrapMemo = (value: unknown): unknown =>
    typeOfMarker(value) === MEMO ? readProperty(value, "type") : value;

/**
 * Whether React would accept this value as a component type.
 * @returns `true` for `memo` and `forwardRef` wrappers only.
 */
export const isElementType = (value: unknown): boolean => {
    const marker = typeOfMarker(value);
    return marker === MEMO || marker === FORWARD_REF;
};

/**
 * Whether the value is a React context object.
 * @returns `true` for a `react.context` marker.
 */
export const isContext = (value: unknown): boolean =>
    typeOfMarker(value) === CONTEXT;

const WRAPPER = /^(?:forwardRef|memo|WithTheme|Styled)\((.*)\)$/;

/**
 * Strips the `forwardRef(...)` and `memo(...)` decoration off a name.
 * @returns The innermost name, unwrapped as many times as needed.
 */
export const normaliseDisplayName = (name: string): string => {
    let current = name;
    let match = WRAPPER.exec(current);

    while (match !== null) {
        current = match[1] ?? current;
        match = WRAPPER.exec(current);
    }

    return current;
};

/**
 * The displayName on the export, or on its `type` or `render`.
 * @returns `null` when nothing in that chain carries one.
 */
export const displayNameOf = (value: unknown): string | null => {
    const direct = readProperty(value, "displayName");

    if (typeof direct === "string") {
        return direct;
    }

    const inner = readProperty(value, "type") ?? readProperty(value, "render");

    if (inner === undefined || inner === value) {
        return null;
    }

    const nested = readProperty(inner, "displayName");
    return typeof nested === "string" ? nested : null;
};

const describeExports = (ns: ModuleNamespace): string => {
    const keys = Object.keys(ns);
    return keys.length === 0 ? "no exports" : `exports: ${keys.join(", ")}`;
};

const safely = (
    predicate: (value: unknown) => boolean,
): ((value: unknown) => boolean) => {
    return (value) => {
        const outcome = Result.trySync(() => predicate(value));
        return outcome.isOk() && outcome.value;
    };
};

/**
 * Every finder goes through here; two different matches are an error.
 * @param target Named in the error when the lookup fails.
 * @param predicate Run inside a try; a throw counts as no match.
 * @returns The single match, or a `binding` error listing the exports.
 */
export const selectExport = (
    ns: ModuleNamespace,
    target: string,
    predicate: (value: unknown) => boolean,
): Result<unknown, BindingError> => {
    const test = safely(predicate);
    const matches: { key: string; value: unknown }[] = [];

    for (const [key, value] of Object.entries(ns)) {
        if (!test(value)) {
            continue;
        }

        if (matches.some((match) => Object.is(match.value, value))) {
            continue;
        }

        matches.push({ key, value });
    }

    const first = matches[0];

    if (first === undefined) {
        return Result.err(
            bindingError(
                target,
                `no export of the chunk matches (${describeExports(ns)})`,
            ),
        );
    }

    if (matches.length > 1) {
        return Result.err(
            bindingError(
                target,
                `${matches.length} exports match (${matches
                    .map((match) => match.key)
                    .join(", ")}); this finder is no longer specific enough`,
            ),
        );
    }

    return Result.ok(first.value);
};

/**
 * The primary finder: styled, `forwardRef`, and `memo` components.
 * @param name The undecorated component name, such as `"Button"`.
 * @returns The matching export, or a `binding` error.
 */
export const findByDisplayName = (
    ns: ModuleNamespace,
    name: string,
): Result<unknown, BindingError> =>
    selectExport(ns, `${name} (displayName)`, (value) => {
        const found = displayNameOf(value);
        return found !== null && normaliseDisplayName(found) === name;
    });

/**
 * For unnamed components: `SelectInput__*` statics name their owner.
 * @param file The source file name those statics are prefixed with.
 * @returns The export owning them, or a `binding` error.
 */
export const findByStyledNamespace = (
    ns: ModuleNamespace,
    file: string,
): Result<unknown, BindingError> =>
    selectExport(ns, `${file} (styled statics named ${file}__*)`, (value) => {
        const owner = unwrapMemo(value);

        if (!isObjectLike(owner)) {
            return false;
        }

        return Object.values(owner as Record<string, unknown>).some(
            (statik) =>
                isStyled(statik) &&
                typeof readProperty(statik, "displayName") === "string" &&
                String(readProperty(statik, "displayName")).startsWith(
                    `${file}__`,
                ),
        );
    });

/**
 * Genius ships `prop-types` in production, so prop names survive.
 * @param required Prop names the wanted component declares.
 * @returns The export declaring all of them, or a `binding` error.
 */
export const findByPropTypes = (
    ns: ModuleNamespace,
    target: string,
    required: readonly string[],
): Result<unknown, BindingError> =>
    selectExport(ns, `${target} (propTypes ${required.join("+")})`, (value) => {
        const owner = unwrapMemo(value);
        const propTypes =
            readProperty(owner, "propTypes") ??
            readProperty(value, "propTypes");

        if (!isObjectLike(propTypes)) {
            return false;
        }

        return required.every((key) => key in (propTypes as object));
    });

const sourceOf = (value: unknown): string | null => {
    if (typeof value !== "function") {
        return null;
    }

    const text = Result.trySync(() => Function.prototype.toString.call(value));
    return text.isOk() ? text.value : null;
};

/** Minifiers rename locals but never member names, so `x.useRef(` survives. */
const HOOK_CALL = /\buse[A-Z]\w*\s*\(/;

/**
 * Sole export, or the arrow: Genius writes hooks as arrows.
 * @returns The hook, or a `binding` error when several could be it.
 */
export const findHook = (
    ns: ModuleNamespace,
    target: string,
): Result<unknown, BindingError> => {
    const values = Object.values(ns);
    const sole = values.length === 1 ? values[0] : undefined;

    if (typeof sole === "function") {
        return Result.ok(sole);
    }

    return selectExport(ns, `${target} (hook)`, (value) => {
        if (typeof value !== "function" || isStyled(value)) {
            return false;
        }

        if (isElementType(value)) {
            return false;
        }

        const isArrow = readProperty(value, "prototype") === undefined;
        const source = sourceOf(value);
        return isArrow || (source !== null && HOOK_CALL.test(source));
    });
};

/**
 * A React context object, by its `$$typeof` marker.
 * @returns The context export, or a `binding` error.
 */
export const findContext = (
    ns: ModuleNamespace,
    target: string,
): Result<unknown, BindingError> =>
    selectExport(ns, `${target} (context)`, isContext);

/**
 * Device pairs share a displayName; probing `attrs` separates them.
 * @param file The source file name its mobile half is prefixed with.
 * @returns The matching pair, or a `binding` error.
 */
export const findDeviceComponent = (
    ns: ModuleNamespace,
    file: string,
): Result<unknown, BindingError> =>
    selectExport(ns, `${file} (responsive pair)`, (value) => {
        if (!isStyled(value)) {
            return false;
        }

        const attrs = readProperty(value, "attrs");

        if (!Array.isArray(attrs)) {
            return false;
        }

        return attrs.some((attr: unknown) => {
            if (typeof attr !== "function") {
                return false;
            }

            const produced = Result.trySync(() =>
                (attr as (props: unknown) => unknown)({
                    theme: { deviceType: "mobile" },
                }),
            );

            if (produced.isErr()) {
                return false;
            }

            const name = displayNameOf(readProperty(produced.value, "as"));
            return (name ?? "").startsWith(`${file}__`);
        });
    });

/**
 * Matches an object export by the keys it carries.
 * @param forbidden Keys that disqualify a match, to split near-twins.
 * @returns The single matching export, or a `binding` error.
 */
export const findByKeys = (
    ns: ModuleNamespace,
    target: string,
    required: readonly string[],
    forbidden: readonly string[] = [],
): Result<unknown, BindingError> =>
    selectExport(ns, `${target} (${required.join("+")})`, (value) => {
        if (!isObjectLike(value)) {
            return false;
        }

        const has = (key: string): boolean =>
            readProperty(value, key) !== undefined || key in (value as object);

        return required.every(has) && !forbidden.some(has);
    });

/**
 * Reports which of `keys` a namespace-like object is missing.
 * @returns The absent keys, empty when every one is present.
 */
export const missingKeys = (
    value: unknown,
    keys: readonly string[],
): readonly string[] =>
    keys.filter((key) => readProperty(value, key) === undefined);
