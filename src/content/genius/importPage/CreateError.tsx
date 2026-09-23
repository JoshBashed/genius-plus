/** What Genius said when it would not create the song. */
import { asPageValue, type PageComponent, type PageElement } from "@/bindings";
import { memo } from "../react";
import type { CreateSongFailure } from "./createSong";
import { Problem } from "./styles";

/** Their key for what belongs to no field in particular. */
const WHOLE_RECORD = "base";

export interface CreateErrorProps {
    readonly failure: CreateSongFailure;
}

/**
 * A refusal, shown as the thing it is.
 *
 * Field errors are listed against their fields rather than run together
 * into a sentence: which field was wrong is the only part the reader can
 * act on, and Genius names it.
 */
const renderCreateError = ({ failure }: CreateErrorProps): PageElement => {
    if (failure.kind === "validationError") {
        const entries = Object.entries(failure.errors);
        const whole = entries.filter(([field]) => field === WHOLE_RECORD);
        const fields = entries.filter(([field]) => field !== WHOLE_RECORD);

        return (
            <Problem>
                <span>Genius would not create that song.</span>
                {whole.map(([field, messages]) => (
                    <span key={field}>{messages.join("; ")}</span>
                ))}
                {fields.length === 0 ? null : (
                    <dl>
                        {fields.flatMap(([field, messages]) => [
                            <dt key={`${field}-name`}>{field}</dt>,
                            <dd key={`${field}-value`}>
                                {messages.join("; ")}
                            </dd>,
                        ])}
                    </dl>
                )}
            </Problem>
        );
    }

    if (failure.kind === "networkError") {
        return (
            <Problem>
                <span>Could not reach Genius.</span>
                <span>{`Nothing was sent to ${failure.url}, so nothing was created.`}</span>
            </Problem>
        );
    }

    if (failure.kind === "unreadable") {
        return (
            <Problem>
                <span>Genius took it, but said something unexpected.</span>
                <span>{failure.reason}</span>
                <span>
                    The song may exist. Search for it above before trying again.
                </span>
            </Problem>
        );
    }

    return (
        <Problem>
            <span>Genius refused it.</span>
            <span>{failure.message}</span>
        </Problem>
    );
};

export const CreateError = memo(
    asPageValue<PageComponent<CreateErrorProps>>(renderCreateError),
);
