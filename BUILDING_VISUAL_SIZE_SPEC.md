# 建物の「論理サイズ」と「描画サイズ」仕様

## 用語
- **論理サイズ (SizeLogic)**: 建設/占有判定に使うサイズ（スロット消費量）
- **描画サイズ (SizeVisual)**: 見た目のサイズ（スプライトがはみ出して良い範囲）
- **基準点 (Anchor/Origin)**: 常に **左下基準**（Phaserの `setOrigin(0, 1)`）

## PlayFab Catalog `CustomData`（建物アイテム）
`playfab_buildings_catalog.json` の各アイテムの `CustomData` に以下を持たせます。

- `SizeLogic`: `{ "x": number, "y": number }`（例: `{x:1,y:1}`）
- `SizeVisual`: `{ "x": number, "y": number }`（例: `{x:1,y:3}`）
- `Origin`: `{ "x": 0, "y": 1 }`（固定）
- `Anchor`: `"bottom_left"`（固定）

## はみ出しの分配ルール（重要）
「占有サイズより画像サイズが大きい」場合のはみ出しは **X方向のみ**、以下のルールで自動計算します（ピクセル単位の手動調整はしません）。

- `deltaX = sizeVisual.x - sizeLogic.x`
- `leftOverflowX = floor(deltaX / 2)`
- `rightOverflowX = deltaX - leftOverflowX`
  - `deltaX` が **偶数** → 左右同じだけはみ出す
  - `deltaX` が **奇数** → 右側が1グリッド多くはみ出す

Y方向は常に「地面基準」で、余った分は **上方向へはみ出す** 想定です（左下アンカーのため）。

## Phaser 3 配置ルール（左下基準）
前提: 1マス= `TILE_SIZE` ピクセル、建物は「占有スロット左下」を起点に配置します。

```js
function placeBuilding(scene, slotX, slotY, buildingDef, TILE_SIZE) {
  // buildingDef.origin = {x:0,y:1} で統一
  const originX = 0;
  const originY = 1;
  const sizeLogic = buildingDef.sizeLogic;   // {x,y}
  const sizeVisual = buildingDef.sizeVisual; // {x,y}
  const deltaX = Math.max(0, (sizeVisual?.x || 0) - (sizeLogic?.x || 0));
  const leftOverflowX = Math.floor(deltaX / 2); // 奇数の余りは右側へ

  // 左下のワールド座標（タイル座標→ピクセル）
  // ※slotY は「占有枠の左下タイル座標」とし、Yは (slotY + sizeLogic.y) が左下のピクセルになる想定
  const worldX = (slotX - leftOverflowX) * TILE_SIZE;
  const worldY = (slotY + (sizeLogic?.y || 1)) * TILE_SIZE;

  const sprite = scene.add.sprite(worldX, worldY, buildingDef.atlasKey, buildingDef.frameKey);
  sprite.setOrigin(originX, originY);
  return sprite;
}
```

ポイント:
- 画像が `SizeVisual` で上/右へはみ出しても、足元（左下）が一致するため破綻しません。
- 当たり判定や配置可否は `SizeLogic` のみで行います（描画は自由）。
