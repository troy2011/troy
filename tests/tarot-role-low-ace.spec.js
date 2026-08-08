const { test, expect } = require('@playwright/test');
const { evaluateTarotRole: evaluateServerTarotRole } = require('../server/tarotRoles');

const minor = (number, suit = 'Wand') => ({ kind: 'minor', number, suit });
const major = (number) => ({ kind: 'major', number, suit: 'None' });

const falseDevilWheel = () => [
  major(15),
  minor(2, 'Wand'),
  minor(3, 'Cup'),
  minor(4, 'Sword'),
  minor(5, 'Pentacle')
];

const trueAceWheel = () => [
  minor(1, 'Wand'),
  minor(2, 'Cup'),
  minor(3, 'Sword'),
  minor(4, 'Pentacle'),
  minor(5, 'Wand')
];

test('server role evaluator does not treat Devil XV as a low ace', () => {
  expect(evaluateServerTarotRole(falseDevilWheel())).toBeNull();
  expect(evaluateServerTarotRole(trueAceWheel())).toMatchObject({ key: 'Straight', primary: [5] });
});

test('shared browser role evaluator does not treat Devil XV as a low ace', async ({ page }) => {
  await page.goto('/tarot-kingdom-preview.html');
  const audit = await page.evaluate(async ({ devilCards, aceCards }) => {
    const { evaluateTarotRole } = await import('/js/tarotRoles.js?v=devil-low-ace-regression1');
    return {
      devil: evaluateTarotRole(devilCards),
      ace: evaluateTarotRole(aceCards)
    };
  }, {
    devilCards: falseDevilWheel(),
    aceCards: trueAceWheel()
  });

  expect(audit.devil).toBeNull();
  expect(audit.ace).toMatchObject({ key: 'Straight', primary: [5] });
});
