# 必要なオーディオファイル

島建設システムの建設音エフェクトのために、以下のオーディオファイルが必要です。

## 必要なファイル

### 1. construction.mp3
- **説明**: トンテンカン（hammering）の建設音
- **フォーマット**: MP3
- **推奨仕様**:
  - ビットレート: 128kbps
  - サンプルレート: 44.1kHz
  - ループ可能な音源（シームレスにループするのが理想）
  - 音量: 中程度（コード内で0.3倍に調整されています）

### 2. construction.ogg
- **説明**: construction.mp3と同じ音源のOgg Vorbis版
- **フォーマット**: Ogg Vorbis
- **推奨仕様**:
  - ビットレート: 128kbps
  - サンプルレート: 44.1kHz
  - ループ可能な音源
  - 音量: 中程度

## 入手方法

### 無料の音源サイト

1. **効果音ラボ** (https://soundeffect-lab.info/)
   - カテゴリ: 生活 → 工事・作業
   - 「トンカチ」「釘打ち」などの音を検索

2. **魔王魂** (https://maou.audio/)
   - カテゴリ: 効果音 → 生活音
   - 工事音・作業音を検索

3. **Freesound** (https://freesound.org/)
   - 検索ワード: "hammering", "construction", "carpentry"
   - ライセンス確認必須（CC0やCC-BYを推奨）

4. **DOVA-SYNDROME** (https://dova-s.jp/)
   - カテゴリ: SE（効果音）
   - 「建設」「工事」で検索

## ファイル変換

MP3をOggに変換する場合は以下のツールを使用：

### FFmpegを使用（推奨）
```bash
ffmpeg -i construction.mp3 -codec:a libvorbis -qscale:a 5 construction.ogg
```

### オンライン変換ツール
- CloudConvert (https://cloudconvert.com/)
- Online Audio Converter (https://online-audio-converter.com/)

## 配置場所

ダウンロード・変換したファイルを以下のパスに配置してください：
- `c:\Users\ikeda\my-liff-app\public\audio\construction.mp3`
- `c:\Users\ikeda\my-liff-app\public\audio\construction.ogg`

## 使用箇所

音声ファイルは以下のコードで使用されます：
- [public/js/island.js:708-744](../js/island.js#L708-L744) - `playConstructionSound()` 関数
- [public/WorldMapScene.js:1243-1247](../WorldMapScene.js#L1243-L1247) - マップ上の建設表示

## 注意事項

- **ライセンス確認**: 使用する音源のライセンスを必ず確認してください
- **著作権表示**: 必要に応じてクレジット表記を追加してください
- **ファイルサイズ**: モバイル環境を考慮して、できるだけ小さいファイルサイズが望ましい（目安: 100KB以下）
- **ブラウザ対応**: MP3とOggの両方を用意することで、幅広いブラウザに対応できます
  - MP3: Chrome, Safari, Edge対応
  - Ogg: Firefox, Chrome対応
