import { useEffect, useState } from "react";
import { Switch } from "@/components/Switch";
import { usePressGlass } from "@/components/usePressGlass";
import {
    DEFAULT_SETTINGS,
    readSettings,
    type Settings,
    writeSettings,
} from "@/utilities/settings";

interface ToggleSpec {
    readonly key: keyof Settings;
    readonly label: string;
    readonly hint: string;
}

const TOGGLES: readonly ToggleSpec[] = [
    {
        hint: "Drops ?si=, ?in= and utm_* whenever you copy a link.",
        key: "cleanSoundcloudLinks",
        label: "Clean SoundCloud links",
    },
    {
        hint: "Also rewrites the address bar as you browse SoundCloud.",
        key: "cleanAddressBar",
        label: "Clean the address bar",
    },
    {
        hint: "Hover any cover to save it as a full resolution PNG.",
        key: "artworkDownloads",
        label: "Artwork downloads",
    },
];

interface SettingRowProps {
    readonly checked: boolean;
    readonly spec: ToggleSpec;
    readonly onChange: (checked: boolean) => void;
}

/** The whole row is the control, so the hit area matches the visuals. */
const SettingRow = ({ checked, onChange, spec }: SettingRowProps) => {
    // The row owns the press, so holding the label glasses the thumb too.
    const { handlers, pressed } = usePressGlass();

    return (
        <button
            aria-checked={checked}
            className="flex cursor-pointer items-center gap-3 rounded text-left outline-offset-8 select-none focus-visible:outline-2 focus-visible:outline-genius"
            onClick={() => onChange(!checked)}
            role="switch"
            type="button"
            {...handlers}
        >
            <Switch
                checked={checked}
                onChange={onChange}
                presentational
                pressed={pressed}
            />
            <span className="flex flex-col gap-0.5">
                <span className="text-xs font-medium">{spec.label}</span>
                <span className="text-[11px] leading-snug text-neutral-400">
                    {spec.hint}
                </span>
            </span>
        </button>
    );
};

/** The popup: one switch per setting, written straight to storage. */
export const App = () => {
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        void readSettings().then((stored) => {
            setSettings(stored);
            setReady(true);
        });
    }, []);

    const toggle = (key: keyof Settings, value: boolean): void => {
        // Update locally first, so the switch never feels laggy.
        setSettings((current) => ({ ...current, [key]: value }));
        void writeSettings({ [key]: value });
    };

    return (
        <main className="flex w-72 flex-col gap-4 bg-neutral-950 p-4 font-sans text-neutral-100">
            <header className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                    <img alt="" className="size-6" src="icons/icon-48.png" />
                    <h1 className="text-sm font-semibold tracking-tight">
                        Genius+
                    </h1>
                </span>
                <span className="text-[10px] text-neutral-500">
                    editor tools
                </span>
            </header>

            <div className="relative flex flex-col gap-3">
                {TOGGLES.map((spec) => (
                    <SettingRow
                        checked={settings[spec.key] === true}
                        key={spec.key}
                        onChange={(checked) => toggle(spec.key, checked)}
                        spec={spec}
                    />
                ))}
                {/* A scrim, not `opacity`: an ancestor below full
                    opacity is a backdrop root, and would cut the
                    switches' glass off from the panel behind it. */}
                <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-0 transition-colors ${
                        ready ? "bg-neutral-950/0" : "bg-neutral-950/60"
                    }`}
                />
            </div>
        </main>
    );
};
