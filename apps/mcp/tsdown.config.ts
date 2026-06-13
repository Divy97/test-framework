import { defineConfig } from "tsdown";

export default defineConfig({
	entry: "./src/index.ts",
	format: "esm",
	fixedExtension: false,
	clean: true,
	// Bundle workspace packages (source-only, multi-file `.js` imports) and the
	// `ignore` dependency into the binary so the published server is
	// self-contained over stdio.
	noExternal: [/^@test-framework\//, "ignore"],
});
