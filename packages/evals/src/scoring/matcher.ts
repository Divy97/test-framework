import type { Assertion } from "@test-framework/qa-engine";

/** Matchers that only check presence/visibility, carrying no expected value. */
const PRESENCE_MATCHERS = new Set([
	"exists",
	"notExists",
	"visible",
	"hidden",
	"enabled",
	"disabled",
]);

export function isPresenceMatcher(assertion: Assertion): boolean {
	return PRESENCE_MATCHERS.has(assertion.matcher);
}

/** A specific assertion has a value/pattern/schema matcher on a concrete target. */
export function isSpecificAssertion(assertion: Assertion): boolean {
	return (
		!isPresenceMatcher(assertion) &&
		assertion.observationPoint.kind !== "generic"
	);
}
