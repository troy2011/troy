const DRINK_ASSET_ROOT = './Sprites/drinks/';
const FOOD_ASSET_ROOT = './Sprites/food/';

const drinkAsset = (fileName) => `${DRINK_ASSET_ROOT}${fileName}`;
const foodAsset = (fileName) => `${FOOD_ASSET_ROOT}${fileName}`;

const MENU_IMAGE_RULES = [
    { pattern: /氷|アイス/u, image: drinkAsset('cocktail_clear_soda_tumbler.png') },
    { pattern: /ノンアルコール/u, image: drinkAsset('fantasy_anchor_green_beer_bottle.png') },
    { pattern: /モエ|シャンドン|シャンパン|CHAMPAGNE/u, image: drinkAsset('troy_champagne_bottle_flute.png') },
    { pattern: /角ボトル/u, image: drinkAsset('troy_yamazaki_whisky_bottle.png') },
    { pattern: /瓶ビール|ハートランド/u, image: drinkAsset('fantasy_golden_compass_beer.png') },
    { pattern: /シャンディガフ/u, image: drinkAsset('fantasy_shipwheel_beer_mug.png') },
    { pattern: /ハイボール/u, image: drinkAsset('troy_highball_mug.png') },
    { pattern: /ウイスキー/u, image: drinkAsset('cocktail_amber_whiskey_tumbler.png') },
    { pattern: /ウォッカ|VODKA/u, image: drinkAsset('troy_vodka_bottle.png') },
    { pattern: /ジントニック/u, image: drinkAsset('cocktail_lime_rosemary_gin.png') },
    { pattern: /ジンバック/u, image: drinkAsset('cocktail_gin_anchor_bottle.png') },
    { pattern: /ジンリッキー/u, image: drinkAsset('cocktail_clear_soda_tumbler.png') },
    { pattern: /モスコミュール/u, image: drinkAsset('cocktail_copper_mint_mug.png') },
    { pattern: /スクリュードライバー/u, image: drinkAsset('cocktail_sunrise_orange_highball.png') },
    { pattern: /ウォッカトニック/u, image: drinkAsset('cocktail_silver_sparkle_highball.png') },
    { pattern: /ブルドッグ/u, image: drinkAsset('cocktail_grapefruit_spritz.png') },
    { pattern: /キューバリブレ/u, image: drinkAsset('cocktail_cola_highball.png') },
    { pattern: /ラムバック/u, image: drinkAsset('cocktail_spiced_rum_bottle.png') },
    { pattern: /テキーラサンライズ/u, image: drinkAsset('cocktail_sunrise_orange_highball.png') },
    { pattern: /メキシコーラ/u, image: drinkAsset('cocktail_cola_highball.png') },
    { pattern: /カシス/u, image: drinkAsset('troy_cassis_bottle.png') },
    { pattern: /ファジーネーブル/u, image: drinkAsset('fantasy_tropical_orange_cocktail.png') },
    { pattern: /スプモーニ/u, image: drinkAsset('cocktail_grapefruit_spritz.png') },
    { pattern: /レモンサワー/u, image: drinkAsset('cocktail_lemon_mason_jar.png') },
    { pattern: /グレープフルーツ/u, image: drinkAsset('cocktail_grapefruit_spritz.png') },
    { pattern: /キンミヤ/u, image: drinkAsset('fantasy_compass_square_bottle.png') },
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
    { pattern: /梅水晶|梅/u, image: foodAsset('pirate_ume_crystal_bowl.png') }
];

const CATEGORY_FALLBACK_IMAGES = {
    beer: drinkAsset('fantasy_golden_compass_beer.png'),
    gin: drinkAsset('cocktail_lime_rosemary_gin.png'),
    vodka: drinkAsset('cocktail_copper_mint_mug.png'),
    rum: drinkAsset('cocktail_spiced_rum_bottle.png'),
    tequila: drinkAsset('cocktail_black_tequila_bottle.png'),
    liqueur: drinkAsset('cocktail_red_berry_cocktail.png'),
    whisky: drinkAsset('cocktail_amber_whiskey_tumbler.png'),
    bottle: drinkAsset('fantasy_compass_square_bottle.png'),
    mixer: drinkAsset('cocktail_clear_soda_tumbler.png'),
    soft: drinkAsset('fantasy_orange_juice_highball.png'),
    food: foodAsset('pirate_spiced_cheese_bowl.png')
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
