/**
 * Refraction fields for a liquid glass panel.
 *
 * The panel is a flat slab of thickness `T` with a bezel around its
 * outline: a band of width `B` where the top surface rises `p(t) * B`
 * above the slab. A vertical viewing ray only bends where that surface is
 * sloped, so the sideways offset depends on nothing but the distance to
 * the outline, and the whole field reduces to a one dimensional table
 * wrapped around the shape by its signed distance.
 */

/** Shape of the bezel's top surface, as a normalised height. */
export type GlassProfile = "circular" | "squircular" | "concave" | "lip";

/** Everything baked into the generated images; change it, regenerate. */
export interface GlassSpec {
    readonly width: number;
    readonly height: number;
    readonly radius: number;
    /** Width of the curved band, and its height. Both scale with it. */
    readonly bezel: number;
    /** Flat slab below the bezel; scales offsets, changes no angle. */
    readonly thickness: number;
    readonly profile: GlassProfile;
    readonly refractiveIndex: number;
    /** Specular direction in degrees, counter clockwise, y up. */
    readonly highlightAngle: number;
    /** Width of the specular thread in px, measured at 2 on the source. */
    readonly highlightWidth: number;
    /** Supersampling of the generated maps. */
    readonly resolution: number;
}

/** The sampled refraction table, plus what it was normalised against. */
export interface GlassField {
    /** Offsets in `[-1, 1]`, positive toward the panel's interior. */
    readonly offsets: readonly number[];
    /** Largest offset in px, which turns `offsets` back into pixels. */
    readonly peak: number;
}

/** A generated pair of maps, ready for `<feImage href>`. */
export interface GlassImages {
    readonly displacement: string;
    readonly specular: string;
    readonly peak: number;
}

/** Table size. Anything from 128 up behaves identically. */
const SAMPLES = 128;

/** Forward difference step for the profile's derivative. */
const DERIVATIVE_STEP = 1e-4;

/** Neutral displacement, and the swing either side of it. */
const NEUTRAL = 128;
const SWING = 127;

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

const circleArc = (u: number): number =>
    Math.sqrt(Math.max(0, 1 - (1 - u) ** 2));

/** Written with `|1 - u|` so the lip can evaluate it past 1. */
const squircle = (u: number): number =>
    Math.max(0, 1 - Math.abs(1 - u) ** 4) ** 0.25;

const smootherstep = (u: number): number => u * u * u * (u * (u * 6 - 15) + 10);

/**
 * Convex ridge in the outer fifth, concave tail after it.
 *
 * The convex term runs at twice the normalised distance, so it is a hump
 * that has fallen back to zero by the bezel's inner end, and the concave
 * term keeps a tenth of the bezel height there rather than returning to
 * the slab.
 */
const lip = (t: number): number =>
    squircle(2 * t) * (1 - smootherstep(t)) +
    (1 - circleArc(t) + 0.1) * smootherstep(t);

const PROFILES: Record<GlassProfile, (t: number) => number> = {
    circular: circleArc,
    concave: (t) => 1 - circleArc(t),
    lip,
    squircular: squircle,
};

/** A bezel wider than this overlaps itself and the 1D model breaks. */
const usableBezel = (spec: GlassSpec): number =>
    Math.max(
        0.001,
        Math.min(spec.bezel, Math.min(spec.width, spec.height) / 2),
    );

/**
 * Refracts one vertical ray through the bezel at normalised depth `t`.
 * @returns The sideways offset in px, positive toward the interior.
 */
const offsetAt = (
    profile: (t: number) => number,
    t: number,
    bezel: number,
    thickness: number,
    refractiveIndex: number,
): number => {
    const height = profile(t);
    const slope = (profile(t + DERIVATIVE_STEP) - height) / DERIVATIVE_STEP;
    const length = Math.sqrt(slope * slope + 1);
    const normalX = -slope / length;
    const normalY = -1 / length;
    const eta = 1 / refractiveIndex;
    const cosine = normalY;
    const inside = 1 - eta * eta * (1 - cosine * cosine);

    if (inside < 0) {
        // Total internal reflection: no ray reaches the backdrop.
        return 0;
    }

    const bend = eta * cosine + Math.sqrt(inside);
    const rayX = -bend * normalX;
    const rayY = eta - bend * normalY;

    // The path is the bezel's own rise plus the slab underneath it, so it
    // never falls to zero and the offset survives at the outline.
    return (rayX * (height * bezel + thickness)) / rayY;
};

/** Tabulates the refraction across the bezel for one geometry. */
export const buildField = (spec: GlassSpec): GlassField => {
    const profile = PROFILES[spec.profile];
    const bezel = usableBezel(spec);
    const offsets: number[] = [];
    let peak = 0;

    for (let index = 0; index < SAMPLES; index++) {
        const offset = offsetAt(
            profile,
            index / SAMPLES,
            bezel,
            spec.thickness,
            spec.refractiveIndex,
        );

        offsets.push(offset);
        peak = Math.max(peak, Math.abs(offset));
    }

    return {
        offsets: peak === 0 ? offsets : offsets.map((it) => it / peak),
        peak,
    };
};

interface MapGeometry {
    readonly width: number;
    readonly height: number;
    readonly radius: number;
    readonly bezel: number;
    readonly resolution: number;
}

/** Map dimensions and geometry, all in supersampled buffer pixels. */
const mapGeometry = (spec: GlassSpec): MapGeometry => {
    const resolution = Math.max(1, Math.round(spec.resolution));
    const width = Math.max(1, Math.round(spec.width * resolution));
    const height = Math.max(1, Math.round(spec.height * resolution));
    const half = Math.min(width, height) / 2;

    return {
        bezel: Math.min(usableBezel(spec) * resolution, half),
        height,
        radius: Math.min(spec.radius * resolution, half),
        resolution,
        width,
    };
};

/**
 * Fills both maps in one pass over the panel.
 *
 * Each pixel folds into its nearest corner circle, which is the rounded
 * rectangle's distance field written without the branches. Only the bezel
 * band is written, plus a one pixel overshoot that fades out to
 * antialias the outline; everything else keeps the value it was cleared
 * to, because the lip profile is far from zero at the outline and relying
 * on the clamp would paint the whole outside at near peak displacement.
 */
const paint = (
    spec: GlassSpec,
    field: GlassField,
    geometry: MapGeometry,
    displacement: ImageData,
    specular: ImageData,
): void => {
    const { bezel, height, radius, resolution, width } = geometry;
    const inner = Math.max(0, radius - bezel) ** 2;
    const outer = (radius + 1) ** 2;
    const angle = (spec.highlightAngle * Math.PI) / 180;
    const lightX = Math.cos(angle);
    const lightY = Math.sin(angle);
    const threadHalf = Math.max(0.001, spec.highlightWidth) / 2;

    for (let index = 0; index < width * height; index++) {
        const column = index % width;
        const row = Math.floor(index / width);
        const at = index * 4;

        displacement.data[at] = NEUTRAL;
        displacement.data[at + 1] = NEUTRAL;
        displacement.data[at + 2] = 0;
        displacement.data[at + 3] = 255;

        let x = 0;
        let y = 0;

        if (column < radius) {
            x = column - radius;
        } else if (column >= width - radius) {
            x = column - radius - (width - 2 * radius);
        }

        if (row < radius) {
            y = row - radius;
        } else if (row >= height - radius) {
            y = row - radius - (height - 2 * radius);
        }

        const squared = x * x + y * y;

        if (squared < inner || squared > outer) {
            continue;
        }

        const distance = Math.sqrt(squared);
        const depth = radius - distance;
        const fade = clamp01(radius + 1 - distance);
        const table = field.offsets;
        const slot = Math.min(
            SAMPLES - 1,
            Math.floor(clamp01(depth / bezel) * SAMPLES),
        );
        const offset = table[slot] ?? 0;
        const inwardX = distance === 0 ? 0 : -x / distance;
        const inwardY = distance === 0 ? 0 : -y / distance;

        displacement.data[at] = NEUTRAL + SWING * offset * inwardX * fade;
        displacement.data[at + 1] = NEUTRAL + SWING * offset * inwardY * fade;

        // A single direction with its sign thrown away lights both of the
        // opposing sides, and the falloff is a half circle bump a couple
        // of px deep rather than anything spread across the bezel.
        const align =
            distance === 0
                ? 0
                : Math.abs((x / distance) * lightX - (y / distance) * lightY);
        const ramp = depth / resolution / threadHalf;
        const edge = Math.sqrt(Math.max(0, 1 - (1 - ramp) ** 2));
        const coefficient = align * edge;

        specular.data[at] = 255 * coefficient;
        specular.data[at + 1] = 255 * coefficient;
        specular.data[at + 2] = 255 * coefficient;
        specular.data[at + 3] = 255 * coefficient * coefficient * fade;
    }
};

/** Renders both maps to data URLs, or `null` without a 2D context. */
const render = (spec: GlassSpec): GlassImages | null => {
    const geometry = mapGeometry(spec);
    const canvas = document.createElement("canvas");
    canvas.width = geometry.width;
    canvas.height = geometry.height;

    const context = canvas.getContext("2d");

    if (context === null) {
        return null;
    }

    const field = buildField(spec);
    const displacement = context.createImageData(
        geometry.width,
        geometry.height,
    );
    const specular = context.createImageData(geometry.width, geometry.height);

    paint(spec, field, geometry, displacement, specular);

    context.putImageData(displacement, 0, 0);
    const displacementUrl = canvas.toDataURL();
    context.putImageData(specular, 0, 0);

    return {
        displacement: displacementUrl,
        peak: field.peak,
        specular: canvas.toDataURL(),
    };
};

/**
 * Turns a peak offset in px into a `feDisplacementMap` scale.
 *
 * The filter fetches from `scale * (channel - 0.5)`, so a full channel
 * spans `±scale/2` and reaching `peak` px needs twice it. Measured in
 * Chrome: a saturated red channel at `scale = 40` moves the backdrop
 * exactly 20 px.
 */
export const displacementScale = (peak: number, strength: number): number =>
    2 * peak * strength;

const cache = new Map<string, GlassImages | null>();

/**
 * Generates the maps for one geometry, reusing an earlier pass.
 * @returns `null` when no canvas is available, so callers can degrade.
 */
export const glassImages = (spec: GlassSpec): GlassImages | null => {
    const key = [
        spec.width,
        spec.height,
        spec.radius,
        spec.bezel,
        spec.thickness,
        spec.profile,
        spec.refractiveIndex,
        spec.highlightAngle,
        spec.highlightWidth,
        spec.resolution,
    ].join("|");

    const cached = cache.get(key);

    if (cached !== undefined) {
        return cached;
    }

    const made = render(spec);
    cache.set(key, made);
    return made;
};
