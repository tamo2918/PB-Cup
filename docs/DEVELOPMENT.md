# 開発手順

## 必要環境

| ツール | 推奨バージョン |
|---|---|
| Node.js | 20+ (動作確認: 22) |
| pnpm | 10 |

## セットアップ

```bash
pnpm install
```

## 起動

ルートで一発起動:

```bash
pnpm dev   # server (3001) と web (3000) を並列で起動
```

個別起動:

```bash
pnpm dev:server   # http://0.0.0.0:3001  (Socket.io + healthz)
pnpm dev:web      # http://0.0.0.0:3000
```

### 環境変数

`web/.env.local`:

```
NEXT_PUBLIC_SERVER_URL=http://localhost:3001
```

`server/.env`（任意）:

```
PORT=3001
CORS_ORIGIN=http://localhost:3000
```

## 動作確認手順

1. ブラウザ A で `http://localhost:3000/admin` を開き、ルームを作成
2. ブラウザ A で「ディスプレイを開く」をクリック → 大型スクリーン表示
3. ブラウザ B（または別タブ）で QR コードからアクセス、適当な学部名で参加
4. 別の学部でもう 1 つ参加（最低 2 チーム必要）
5. 管理者画面で「ゲームスタート」
6. 各参加者で 0–100 の数字を入力 → GO で送信
7. 全員回答後、管理者で「正解を発表する」
8. ディスプレイでゲージアニメーション → バルーン割れアニメーション
9. 「次の問題へ」を繰り返し、最終問題後はランキングが表示

## LAN内のスマホから参加させるとき

- この Mac をホストにして完結させるなら、`pnpm dev` のままでよい
- ただし管理画面は `localhost` ではなく `http://<このMacのIPアドレス>:3000/admin` で開く
- そうすると QR / 参加 URL / Socket 接続先がその IP ベースになり、同じ Wi-Fi の端末から参加できる
- `CORS_ORIGIN` を未設定で起動した場合、開発中は LAN からの origin を自動許可する

## 型チェック / ビルド

```bash
pnpm type-check   # 全パッケージで tsc --noEmit
pnpm build        # server: dist/, web: .next/
```

## デプロイ

- **web**: Vercel に `web/` を Project root として配置。`NEXT_PUBLIC_SERVER_URL` を本番サーバ URL に設定。
- **server**: Railway / Fly.io / Render。`pnpm --filter @husen/server build && pnpm --filter @husen/server start` で起動。`CORS_ORIGIN` に本番フロント URL を設定。
- WebSocket sticky session が必要な場合は Railway / Fly のデフォルト設定で OK。Vercel のサーバーレス関数は WebSocket を維持できないので、サーバは別ホスティングに置くこと。

## トラブルシュート

| 症状 | 原因と対処 |
|---|---|
| 「接続待ち」のまま | サーバ未起動。`pnpm dev:server` を起動 |
| CORS エラー | `server/.env` の `CORS_ORIGIN` がフロントの URL と一致しているか確認 |
| 同じ学部で参加できない | 既に同名チームが接続中。サーバを再起動するか、チーム名を変える |
| ディスプレイで正解アニメが流れない | 一度ディスプレイを表示中のクリック等で `unlockAudio()` を発火させる必要あり（自動で実行される） |
