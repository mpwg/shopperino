import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { describe, it } from "node:test";

type DependencyRule = {
  root: string;
  forbiddenTargets: string[];
  forbiddenSpecifiers: string[];
};

const repoRoot = resolve(import.meta.dirname, "../..");
const rules: DependencyRule[] = [
  {
    root: "packages/core",
    forbiddenTargets: ["packages/application", "packages/db", "apps"],
    forbiddenSpecifiers: ["node:sqlite"],
  },
  {
    root: "packages/application",
    forbiddenTargets: ["packages/db", "apps"],
    forbiddenSpecifiers: ["node:sqlite"],
  },
];

describe("architecture dependency rules", () => {
  for (const rule of rules) {
    it(`${rule.root} does not import forbidden layers`, () => {
      const rootPath = resolve(repoRoot, rule.root);
      const violations: string[] = [];

      for (const filePath of listTypeScriptFiles(rootPath)) {
        const source = readFileSync(filePath, "utf8");
        for (const specifier of importSpecifiers(source)) {
          const relativeFile = relative(repoRoot, filePath);

          if (rule.forbiddenSpecifiers.includes(specifier)) {
            violations.push(`${relativeFile} imports ${specifier}`);
            continue;
          }

          if (!specifier.startsWith(".")) {
            continue;
          }

          const target = normalize(resolve(dirname(filePath), specifier));
          for (const forbiddenTarget of rule.forbiddenTargets) {
            const forbiddenPath = resolve(repoRoot, forbiddenTarget);
            if (target === forbiddenPath || target.startsWith(`${forbiddenPath}/`)) {
              violations.push(`${relativeFile} imports ${specifier} (${forbiddenTarget})`);
            }
          }
        }
      }

      assert.deepEqual(violations, []);
    });
  }
});

function listTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      files.push(...listTypeScriptFiles(path));
      continue;
    }

    if (path.endsWith(".ts")) {
      files.push(path);
    }
  }

  return files;
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importPattern = /import\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g;
  const exportPattern = /export\s+(?:type\s+)?[^'"]+\s+from\s+["']([^"']+)["']/g;

  for (const pattern of [importPattern, exportPattern]) {
    let match = pattern.exec(source);
    while (match) {
      specifiers.push(match[1]);
      match = pattern.exec(source);
    }
  }

  return specifiers;
}
