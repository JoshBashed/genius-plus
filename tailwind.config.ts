import type { Config } from "tailwindcss";

/** Tailwind v4 theme; `genius` is the site's yellow and its ink. */
export default {
    content: ["./src/**/*.{ts,tsx,html}"],
    theme: {
        extend: {
            colors: {
                genius: {
                    DEFAULT: "#ffff64",
                    ink: "#14110b",
                    dim: "#c9c94f",
                },
            },
        },
    },
} satisfies Config;
