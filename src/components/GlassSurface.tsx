import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import {
    displacementScale,
    type GlassProfile,
    type GlassSpec,
    glassImages,
} from "./liquidGlass";

/** Appearance of a panel of glass, independent of what sits on it. */
export interface GlassOptions {
    readonly profile: GlassProfile;
    readonly bezel: number;
    readonly thickness: number;
    readonly refractiveIndex: number;
    readonly highlightAngle: number;
    readonly highlightWidth: number;
    readonly resolution: number;
    /** Softening applied to the backdrop before it is displaced. */
    readonly blur: number;
    /** Saturation boost, masked to the rim thread rather than global. */
    readonly saturation: number;
    /** Alpha multiplier on the specular thread. */
    readonly highlightOpacity: number;
    /** Multiplied into the refracted backdrop, the way glass absorbs. */
    readonly tint?: string;
    /**
     * Screened over the tint, which lifts the darks and leaves the
     * highlights alone. A multiply can only ever darken, so this is what
     * keeps a tinted panel bright over a near black backdrop.
     */
    readonly lift?: string;
}

/**
 * Ids must be unique per instance and resolvable from whichever tree the
 * surface mounts into, so they are counted here rather than taken from
 * `useId`, whose React 19 output is awkward inside a `url(#…)` fragment.
 */
const SALT = Math.random().toString(36).slice(2, 8);

let counter = 0;

const nextFilterId = (): string => {
    counter += 1;
    return `genius-glass-${SALT}-${counter}`;
};

interface GlassFilterProps {
    readonly id: string;
    readonly displacement: string;
    readonly specular: string;
    readonly width: number;
    readonly height: number;
    readonly scale: number;
    readonly glass: GlassOptions;
}

/**
 * Soften, bend, colour the glass, then two passes of the rim thread.
 *
 * The tint multiplies the refracted backdrop rather than covering it, so
 * the panel takes its colour the way stained glass does and the bent
 * texture survives, and the lift screens a floor back under it. The
 * saturation boost is clipped to the
 * thread's own alpha rather than applied to the panel, so it reads as a
 * thin iridescent edge, and the white highlight is laid over that at half
 * alpha. Both blends paint straight over; the thread's alpha is what
 * keeps them from flattening the refraction underneath.
 */
const GlassFilter = ({
    displacement,
    glass,
    height,
    id,
    scale,
    specular,
    width,
}: GlassFilterProps) => {
    const stained = glass.tint === undefined ? "bent" : "cast";
    const panel = glass.lift === undefined ? stained : "lifted";

    return (
        <svg
            aria-hidden="true"
            className="hidden"
            colorInterpolationFilters="sRGB"
        >
            <filter id={id}>
                <feGaussianBlur
                    in="SourceGraphic"
                    result="soft"
                    stdDeviation={glass.blur}
                />
                <feImage
                    height={height}
                    href={displacement}
                    preserveAspectRatio="none"
                    result="map"
                    width={width}
                    x={0}
                    y={0}
                />
                <feDisplacementMap
                    in="soft"
                    in2="map"
                    result="bent"
                    scale={scale}
                    xChannelSelector="R"
                    yChannelSelector="G"
                />
                {glass.tint !== undefined && (
                    <feFlood floodColor={glass.tint} result="tint" />
                )}
                {glass.tint !== undefined && (
                    // Premultiplied `i1 * i2`, which is a plain multiply
                    // that leaves the backdrop's own alpha alone.
                    <feComposite
                        in="tint"
                        in2="bent"
                        k1={1}
                        k2={0}
                        k3={0}
                        k4={0}
                        operator="arithmetic"
                        result="cast"
                    />
                )}
                {glass.lift !== undefined && (
                    <feFlood floodColor={glass.lift} result="floor" />
                )}
                {glass.lift !== undefined && (
                    <feBlend
                        in="floor"
                        in2={stained}
                        mode="screen"
                        result="lifted"
                    />
                )}
                <feColorMatrix
                    in={panel}
                    result="vivid"
                    type="saturate"
                    values={`${glass.saturation}`}
                />
                <feImage
                    height={height}
                    href={specular}
                    preserveAspectRatio="none"
                    result="rim"
                    width={width}
                    x={0}
                    y={0}
                />
                <feComposite
                    in="vivid"
                    in2="rim"
                    operator="in"
                    result="rimColour"
                />
                <feComponentTransfer in="rim" result="rimWhite">
                    <feFuncA slope={glass.highlightOpacity} type="linear" />
                </feComponentTransfer>
                <feBlend
                    in="rimColour"
                    in2={panel}
                    mode="normal"
                    result="stage1"
                />
                <feBlend in="rimWhite" in2="stage1" mode="normal" />
            </filter>
        </svg>
    );
};

export interface GlassSurfaceProps {
    readonly width: number;
    readonly height: number;
    /** Corner radius, which is half the height for a lozenge. */
    readonly radius: number;
    readonly glass: GlassOptions;
    /** Fraction of the computed peak displacement to deliver. */
    readonly strength: number;
    readonly className?: string;
    /** Merged under the backdrop filter, for background and transform. */
    readonly style?: CSSProperties;
    readonly children?: ReactNode;
}

/**
 * A panel that refracts whatever the page paints behind it.
 *
 * The filter is part of the component rather than the document, because
 * `url(#…)` resolves against the containing tree and the surface has to
 * work inside a shadow root. Everything else belongs to the caller: the
 * element carries only the backdrop filter, so any background, shadow, or
 * transform layers over the refraction in the usual order.
 */
export const GlassSurface = ({
    children,
    className,
    glass,
    height,
    radius,
    strength,
    style,
    width,
}: GlassSurfaceProps) => {
    const [filterId] = useState(nextFilterId);
    const spec: GlassSpec = {
        bezel: glass.bezel,
        height,
        highlightAngle: glass.highlightAngle,
        highlightWidth: glass.highlightWidth,
        profile: glass.profile,
        radius,
        refractiveIndex: glass.refractiveIndex,
        resolution: glass.resolution,
        thickness: glass.thickness,
        width,
    };
    const images = glassImages(spec);

    return (
        <>
            {images !== null && (
                <GlassFilter
                    displacement={images.displacement}
                    glass={glass}
                    height={height}
                    id={filterId}
                    scale={displacementScale(images.peak, strength)}
                    specular={images.specular}
                    width={width}
                />
            )}
            <span
                className={className}
                style={{
                    ...style,
                    backdropFilter:
                        images === null ? undefined : `url(#${filterId})`,
                }}
            >
                {children}
            </span>
        </>
    );
};
