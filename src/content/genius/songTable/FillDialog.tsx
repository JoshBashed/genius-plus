/** The column menu's dialog: the column's own editor, and nothing else. */
import type { PageElement, SelectOption } from "@/bindings";
import { FIELD_LABELS, type SongDraft } from "../draft";
import { ColumnEditor } from "./ColumnEditor";
import type { FillMode } from "./ColumnMenu";
import type { ColumnSpec } from "./columns";
import { Confirm } from "./styles";

export interface FillDialogProps {
    readonly column: ColumnSpec;
    readonly mode: FillMode;
    /** A scratch draft: only `column.field` is ever read back out. */
    readonly draft: SongDraft;
    readonly languageOptions: readonly SelectOption[];
    readonly primaryTagOptions: readonly SelectOption[];
    readonly onPatch: (next: Partial<SongDraft>) => void;
}

export const FillDialog = (props: FillDialogProps): PageElement => {
    const { column, mode } = props;
    const label = FIELD_LABELS[column.field].toLowerCase();

    return (
        <Confirm>
            <h2>
                {mode === "empty"
                    ? `Fill empty ${label}`
                    : `Replace all ${label}`}
            </h2>
            <p>
                {mode === "empty"
                    ? `This stages the value below on every song whose ${label} is empty.`
                    : `This stages the value below on every song, replacing whatever ${label} it already has.`}
            </p>
            <div className="gp-editor">
                <ColumnEditor
                    column={column}
                    disabled={false}
                    draft={props.draft}
                    hasError={false}
                    languageOptions={props.languageOptions}
                    onPatch={props.onPatch}
                    primaryTagOptions={props.primaryTagOptions}
                />
            </div>
            <p className="gp-caveat">
                Nothing is sent yet. The rows are staged like any other edit, so
                "Save" still confirms them and "Revert all" still undoes them.
            </p>
            <p className="gp-caveat">
                Songs you may not edit here, and songs still loading, are
                skipped.
            </p>
        </Confirm>
    );
};
