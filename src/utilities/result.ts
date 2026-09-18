import { Result, type ResultBase } from "@resulted/results";

/** Every failure this extension can produce, as a tagged union. */
export type AppError =
    | { readonly kind: "network"; readonly url: string }
    | {
          readonly kind: "http";
          readonly url: string;
          readonly status: number;
      }
    | { readonly kind: "decode"; readonly reason: string }
    | { readonly kind: "unsupported"; readonly reason: string }
    | {
          /** Genius would reject the write: no usable CSRF token. */
          readonly kind: "auth";
          readonly reason: string;
      }
    | {
          /** A Genius bundle export we expected to find, and did not. */
          readonly kind: "binding";
          readonly target: string;
          readonly reason: string;
      }
    | {
          /** The page's data, not the bundle, is missing something. */
          readonly kind: "page";
          readonly target: string;
          readonly reason: string;
      }
    | { readonly kind: "no-receiver" };

export type AppResult<T> = Result<T, AppError>;

export const describeError = (error: AppError): string => {
    switch (error.kind) {
        case "network":
            return `Could not reach ${error.url}`;
        case "http":
            return `${error.url} responded ${error.status}`;
        case "decode":
            return `Could not decode the image: ${error.reason}`;
        case "unsupported":
            return error.reason;
        case "auth":
            return error.reason;
        case "binding":
            return `Could not bind ${error.target}: ${error.reason}`;
        case "page":
            return `Could not read ${error.target}: ${error.reason}`;
        case "no-receiver":
            return "The extension is reloading, try again";
    }
};

/** Rebuilds a `Result` that lost its prototype crossing a boundary. */
export const reviveResult = <Ok, Err>(
    base: ResultBase<Ok, Err>,
): Result<Ok, Err> =>
    base.type === "ok" ? Result.ok(base.value) : Result.err(base.error);
