declare module "*.css" {
    /** Compiled Tailwind output, injected into shadow roots as text. */
    const css: string;
    export default css;
}
