/** Shapes shared by the bindings: a chunk's namespace, and the one cast. */

/** The namespace object a dynamic `import()` resolves to. */
export type ModuleNamespace = Readonly<Record<string, unknown>>;

/** Asserts the shape a finder proved. Every cast goes through here. */
export const asPageValue = <T>(value: unknown): T => value as T;
