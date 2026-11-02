# pixelfx (vendored)

- Source: https://github.com/patch-gg/pixelfx
- Commit: `a84159688af3ca37a4be05a0d422b94451b2e24e` (v0.3.0, 2026-10-31)
- License: MIT (`LICENSE`); adapted parts are listed in `NOTICE.md`. The gallery font is not included.

Only `src/core` and the effects Tarot Kingdom uses are copied, with every file they import, keeping the
upstream folder layout (`core/`, `fx/<category>/`). The files are plain ES modules loaded on demand by
`public/js/tarotKingdomPixelFx.js`; nothing here is bundled.

## Local changes

- `fx/lightning/lightning-strike.js`: a single stroke and a soft decay instead of three restrikes with a
  7-step strobe, so the bolt does not flash repeatedly. Marked with `// troy:` comments.
- `fx/status/burning.js`: no whole-body white/orange flash on each 0.6 s tick (repeated flashing).
  Marked with a `// troy:` comment.
- `fx/lightning/electrified.js`: the jolt (three every two seconds) lifts the body's shading by about
  half as much and its glows are dimmer and sit on the actor's chest, so it brightens instead of
  flashing. Marked with a `// troy:` comment.
- `fx/holy/heal.js`: an extra `drain` option (default 1); the 5-card summon heal passes 0 so the party is
  not greyed out before the hoop restores it. Marked with a `// troy:` comment.

## Updating

Copy the same set from a newer commit, re-apply the changes above, update the commit hash here, and check
every recipe in `tarotKingdomPixelFx.js` still loads (`node --test tests/tarot-kingdom-pixelfx.test.cjs`).
