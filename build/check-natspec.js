#!/usr/bin/env node
// Check which functions are missing NatSpec in the registry
const fs = require("fs");
const path = require("path");

// Load the generated registry as a string and eval the export
const registrySource = fs.readFileSync(path.join(__dirname, "..", "src", "abi-registry.js"), "utf8");
// Extract the JSON from the registry export
const match = registrySource.match(/export const registry = ({[\s\S]*?});/);
if (!match) {
  console.error("Could not parse registry");
  process.exit(1);
}
const registry = JSON.parse(match[1]);

const missing = [];
for (const [name, abi] of Object.entries(registry.contracts)) {
  const fns = abi.filter(e => e.type === "function");
  const documented = registry.natspec[name] || {};
  for (const fn of fns) {
    if (!documented[fn.name]) {
      missing.push(`${name}.${fn.name}`);
    }
  }
}

console.log(`Missing NatSpec (${missing.length} of ${Object.values(registry.contracts).reduce((s, a) => s + a.filter(e => e.type === "function").length, 0)} functions):`);
missing.forEach(m => console.log(`  ${m}`));
