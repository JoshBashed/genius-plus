/** Schemas, as a `Result` rather than an exception. */
import { Result } from "@resulted/results";
import type { z } from "zod";

/** The only way decoding fails, so it is the only thing it returns. */
export interface DecodeFailure {
    readonly kind: "decode";
    readonly reason: string;
}

/** How many issues a message lists before it stops. */
const MAX_ISSUES = 3;

/** Zod's own path, as the dotted key a reader would recognise. */
const pathOf = (issue: z.core.$ZodIssue): string =>
    issue.path.length === 0 ? "(root)" : issue.path.join(".");

const describeIssues = (issues: readonly z.core.$ZodIssue[]): string => {
    const shown = issues
        .slice(0, MAX_ISSUES)
        .map((issue) => `${pathOf(issue)}: ${issue.message}`)
        .join("; ");
    const rest = issues.length - MAX_ISSUES;

    return rest > 0 ? `${shown}, and ${rest} more` : shown;
};

/**
 * Parses a value against a schema, never throwing.
 * @param what Named in the error, so it says what failed to decode.
 * @returns The parsed value, or a `decode` error listing what was wrong.
 */
export const decode = <Schema extends z.ZodType>(
    schema: Schema,
    value: unknown,
    what: string,
): Result<z.output<Schema>, DecodeFailure> => {
    const parsed = schema.safeParse(value);

    return parsed.success
        ? Result.ok(parsed.data)
        : Result.err({
              kind: "decode",
              reason: `${what}: ${describeIssues(parsed.error.issues)}`,
          });
};

/**
 * The same, for a value a caller can do without.
 * @returns The parsed value, or `null` when it did not match.
 */
export const decodeOr = <Schema extends z.ZodType>(
    schema: Schema,
    value: unknown,
): z.output<Schema> | null => {
    const parsed = schema.safeParse(value);

    return parsed.success ? parsed.data : null;
};
