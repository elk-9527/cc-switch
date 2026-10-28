// Run against an isolated installation of the official DSH packages, never a user's profile.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const [modules, fixture] = process.argv.slice(2);
if (!modules || !fixture)
  throw new Error(
    "Usage: node scripts/validate-dsh-native.mjs <node_modules> <fixture.json>",
  );
const requireNative = createRequire(resolve(modules, "validation.cjs"));
const { load } = requireNative("js-yaml");
const { composeEntries } = await import(
  pathToFileURL(requireNative.resolve("@deepseek-ai/dsh-app-boot"))
);
const { Config, apply } = await import(
  pathToFileURL(requireNative.resolve("@deepseek-ai/dsh-llm-pi-ai"))
);
const snapshots = JSON.parse(await readFile(fixture, "utf8"));
const base = [
  {
    id: "llm-pi-ai",
    name: "@deepseek-ai/dsh-llm-pi-ai",
    config: { providers: {} },
  },
  { id: "agent-default-model", name: "default-model", config: {} },
];
for (const stage of ["added", "edited", "removed"]) {
  const warnings = [];
  const plugins = composeEntries(
    [[{ insert: base }], load(snapshots[stage])],
    (warning) => warnings.push(warning),
  );
  assert.deepEqual(warnings, [], `${stage}: native loader warnings`);
  const llm = plugins.find((plugin) => plugin.id === "llm-pi-ai");
  const validated = Config(llm.config);
  let adapter;
  const directory = [];
  // The real plugin and model adapter run with an in-memory host seam. No
  // inference, login, user credentials or filesystem services are invoked.
  const host = {
    fiber: { entry: { options: { id: "llm-pi-ai" } } },
    inject() {},
    on() {},
    get(service) {
      return service === "credentials"
        ? {
            resolve: async () => ({ value: "native-validation-key" }),
            readRecord: async () => undefined,
            listRecords: async () => [],
          }
        : undefined;
    },
    logger: {
      warn() {},
      error(error) {
        throw error;
      },
    },
    llm: {
      registerConfigurableProviders(entries) {
        directory.push(...entries);
        return { replace() {} };
      },
      registerModelDiscovery() {},
      registerAdapter(_routes, value) {
        adapter = value;
        return { replace() {} };
      },
    },
  };
  apply(host, validated);
  const providers = validated.providers.get();
  for (const provider of Object.keys(providers)) {
    assert.ok(
      directory.some((entry) => entry.provider === provider),
      `${stage}: ${provider} is registered in the native provider directory`,
    );
    const models = await adapter.listModels(provider);
    assert.ok(
      models.some((model) => model.id === "model"),
      `${stage}: ${provider} is visible to the native model catalog`,
    );
  }
  assert.equal(Object.keys(providers).length, stage === "removed" ? 2 : 3);
  const defaults = plugins.find(
    (plugin) => plugin.id === "agent-default-model",
  ).config;
  assert.equal(defaults.provider, "native-provider");
  assert.equal(defaults.model, "native-model");
  assert.equal(
    plugins.filter((plugin) => plugin.name === "@deepseek-ai/dsh-mcp-client")
      .length,
    stage === "removed" ? 0 : 1,
  );
  if (stage === "edited")
    assert.equal(providers.chat.baseURL, "https://updated.example/v1");
  console.log(
    `${stage}: native profile composition and provider schema accepted`,
  );
}
console.log(
  "DSH native acceptance passed (three protocols, MCP lifecycle, defaults preserved).",
);
