# ゲームフロー & アニメーション仕様

## フェーズ遷移

```
lobby
  │ admin:start_game
  ▼
answering ─┐
  │        │ all teams answered
  │        ▼
  │     waiting
  │        │ admin:reveal
  ▼        ▼
revealing
  │ admin:next_question
  ├──── (more questions remain) ──► answering
  └──── (last question / ≤1 active team) ──► finished
```

| フェーズ | トリガー | 主なクライアント動作 |
|---|---|---|
| `lobby` | ルーム作成直後 | 参加者を待つ。QR と参加者リストを表示 |
| `answering` | `admin:start_game` または `admin:next_question` | 参加者は問題と数字キーパッド表示。ディスプレイは問題と各チームの「未回答 / 回答済」 |
| `waiting` | 全員 `answer:submit` 済み | 管理者の発表合図待ち。UI は強調表示 |
| `revealing` | `admin:reveal` | ディスプレイで GaugeBar アニメ → バルーン割れ |
| `result` | (revealing から自然遷移) | スコア更新後の状態表示 |
| `finished` | `admin:next_question`（最終）/ `admin:end_game` | ランキング表示 |

## スコア計算

問題の正解 `correct` と回答 `answer` から:

- `diff = |correct - answer|`
- `perfect = diff === 0`
- 風船変動: `balloons -= diff` （`perfect` の場合は `+10` のボーナスのみ加算、減算なし）
- `balloons <= 0` で `eliminated`
- 未回答チームは `diff = 100`（最大ペナルティ）として扱う

## 演出: ゲージバー

`web/src/components/GaugeBar.tsx`

ゲージ表示と同時に**全チームの回答マーカー**（チーム色の縦線＋ラベル）が一斉に並び、その後ゆっくりと既存の金色 fill バーが伸びていく — 「どのチームの近くで止まるか」を視聴者が固唾を飲んで見守る、焦らしの演出。

```
T=0       ゲージバー＋全チームマーカー(色付き縦線)が同時に登場
T=0–0.7s  チームマーカーが stagger fade-in
Phase A:  fill バー(金色) 0% ──slow slide──► overshoot (target × 1.8 〜 +25 のうち大)
            duration: 2.6s, ease: cubic-bezier(0.25,0.46,0.45,0.94)
Phase B:  overshoot ──gentle spring bounce──► target
            stiffness: 45, damping: 9, mass: 1.6
Phase C:  "ドン" 効果音と同時に
            ・金色 fill バーはその位置で止まり、真っ赤＋発光の縦線が確定
            ・確定時の三角と縦線が拡大 (scale 1 → 1.5 → 1.15)
            ・正解の % が 0.5 → 1.5 → 1.0 でドン！と表示
            ・ゴールド fill バーの伸びがそのまま正解位置になる
```

設計上のポイント:

- アニメ中は**既存の金色 fill バー**が伸びていき、まだ「答え」とは確定していない雰囲気を作る
- 収束した瞬間に**赤いネオン光のような発光**を伴う太い赤線へ切り替わる → 「これが答えだ！」と一目で分かる演出
- ライブで動く数値は `data-gauge-fill` 属性付きの DOM から `getComputedStyle` で `width` を取り出して計算（Framer Motion の値読み取りに頼らずシンプルに）。

## 演出: バルーン割れ

`web/src/app/display/[roomId]/page.tsx` の `runForTeam` を参照。

1. 正解発表後、ゲージが収束したタイミング (`onCorrectShown`) で `popAfterBar = true`
2. 各チームに対し、誤差 `diff` の数だけ右端から順に `popping` 配列に index を追加
3. `<Balloon popped />` が `scale: [1, 1.4, 0]` で破裂アニメ
4. 1 個割れるごとに `displayBalloons[team]` をデクリメントし、`popping` 配列から該当 index を除外
5. `stagger = max(20, 80 - diff*1.5) ms` 誤差が大きいほど割れが速い
6. `perfect` の場合は風船を +10 個流入させ `playPerfect()` ファンファーレ
7. `eliminated` の場合は赤フラッシュ + `playGameOver()`

## 効果音

`web/src/lib/sounds.ts` で Web Audio API を使い、外部音源なしで合成:

- `playPop()` — squareオシレータ。ピッチが 900Hz → 120Hz へ exponential ramp
- `playReveal()` — triangle + ノイズで「ドン！」
- `playPerfect()` — C5 → E5 → G5 → C6 のアルペジオ
- `playGameOver()` — 下降するノコギリ波コード

`unlockAudio()` を初回ユーザー操作（タップ / クリック）時に呼ぶことで Safari 等の自動再生制限を解除しています。
