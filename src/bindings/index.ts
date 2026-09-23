/** Typed handles on Genius's bundle; MAIN world only, no `chrome.*`. */

export * from "./components";
export {
    borrowChunks,
    type ChunkIndex,
    describeMarkers,
    detectPage,
    type GeniusPage,
    type PageMarkers,
    readChunkUrls,
    resolveChunk,
    resolveChunkMatching,
} from "./discovery";
export {
    type BindingError,
    type ChunkError,
    describeBindingError,
    type UnsupportedPageError,
} from "./errors";
export {
    displayNameOf,
    findByDisplayName,
    findByKeys,
    findByPropTypes,
    findByStyledNamespace,
    findContext,
    findDeviceComponent,
    findHook,
    isContext,
    isElementType,
    isStyled,
    normaliseDisplayName,
    selectExport,
    unwrapMemo,
} from "./finders";
export * from "./hooks";
export {
    type Binding,
    getPage,
    loadChunk,
    loadChunkMatching,
    loadChunkUrl,
    resetBindings,
} from "./loader";
export { getModal, type ModalProps } from "./modal";
export {
    getReact,
    getReactDom,
    getReactDomClient,
    type PageReact,
    type PageReactDom,
    type PageReactDomClient,
    type PageRoot,
} from "./react";
export {
    type GeniusTheme,
    getStyledComponents,
    type PageStyledComponents,
    type PageStyledFactory,
    type PageStyledTag,
    type PageStyledValue,
    type ThemeProviderProps,
} from "./styled";
export {
    asPageValue,
    type ModuleNamespace,
    type PageComponent,
    type PageContext,
    type PageElement,
    type PageNode,
    type PageSyntheticEvent,
} from "./types";
