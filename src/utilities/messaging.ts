import { Result, type ResultBase } from "@resulted/results";
import { type AppError, type AppResult, reviveResult } from "./result";

/** Everything a content script can ask the service worker to do. */
export type Message =
    /** Fetch an image in the worker, which is not bound by page CORS. */
    { readonly type: "image:fetch"; readonly url: string };

/** The success value each message type resolves to. */
export interface ResponseMap {
    /** A `data:` URL holding the untouched CDN bytes. */
    "image:fetch": string;
}

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
    ) => Promise<AppResult<ResponseMap[T]>>;
};

const isMessage = (value: unknown): value is Message =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string";

const isResultBase = (value: unknown): value is ResultBase<unknown, AppError> =>
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
): Promise<AppResult<ResponseMap[M["type"]]>> => {
    const response = await Result.try(chrome.runtime.sendMessage(message));

    if (response.isErr()) {
        return Result.err({ kind: "no-receiver" });
    }

    if (!isResultBase(response.value)) {
        return Result.err({ kind: "no-receiver" });
    }

    return reviveResult(
        response.value as ResultBase<ResponseMap[M["type"]], AppError>,
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
              ) => Promise<AppResult<unknown>>)
            | undefined;

        if (handler === undefined) {
            return false;
        }

        handler(message, sender)
            .then((result) => respond(result))
            .catch((error: unknown) => {
                respond(
                    Result.err<never, AppError>({
                        kind: "decode",
                        reason: String(error),
                    }),
                );
            });

        return true;
    });
};
