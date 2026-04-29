# アーキテクチャ

## 全体図

```
[管理者ブラウザ]            [参加者ブラウザ × N]            [ディスプレイ]
   /admin                       /join/[roomId]                  /display/[roomId]
      │                              │                              │
      └─────── socket.io ─────── server ─────── socket.io ──────────┘
                                  Node.js + Express
                                  (port 3001)
```

## モジュール

### `shared/` — 共有型

- `Team`, `Question`, `RoomSnapshot`, `RevealPayload`, `RankingEntry` …
- Socket.io イベント名と型 (`ServerToClientEvents`, `ClientToServerEvents`)
- TypeScript only（ランタイムコードなし）。`pnpm` ワークスペースで `@husen/shared` として参照。

### `server/`

| ファイル | 役割 |
|---|---|
| `src/index.ts` | Express + Socket.io サーバ起動、`/healthz`、ルームの定期掃除 |
| `src/rooms.ts` | ルーム状態と純粋なゲームロジック (作成 / 参加 / 回答 / 集計 / 次へ) |
| `src/handlers.ts` | Socket.io のイベントハンドラ。送信元の権限チェックと `room:updated` のブロードキャスト |

ルームはオンメモリ Map に保持。再起動で全消去。  
2 時間アクティビティが無いルームは自動削除。

### `web/`

| ディレクトリ | 役割 |
|---|---|
| `src/app/admin` | 管理者画面（ルーム作成 + 進行制御） |
| `src/app/join/[roomId]` | 参加者画面（学部選択 + 数字入力） |
| `src/app/display/[roomId]` | ディスプレイ画面（QR / 問題 / ゲージ / バルーン / ランキング） |
| `src/components/` | `GaugeBar`, `BalloonGrid`, `TeamCard`, `NumberPad`, `QRCard`, `Confetti`, `QuestionBox` |
| `src/hooks/useSocket.ts` | プロセス共有のシングルトン socket への薄い React ラッパー |
| `src/lib/socket.ts` | socket.io-client のシングルトンインスタンス |
| `src/lib/sounds.ts` | Web Audio API による効果音（ポップ / ファンファーレ / ゲームオーバー） |
| `src/lib/colors.ts` | バルーンとチーム色のパレット + 名前ハッシュ |

## Socket.io イベント仕様

### サーバ → クライアント

| イベント | ペイロード | 説明 |
|---|---|---|
| `room:updated` | `RoomSnapshot` | ルーム状態の同期。フェーズが変わるたびに送信 |
| `game:question` | `QuestionPayload` | 問題の配信（`game:answering` 開始時） |
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

## 認証 / 権限

- 管理者: ルーム作成時に発行される `adminToken` を localStorage に保持。`admin:*` イベントで毎回送信し、サーバ側で照合。
- 参加者: チーム名 + ソケット ID で識別。回答送信時は当該チームのソケットからの送信であることを検証。
- ディスプレイ: 認証なし（誰でも観覧可）。書き込みは行わないので OK。

## バリデーション

- 問題の正解値: `0..100` の整数（クライアント、サーバ両方で clamping）
- 初期風船: `10..500`、デフォルト 100
- チーム名: 1–24 文字
- ロビー以外で新規参加は不可（再接続のみ可）

## 永続化

なし。サーバ再起動時にすべてのルームが消える前提。  
イベント本番は数時間で終わるため、運用コストを優先しオンメモリにとどめている。
