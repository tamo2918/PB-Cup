# アーキテクチャ

## 全体図

```
[管理者ブラウザ]            [参加者ブラウザ × N]            [ディスプレイ]
   /admin                       /join/[roomId]                  /display/[roomId]
      │                              │                              │
      └─────── socket.io ─────── server ─────── socket.io ──────────┘
                                  Node.js + Express
                                  (port 3001 / 0.0.0.0)
```

## モジュール

### `shared/` — 共有型

- `Team`, `PublicTeam`（サーバ側 / クライアント公開用）
- `Question`, `RoomSnapshot`, `RevealPayload`, `AnswerResult`, `RankingEntry`, `QuestionPayload`
- Socket.io イベントの型 (`ServerToClientEvents`, `ClientToServerEvents`)
- TypeScript only（ランタイムコードなし）。`pnpm` ワークスペースで `@husen/shared` として参照。

`PublicTeam` には参加時にサーバが割り当てた `color`（ハイライトカラー）が含まれ、各 UI で使われる。

### `server/`

| ファイル | 役割 |
|---|---|
| `src/index.ts` | Express + Socket.io サーバ起動、`/healthz`、ルーム自動掃除。`HOST=0.0.0.0` でバインドし、`CORS_ORIGIN` 未設定の dev ではあらゆる origin を許可（LAN 内スマホからの接続用） |
| `src/rooms.ts` | ルーム状態と純粋なゲームロジック (作成 / 参加 / 回答 / 集計 / 次へ)。`scheduleRevealResult` / `markRevealResult` / `clearRevealReadyTimer` で `revealing → result` の遷移を制御 |
| `src/handlers.ts` | Socket.io のイベントハンドラ。送信元の権限チェックと `room:updated` のブロードキャスト |

ルームはオンメモリ Map に保持。再起動で全消去。  
2 時間アクティビティが無いルームは自動削除。

#### チームカラーの割り当て

`rooms.ts` で 10 色のプリセットパレットを上から順に割り当て、それを使い切ったあとは Golden-ratio で HSL を生成して衝突しないように追加発行する。クライアント側で色をハッシュ計算する代わりに、**サーバが唯一の真実**として `PublicTeam.color` を配布。

### `web/`

| ディレクトリ | 役割 |
|---|---|
| `src/app/admin` | 管理者画面（ルーム作成 + 進行制御） |
| `src/app/join/[roomId]` | 参加者画面（学部選択 + 数字入力） |
| `src/app/display/[roomId]` | ディスプレイ画面（QR / 問題 / ゲージ / バルーン / ランキング） |
| `src/components/` | `GaugeBar`, `RemainingBalloon`, `TeamCard`, `NumberPad`, `QRCard`, `Confetti`, `QuestionBox`, `Balloon`, `BalloonGrid` |
| `src/hooks/useSocket.ts` | プロセス共有のシングルトン socket への薄い React ラッパー |
| `src/lib/socket.ts` | socket.io-client のシングルトンインスタンス |
| `src/lib/sounds.ts` | Web Audio API による効果音（ポップ / ファンファーレ / ゲームオーバー） |
| `src/lib/colors.ts` | 紙吹雪 / 装飾風船用のパレット（チーム本体の色は **サーバ supplied**） |

主要コンポーネントの役割:

- `GaugeBar` — 正解発表時の核となる演出。金色 fill バーがゆっくり伸び、オーバーシュート＆スプリングで正解値に収束、その後赤い「答えライン」が確定
- `RemainingBalloon` — 大きな 1 個のバルーン SVG＋残数の数字を表示。誤差を被るとふるふる揺れる演出（旧 `BalloonGrid` から置き換え）
- `TeamCard` — 各チームの「残り風船」と「予想」を 2 つの `RemainingBalloon` で並べ、誤差バッジ・正解バッジを重ねて出す
- `Balloon` / `BalloonGrid` — 旧バージョンで利用していたグリッド表示用。現状の本流ではないが残置（必要に応じて差し戻せるように）

## Socket.io イベント仕様

### サーバ → クライアント

| イベント | ペイロード | 説明 |
|---|---|---|
| `room:updated` | `RoomSnapshot` | ルーム状態の同期。フェーズが変わるたびに送信 |
| `game:question` | `QuestionPayload` | 問題の配信（`answering` 開始時） |
| `game:reveal` | `RevealPayload` | 正解と各チームの計算結果 |
| `game:end` | `{ ranking: RankingEntry[] }` | ゲーム終了 + 最終順位 |
| `game:waiting` | _none_ | 全員回答済み。管理者待ち |
| `error:message` | `{ code, message }` | エラー通知 |
| `admin:room_created` | `{ roomId, adminToken }` | ルーム作成完了 |
| `team:joined` | `{ teamName, roomId }` | 自分が参加完了したことを通知 |

### クライアント → サーバ

| イベント | ペイロード | 説明 |
|---|---|---|
| `admin:create_room` | `{ questions[], startBalloons, allowedTeams? }` | ルーム作成 |
| `admin:join` | `{ roomId, adminToken }` | 管理者の再接続 |
| `admin:start_game` | `{ roomId, adminToken }` | スタート |
| `admin:reveal` | `{ roomId, adminToken }` | 正解発表 |
| `admin:next_question` | `{ roomId, adminToken }` | 次の問題（最終問題なら終了） |
| `admin:end_game` | `{ roomId, adminToken }` | 強制終了 |
| `team:join` | `{ roomId, teamName }` | チーム参加 / 再接続 |
| `answer:submit` | `{ roomId, teamName, answer }` | 回答送信 |
| `display:join` | `{ roomId }` | ディスプレイがルームを購読 |
| `display:reveal_complete` | `{ roomId, questionIndex }` | ディスプレイ側のゲージ＋バルーン演出が一通り終わったことを通知 |

## 正解発表フェーズの遷移

`revealing → result` 遷移は **ディスプレイ側の演出完了 ack** または **12 秒フォールバックタイマー** のどちらか早い方でトリガされる。これは「演出中にスマホ参加者が結果画面に切り替わってしまう」のを防ぐため。

```
admin:reveal
   │
   ▼
[server] phase = 'revealing'
   ├─ broadcast game:reveal
   ├─ broadcast room:updated  (phase: revealing)
   └─ scheduleRevealResult(12s fallback)
                 │
                 │  whichever comes first ↓
                 ▼
   ┌─────────────────────────┬────────────────────────┐
   │ display:reveal_complete │ (12s fallback fires)   │
   └─────────────────────────┴────────────────────────┘
                 ▼
[server] markRevealResult() → phase = 'result'
   └─ broadcast room:updated  (phase: result)
                 │
                 ▼
        参加者の result 画面が解禁
```

サーバは `revealing` 中に来たディスプレイの ack だけを受け付け、別フェーズや別問題インデックスの ack は無視する（ガード済み）。

## 認証 / 権限

- **管理者**: ルーム作成時に発行される `adminToken` を localStorage に保持。`admin:*` イベントで毎回送信し、サーバ側で照合
- **参加者**: チーム名 + ソケット ID で識別。回答送信時は当該チームのソケットからの送信であることを検証
- **ディスプレイ**: 認証なし（誰でも観覧可）。書き込みできるのは `display:reveal_complete` のみで、`socket.data.role === 'display'` かつ自分がいる `roomId` でなければ無視

## CORS / バインド

- `HOST=0.0.0.0` で listen するので LAN 内の他端末（スマホ）から接続可能
- `CORS_ORIGIN` 環境変数（カンマ区切り）で origin を制限
- 環境変数を未設定 + `NODE_ENV !== production` のときは **dev デフォルトで全 origin 許可**（LAN IP からの接続を試行錯誤しなくて済む）
- 本番では必ず `CORS_ORIGIN` を設定すること

## バリデーション

- 問題の正解値: `0..100` の整数（クライアント、サーバ両方で clamping）
- 初期風船: `10..500`、デフォルト 100
- チーム名: 1–24 文字
- ロビー以外で新規参加は不可（再接続のみ可）

## 永続化

なし。サーバ再起動時にすべてのルームが消える前提。  
イベント本番は数時間で終わるため、運用コストを優先しオンメモリにとどめている。
