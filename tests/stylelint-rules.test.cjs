const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const stylelint = require("stylelint");
const {
  buildRuleFingerprints
} = require("../tools/stylelint/baseline-utils.cjs");

const projectRoot = path.resolve(__dirname, "..");
const configFile = path.join(projectRoot, "stylelint.config.cjs");

async function warningsFor(code, name) {
  const report = await stylelint.lint({
    code,
    codeFilename: path.join(projectRoot, "public", `__${name}.css`),
    configFile
  });

  return report.results[0].warnings;
}

test("allows distinct simple selectors in one compound selector", async () => {
  const warnings = await warningsFor(
    ".btn.primary#save[data-action] { color: red; }",
    "valid-compound"
  );

  assert.equal(warnings.length, 0);
});

for (const [name, selector] of [
  ["class", ".btn.btn"],
  ["id", "#dialog#dialog"],
  ["attribute", "[data-x][data-x]"]
]) {
  test(`rejects a repeated ${name} selector`, async () => {
    const warnings = await warningsFor(
      `${selector} { color: red; }`,
      `duplicate-${name}`
    );

    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].rule, "troy/no-self-duplicate-selectors");
  });
}

test("rule fingerprints ignore location but change with declarations", () => {
  const original = buildRuleFingerprints(".btn {\n  color: red;\n}");
  const moved = buildRuleFingerprints("\n\n.btn {\n  color: red;\n}");
  const changed = buildRuleFingerprints(".btn {\n  color: blue;\n}");

  assert.equal(original.get(1), moved.get(3));
  assert.notEqual(original.get(1), changed.get(1));
});
