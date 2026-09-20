/** Apple's token is bound to their own origin, so requests must claim it. */
import { Result } from "@resulted/results";

/**
 * Their web player token carries `root_https_origin: ["apple.com"]`, and
 * amp-api answers 401 to a request whose `Origin` is not under it. The
 * header cannot be set by `fetch`, which forbids that name, so the only
 * way to send it is to rewrite it on the way out.
 */
const APPLE_ORIGIN = "https://music.apple.com";

/** One rule, replaced rather than added to, so a reload cannot stack. */
const RULE_ID = 1;

/** The rule only reaches where a host permission already does. */
const AMP_API = "||amp-api.music.apple.com^";

/** The rule could not be put in place, so amp-api will answer 401. */
export interface OriginRuleError {
    readonly kind: "originRule";
    readonly reason: string;
}

/**
 * Whether Chrome granted the API at all.
 * It is `undefined`, not empty, when the permission is not in the
 * manifest Chrome loaded, which is what an unreloaded extension has.
 */
const available = (): boolean =>
    typeof chrome.declarativeNetRequest?.updateDynamicRules === "function";

/**
 * Puts Apple's own origin on every amp-api request this extension makes.
 * @returns Nothing, or why the rule could not be registered.
 */
export const claimAppleOrigin = async (): Promise<
    Result<null, OriginRuleError>
> => {
    if (!available()) {
        return Result.err({
            kind: "originRule",
            reason:
                "this build needs the declarativeNetRequest permission, " +
                "which Chrome only grants on a reload: open " +
                "chrome://extensions and reload Genius+",
        });
    }

    const written = await Result.try(
        chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [
                {
                    action: {
                        type: "modifyHeaders",
                        requestHeaders: [
                            {
                                header: "origin",
                                operation: "set",
                                value: APPLE_ORIGIN,
                            },
                        ],
                    },
                    condition: {
                        resourceTypes: ["xmlhttprequest"],
                        urlFilter: AMP_API,
                    },
                    id: RULE_ID,
                    priority: 1,
                },
            ],
            removeRuleIds: [RULE_ID],
        }),
    );

    return written.isErr()
        ? Result.err({ kind: "originRule", reason: String(written.error) })
        : Result.ok(null);
};
