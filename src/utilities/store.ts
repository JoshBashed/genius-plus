/** A snapshot and a subscription, the pair React's store hook wants. */
export interface Store<T> {
    readonly getSnapshot: () => T;
    readonly subscribe: (listener: () => void) => () => void;
    readonly set: (value: T) => void;
}

/**
 * The smallest store `useSyncExternalStore` will accept.
 * @returns A store whose `set` ignores an `Object.is`-equal value.
 */
export const createStore = <T>(initial: T): Store<T> => {
    let snapshot = initial;
    const listeners = new Set<() => void>();

    return {
        getSnapshot: () => snapshot,
        set: (value: T) => {
            if (Object.is(value, snapshot)) {
                return;
            }
            snapshot = value;
            for (const listener of listeners) {
                listener();
            }
        },
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
};
