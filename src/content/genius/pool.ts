/** A bounded worker pool, shared by the metadata reads and the writes. */

/**
 * Runs `worker` over `items` with at most `limit` calls in flight.
 * @param worker Must settle rather than reject; a rejection aborts the pool.
 */
export const drain = async <T>(
    items: readonly T[],
    limit: number,
    worker: (item: T) => Promise<void>,
): Promise<void> => {
    // One shared iterator, so an `undefined` element is a value, not an end.
    const queue = items.values();

    const pull = async (): Promise<void> => {
        for (const item of queue) {
            await worker(item);
        }
    };

    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, pull),
    );
};
