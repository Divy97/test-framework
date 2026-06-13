import { PostHog } from "posthog-node";

const client = new PostHog("phc_fixture");

export function isEnabled(flag: string): boolean {
	return Boolean(client) && flag.length > 0;
}
