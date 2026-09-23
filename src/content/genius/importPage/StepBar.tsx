/** The stepped progress bar, one segment per step. */

import { memo } from "react";
import { asPageValue, type PageComponent, type PageElement } from "@/bindings";
import { Steps } from "./styles";
import { STEP_LABELS, type StepNumber } from "./wizard";

interface StepBarProps {
    readonly step: StepNumber;
}

const renderStepBar = ({ step }: StepBarProps): PageElement => (
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

export const StepBar = memo(
    asPageValue<PageComponent<StepBarProps>>(renderStepBar),
);
