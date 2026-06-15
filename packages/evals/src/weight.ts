import type { Priority, Risk } from "@test-framework/qa-engine";
import type { Rubric } from "./schema/rubric.js";

/** Risk-and-priority weight for one Ground Truth item; range 1..12 by default. */
export function itemWeight(
	rubric: Rubric,
	risk: Risk,
	priority: Priority,
): number {
	return rubric.riskWeight[risk] * rubric.priorityWeight[priority];
}
