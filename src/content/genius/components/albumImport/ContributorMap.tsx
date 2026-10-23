/** Each name Apple gave, against the Genius artist it maps to. */

import { type FC, memo } from "react";
import type { SelectOption } from "@/bindings";
import { Rows, Scroller } from "@/content/genius/components/albumImport/styles";
import { Icon } from "@/content/genius/components/genius/Icon";
import {
    MENU_STYLES,
    PORTAL_PROPS,
} from "@/content/genius/components/genius/selectProps";
import { TagInput } from "@/content/genius/components/genius/TagInput";
import {
    type Contributor,
    type ContributorPlan,
    contributorList,
} from "@/content/genius/features/albumImport/contributors";
import { loadArtistOptions } from "@/content/genius/utilities/options";

interface RowProps {
    readonly entry: Contributor;
    readonly onChange: (name: string, options: readonly SelectOption[]) => void;
}

/** The same control the song page credits an artist with. */
const Row: FC<RowProps> = ({ entry, onChange }) => (
    <tr>
        <td className="gp-state">
            {entry.options.length === 0 ? (
                <>
                    <Icon
                        className="gp-icon gp-icon-missing"
                        height={14}
                        names={["warning", "alert"]}
                        width={14}
                    />
                    <span className="gp-said">Nothing chosen yet</span>
                </>
            ) : null}
        </td>
        <td className="gp-name" title={entry.name}>
            {entry.name}
            {entry.from === null ? null : (
                <span className="gp-aside">{` from "${entry.from}"`}</span>
            )}
            {entry.exactCount > 1 ? (
                <span className="gp-aside">
                    {` ${entry.exactCount} artists share this name`}
                </span>
            ) : null}
        </td>
        <td className="gp-pick">
            <TagInput
                controlledValue={entry.options}
                customStyles={MENU_STYLES}
                defaultOptions={entry.suggestions}
                isCreatable
                loadOptions={loadArtistOptions}
                onChange={(next) => {
                    onChange(entry.name, next);
                }}
                placeholder="Leave empty to skip"
                promptMessage="Search artists"
                reactSelectProps={PORTAL_PROPS}
                valueBackgroundKey="variant"
            />
        </td>
    </tr>
);

interface ContributorMapProps {
    readonly plan: ContributorPlan;
    readonly onChange: (name: string, options: readonly SelectOption[]) => void;
}

/**
 * One row per name, in one order that nothing reorders.
 * A name Genius knew exactly is filled in already; anything else is left
 * empty on purpose, so an import never invents an artist on its own.
 */
const renderContributorMap: FC<ContributorMapProps> = ({ onChange, plan }) => (
    <Scroller>
        <Rows>
            <tbody>
                {contributorList(plan).map((entry) => (
                    <Row entry={entry} key={entry.name} onChange={onChange} />
                ))}
            </tbody>
        </Rows>
    </Scroller>
);

export const ContributorMap = memo(renderContributorMap);
