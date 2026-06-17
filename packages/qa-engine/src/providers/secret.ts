const REDACTED = "[redacted]";

/**
 * Wraps a resolved API key. The raw value is reachable only via `.use()` for the
 * duration of one call; every coercion path a logger might hit — `toString`,
 * `toJSON`/`JSON.stringify`, and `util.inspect`/`console.log` — yields
 * `"[redacted]"`. The value is held in a private field so it cannot be read by
 * enumeration or spreading.
 */
export class Secret {
	readonly #value: string;

	constructor(value: string) {
		this.#value = value;
	}

	/** Run `fn` with the raw value. The only way to read it. */
	use<T>(fn: (value: string) => T): T {
		return fn(this.#value);
	}

	toString(): string {
		return REDACTED;
	}

	toJSON(): string {
		return REDACTED;
	}

	[Symbol.for("nodejs.util.inspect.custom")](): string {
		return REDACTED;
	}
}
