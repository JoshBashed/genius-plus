/** Reading a value of unknown shape one property at a time. */

/**
 * Whether a value can be read key by key, each value as `unknown`.
 * Functions count: a React component's statics live on one.
 */
export const isRecord = (
    value: unknown,
): value is Readonly<Record<string, unknown>> =>
    (typeof value === "object" && value !== null) ||
    typeof value === "function";
