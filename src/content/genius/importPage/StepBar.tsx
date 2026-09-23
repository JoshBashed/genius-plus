/** The stepped progress bar, one segment per step. */

import { type FC, memo } from "react";
import { Steps } from "./styles";
import { STEP_LABELS, type StepNumber } from "./wizard";

interface StepBarProps {
    readonly step: StepNumber;
}

const renderStepBar: FC<StepBarProps> = ({ step }) => (
    <Steps>
        {STEP_LABELS.map((label, index) => (
            <li
                data-state={
                    index + 1 === step
                        ? "active"
                        : index + 1 < step
                          ? "done"
                          : "todo"
                }
                key={label}
            >
                {label}
            </li>
        ))}
    </Steps>
);

export const StepBar = memo(renderStepBar);
