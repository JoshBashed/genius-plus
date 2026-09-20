/** Genius's Pusher subscription hook, read at the call. */
import type { UsePusherHook, UsePusherOptions } from "@/bindings";
import { slot } from "../reactHost/binding";

export const usePusherSlot = slot<UsePusherHook>("Genius's usePusher");

export const setUsePusher = usePusherSlot.set;

/** Whether this page bound it; without it a queued write is never heard. */
export const hasUsePusher = (): boolean => usePusherSlot.peek() !== null;

export const usePusher = (options: UsePusherOptions): void =>
    usePusherSlot.get()(options);
