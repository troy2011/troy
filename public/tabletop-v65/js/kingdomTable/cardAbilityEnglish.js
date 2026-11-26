// Card-inspector copy is keyed by printed card identity, not Japanese prose.
import { ABILITY } from './abilityNames.js?v=pirate-ability-finish-han-v1';
const suits = {wand:'Wands',cup:'Cups',sword:'Swords',coin:'Pentacles'};
const counterNumbers = {wand:19,cup:17,sword:16,coin:18};
const counters = {16:'Swords',17:'Cups',18:'Pentacles',19:'Wands'};
const names = Object.freeze({
    [ABILITY.hang]:'Hung Over', [ABILITY.resurrection]:'Resurrection', [ABILITY.banish]:'Banish',
    [ABILITY.mighty]:'Mighty Cut', [ABILITY.justice]:'Live Reverse', [ABILITY.clearance]:'Cleanse',
    [ABILITY.world]:"World's End", [ABILITY.death]:'The Reaping', [ABILITY.devil]:"Dead Man's Chest",
});
const lock = ['Lock','Beat a single card of this suit to lock it. Only the same suit or Temperance can be played until the table clears or someone calls.'];
const minor = {
    5:[['Skip','Skip one seat for each Minor 5 in a normal play. Major 5 counts as two skips.']],
    8:[['8 Cut','Single: the next player can only call or pass. Two or more: clear the table immediately.']],
    11:[['11 Back','Reverse number strength, or restore it if already reversed. A table clear or call ends the reversal. Five-card hands keep their rankings.']],
    12:[[names[ABILITY.banish],'If you clear the table, you may exile a card from your hand. You can go out by exiling your last card.']],
    13:[lock],14:[lock],
};
const major = {
    0:[['Wild','Fills a missing rank in a five-card hand. Has no suit and cannot stand in for a Minor Ace.'],['Five-card hand','Combine with four Minor Aces for Elemental.']],
    1:[['All suits','Rank 1. Counts as all four suits for locks and flushes.']],
    5:[['Double Skip','Skip the next two seats on a normal play. Each Minor 5 adds one more skip.']],
    8:[[names[ABILITY.mighty],'Only The World can answer the next play.']],
    11:[[names[ABILITY.justice],'Reverse number strength.'],['Justice Served','Ending 11 Back earns +1 han.']],
    12:[[names[ABILITY.hang],'If you clear the table, you may give a card to the opponent with the fewest cards. Break ties by choosing the nearest opponent in the current turn order. You may give away your last card to go out.']],
    13:[[names[ABILITY.death],'If this card clears the table on its own, each opponent discards their strongest Minor 11–14. Under 11 Back, the order is reversed. No one discards their last card.']],
    14:[[names[ABILITY.clearance],"On a normal play, remove any suit lock, 11 Back, and Judgement's pending retrieval. Remove at least one to earn +1 han. This does not clear the table and cannot be played during 8 Cut."]],
    15:[['Strength','Loses to an Ace.'],[names[ABILITY.devil],'If this card clears the table on its own, each player may select a card or decline. If at least two select a card, they pass their cards simultaneously to the next participant in turn order.'],['Han transfer','Take 1 han from each opponent who declined and has at least 1 han.'],['Five-card hand','Combine with four Minor Aces for High Five of a Kind.']],
    20:[['Reverse ranks','A normal play reverses number strength, or restores the normal order if already reversed.'],[names[ABILITY.resurrection],"The player who clears the table may recover one Minor card from another player's graveyard if they hold fewer than eight cards."]],
    21:[[names[ABILITY.world],'Unless 11 Back is active, beat a single Major and clear the table immediately. This can also beat Major 8.'],['Five-card hand','Five Majors including The World make The World. Combine it with Majors 16–19 for High World.']],
};
const majorFlavor = [
    'The destination was still unwritten. A dog chased the Fool out onto the plank.',
    'One breath of smoke drew an endless circle in the sky above the harbor.',
    'Even at high tide, no one gave voice to that secret.',
    'The Empress handed her guest an apple polished by the sea wind.',
    'Cannon fire does not set a fleet in motion. A single nod from the captain does.',
    'The laws of the sea go unwritten. Sailors who survive the storm tell them to those who follow.',
    'The angel spread its wings. They took each other by the hand and turned toward the same harbor.',
    'Do not wait for the waves. The white horse and the black struck the surf in unison.',
    'The lion closed its jaws. She had only waited until it came close enough.',
    'A fading light reaches farthest through the fog.',
    'Fair winds and foul trade places once the tide has turned.',
    'To set the tilting scales right, they turned the whole ship upside down.',
    'With the world upside down, he finally saw which load he had to let go.',
    'At the last bell, kings and nameless souls alike return to the sea.',
    'A drop of fresh water in the briny sea. With that one drop, the voyage could go on.',
    "The Devil always strikes a fair bargain. You'll learn what you lost tomorrow.",
    'The Kraken opened an eye on the seabed before the thunder could sound.',
    "A star fell into the sea with a flick of the mermaid's tail.",
    'Do not follow the path of moonlight. Its reflection knows the real night.',
    "The boy broke into a run. Even the great dog's shadow bounded across the deck.",
    'Even voices sunk deep beneath the sea answer the call of that conch.',
    'Not until the last port did the two edges of the chart finally meet.',
];
const minorFlavor = {
    wand:[
        'The wind tore at the chart. The pistol in the other hand did not move.',
        "Pistol in hand, he scanned the open water. His crewmates' sails rose against the setting sun.",
        'All four harbor lights were lit. Tonight, at least, they could sleep soundly.',
        'A tavern chair went over. No one was willing to lower their pistol.',
        'When the victory flag came into port, the waiting children waved sticks in imitation.',
        'After that climb, they would never let anyone drag them down from the rocks.',
        'A cannonball swept across the water. Now was the time to furl the sails.',
        'Only an hour till dawn. Just for tonight, keep that broken oar out of the fire.',
        'The sailor drew the cannon cart toward the harbor, one step at a time.',
        'The Page held up a pistol. The voyage beyond that horizon had yet to begin.',
        "Spray drenched the Knight's pistol, but the horse galloped on.",
        "The Queen's sunflower faced the sea. Only the black cat looked back.",
        "No foreign ship drew near while the King's cannon guarded the harbor.",
        'In the wind and rain, the very first one caught fire.',
    ],
    cup:[
        'The clink of two cups settled the long talks over a truce.',
        'The calmer the water at night, the quicker the third cup empties.',
        'The sailor refused a drink. Beyond the cup, he could see home.',
        'The fifth cup spilled. No one called for another toast.',
        'The old cup sat right only in the hand of an old crewmate.',
        'Treasure and monsters floated in the seven cups. The sailor could not tell which were illusions.',
        'He set his cup down and stood. That was all it took to bring the feast to a pause.',
        'If you keep all the wine for yourself, you have only your own loneliness to drink with.',
        "The sailor returned from a distant island to find the family's cups set out at the table.",
        "A little fish swam in the Page's cup. No one in the tavern was surprised.",
        'The Knight passed up the cup before him to keep the last of the fresh water.',
        'When the Queen tilted her cup, the colors of the harbor were caught in the water.',
        'No matter how wild the sea grew, the King never spilled a drop.',
        'A white dove came down and water brimmed over the golden cup.',
    ],
    sword:[
        'Only the night wind passed between the two crossed swords.',
        'In the rain, three blades stayed lodged in the heart of the treasure chest.',
        'Those who sleep with their swords laid out strap them on again at dawn.',
        'A step forward is quicker than stooping for a fallen sword.',
        'They loaded the blades into the bow of the ferry and cast off without telling a soul.',
        'Five swords were borrowed. No one has yet claimed to have returned one.',
        'There were eight swords. With her hands still bound, she waited for the tide to go out.',
        'Nine swords lined the wall. A sleepless night leaves plenty of time to count them again.',
        'Ten swords stuck in his back. Only the sea greeted the dawn as if nothing had happened.',
        'The young swordsman pointed his blade even at the calm sea.',
        'The Knight rode hard through the surf. The sea was still reflected in the drawn blade.',
        "They did not fear the Queen's sword. They feared the eyes that could see through a lie.",
        'No one crossed the harbor boundary before the King sheathed his blade.',
        'The blade that parted the waves had neither name nor crest.',
    ],
    coin:[
        'Two gold coins tossed to the rhythm of the waves landed in the very same palm.',
        'Even the storm could not erase the mark the three had carved in the hull.',
        'The man who slept clutching his gold woke to find his key gone.',
        'Five gold coins gleamed beyond the window. Every one was out of reach of the two drenched travelers.',
        'They counted six gold coins in the palm of a hand and divided them among three sailors.',
        'Buried coins do not come back on their own. That is why a mark is left in the earth.',
        'The sound of the eighth coin polished meant the workday was done.',
        'The birds returning to the favorite garden brought more joy than nine gold coins.',
        'Tracing the scars on the old coin brought back the names of the ports the family had crossed.',
        'The Page did not sell the gold coin they found. It became a marker for the journey.',
        'The Knight returned the coins he had left. There was a port that would take him back empty-handed.',
        "Only coins struck with the Queen's crest passed muster in the city of fog.",
        'The first coin the King gave away was the one that shone brightest.',
        'A gold coin brighter than morning peeked out from a crack in the rock.',
    ],
};
export function cardInspectEnglish(card) {
    const {num,suit}=card;
    let clauses;
    const flavor=card.major ? majorFlavor[num] : minorFlavor[suit][num-2];
    if (!card.major) {
        clauses=num===15?[
            ['Counter',`When played singly, a Major of the same suit can beat it (${suits[suit]}: Major ${counterNumbers[suit]}). That counter does not work during 11 Back.`],
            ['Five-card hand','Counts as 1 only in an A–2–3–4–5 straight. Four Aces plus a fifth card make Elemental. If the fifth card is The Devil, it makes High Five of a Kind.'],
            ['Payment','If you lose, each Ace left in your hand adds +1 han to your payment.'],
        ]:minor[num]??[];
    } else {
        const suitName=counters[num];
        clauses=suitName?[
            ['Counters',`Counts as ${suitName}. Can beat singles matching that suit according to normal strength. It also beats a Minor Ace, except during 11 Back.`],
            ['Five-card hand','Four Minor cards of the same suit make High Flush. Majors 16–19 plus one other Major make High Elemental, or High World with The World.'],
        ]:[...(major[num]??[])];
        if (num>=16) clauses.push(['Major Arcana Clear','Play this as a normal single and clear the table yourself to earn +1 han.']);
        if (suitName||num===21) clauses.push(['Play condition','Cannot lead on an empty table unless it is your last card.']);
        clauses.push(['Final Trump','Go out by playing this card on its own to earn +1 han.']);
    }
    return {effects:clauses.map(([label,text])=>({label,text})),flavor};
}
