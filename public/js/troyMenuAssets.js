const DRINK_ASSET_ROOT = './Sprites/drinks/';
const FOOD_ASSET_ROOT = './Sprites/food/';

const drinkAsset = (fileName) => `${DRINK_ASSET_ROOT}${fileName}`;
const foodAsset = (fileName) => `${FOOD_ASSET_ROOT}${fileName}`;

const MENU_IMAGE_RULES = [
    { pattern: /氷|アイス/u, image: drinkAsset('cocktail_clear_soda_tumbler.png') },
    { pattern: /コロナセロ/u, image: drinkAsset('fantasy_golden_compass_beer.png') },
    { pattern: /ノンアルコール/u, image: drinkAsset('fantasy_anchor_green_beer_bottle.png') },
    { pattern: /モエ|シャンドン|シャンパン|CHAMPAGNE/u, image: drinkAsset('troy_champagne_bottle_flute.png') },
    { pattern: /角ボトル/u, image: drinkAsset('troy_yamazaki_whisky_bottle.png') },
    { pattern: /瓶ビール|ハートランド/u, image: drinkAsset('fantasy_anchor_green_beer_bottle.png') },
    { pattern: /シャンディガフ/u, image: drinkAsset('fantasy_shipwheel_beer_mug.png') },
    { pattern: /ハイボール/u, image: drinkAsset('troy_highball_mug.png') },
    { pattern: /ウイスキー/u, image: drinkAsset('cocktail_amber_whiskey_tumbler.png') },
    { pattern: /ジントニック/u, image: drinkAsset('cocktail_silver_sparkle_highball.png') },
    { pattern: /ジンバック/u, image: drinkAsset('cocktail_gold_sparkle_highball.png') },
    { pattern: /ジンリッキー/u, image: drinkAsset('cocktail_clear_soda_tumbler.png') },
    { pattern: /モスコミュール/u, image: drinkAsset('cocktail_gold_sparkle_highball.png') },
    { pattern: /スクリュードライバー/u, image: drinkAsset('cocktail_sunrise_orange_highball.png') },
    { pattern: /ウォッカトニック/u, image: drinkAsset('cocktail_clear_soda_tumbler.png') },
    { pattern: /ウォッカ|VODKA/u, image: drinkAsset('troy_vodka_bottle.png') },
    { pattern: /ブルドッグ/u, image: drinkAsset('cocktail_grapefruit_spritz.png') },
    { pattern: /キューバリブレ/u, image: drinkAsset('cocktail_copper_mint_mug.png') },
    { pattern: /ラムバック/u, image: drinkAsset('pirate_lime_grog_mug.png') },
    { pattern: /ラムパイン/u, image: drinkAsset('cocktail_pineapple_skull_tiki.png') },
    { pattern: /モヒート/u, image: drinkAsset('cocktail_skull_mint_tankard.png') },
    { pattern: /テキーラサンライズ/u, image: drinkAsset('cocktail_sunrise_orange_highball.png') },
    { pattern: /メキシコーラ/u, image: drinkAsset('cocktail_lime_cola_highball.png') },
    { pattern: /カシス/u, image: drinkAsset('troy_cassis_rocks_glass.png') },
    { pattern: /ファジーネーブル/u, image: drinkAsset('fantasy_tropical_orange_cocktail.png') },
    { pattern: /スプモーニ/u, image: drinkAsset('cocktail_grapefruit_spritz.png') },
    { pattern: /レモンサワー/u, image: drinkAsset('cocktail_lemon_mason_jar.png') },
    { pattern: /グレープフルーツ/u, image: drinkAsset('cocktail_grapefruit_spritz.png') },
    { pattern: /キンミヤ/u, image: drinkAsset('pirate_blue_crystal_potion.png') },
    { pattern: /黒霧/u, image: drinkAsset('fantasy_black_skull_potion.png') },
    { pattern: /焼酎.*(お茶|ウーロン)|ウーロン茶|お茶|ウーロン/u, image: drinkAsset('troy_oolong_tea_glass.png') },
    { pattern: /焼酎.*ソーダ|ソーダ|水\s*1?本|水割り/u, image: drinkAsset('cocktail_clear_soda_tumbler.png') },
    { pattern: /焼酎/u, image: drinkAsset('fantasy_anchor_clay_jug.png') },
    { pattern: /グラスワイン（白）|グラスワイン.*種類:\s*白|白ワイン/u, image: drinkAsset('fantasy_compass_white_wine.png') },
    { pattern: /ワインボトル/u, image: drinkAsset('pirate_red_wine_bottle.png') },
    { pattern: /グラスワイン|ワイン/u, image: drinkAsset('pirate_red_wine_glass.png') },
    { pattern: /オレンジジュース/u, image: drinkAsset('fantasy_orange_juice_highball.png') },
    { pattern: /コーラ/u, image: drinkAsset('cocktail_cola_highball.png') },
    { pattern: /ジンジャーエール/u, image: drinkAsset('cocktail_gold_sparkle_highball.png') },
    { pattern: /漬けチーズ|チーズ/u, image: foodAsset('pirate_spiced_cheese_bowl.png') },
    { pattern: /うずら|味玉|たまご|卵/u, image: foodAsset('pirate_boiled_egg_bowl.png') },
    { pattern: /ナゲット|チキン/u, image: foodAsset('pirate_fried_chicken_nuggets.png') },
    { pattern: /韓国のり|海苔|のり/u, image: foodAsset('pirate_nori_stack.png') },
    { pattern: /梅水晶|梅/u, image: foodAsset('pirate_ume_crystal_bowl.png') },
    { pattern: /フライドポテト/u, image: foodAsset('pirate_french_fries_bucket.png') },
    { pattern: /フランク/u, image: foodAsset('snack_sausage_skillet.png') },
    { pattern: /ミックスナッツ|ナッツ/u, image: foodAsset('pirate_mixed_nuts_barrel.png') },
    { pattern: /ピザトースト|ピザ/u, image: foodAsset('snack_mini_pizza_plate.png') },
    { pattern: /ビーフジャーキー|ジャーキー/u, image: foodAsset('pirate_jerky_platter.png') },
    { pattern: /ポテトチップス/u, image: foodAsset('snack_potato_chips_bowl.png') },
    { pattern: /カップラーメン|ラーメン/u, image: foodAsset('snack_ramen_bowl.png') },
    { pattern: /みそ汁|味噌汁/u, image: foodAsset('snack_miso_soup_bowl.png') }
];

const CATEGORY_FALLBACK_IMAGES = {
    specials: drinkAsset('troy_champagne_bottle_flute.png'),
    beer: drinkAsset('fantasy_golden_compass_beer.png'),
    gin: drinkAsset('troy_gin_bottle.png'),
    vodka: drinkAsset('troy_vodka_bottle.png'),
    rum: drinkAsset('troy_rum_square_bottle.png'),
    tequila: drinkAsset('troy_tequila_bottle.png'),
    liqueur: drinkAsset('troy_cassis_bottle.png'),
    whisky: drinkAsset('troy_highball_mug.png'),
    bottle: drinkAsset('troy_champagne_bottle_flute.png'),
    mixer: drinkAsset('cocktail_clear_soda_tumbler.png'),
    soft: drinkAsset('troy_oolong_tea_glass.png'),
    food: foodAsset('snack_fried_chicken_skillet.png')
};

function getMenuAssetSearchText(item = {}) {
    return [
        item?.concept,
        item?.name,
        item?.content,
        item?.note,
        item?.optionLabel,
        item?.sizeLabel
    ].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
}

export function getTroyMenuImage(categoryId = '', item = {}) {
    const explicit = String(item?.iconImage || item?.image || '').trim();
    if (explicit) return explicit;

    const normalizedCategory = String(categoryId || item?.menuId || item?.categoryId || '').trim().toLowerCase();
    const searchText = getMenuAssetSearchText(item);
    const matched = MENU_IMAGE_RULES.find((rule) => rule.pattern.test(searchText));
    if (matched) return matched.image;

    return CATEGORY_FALLBACK_IMAGES[normalizedCategory] || '';
}

export function getTroyMenuCategoryImage(categoryId = '') {
    const normalizedCategory = String(categoryId || '').trim().toLowerCase();
    return CATEGORY_FALLBACK_IMAGES[normalizedCategory] || '';
}
