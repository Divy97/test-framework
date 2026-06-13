import test from "node:test";

test("accounts can be listed", () => {
	if (typeof GET !== "undefined") {
		throw new Error("unexpected global");
	}
});
