export const TROY_MENU_IDS = ['favorite', 'beer', 'gin', 'vodka', 'rum', 'tequila', 'liqueur', 'whisky', 'soft', 'food', 'bottle'];

export const TROY_ALCOHOL_SIZE_OPTIONS = [
    { label: 'S', price: 500 },
    { label: 'M', price: 700 },
    { label: '海賊ジョッキ', price: 1000 }
];

const TROY_STAFF_ALCOHOL_SIZE_OPTIONS = [
    ...TROY_ALCOHOL_SIZE_OPTIONS
];

function cloneSizeOptions(options = []) {
    return options.map((option) => ({
        label: String(option.label || option.suffix || '').trim(),
        suffix: String(option.suffix || option.label || '').trim(),
        price: Math.max(0, Math.floor(Number(option.price) || 0))
    })).filter((option) => option.label && option.price > 0);
}

function withAlcoholSizes(items = []) {
    return items.map((item) => ({
        ...item,
        sizeOptions: cloneSizeOptions(TROY_ALCOHOL_SIZE_OPTIONS).map(({ label, price }) => ({ label, price })),
        staffSizeOptions: cloneSizeOptions(TROY_STAFF_ALCOHOL_SIZE_OPTIONS)
    }));
}

function withAlcoholSize(item = {}) {
    return withAlcoholSizes([item])[0];
}

function withStaffSizes(variants = []) {
    return variants.map((variant) => ({
        ...variant,
        staffSizeOptions: cloneSizeOptions(TROY_STAFF_ALCOHOL_SIZE_OPTIONS)
    }));
}

export const TROY_BOTTLE_ITEMS = [
    { concept: 'キンミヤボトル', content: '割物はスタッフまで', price: 2500, emoji: '🍶' },
    { concept: '黒霧ボトル', content: '割物はスタッフまで', price: 3000, emoji: '🍾' },
    { concept: 'ワインボトル', content: '', price: 3000, emoji: '🍷' },
    { concept: 'モエ・エ・シャンドン', content: '', price: 18000, emoji: '🍾' },
    { concept: '角ボトル', content: '割物はスタッフまで', price: 4000, emoji: '🥃' }
];

export const TROY_PRODUCT_MENUS = {
    beer: {
        title: 'ビール・ハイボール',
        items: [
            { concept: '瓶ビール', content: 'ハートランド', price: 700, emoji: '🍺', staffName: '瓶ビール（ハートランド）' },
            withAlcoholSize({ concept: 'ハイボール', content: '角', price: 500, emoji: '🥃', staffName: 'ハイボール（角）' }),
            withAlcoholSize({ concept: 'シャンディガフ', content: 'ビール + ジンジャーエール', price: 500, emoji: '🍺', staffName: 'シャンディガフ（ビール+ジンジャーエール）' }),
            { concept: 'ノンアルコール瓶ビール', content: 'ハイネケン', price: 500, emoji: '🍺', staffName: 'ノンアルコール瓶ビール（ハイネケン）' },
            { concept: 'ノンアルコール瓶ビール', content: 'コロナセロ', price: 500, emoji: '🍺', staffName: 'ノンアルコール瓶ビール（コロナセロ）' }
        ]
    },
    gin: {
        title: 'ジンベース',
        items: withAlcoholSizes([
            { concept: 'ジントニック', content: 'トニック', price: 500, emoji: '🍸', staffName: 'ジントニック（+トニック）' },
            { concept: 'ジンバック', content: 'ジンジャーエール', price: 500, emoji: '🍸', staffName: 'ジンバック（+ジンジャーエール）' },
            { concept: 'ジンリッキー', content: 'ソーダ', price: 500, emoji: '🍸', staffName: 'ジンリッキー（+ソーダ）' }
        ])
    },
    vodka: {
        title: 'ウォッカベース',
        items: withAlcoholSizes([
            { concept: 'モスコミュール', content: 'ジンジャーエール', price: 500, emoji: '🍹', staffName: 'モスコミュール（+ジンジャーエール）' },
            { concept: 'スクリュードライバー', content: 'オレンジ', price: 500, emoji: '🍹', staffName: 'スクリュードライバー（+オレンジ）' },
            { concept: 'ウォッカトニック', content: 'トニック', price: 500, emoji: '🍹', staffName: 'ウォッカトニック（+トニック）' },
            { concept: 'ブルドッグ', content: 'グレープフルーツ', price: 500, emoji: '🍹', staffName: 'ブルドッグ（+グレープフルーツ）' }
        ])
    },
    rum: {
        title: 'ラムベース',
        items: withAlcoholSizes([
            { concept: 'キューバリブレ', content: 'コーラ', price: 500, emoji: '🥃', staffName: 'キューバリブレ（+コーラ）' },
            { concept: 'ラムバック', content: 'ジンジャーエール', price: 500, emoji: '🥃', staffName: 'ラムバック（+ジンジャーエール）' },
            { concept: 'ラムパイン', content: 'パイン', price: 500, emoji: '🍍', staffName: 'ラムパイン（+パイン）' },
            { concept: 'モヒート', content: 'ミント + ソーダ', price: 500, emoji: '🌿', staffName: 'モヒート（ミント+ソーダ）' }
        ])
    },
    tequila: {
        title: 'テキーラベース',
        items: withAlcoholSizes([
            { concept: 'テキーラサンライズ', content: 'オレンジ', price: 500, emoji: '🍹', staffName: 'テキーラサンライズ（+オレンジ）' },
            { concept: 'メキシコーラ', content: 'コーラ', price: 500, emoji: '🥃', staffName: 'メキシコーラ（+コーラ）' }
        ])
    },
    liqueur: {
        title: 'リキュール・その他',
        items: [
            withAlcoholSize({
                concept: 'カシス',
                content: '割り物を選択',
                price: 500,
                mixers: ['オレンジ', 'ソーダ', 'ウーロン'],
                emoji: '🍷',
                staffVariants: withStaffSizes([
                    { name: 'カシスオレンジ' },
                    { name: 'カシスソーダ' },
                    { name: 'カシスウーロン' }
                ])
            }),
            ...withAlcoholSizes([
                { concept: 'ファジーネーブル', content: 'ピーチ + オレンジ', price: 500, emoji: '🍑', staffName: 'ファジーネーブル（ピーチ+オレンジ）' },
                { concept: 'スプモーニ', content: 'カンパリ + グレープフルーツ + トニック', price: 500, emoji: '🍊', staffName: 'スプモーニ（カンパリ+グレープフルーツ+トニック）' },
                { concept: 'レモンサワー', content: '', price: 500, emoji: '🍋' },
                { concept: 'グレープフルーツサワー', content: '', price: 500, emoji: '🍊' }
            ])
        ]
    },
    whisky: {
        title: 'ウイスキー・焼酎・ワイン',
        items: [
            {
                concept: 'ウイスキー',
                content: '飲み方を選択',
                price: 500,
                mixers: ['ロック', '水割り'],
                optionLabelName: '飲み方',
                emoji: '🥃',
                staffVariants: withStaffSizes([
                    { name: 'ウイスキー（ロック）' },
                    { name: 'ウイスキー（水割り）' }
                ])
            },
            {
                concept: '焼酎',
                content: '種類を選択',
                price: 500,
                mixers: ['サトウキビ', '芋', '麦'],
                optionLabelName: '種類',
                emoji: '🍶',
                staffVariants: withStaffSizes([
                    { name: '焼酎 お茶割り' },
                    { name: '焼酎 ウーロン割り' },
                    { name: '焼酎 ソーダ割り' },
                    { name: '焼酎 芋' },
                    { name: '焼酎 麦' },
                    { name: '焼酎 米' },
                    { name: '焼酎 しそ' }
                ])
            },
            {
                concept: 'グラスワイン',
                content: '赤 / 白を選択',
                price: 500,
                mixers: ['赤', '白'],
                optionLabelName: '種類',
                emoji: '🍷',
                staffVariants: withStaffSizes([
                    { name: 'グラスワイン（赤）' },
                    { name: 'グラスワイン（白）' }
                ])
            }
        ]
    },
    soft: {
        title: 'ソフトドリンク',
        items: [
            { concept: 'ウーロン茶', content: '', price: 400, emoji: '🫖' },
            { concept: 'オレンジジュース', content: '', price: 400, emoji: '🧃' },
            { concept: 'グレープフルーツジュース', content: '', price: 400, emoji: '🧃' },
            { concept: 'コーラ', content: '', price: 400, emoji: '🥤' },
            { concept: 'ジンジャーエール', content: '', price: 400, emoji: '🥤' }
        ]
    },
    food: {
        title: '酒場のフード',
        items: [
            { concept: '漬けチーズ', content: '', price: 500, emoji: '🧀' },
            { concept: 'うずらの味玉', content: '', price: 500, emoji: '🥚' },
            { concept: 'ナゲット', content: '', price: 500, emoji: '🍗' },
            { concept: '韓国のり', content: '', price: 300, emoji: '◼️' },
            { concept: '梅水晶', content: '', price: 500, emoji: '🥢' },
            { concept: 'フライドポテト', content: '', price: 500, emoji: '🍟' },
            { concept: 'フランク', content: '', price: 500, emoji: '🌭' },
            { concept: 'ミックスナッツ', content: '', price: 500, emoji: '🥜' },
            { concept: 'ピザトースト', content: '', price: 500, emoji: '🍕' },
            { concept: 'ビーフジャーキー', content: '', price: 500, emoji: '🥩' },
            { concept: 'ポテトチップス', content: '', price: 500, emoji: '🥔' },
            { concept: 'カップラーメン', content: '', price: 500, emoji: '🍜' },
            { concept: 'みそ汁', content: '', price: 500, emoji: '🥣' },
            { concept: 'ピクルス', content: '', price: 500, emoji: '🥒' },
            { concept: '珍味', content: '', price: 500, emoji: '🥢' },
            { concept: 'ポッキー', content: '', price: 300, emoji: '🍫' }
        ]
    }
};

const TROY_STAFF_ONLY_MENUS = [
    { id: 'mixer', category: '割り物', items: [
        { name: 'お茶', price: 600 },
        { name: 'ウーロン', price: 600 },
        { name: 'ソーダ 1本', price: 300 },
        { name: '水 1本', price: 300 },
        { name: '氷', price: 500 }
    ]}
];

const TROY_STAFF_MENU_ORDER = ['beer', 'gin', 'vodka', 'rum', 'tequila', 'liqueur', 'whisky', 'mixer', 'food', 'soft'];

export const STAFF_MENU_CUSTOM_CATEGORY_ALIASES = {
    bottle: 'whisky'
};

function normalizePrice(value, fallback = 0) {
    const price = Math.floor(Number(value) || 0);
    return price > 0 ? price : Math.max(0, Math.floor(Number(fallback) || 0));
}

function getStaffBaseName(item = {}) {
    const staffName = String(item.staffName || '').trim();
    if (staffName) return staffName;
    const concept = String(item.concept || item.name || '').trim();
    const content = String(item.content || '').trim();
    if (!content || /選択|スタッフまで/u.test(content)) return concept;
    return `${concept}（${content.replace(/\s*\+\s*/g, '+')}）`;
}

function expandStaffSizedItem(baseItem = {}, sizeOptions = []) {
    return cloneSizeOptions(sizeOptions).map((size) => ({
        name: `${baseItem.name} ${size.suffix || size.label}`,
        price: size.price,
        note: baseItem.note || '',
        image: baseItem.image || '',
        iconImage: baseItem.iconImage || baseItem.image || '',
        emoji: baseItem.emoji || ''
    }));
}

function toStaffMenuItem(item = {}, override = {}) {
    return {
        name: String(override.name || getStaffBaseName(item)).trim(),
        price: normalizePrice(override.price, item.price),
        note: String(override.note || item.staffNote || '').trim(),
        image: String(override.image || item.image || '').trim(),
        iconImage: String(override.iconImage || override.image || item.iconImage || item.image || '').trim(),
        emoji: String(override.emoji || item.emoji || '').trim()
    };
}

function buildStaffItemsFromTroyItems(items = []) {
    const rows = [];
    items.forEach((item) => {
        if (item?.disabled) return;
        const variants = Array.isArray(item?.staffVariants) ? item.staffVariants : [];
        if (variants.length) {
            variants.forEach((variant) => {
                const row = toStaffMenuItem(item, variant);
                const sizeOptions = cloneSizeOptions(variant.staffSizeOptions || item.staffSizeOptions || []);
                rows.push(...(sizeOptions.length ? expandStaffSizedItem(row, sizeOptions) : [row]));
            });
            return;
        }

        const row = toStaffMenuItem(item);
        const sizeOptions = cloneSizeOptions(item.staffSizeOptions || []);
        rows.push(...(sizeOptions.length ? expandStaffSizedItem(row, sizeOptions) : [row]));
    });
    return rows;
}

function cloneStaffOnlyMenu(menu = {}) {
    return {
        id: menu.id,
        category: menu.category,
        items: (Array.isArray(menu.items) ? menu.items : []).map((item) => ({ ...item }))
    };
}

function getBaseStaffCategories() {
    const categories = Object.entries(TROY_PRODUCT_MENUS).map(([id, data]) => ({
        id,
        category: data.title,
        items: buildStaffItemsFromTroyItems(data.items)
    }));
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const whisky = categoryById.get('whisky');
    if (whisky) {
        whisky.items.push(...buildStaffItemsFromTroyItems(TROY_BOTTLE_ITEMS));
    }
    TROY_STAFF_ONLY_MENUS.forEach((menu) => {
        categoryById.set(menu.id, cloneStaffOnlyMenu(menu));
    });
    return TROY_STAFF_MENU_ORDER
        .map((id) => categoryById.get(id))
        .filter(Boolean)
        .map((category) => ({
            ...category,
            items: category.items.map((item) => ({ ...item }))
        }));
}

export function getTroyStaffMenu() {
    return getBaseStaffCategories();
}
