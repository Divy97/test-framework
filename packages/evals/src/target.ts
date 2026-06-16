import type { Target } from "@test-framework/qa-engine";

function assertNever(value: never): never {
	throw new Error(`Unhandled target: ${JSON.stringify(value)}`);
}

/** Stable canonical string for a behavioral target, used in dedup signatures. */
export function targetKey(target: Target): string {
	switch (target.kind) {
		case "ui":
			return `ui:${target.route ?? ""}|${target.component ?? ""}|${target.selector ?? ""}`;
		case "api":
			return `api:${target.method} ${target.path}`;
		case "integration":
			return `integration:${target.system}.${target.operation}`;
		case "generic":
			return `generic:${target.description}`;
		default:
			return assertNever(target);
	}
}
