const crypto = require("node:crypto");
const postcss = require("postcss");

function normalizeWarningText(text) {
  return text.replace(/, first used at line \d+(?= \()/u, "");
}

function normalizeRule(rule) {
  const nodes = rule.nodes
    .filter((node) => node.type !== "comment")
    .map((node) => {
      if (node.type === "decl") {
        return {
          type: node.type,
          prop: node.prop,
          value: node.value,
          important: node.important
        };
      }

      return {
        type: node.type,
        text: node.toString().replace(/\s+/gu, " ").trim()
      };
    });

  return JSON.stringify({
    selector: rule.selector.replace(/\s+/gu, " ").trim(),
    nodes
  });
}

function buildRuleFingerprints(css) {
  const fingerprints = new Map();
  const root = postcss.parse(css);

  root.walkRules((rule) => {
    const line = rule.source?.start?.line;

    if (!line) {
      return;
    }

    const fingerprint = crypto
      .createHash("sha256")
      .update(normalizeRule(rule))
      .digest("hex")
      .slice(0, 16);

    fingerprints.set(line, fingerprint);
  });

  return fingerprints;
}

function warningKey(warning, fingerprints) {
  const fingerprint = fingerprints.get(warning.line) ?? "";

  return [
    warning.rule,
    normalizeWarningText(warning.text),
    fingerprint
  ].join("\u001f");
}

module.exports = {
  buildRuleFingerprints,
  normalizeWarningText,
  warningKey
};
