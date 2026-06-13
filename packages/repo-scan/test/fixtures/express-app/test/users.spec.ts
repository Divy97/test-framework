import router from "../src/routes/users.js";

test("router is defined", () => {
	if (!router) {
		throw new Error("router missing");
	}
});
