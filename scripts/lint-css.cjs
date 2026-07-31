const fs = require("node:fs");
const path = require("node:path");
const stylelint = require("stylelint");
const {
  buildRuleFingerprints,
  normalizeWarningText,
  warningKey
} = require("../tools/stylelint/baseline-utils.cjs");

const projectRoot = path.resolve(__dirname, "..");
const baselinePath = path.join(projectRoot, "stylelint-baseline.json");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));

function normalizePath(filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

function createAllowances() {
  const allowances = new Map();

  for (const [file, entries] of Object.entries(baseline)) {
    const fileAllowances = new Map();

    for (const entry of entries) {
      fileAllowances.set(
        `${entry.rule}\u001f${entry.text}\u001f${entry.fingerprint ?? ""}`,
        entry.count
      );
    }

    allowances.set(file, fileAllowances);
  }

  return allowances;
}

async function main() {
  const report = await stylelint.lint({
    files: ["public/**/*.css"],
    cwd: projectRoot,
    configFile: path.join(projectRoot, "stylelint.config.cjs")
  });
  const allowances = createAllowances();
  const newErrors = [];

  for (const result of report.results) {
    const file = normalizePath(result.source);
    const fileAllowances = allowances.get(file);
    let fingerprints = new Map();

    try {
      const css = fs.readFileSync(result.source, "utf8");
      fingerprints = buildRuleFingerprints(css);
    } catch {
      // Syntax errors are reported by Stylelint and have no rule fingerprint.
    }

    for (const warning of result.warnings) {
      if (warning.severity !== "error") {
        continue;
      }

      const key = warningKey(warning, fingerprints);
      const remaining = fileAllowances?.get(key) ?? 0;

      if (remaining > 0) {
        fileAllowances.set(key, remaining - 1);
        continue;
      }

      newErrors.push({ file, warning });
    }
  }

  if (newErrors.length === 0) {
    console.log("CSS lint passed: no violations beyond the approved legacy baseline.");
    return;
  }

  const displayedErrors = newErrors.slice(0, 20);

  for (const { file, warning } of displayedErrors) {
    console.error(
      `${file}:${warning.line}:${warning.column} ${warning.text}`
    );
  }

  if (newErrors.length > displayedErrors.length) {
    console.error(
      `... ${newErrors.length - displayedErrors.length} additional violation(s) omitted.`
    );
  }

  console.error(
    `CSS lint failed with ${newErrors.length} new violation(s). Fix the CSS; do not expand the baseline.`
  );
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
