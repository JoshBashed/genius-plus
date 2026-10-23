import { Result, type ResultBase } from "@resulted/results";
import { z } from "zod";
import {
    type DecodeFailure,
    decodeFailureSchema,
    decodeOr,
} from "@/utilities/decode";
import {
    type HttpError,
    httpErrorSchema,
    type NetworkError,
    networkErrorSchema,
} from "@/utilities/http";

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

const noReceiverSchema = z.object({ kind: z.literal("no-receiver") });

const forbiddenHostSchema = z.object({
    kind: z.literal("unsupported"),
    reason: z.string(),
});

/** Everything a content script can ask the service worker to do. */
const messageSchema = z.discriminatedUnion("type", [
    /** Fetch an image in the worker, which is not bound by page CORS. */
    z.object({ type: z.literal("image:fetch"), url: z.string() }),
    /** Read one song's credits from Apple's catalogue, token and all. */
    z.object({
        storefront: z.string(),
        trackId: z.number(),
        type: z.literal("apple:credits"),
    }),
]);

export type Message = z.output<typeof messageSchema>;

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

/** A `Result` as it arrives, prototype gone, read with its two halves. */
export const answerSchema = <Ok extends z.ZodType, Err extends z.ZodType>(
    ok: Ok,
    err: Err,
) =>
    z.discriminatedUnion("type", [
        z.object({ type: z.literal("ok"), value: ok }),
        z.object({ error: err, type: z.literal("err") }),
    ]);

/** What the channel adds to every answer, as it arrives. */
const deliveryErrorSchema = z.union([noReceiverSchema, decodeFailureSchema]);

/** Sends a message to the service worker, and reads its answer. */
const ask = async <Answer extends z.ZodType>(
    message: Message,
    schema: Answer,
): Promise<z.output<Answer> | null> => {
    const response = await Result.try(chrome.runtime.sendMessage(message));

    return response.isErr() ? null : decodeOr(schema, response.value);
};

const imageAnswerSchema = answerSchema(
    z.string(),
    z.union([
        networkErrorSchema,
        httpErrorSchema,
        forbiddenHostSchema,
        deliveryErrorSchema,
    ]),
);

/**
 * Asks the worker for an image, which is not bound by page CORS.
 * @returns A `data:` URL of the untouched bytes.
 */
export const requestImage = async (
    url: string,
): Promise<Result<string, ErrorMap["image:fetch"] | DeliveryError>> => {
    const answer = await ask({ type: "image:fetch", url }, imageAnswerSchema);

    return answer === null
        ? Result.err({ kind: "no-receiver" })
        : reviveResult(answer);
};

const creditsAnswerSchema = answerSchema(
    z.unknown(),
    z.union([
        networkErrorSchema,
        httpErrorSchema,
        decodeFailureSchema,
        deliveryErrorSchema,
    ]),
);

/**
 * Asks the worker for one song's credits from Apple's catalogue.
 * @returns Apple's answer, for the caller to parse.
 */
export const requestCredits = async (
    storefront: string,
    trackId: number,
): Promise<Result<unknown, ErrorMap["apple:credits"] | DeliveryError>> => {
    const answer = await ask(
        { storefront, trackId, type: "apple:credits" },
        creditsAnswerSchema,
    );

    return answer === null
        ? Result.err({ kind: "no-receiver" })
        : reviveResult(answer);
};

/** Runs the handler for a message, or `null` when there is none. */
const handle = (
    handlers: MessageHandlers,
    message: Message,
    sender: chrome.runtime.MessageSender,
): Promise<Result<unknown, unknown>> | null => {
    switch (message.type) {
        case "image:fetch":
            return handlers["image:fetch"]?.(message, sender) ?? null;
        case "apple:credits":
            return handlers["apple:credits"]?.(message, sender) ?? null;
    }
};

/**
 * Registers one handler per message type; always answers a `Result`.
 * @param handlers Keyed by message type; unknown types are ignored.
 */
export const onMessage = (handlers: MessageHandlers): void => {
    chrome.runtime.onMessage.addListener((raw, sender, respond) => {
        const message = decodeOr(messageSchema, raw);
        const handled =
            message === null ? null : handle(handlers, message, sender);

        if (handled === null) {
            return false;
        }

        handled
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
