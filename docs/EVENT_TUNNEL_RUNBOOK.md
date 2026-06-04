# 外部ネットワーク参加用 起動手順

短時間イベントでは Cloudflare Quick Tunnel を使い、外部ネットワークから参加できる公開 URL を一時的に発行します。

このプロジェクトは通常 `web:3000` と `server:3001` に分かれています。イベント起動ではローカルプロキシ `8787` を立て、1 本の Cloudflare URL で次のように振り分けます。

```text
https://...trycloudflare.com
  ├─ /socket.io/* -> localhost:3001
  ├─ /healthz     -> localhost:3001
  └─ その他       -> localhost:3000
```

## 事前準備

```bash
pnpm install
brew install cloudflared
cloudflared --version
```

管理者パスワードを固定したい場合は、起動時に環境変数で指定します。

```bash
ADMIN_PASSWORD='任意のパスワード' pnpm event:start
```

未指定の場合は、起動ごとにランダムな管理者パスワードをターミナルへ表示します。

## 起動

```bash
pnpm event:start
```

このコマンドは次をまとめて実行します。

- 既存のイベント用プロセスを停止
- Socket.io サーバーを `localhost:3001` で起動
- Next.js を `localhost:3000` で起動
- ローカルプロキシを `localhost:8787` で起動
- `cloudflared tunnel --url http://localhost:8787` を起動

ログに次のような URL が出たら、その `/admin` を開きます。

```text
[event-start] public URL: https://example.trycloudflare.com
[event-start] admin: https://example.trycloudflare.com/admin
```

管理者画面でルームを作成すると、参加用 QR も同じ `https://...trycloudflare.com` の URL になります。

## リセット

状態を完全に作り直したい場合:

```bash
pnpm event:start
```

`event:start` は先に `event:reset` を実行するため、ルーム状態も公開 URL も作り直されます。

停止だけしたい場合:

```bash
pnpm event:reset
```

通常は起動中ターミナルで `Ctrl+C` しても停止できます。

## 当日の流れ

1. `pnpm event:start`
2. 表示された `https://...trycloudflare.com/admin` を開く
3. 管理者パスワードでログイン
4. 参加チーム候補、問題、初期風船数を確認
5. ルーム作成
6. 管理画面の QR を参加者へ提示
7. スマホの 4G/5G で 1 台テスト参加
8. ディスプレイ画面を開いて音声を有効化
9. 参加者が揃ったらゲーム開始

## トラブル対応

### `cloudflared` がない

```bash
brew install cloudflared
```

### 参加者が接続待ちのまま

`pnpm event:start` で起動し直してください。古い URL の QR は使わず、新しく表示された URL で管理画面からルームを作り直します。

### 管理画面が 503 になる

通常の `pnpm dev` では `ADMIN_PASSWORD` が必要です。イベントでは `pnpm event:start` を使うか、固定パスワードを指定して起動します。

### ルームを作り直したい

```bash
pnpm event:start
```

このアプリはオンメモリ管理なので、サーバーを再起動するとルーム状態は消えます。

## 注意

Cloudflare Quick Tunnel の URL は毎回変わります。イベント開始直前に起動し、表示された URL で QR コードを作り直してください。
