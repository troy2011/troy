const selectorParser = require("postcss-selector-parser");
const stylelint = require("stylelint");

const ruleName = "troy/no-self-duplicate-selectors";
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (selector) =>
    `Unexpected repeated simple selector "${selector}" in the same compound selector`
});

const ruleFunction = (primaryOption) => (root, result) => {
  const validOptions = stylelint.utils.validateOptions(result, ruleName, {
    actual: primaryOption,
    possible: [true]
  });

  if (!validOptions) {
    return;
  }

  root.walkRules((rule) => {
    const reported = new Set();

    try {
      selectorParser((selectorRoot) => {
        selectorRoot.walk((selectorNode) => {
          if (selectorNode.type !== "selector") {
            return;
          }

          const seen = new Set();

          for (const node of selectorNode.nodes) {
            if (node.type === "combinator") {
              seen.clear();
              continue;
            }

            if (!["attribute", "class", "id", "tag"].includes(node.type)) {
              continue;
            }

            const signature = `${node.type}:${node.toString()}`;

            if (!seen.has(signature)) {
              seen.add(signature);
              continue;
            }

            const reportKey = `${selectorNode.toString()}:${signature}`;

            if (reported.has(reportKey)) {
              continue;
            }

            reported.add(reportKey);
            stylelint.utils.report({
              message: messages.rejected(node.toString()),
              node: rule,
              result,
              ruleName
            });
          }
        });
      }).processSync(rule.selector);
    } catch {
      // Stylelint's parser reports malformed selectors separately.
    }
  });
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;

module.exports = stylelint.createPlugin(ruleName, ruleFunction);
