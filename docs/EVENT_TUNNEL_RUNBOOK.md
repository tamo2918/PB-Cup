# 外部ネットワーク参加用 起動手順

10分程度の短いイベントで、無料の Cloudflare Quick Tunnel を使って外部ネットワークから参加できるようにする手順です。

このアプリは `web` が `localhost:3000`、Socket.IO サーバーが `localhost:3001` で分かれているため、トンネルは **2本** 起動します。

## 事前準備

### 1. 依存関係

```bash
pnpm install
```

### 2. cloudflared を入れる

未インストールの場合:

```bash
brew install cloudflared
```

確認:

```bash
cloudflared --version
```

## 起動手順

ターミナルを4つ開いて、以下の順番で起動します。

### ターミナル1: サーバーを起動

```bash
pnpm dev:server
```

起動ログに `0.0.0.0:3001` が出ればOKです。

### ターミナル2: サーバーを外部公開

```bash
cloudflared tunnel --url http://localhost:3001
```

ログに出る `https://...trycloudflare.com` のURLを控えます。

例:

```text
https://server-example.trycloudflare.com
```

このURLを以下では `<SERVER_TUNNEL_URL>` と呼びます。

### ターミナル3: Webを起動

ターミナル2で控えたサーバーURLを使って起動します。

```bash
NEXT_PUBLIC_SERVER_URL=<SERVER_TUNNEL_URL> pnpm dev:web
```

例:

```bash
NEXT_PUBLIC_SERVER_URL=https://server-example.trycloudflare.com pnpm dev:web
```

注意: サーバー側 tunnel URL が変わった場合は、この Web サーバーを一度止めて、変わったURLで起動し直してください。

### ターミナル4: Webを外部公開

```bash
cloudflared tunnel --url http://localhost:3000
```

ログに出る `https://...trycloudflare.com` のURLを控えます。

例:

```text
https://web-example.trycloudflare.com
```

このURLを以下では `<WEB_TUNNEL_URL>` と呼びます。

## 管理者画面を開く

管理者は必ず Web 側の tunnel URL で開きます。

```text
<WEB_TUNNEL_URL>/admin
```

例:

```text
https://web-example.trycloudflare.com/admin
```

`localhost:3000/admin` で開くと、QRコードにも `localhost` が入り、外部ネットワークの参加者が入れません。

## 当日の流れ

1. ターミナル1から4を順番に起動する
2. `<WEB_TUNNEL_URL>/admin` を開く
3. ルームを作成する
4. 管理画面に表示されたQRコードを参加者に見せる
5. スマホのモバイル回線で1台テスト参加する
6. ディスプレイ用画面を管理画面から開く
7. 参加者が揃ったらゲーム開始

## 事前チェックリスト

- Mac のスリープを切る
- 4つのターミナルを閉じない
- 会場Wi-Fiではなく、スマホの4G/5Gから参加テストする
- 管理画面を `localhost` ではなく `<WEB_TUNNEL_URL>/admin` で開いている
- QRコードのURLが `https://...trycloudflare.com/join/...` になっている
- ディスプレイ画面で接続表示が緑になっている
- 参加者端末で「接続中」になっている

## トラブル対応

### 参加者が「接続待ち」のまま

原因は Web 側が古いサーバー tunnel URL を見ている可能性が高いです。

対応:

1. ターミナル2の `<SERVER_TUNNEL_URL>` を確認する
2. ターミナル3を止める
3. 正しいURLで起動し直す

```bash
NEXT_PUBLIC_SERVER_URL=<SERVER_TUNNEL_URL> pnpm dev:web
```

4. ターミナル4の Web tunnel URL で管理画面を開き直す
5. ルームとQRを作り直す

### QRコードを読んでも開けない

確認:

- QRのURLが `localhost` になっていないか
- Web tunnel のターミナル4が動き続けているか
- Web tunnel URL が変わっていないか

### ゲーム中に全員切断された

いずれかの tunnel またはローカルサーバーが止まった可能性があります。

対応:

1. ターミナル1から4がすべて動いているか確認する
2. tunnel URL が変わった場合は、Webを新しい `<SERVER_TUNNEL_URL>` で再起動する
3. 新しい `<WEB_TUNNEL_URL>/admin` でルームを作り直す

オンメモリ管理のため、サーバーを再起動するとルーム状態は消えます。

## 片付け

イベント終了後、4つのターミナルで `Ctrl+C` を押して停止します。

## 補足

Cloudflare Quick Tunnel のURLは毎回変わります。イベント開始直前に起動し、表示されたURLでQRコードを作り直してください。
