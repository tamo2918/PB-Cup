# 🎈 husen — パーセントバルーン 学部対抗ゲームシステム

フジテレビ「ネプリーグ」の企画「パーセントバルーン」を学部対抗イベント向けに再現したリアルタイム Web アプリです。

- 参加者は QR コードからスマホで参加
- 大型スクリーンに全学部のバルーンを表示
- 正解発表時、ゲージバーがオーバーシュートしながら正解値に収束
- 誤差の数だけバルーンが「割れる」演出

## クイックスタート

```bash
# 依存関係をインストール
pnpm install

# サーバ + フロントを並列起動
pnpm dev
```

- 管理者: http://localhost:3000/admin
- 参加者: 管理者画面の QR / URL から参加
- ディスプレイ: 管理者画面のリンクから別ウィンドウで開く（`F11` でフルスクリーン）

### 同じWi-Fi内の他デバイスから参加する

- この Mac と参加者端末を同じ Wi-Fi に接続
- `pnpm dev` のあと、この Mac の LAN IP で管理画面を開く
  - 例: `http://192.168.1.23:3000/admin`
- その状態で表示される QR / 参加 URL を配る

`localhost` で開くと QR にも `localhost` が入るため、他デバイスからは参加できません。

## ディレクトリ構成

```
.
├── shared/          # フロント・サーバ共有の型定義
├── server/          # Node.js + Express + Socket.io
└── web/             # Next.js 14 (App Router) + Tailwind + Framer Motion
```

## ドキュメント

- [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) — 開発手順
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — アーキテクチャと Socket.io イベント仕様
- [`docs/GAME_FLOW.md`](./docs/GAME_FLOW.md) — ゲームのフェーズ遷移とアニメーション仕様

## ライセンス

MIT
