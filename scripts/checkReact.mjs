/** Fails the build if our React reaches the Genius content scripts. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
/**
 * Where an import of each module is refused. `react` itself is allowed
 * under `src/content/genius`, because rspack resolves it to their React.
 */
const SOURCE_DIRS = [
    { dir: "src/content/genius", allowed: ["react"] },
    { dir: "src/bindings", allowed: [] },
];
const BUNDLES = [
    "dist/content/genius.js",
    "dist/content/genius-main.js",
    "dist/content/genius-early.js",
];

/**
 * The three ways `react` gets in, anchored to specifier position.
 * `import type` is erased at build, so it brings in nothing.
 */
const FORBIDDEN_PATTERNS = [
    /^\s*(?:import|export)\s(?!type\s)[^;]*?\bfrom\s*["'](react|react-dom)(\/[^"']*)?["']/gm,
    /^\s*import\s*["'](react|react-dom)(\/[^"']*)?["']/gm,
    /\b(?:require|import)\(\s*["'](react|react-dom)(\/[^"']*)?["']\s*\)/g,
];

/** Strings React ships; minifiers never rewrite string literals. */
const REACT_MARKERS = [
    "react.transitional.element",
    "__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE",
    "__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED",
    "Minified React error #",
];

const walk = (dir) => {
    const found = [];

    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);

        if (statSync(path).isDirectory()) {
            found.push(...walk(path));
        } else if (/\.[jt]sx?$/.test(entry)) {
            found.push(path);
        }
    }

    return found;
};

const problems = [];

for (const { dir, allowed } of SOURCE_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
        const source = readFileSync(file, "utf8");

        for (const pattern of FORBIDDEN_PATTERNS) {
            for (const match of source.matchAll(pattern)) {
                const module = `${match[1]}${match[2] ?? ""}`;

                if (allowed.includes(module)) {
                    continue;
                }

                problems.push(`${relative(ROOT, file)} imports "${module}"`);
            }
        }
    }
}

for (const bundle of BUNDLES) {
    let source;

    try {
        source = readFileSync(join(ROOT, bundle), "utf8");
    } catch {
        problems.push(`${bundle} was not emitted`);
        continue;
    }

    for (const marker of REACT_MARKERS) {
        if (source.includes(marker)) {
            problems.push(`${bundle} contains React (${marker})`);
        }
    }
}

if (problems.length > 0) {
    console.error("React leaked into the Genius content scripts:");

    for (const problem of problems) {
        console.error(`  - ${problem}`);
    }

    process.exit(1);
}

console.info(
    `check-react: ${BUNDLES.join(", ")} carry no React, and no file under ${SOURCE_DIRS.map((entry) => entry.dir).join(" or ")} imports it`,
);
