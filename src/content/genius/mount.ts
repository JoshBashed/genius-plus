/** Mounts the table beside `#application`, never inside their tree. */
import {
    describeMarkers,
    detectPage,
    getButton,
    getDateInput,
    getDropdown,
    getReact,
    getReactDomClient,
    getSelectInput,
    getSmallButton,
    getSpinner,
    getStyledComponents,
    getTagInput,
    getTextInput,
    getUseLanguageOptions,
    type PageRoot,
    resetBindings,
    type SelectOption,
} from "@/bindings";
import { type AppError, describeError } from "@/utilities/result";
import { loadPrimaryTagOptions } from "./options";
import {
    capturePageContexts,
    pageTheme,
    withPageContexts,
} from "./pageContext";
import { isAlbumUrl, readAlbumSeed } from "./pageState";
import { primeReactHost } from "./reactHost/host";
import { primeJsxRuntime } from "./reactHost/jsxRuntime";
import { postStatus } from "./relay";

const CONTAINER_ID = "genius-plus-album-table";

let root: PageRoot | null = null;
let container: HTMLElement | null = null;
let running = false;

/** Bumped by every stop, so a run that lost its document cannot commit. */
let generation = 0;

const ensureContainer = (): HTMLElement => {
    const existing = container ?? document.getElementById(CONTAINER_ID);

    if (existing instanceof HTMLElement) {
        existing.replaceChildren();
        container = existing;
        return existing;
    }

    const created = document.createElement("div");
    created.id = CONTAINER_ID;

    const application = document.querySelector("#application");

    if (application?.parentNode != null) {
        application.parentNode.insertBefore(created, application.nextSibling);
    } else {
        document.body.append(created);
    }

    container = created;
    return created;
};

export const stopAlbumTable = (): void => {
    generation += 1;
    root?.unmount();
    root = null;
    container?.remove();
    container = null;
    running = false;
};

const renderLegacyNotice = (): void => {
    const host = ensureContainer();
    const notice = document.createElement("div");

    notice.setAttribute(
        "style",
        [
            "position: fixed;",
            "z-index: 9999;",
            "top: 0.5rem;",
            "right: 0.5rem;",
            "padding: 1rem;",
            "background: #f0f0f0;",
            "border: 1px solid #000;",
            "box-shadow: 0 0 0.5rem rgba(0, 0, 0, 0.25);",
            "display: flex;",
            "gap: 1rem;",
            "align-items: flex-start;",
        ].join(""),
    );

    const info = document.createElement("div");
    info.setAttribute(
        "style",
        ["display: flex;", "flex-direction: column;", "gap: 0.25rem;"].join(""),
    );

    const heading = document.createElement("strong");
    heading.textContent = "Genius+ not available";

    const body = document.createElement("span");
    body.textContent = "Legacy album page does not use React.";

    info.append(heading, body);

    const close = document.createElement("button");
    close.textContent = "×";
    close.setAttribute(
        "style",
        [
            "background: none;",
            "border: none;",
            "width: 1rem;",
            "height: 1rem;",
            "font-size: 1.5rem;",
            "line-height: 1rem;",
            "cursor: pointer;",
        ].join(""),
    );
    close.addEventListener("click", () => {
        notice.remove();
    });

    notice.append(info, close);

    host.append(notice);
};

const fail = (error: AppError): void => {
    postStatus("failed", describeError(error));
};

/**
 * One start attempt, so `startAlbumTable` alone owns the `running` flag.
 * @param era The generation this run began in; a stop makes it stale.
 * @returns Whether the run left something mounted.
 */
const buildAlbumTable = async (era: number): Promise<boolean> => {
    if (!isAlbumUrl()) {
        postStatus("skipped", `${location.pathname} is not an album page`);
        return false;
    }

    const page = detectPage();

    if (page.isErr()) {
        fail(page.error);
        return false;
    }

    if (page.value.kind === "legacy") {
        renderLegacyNotice();
        postStatus("legacy", describeMarkers(page.value.markers));
        return true;
    }

    const seed = readAlbumSeed();

    if (seed.isErr()) {
        fail(seed.error);
        return false;
    }

    // Started together, awaited one at a time: each narrows separately.
    const pending = {
        button: getButton(),
        dateInput: getDateInput(),
        dom: getReactDomClient(),
        dropdown: getDropdown(),
        primaryTags: loadPrimaryTagOptions(),
        react: getReact(),
        selectInput: getSelectInput(),
        smallButton: getSmallButton(),
        spinner: getSpinner(),
        jsxRuntime: primeJsxRuntime(),
        styled: getStyledComponents(),
        tagInput: getTagInput(),
        textInput: getTextInput(),
        useLanguageOptions: getUseLanguageOptions(),
    };

    const react = await pending.react;
    if (react.isErr()) {
        fail(react.error);
        return false;
    }

    const dom = await pending.dom;
    if (dom.isErr()) {
        fail(dom.error);
        return false;
    }

    // Every JSX expression below reads this runtime synchronously.
    const jsxRuntime = await pending.jsxRuntime;
    if (jsxRuntime.isErr()) {
        fail(jsxRuntime.error);
        return false;
    }

    const styled = await pending.styled;
    if (styled.isErr()) {
        fail(styled.error);
        return false;
    }

    const textInput = await pending.textInput;
    if (textInput.isErr()) {
        fail(textInput.error);
        return false;
    }

    const tagInput = await pending.tagInput;
    if (tagInput.isErr()) {
        fail(tagInput.error);
        return false;
    }

    const selectInput = await pending.selectInput;
    if (selectInput.isErr()) {
        fail(selectInput.error);
        return false;
    }

    const dateInput = await pending.dateInput;
    if (dateInput.isErr()) {
        fail(dateInput.error);
        return false;
    }

    const button = await pending.button;
    if (button.isErr()) {
        fail(button.error);
        return false;
    }

    const smallButton = await pending.smallButton;
    if (smallButton.isErr()) {
        fail(smallButton.error);
        return false;
    }

    const spinner = await pending.spinner;
    if (spinner.isErr()) {
        fail(spinner.error);
        return false;
    }

    // Non-fatal: without it the column header menus simply do not render.
    const dropdown = await pending.dropdown;

    const captured = capturePageContexts();
    const theme = pageTheme(captured, styled.value.ThemeContext);

    if (theme.isErr()) {
        fail(theme.error);
        return false;
    }

    // A missing language list costs that column its choices, nothing more.
    const languageHook = await pending.useLanguageOptions;
    const useLanguageOptions: () => readonly SelectOption[] =
        languageHook.isOk() ? languageHook.value : () => [];

    const primaryTagOptions = await pending.primaryTags;

    // A restart while those loaded: these are the old document's chunks.
    if (era !== generation) {
        return false;
    }

    primeReactHost({
        Button: button.value,
        DateInput: dateInput.value,
        Dropdown: dropdown.isOk() ? dropdown.value : null,
        react: react.value,
        SelectInput: selectInput.value,
        SmallButton: smallButton.value,
        Spinner: spinner.value,
        styled: styled.value.styled,
        TagInput: tagInput.value,
        TextInput: textInput.value,
        theme: theme.value,
    });

    // Eager, so it stays in this bundle but evaluates only once primed.
    const { SongTable } = await import(
        /* webpackMode: "eager" */ "./songTable"
    );

    if (era !== generation) {
        return false;
    }

    const tree = withPageContexts(
        react.value,
        captured,
        // Belt and braces, in case the walk missed their provider.
        react.value.createElement(
            styled.value.ThemeProvider,
            { theme: theme.value },
            react.value.createElement(SongTable, {
                album: seed.value,
                primaryTagOptions,
                useLanguageOptions,
            }),
        ),
    );

    root = dom.value.createRoot(ensureContainer());
    root.render(tree);
    postStatus("rendered", `${seed.value.tracks.length} songs`);
    return true;
};

/** Safe to call twice; a second call is a no-op until stopped. */
export const startAlbumTable = async (): Promise<void> => {
    if (running) {
        return;
    }

    running = true;
    const era = generation;
    const mounted = await buildAlbumTable(era);

    // A restart owns the flag now, so this run must not touch it.
    if (era === generation) {
        running = mounted;
    }
};

/** Rebuilds everything: a new document has new chunk hashes. */
export const restartAlbumTable = async (): Promise<void> => {
    stopAlbumTable();
    resetBindings();
    postStatus("removed", location.pathname);
    await startAlbumTable();
};
