import { activeTableLanguage } from './tableLocale.js?v=6';

const english = Object.freeze({
    "あなた": "You",
    "カイ": "Kai",
    "ミナ": "Mina",
    "基本の出し方": "Playing the basics",
    "先に手札を出し切った人の勝ちです。場の札より強い札を、場と同じ枚数で出していきます。親のミナが最初の場札「ワンドの6」をめくりました。": "The first player to play every card in their hand wins. Match the number of cards on the table and beat them. Mina is the dealer and revealed the Six of Wands as the starting card.",
    "場は「ワンドの6」の1枚です。光っている「カップの9」を選んで「出す」を押してください。": "The Six of Wands is on the table. Select the glowing Nine of Cups, then tap Play.",
    "6より大きい9で返しました。これが通常出しです。": "Your 9 beats the 6. That is a normal play.",
    "同じ9。赤（火）で青（水）に返せました。火と水は互いに返せます。": "Both cards are 9s. Red (Fire) beats blue (Water), and blue can beat red in return.",
    "次の組み合わせを見るため、ここではパスします。": "Pass for now so you can see the next matchup.",
    "場が流れ、カイが親です。": "The table clears. Kai leads next.",
    "カイが黄色（風）の9を出しました。": "Kai played a yellow (Wind) 9.",
    "黄色（風）の9に、緑（地）の9を出してください。": "Play the green (Earth) 9 against the yellow (Wind) 9.",
    "緑の9で返せた！ 風と地も互いに返せます。": "Your green 9 beats it! Wind and Earth can beat each other at the same rank.",
    "ミナは大札の「隠者9」を出しました。大札入りの組は、スートに関係なく同じ数字へ返せます。逆に、大札の9へ小札の9だけでは返せません。": "Mina played The Hermit (9), a Major Arcana card. A set with a Major can beat an equal rank regardless of suit. A Minor 9 alone cannot beat a Major 9.",
    "返せる札がありません。出せる札があってもパスできます。「パス」を押してください。": "None of your cards can beat this play. You may pass even when you have a legal play. Tap Pass.",
    "最後に出したミナ以外が全員パスしたので、場が流れました。最後に出したミナが次の親です。": "Everyone except Mina, the last to play, passed. The table clears and Mina leads again.",
    "ミナは4を2枚出しました。同じ数字なら1〜3枚まとめて出せます。": "Mina played two 4s. You can play one to three cards of the same rank together.",
    "2枚の場には2枚で返します。「ソードの7」と「ペンタクルの7」を選んで「出す」を押してください。": "Match a pair with a pair. Select the Seven of Swords and Seven of Pentacles, then tap Play.",
    "全員がパスして場が流れ、あなたが親です。空の場には好きな札を出せます。": "Everyone passed and the table cleared. You lead now. With the table empty, you can open with a play of your choice.",
    "小札のAは通常時、小札で一番強い札です。「ペンタクルのA」を出してください。": "An Ace is normally the strongest Minor Arcana rank. Play the Ace of Pentacles.",
    "Aは誰も返せませんでした。通常時、Aに返せる大札は同じスート色の16〜19です（ペンタクルのAには月18）。": "No one could beat the Ace. Under normal ranking, only the matching suit’s Major (16–19) can beat it. For the Ace of Pentacles, that is The Moon (18).",
    "通常出し、火↔水と風↔地の反発、大札の同数字返し、パスと場流しを体験しました。": "You learned normal plays, opposing suits (Fire versus Water and Wind versus Earth), matching a rank with a Major, passing, and clearing the table.",
    "数字の効果": "Rank effects",
    "5・8・11・13・14には、出したときの効果があります。最初の場札は「ソードの3」です。": "Playing a 5, 8, 11, 13, or 14 can trigger an effect. The Three of Swords starts on the table.",
    "「ワンドの5」を出してください。": "Play the Five of Wands.",
    "5は、出した枚数ぶん次の人を飛ばします。カイの番を飛ばして、ミナの番です。": "Each 5 you play skips one player. Kai is skipped, so it is Mina’s turn.",
    "ミナが11を出しました。11バックで、数字の強弱が逆になります。今は小さい数字ほど強い状態です。": "Mina played an 11, triggering Eleven Back. The ranks reverse: lower numbers are stronger now.",
    "11バック中なので、11より小さい「カップの7」で返せます。出してください。": "Eleven Back is active, so the Seven of Cups beats the 11. Play it.",
    "場が流れると11バックは解除されます。": "Clearing the table ends Eleven Back.",
    "8を2枚以上出すと、その場ですぐに場が流れます。「ワンドの8」と「カップの8」を出してください。": "Playing two or more 8s clears the table at once. Play the Eight of Wands and Eight of Cups.",
    "8の2枚出しで場が流れ、あなたがそのまま親です。": "Your pair of 8s cleared the table. You keep the lead.",
    "「ペンタクルの10」を出してください。": "Play the Ten of Pentacles.",
    "カイが同じスートの1枚場に「ペンタクルの13」を出したので、ペンタクルでロックされました。ロック中はペンタクルでしか返せません。": "Kai played the Thirteen of Pentacles on a single card of the same suit, locking the table to Pentacles. While the lock holds, your reply must match that suit.",
    "ロックは大札の「節制14」で解除できます。節制はロック中でも出せます。「節制14」を出してください。": "Temperance (14) can break the lock and may be played through it. Play Temperance.",
    "ロック解除。節制で効果を消すと「清めの盃」で＋1翻です。": "The lock is gone. Removing an effect with Temperance earns +1 han for Purification.",
    "8を1枚だけ出すと「8カット」です。次の人はコールかパスしかできません。「ペンタクルの8」を出してください。": "A single 8 triggers Eight Cut. The next player can only Call or pass. Play the Eight of Pentacles.",
    "8カットで誰も返せず、場が流れました。": "Nobody could reply under Eight Cut, so the table clears.",
    "5のスキップ、11バック、8の効果、13のロックと節制14の解除を体験しました。小札12のバニッシュでは、場を流したあと手札を1枚除外できる効果があります。": "You saw how 5 skips players, 11 reverses the ranks, 8 cuts or clears, 13 locks a suit, and Temperance (14) removes effects. A Minor 12 can trigger Banish, which lets you exile one card from your hand after clearing the table.",
    "大札": "Major Arcana",
    "大札にはそれぞれ専用の条件や効果があります。親のカイが最初の場札「ソードの10」をめくりました。": "Major Arcana cards have special conditions and effects. Kai is the dealer and revealed the Ten of Swords as the starting card.",
    "ミナは大札「塔16」を出しました。16はソード、17はカップ、18はペンタクル、19はワンドの1枚場にだけ出せます。": "Mina played The Tower (16). These Majors can only answer a single card of their matching suit: 16 Swords, 17 Cups, 18 Pentacles, and 19 Wands.",
    "大札「世界21」のワールドエンドは、大札1枚の場に出すと即座に場を流します。「世界21」を出してください。": "The World (21) triggers World’s End: it clears the table immediately when played on a single Major. Play The World.",
    "大札16〜21を1枚で出して自分で場を流すと、＋1翻です。": "Play a single Major 16–21 and clear the table with it to earn +1 han.",
    "大札16〜19と21は、最後の1枚でない限り空の場には出せません。ここでは大札「正義11」を出してください。": "Majors 16–19 and 21 cannot open on an empty table unless they are the last card in your hand. Play Justice (11) here instead.",
    "正義11で札の強弱が逆に。すでに11バック中なら解除し、正義執行で＋1翻です。": "Justice (11) reverses the ranks. If Eleven Back is already active, Justice ends it and earns +1 han for Justice Served.",
    "先にカイがパスしました。": "Kai passed first.",
    "11バック中なので、ミナは小さい6で返しました。": "Eleven Back is active, so Mina replied with a lower 6.",
    "パスしてください。": "Tap Pass.",
    "場が流れ、ミナが親になりました。": "The table clears and Mina takes the lead.",
    "対応スートの大札16〜19、世界21の即流し、大札流しの＋1翻、正義11の11バックを体験しました。ほかの大札の効果はルールページで確認できます。": "You saw the matching suits for Majors 16–19, the instant clear from The World (21), +1 han for a Major Arcana Clear, and Eleven Back from Justice (11). See the Rules page for the other Major effects.",
    "5枚役": "Five-card hands",
    "空の場には、手札5枚で作る5枚役も出せます。最初の場札は親ミナの「ソードの2」です。": "You can open on an empty table with a five-card hand. Mina is the dealer and revealed the Two of Swords as the starting card.",
    "まずはパスして、相手の出方を見ましょう。": "Pass first and see what your opponents play.",
    "場が流れ、ミナが親です。": "The table clears and Mina leads.",
    "ミナは5・6・7・8・9の「ストレート」を出しました。5枚役の場には、より強い5枚役でしか返せません。": "Mina played a 5–6–7–8–9 Straight. Only a stronger five-card hand can beat a five-card hand.",
    "同じスート5枚の「フラッシュ」はストレートより強い役です。光っているペンタクル5枚を選んで「役を出す」を押してください。": "A Flush (five cards of the same suit) beats a Straight. Select the five glowing Pentacles, then tap Play Hand.",
    "ミナは場の5枚より手札が少ないので自動でパス。フラッシュが通って場が流れ、＋2翻です。": "Mina has fewer than five cards and passes automatically. The Flush holds, clearing the table and earning +2 han.",
    "フラッシュが通って場が流れ、＋2翻です。5枚役で場を流すと、役に応じて翻が増えます。": "Your Flush held and cleared the table, earning +2 han. The reward for clearing with five cards depends on the hand.",
    "5枚役の強さと、場を流したときの翻を表で確認しましょう。表は弱い役から順に並んでいます。": "Use the table to check how five-card hands rank and how much han they earn for a clear. The weakest hands are listed first.",
    "コールと上がり": "Calling and going out",
    "最後は、コールで役を作り、手札を出し切って上がります。最初の場札は親ミナの「カップの4」です。": "Make a hand with Call, then play your last card to go out. Mina is the dealer and revealed the Four of Cups as the starting card.",
    "1枚の場札に手札4枚を合わせて5枚役を作るのが「コール」です。4・4・9・9を選んで「コール」を押してください。場の4と合わせてフルハウスです。": "Call combines four cards from your hand with the single card on the table. Select 4, 4, 9, and 9, then tap Call. The table’s 4 makes it a Full House.",
    "コールで作った役は、表より1翻少なくなります。": "A called hand earns one less han than the amount shown in the table.",
    "フルハウスのコールが通り、3−1＝＋2翻です。コールで、ロック・8カット・11バックも解除されます。": "Your called Full House held: 3 − 1 = +2 han. Calling also removes Lock, Eight Cut, and Eleven Back.",
    "3を3枚まとめて出してください。": "Play all three 3s together.",
    "スリーカードで＋1翻です。": "Three of a Kind earns +1 han.",
    "残りは大札「太陽19」1枚です。": "You have one card left: The Sun (19).",
    "19は普段は空の場に出せませんが、最後の1枚なら出して上がれます。大札を最後の1枚として出して上がると「切札」で＋1翻です。「太陽19」を出してください。": "The Sun (19) normally cannot open on an empty table, but you may play it if it is your last card. Going out with a single Major earns +1 han for Final Trump. Play The Sun.",
    "手札を出し切って上がりました！ 最後の1枚が大札なので切札＋1翻です。点数を計算します。": "You went out! Your last card was a Major, so Final Trump adds +1 han. Now tally the score.",
    "上がった人の翻は、上がり1翻＋役や大札流しの翻＋切札＋親の1翻です。5枚役・コールで上がると「役上がり」でさらに＋1翻。負けた人は「残り枚数 × 翻 × 10枚」を払います。残した小札Aは1枚につき1翻、親は1翻多く払います。": "The winner earns 1 han for going out, plus any hand or Major-clear bonuses, Final Trump, and 1 han if they are the dealer. Going out with a five-card hand or a Call adds +1 han for Five-Card Finish. Losers pay cards remaining × han × 10 chips. Each Minor Ace left adds 1 han to that player’s payment, and the dealer pays with 1 extra han.",
    "この章は終わりました": "This chapter is complete.",
    "今は手番ではありません": "It is not your turn.",
    "今は「パス」を押してください": "Tap Pass now.",
    "光っている札を選んで「出す」を押してください": "Select the glowing cards, then tap Play.",
    "光っている札だけを、すべて選んでください": "Select all the glowing cards and no others."
});

export const tutorialIsEnglish = () => activeTableLanguage() === 'en';
export const tutorialText = (japanese, language = activeTableLanguage()) =>
    language === 'en' && Object.hasOwn(english, japanese) ? english[japanese] : japanese;
export const tutorialCopy = (japanese, english) => tutorialIsEnglish() ? english : japanese;

export function tutorialPageUrl(href, base = globalThis.location?.href) {
    if (!base) return href;
    const source = new URL(base);
    const lang = source.searchParams.get('lang');
    if (lang !== 'ja' && lang !== 'en') return href;
    const target = new URL(href, source);
    if (target.origin !== source.origin) return href;
    target.searchParams.set('lang', lang);
    return target.pathname + target.search + target.hash;
}
