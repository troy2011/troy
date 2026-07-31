module.exports = {
  plugins: ["./tools/stylelint/no-self-duplicate-selectors.cjs"],
  rules: {
    "no-duplicate-selectors": true,
    "troy/no-self-duplicate-selectors": true
  }
};
