/**
 * High-precision secret detectors. These intentionally match real credential
 * shapes (private keys, provider/cloud tokens) and NOT generic `password:` fields,
 * because legitimate test data in a graph contains synthetic passwords. False
 * positives are surfaced in the result and the pattern set is tunable.
 */
const PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
	{ name: "pem-private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
	{ name: "aws-access-key-id", re: /\bAKIA[0-9A-Z]{16}\b/ },
	{ name: "aws-secret-access-key", re: /\bAWS_SECRET_ACCESS_KEY\b/ },
	{ name: "slack-token", re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
	{
		name: "jwt",
		re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
	},
	{ name: "provider-api-key", re: /\bsk-(ant-)?[A-Za-z0-9_-]{16,}\b/ },
	{ name: "provider-key-env", re: /\b(ANTHROPIC|OPENAI)_API_KEY\b/ },
];

/** Returns the sorted names of every secret pattern that matches the text. */
export function detectLeakage(text: string): string[] {
	const hits: string[] = [];
	for (const pattern of PATTERNS) {
		if (pattern.re.test(text)) hits.push(pattern.name);
	}
	return hits.sort();
}
