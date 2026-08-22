import { assertObjectJsonSchema, assertSupportedJsonSchema } from "@deepseek-ai/dsh-tools";
//#region src/host/tools/register-project-tools.ts
function isObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function assertSchema(assertion, value, label) {
	try {
		assertion(value);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new TypeError(`${label} is invalid: ${detail}`);
	}
}
function validateDefinition(definition, index, names) {
	if (!isObject(definition)) throw new TypeError(`project Tool definition ${index} must be an object`);
	const name = definition.name;
	if (typeof name !== "string" || name.trim().length === 0) throw new TypeError(`project Tool definition ${index} must have a non-empty name`);
	if (names.has(name)) throw new TypeError(`duplicate project Tool name: ${name}`);
	names.add(name);
	if (typeof definition.description !== "string" || definition.description.trim().length === 0) throw new TypeError(`project Tool ${name} must have a non-empty description`);
	assertSchema(assertObjectJsonSchema, definition.parameters, `project Tool ${name} input schema`);
	const output = definition.output;
	if (!isObject(output)) throw new TypeError(`project Tool ${name} output schema is required`);
	assertSchema(assertSupportedJsonSchema, output.schema, `project Tool ${name} output schema`);
}
function disposeInReverse(disposers) {
	let firstError;
	for (let index = disposers.length - 1; index >= 0; index -= 1) try {
		disposers[index]();
	} catch (error) {
		firstError ??= error;
	}
	if (firstError !== void 0) throw firstError;
}
/**
* Register all project-owned Tools through the single Harness registration seam.
* The returned disposer is safe to call more than once and unregisters in reverse order.
*/
function registerProjectTools(ctx, definitions) {
	const names = /* @__PURE__ */ new Set();
	for (const [index, definition] of definitions.entries()) validateDefinition(definition, index, names);
	const disposers = [];
	try {
		for (const definition of definitions) disposers.push(ctx.tools.register(definition));
	} catch (error) {
		try {
			disposeInReverse(disposers);
		} catch (cleanupError) {
			throw new AggregateError([error, cleanupError], "project Tool registration and rollback failed");
		}
		throw error;
	}
	let disposed = false;
	return () => {
		if (disposed) return;
		disposed = true;
		disposeInReverse(disposers);
	};
}
//#endregion
//#region src/agent/plugin.ts
const definitions = [];
const name = "harness-comfyui/agent";
const inject = ["tools"];
/** Restrict inherited Tools before registering this Agent Preset's project Tools. */
function apply(ctx) {
	ctx.effect(() => {
		const disposeRestriction = ctx.tools.restrict({ allow: [] });
		let disposeProjectTools;
		try {
			disposeProjectTools = registerProjectTools(ctx, definitions);
		} catch (error) {
			disposeRestriction();
			throw error;
		}
		return () => {
			disposeProjectTools?.();
			disposeRestriction();
		};
	}, "project Agent Tool registry");
}
//#endregion
export { apply, inject, name };
