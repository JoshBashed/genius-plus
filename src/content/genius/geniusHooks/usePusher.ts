/** Genius's Pusher subscription hook, read at the call. */
import type { UsePusherHook, UsePusherOptions } from "@/bindings";
import { slot } from "../reactHost/binding";

const hook = slot<UsePusherHook>("Genius's usePusher");

export const setUsePusher = hook.set;

/** Whether this page bound it; without it a queued write is never heard. */
export const hasUsePusher = (): boolean => hook.peek() !== null;

export const usePusher = (options: UsePusherOptions): void =>
    hook.get()(options);
