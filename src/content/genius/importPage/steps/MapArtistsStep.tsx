/** Step three: every name Apple credits, against a Genius artist. */

import { type FC, memo } from "react";
import type { SelectOption } from "@/bindings";
import type { ContributorPlan } from "../../albumImport/contributors";
import { Button } from "../../geniusComponents/Button";
import { ContributorMap } from "../ContributorMap";
import { Actions, Panel } from "../styles";

export interface MapArtistsStepProps {
    readonly artists: ContributorPlan;
    readonly onChange: (name: string, options: readonly SelectOption[]) => void;
    readonly onNext: () => void;
    readonly onBack: () => void;
}

const renderMapArtistsStep: FC<MapArtistsStepProps> = ({
    artists,
    onBack,
    onChange,
    onNext,
}) => (
    <Panel>
        <p>
            Match each name credited by Apple to the Genius artist it
            represents. Leave a name blank to omit that artist wherever it
            appears.
        </p>
        <ContributorMap onChange={onChange} plan={artists} />
        <Actions>
            <Button onClick={onNext} type="button">
                Next
            </Button>
            <Button onClick={onBack} secondary type="button">
                Back
            </Button>
        </Actions>
    </Panel>
);

export const MapArtistsStep = memo(renderMapArtistsStep);
