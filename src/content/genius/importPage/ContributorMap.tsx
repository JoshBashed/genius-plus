/** Each name Apple gave, against the Genius artist it maps to. */
import {
    asPageValue,
    type PageComponent,
    type PageElement,
    type SelectOption,
} from "@/bindings";
import {
    type Contributor,
    type ContributorPlan,
    contributorList,
} from "../albumImport/contributors";
// Deep imports, not the barrel: it evaluates every component, and this
// page binds only the few it renders with.
import { Icon } from "../geniusComponents/Icon";
import { TagInput } from "../geniusComponents/TagInput";
import { loadArtistOptions } from "../options";
import { memo } from "../reactHost/react";
import { MENU_STYLES, PORTAL_PROPS } from "../selectProps";
import { Rows, Scroller } from "./styles";

interface RowProps {
    readonly entry: Contributor;
    readonly onChange: (name: string, options: readonly SelectOption[]) => void;
}

/** The same control the song page credits an artist with. */
const Row = ({ entry, onChange }: RowProps): PageElement => (
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
const renderContributorMap = ({
    onChange,
    plan,
}: ContributorMapProps): PageElement => (
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

export const ContributorMap = memo(
    asPageValue<PageComponent<ContributorMapProps>>(renderContributorMap),
);
