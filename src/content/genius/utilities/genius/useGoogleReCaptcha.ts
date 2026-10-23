/** The Google ReCaptcha hook Genius binds on its pages */
import type { UseGoogleReCaptchaResult } from "@/bindings";
import { slot } from "@/content/genius/utilities/slot";

/** Exported whole so an install can record why a lookup failed. */
export const useGoogleReCaptchaSlot = slot<() => UseGoogleReCaptchaResult>(
    "Genius's useGoogleReCaptcha",
);

/**
 * Their Google ReCaptcha hook, which needs no key and no auth of ours.
 */
export const useGoogleReCaptcha = (): UseGoogleReCaptchaResult =>
    useGoogleReCaptchaSlot.get()();
