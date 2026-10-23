/** Typed handles on Genius's bundle; MAIN world only, no `chrome.*`. */

export * from "@/bindings/components";
export {
    type ChunkIndex,
    describeMarkers,
    detectPage,
    type GeniusPage,
    type PageMarkers,
    readChunkIndex,
    resolveChunk,
    resolveChunkMatching,
} from "@/bindings/discovery";
export {
    type BindingError,
    type ChunkError,
    describeBindingError,
    type UnsupportedPageError,
} from "@/bindings/errors";
export {
    displayNameOf,
    findByDisplayName,
    findByKeys,
    findByStyledNamespace,
    findContext,
    findHook,
    isContext,
    isElementType,
    isStyled,
    normaliseDisplayName,
    selectExport,
    unwrapMemo,
} from "@/bindings/finders";
export * from "@/bindings/hooks";
export {
    type Binding,
    getPage,
    loadChunk,
    loadChunkExporting,
    loadChunkMatching,
    resetBindings,
} from "@/bindings/loader";
export { getModal, type ModalProps } from "@/bindings/modal";
export {
    getReact,
    getReactDom,
    getReactDomClient,
    type PageReact,
    type PageReactDom,
    type PageReactDomClient,
    type PageRoot,
} from "@/bindings/react";
export {
    type GeniusTheme,
    getStyledComponents,
    type PageStyledComponents,
    type PageStyledFactory,
    type PageStyledTag,
    type PageStyledValue,
    type ThemeProviderProps,
} from "@/bindings/styled";
export {
    borrowComponent,
    borrowContext,
    borrowFunction,
    borrowModule,
    type ModuleNamespace,
} from "@/bindings/types";
