import { Result, type ResultBase } from "@resulted/results";
import type { DecodeFailure } from "./decode";
import type { HttpError, NetworkError } from "./http";

/** Rebuilds a `Result` that lost its prototype crossing a boundary. */
export const reviveResult = <Ok, Err>(
    base: ResultBase<Ok, Err>,
): Result<Ok, Err> =>
    base.type === "ok" ? Result.ok(base.value) : Result.err(base.error);

/** Nothing answered the message, which is the worker being replaced. */
export interface NoReceiverError {
    readonly kind: "no-receiver";
}

/** The worker is not an open proxy, and that URL is not one it fetches. */
export interface ForbiddenHostError {
    readonly kind: "unsupported";
    readonly reason: string;
}

/** Everything a content script can ask the service worker to do. */
export type Message =
    /** Fetch an image in the worker, which is not bound by page CORS. */
    | { readonly type: "image:fetch"; readonly url: string }
    /** Read one song's credits from Apple's catalogue, token and all. */
    | {
          readonly type: "apple:credits";
          readonly storefront: string;
          readonly trackId: number;
      };

/** The success value each message type resolves to. */
export interface ResponseMap {
    /** A `data:` URL holding the untouched CDN bytes. */
    "image:fetch": string;
    /** Apple's catalogue answer, parsed by the caller. */
    "apple:credits": unknown;
}

/** What a handler for each message type can fail with. */
export interface ErrorMap {
    "image:fetch": NetworkError | HttpError | ForbiddenHostError;
    "apple:credits": NetworkError | HttpError | DecodeFailure;
}

/**
 * What the channel itself adds to a handler's own failures.
 * A handler that throws is answered with a `decode` error, so every
 * caller can see one whatever its own handler declares.
 */
export type DeliveryError = NoReceiverError | DecodeFailure;

/** Narrows `Message` to the member whose `type` is `T`. */
export type MessageOf<T extends Message["type"]> = Extract<
    Message,
    { type: T }
>;

/** One optional handler per message type. */
export type MessageHandlers = {
    readonly [T in Message["type"]]?: (
        message: MessageOf<T>,
        sender: chrome.runtime.MessageSender,
    ) => Promise<Result<ResponseMap[T], ErrorMap[T]>>;
};

const isMessage = (value: unknown): value is Message =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string";

const isResultBase = (value: unknown): value is ResultBase<unknown, unknown> =>
    typeof value === "object" &&
    value !== null &&
    ((value as { type?: unknown }).type === "ok" ||
        (value as { type?: unknown }).type === "err");

/**
 * Sends a message to the service worker and revives its `Result`.
 * @returns The handler's result, or `no-receiver` if none replied.
 */
export const sendMessage = async <M extends Message>(
    message: M,
): Promise<
    Result<ResponseMap[M["type"]], ErrorMap[M["type"]] | DeliveryError>
> => {
    const response = await Result.try(chrome.runtime.sendMessage(message));

    if (response.isErr()) {
        return Result.err({ kind: "no-receiver" });
    }

    if (!isResultBase(response.value)) {
        return Result.err({ kind: "no-receiver" });
    }

    return reviveResult(
        response.value as ResultBase<
            ResponseMap[M["type"]],
            ErrorMap[M["type"]] | DeliveryError
        >,
    );
};

/**
 * Registers one handler per message type; always answers a `Result`.
 * @param handlers Keyed by message type; unknown types are ignored.
 */
export const onMessage = (handlers: MessageHandlers): void => {
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
        if (!isMessage(message)) {
            return false;
        }

        const handler = handlers[message.type] as
            | ((
                  message: Message,
                  sender: chrome.runtime.MessageSender,
              ) => Promise<Result<unknown, unknown>>)
            | undefined;

        if (handler === undefined) {
            return false;
        }

        handler(message, sender)
            .then((result) => respond(result))
            .catch((error: unknown) => {
                respond(
                    Result.err<never, DecodeFailure>({
                        kind: "decode",
                        reason: String(error),
                    }),
                );
            });

        return true;
    });
};
