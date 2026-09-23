/** What a save would send, shown before anything reaches Genius. */
import type { FC } from "react";
import { type DraftField, FIELD_LABELS } from "../draft";
import { describePlan, type SavePlan } from "../write";
import { Confirm } from "./styles";

const fieldNames = (fields: readonly DraftField[]): string =>
    fields.map((field) => FIELD_LABELS[field]).join(", ");

interface ConfirmDialogProps {
    readonly plan: SavePlan;
}

export const ConfirmDialog: FC<ConfirmDialogProps> = ({ plan }) => (
    <Confirm>
        <h2>Save these edits to Genius?</h2>
        {plan.writes.length === 0 ? (
            <p>
                Nothing here can be sent. Every field you changed is listed
                below with its reason.
            </p>
        ) : (
            <p>{`This writes ${describePlan(plan)}.`}</p>
        )}
        <ul>
            {plan.writes.map((write) => (
                <li key={write.songId}>
                    <span className="gp-song">{write.title}</span>
                    {fieldNames(write.fields)}
                </li>
            ))}
        </ul>
        {plan.skipped.length === 0 ? null : (
            <div className="gp-caveat">
                <p>Not sent:</p>
                <ul>
                    {plan.skipped.map((entry) => (
                        <li key={`${entry.field}:${entry.reason}`}>
                            <span className="gp-song">
                                {FIELD_LABELS[entry.field]}
                            </span>
                            {entry.reason}
                        </li>
                    ))}
                </ul>
            </div>
        )}
        <p className="gp-caveat">
            Credits, tags, dates, and languages are queued for Genius to apply
            in the background. Titles, SoundCloud URLs, and YouTube URLs are
            saved outright.
        </p>
        <p className="gp-caveat">
            Each song is re-read first. Any field someone else changed since
            this table loaded is held back, not overwritten, and your edit is
            kept.
        </p>
    </Confirm>
);
