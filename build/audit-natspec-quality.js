#!/usr/bin/env node
// Audit NatSpec quality — find terse, jargon-heavy, or unhelpful descriptions
const fs = require("fs");
const path = require("path");

const registrySource = fs.readFileSync(path.join(__dirname, "..", "src", "abi-registry.js"), "utf8");
const match = registrySource.match(/export const registry = ({[\s\S]*?});/);
const registry = JSON.parse(match[1]);

const issues = [];

for (const [contract, docs] of Object.entries(registry.natspec)) {
  for (const [fnName, doc] of Object.entries(docs)) {
    const notice = doc.notice || "";

    // Flag very short notices (less than 30 chars usually means too terse)
    if (notice && notice.length < 25 && notice.length > 0) {
      issues.push({ contract, fnName, notice, issue: "TOO_SHORT" });
    }

    // Flag notices that just repeat the function name
    if (notice && notice.toLowerCase().replace(/[^a-z]/g, "").includes(fnName.toLowerCase().replace(/[^a-z]/g, ""))) {
      // Only flag if notice is basically just the function name rephrased
      if (notice.length < fnName.length + 20) {
        issues.push({ contract, fnName, notice, issue: "NAME_REPEAT" });
      }
    }

    // Flag missing notice (has details or params but no notice)
    if (!notice && (doc.details || doc.params)) {
      issues.push({ contract, fnName, notice: "(none)", issue: "NO_NOTICE" });
    }
  }
}

// Group by contract
const byContract = {};
for (const issue of issues) {
  if (!byContract[issue.contract]) byContract[issue.contract] = [];
  byContract[issue.contract].push(issue);
}

console.log(`NatSpec Quality Audit — ${issues.length} potential issues found\n`);
for (const [contract, contractIssues] of Object.entries(byContract)) {
  console.log(`${contract}:`);
  for (const issue of contractIssues) {
    console.log(`  ${issue.issue.padEnd(12)} ${issue.fnName}: "${issue.notice}"`);
  }
  console.log("");
}
