'use client';

import { useEffect, useMemo, useState } from 'react';
import type { RankingEntry, RoomSnapshot } from '@husen/shared';
import { useSocket } from '@/hooks/useSocket';
import { QRCard } from '@/components/QRCard';

interface QuestionDraft {
  id: string;
  text: string;
  correctAnswer: string; // keep as string for input flexibility
}

const newDraftId = () => Math.random().toString(36).slice(2, 9);

const SAMPLE_QUESTIONS: QuestionDraft[] = [
  { id: newDraftId(), text: '20代女性で格安スマホを利用している人の割合は？', correctAnswer: '29' },
  { id: newDraftId(), text: '日本人で朝食にパンを食べる人の割合は？', correctAnswer: '47' },
  { id: newDraftId(), text: '大学生で月に1回以上映画館に行く人の割合は？', correctAnswer: '22' },
];

export default function AdminPage() {
  const { socket, connected } = useSocket();
  const [questions, setQuestions] = useState<QuestionDraft[]>(SAMPLE_QUESTIONS);
  const [startBalloons, setStartBalloons] = useState(100);
  const [allowedTeams, setAllowedTeams] = useState<string>(
    '工学部, 理学部, 文学部, 法学部, 医学部'
  );
  const [room, setRoom] = useState<{ roomId: string; adminToken: string } | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [ranking, setRanking] = useState<RankingEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Restore previously created room from localStorage so a refresh works.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('husen.admin.room');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { roomId: string; adminToken: string };
        if (parsed.roomId && parsed.adminToken) setRoom(parsed);
      } catch {
        // ignore
      }
    }
  }, []);

  // After connect, rejoin admin if we have stored credentials
  useEffect(() => {
    if (!socket || !connected || !room) return;
    socket.emit('admin:join', room, (res) => {
      if (!res?.ok) {
        setError('ルームに再接続できませんでした。新しいルームを作成してください。');
        window.localStorage.removeItem('husen.admin.room');
        setRoom(null);
        setSnapshot(null);
      }
    });
  }, [socket, connected, room]);

  // Subscribe to room updates
  useEffect(() => {
    if (!socket) return;
    const onRoom = (snap: RoomSnapshot) => setSnapshot(snap);
    const onEnd = (p: { ranking: RankingEntry[] }) => setRanking(p.ranking);
    const onErr = (p: { code: string; message: string }) => setError(p.message);
    socket.on('room:updated', onRoom);
    socket.on('game:end', onEnd);
    socket.on('error:message', onErr);
    return () => {
      socket.off('room:updated', onRoom);
      socket.off('game:end', onEnd);
      socket.off('error:message', onErr);
    };
  }, [socket]);

  const joinUrl = useMemo(() => {
    if (!room) return '';
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/join/${room.roomId}`;
  }, [room]);
  const displayUrl = useMemo(() => {
    if (!room || typeof window === 'undefined') return '';
    return `${window.location.origin}/display/${room.roomId}`;
  }, [room]);

  // ─── handlers ─────────────────────────────────────────────────────────

  const addQuestion = () =>
    setQuestions((q) => [...q, { id: newDraftId(), text: '', correctAnswer: '' }]);

  const updateQuestion = (id: string, key: keyof QuestionDraft, val: string) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, [key]: val } : q)));

  const removeQuestion = (id: string) => setQuestions((qs) => qs.filter((q) => q.id !== id));

  const moveQuestion = (id: string, dir: -1 | 1) => {
    setQuestions((qs) => {
      const idx = qs.findIndex((q) => q.id === id);
      if (idx < 0) return qs;
      const next = idx + dir;
      if (next < 0 || next >= qs.length) return qs;
      const out = [...qs];
      [out[idx], out[next]] = [out[next]!, out[idx]!];
      return out;
    });
  };

  const createRoom = () => {
    setError(null);
    if (!socket) return;
    const allowed = allowedTeams
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = {
      questions: questions.map((q) => ({
        text: q.text.trim(),
        correctAnswer: Number(q.correctAnswer),
      })),
      startBalloons,
      allowedTeams: allowed,
    };
    if (payload.questions.some((q) => !q.text)) {
      setError('問題文を全て入力してください。');
      return;
    }
    if (
      payload.questions.some(
        (q) => !Number.isFinite(q.correctAnswer) || q.correctAnswer < 0 || q.correctAnswer > 100
      )
    ) {
      setError('正解パーセントは 0〜100 の整数で入力してください。');
      return;
    }
    socket.emit('admin:create_room', payload, (res) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const data = { roomId: res.roomId, adminToken: res.adminToken };
      setRoom(data);
      window.localStorage.setItem('husen.admin.room', JSON.stringify(data));
    });
  };

  const startGame = () =>
    room && socket?.emit('admin:start_game', { roomId: room.roomId, adminToken: room.adminToken });
  const reveal = () =>
    room && socket?.emit('admin:reveal', { roomId: room.roomId, adminToken: room.adminToken });
  const nextQuestion = () =>
    room &&
    socket?.emit('admin:next_question', { roomId: room.roomId, adminToken: room.adminToken });
  const endGame = () =>
    room && socket?.emit('admin:end_game', { roomId: room.roomId, adminToken: room.adminToken });

  const resetRoom = () => {
    window.localStorage.removeItem('husen.admin.room');
    setRoom(null);
    setSnapshot(null);
    setRanking(null);
  };

  // ─── render ───────────────────────────────────────────────────────────

  if (!room) {
    return (
      <main className="min-h-screen bg-gray-50 p-6 md:p-10">
        <div className="max-w-3xl mx-auto">
          <header className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-black text-sky-deep">🎈 ルーム作成</h1>
            <ConnectionBadge connected={connected} />
          </header>

          {error && (
            <div className="bg-red-50 border-2 border-red-300 text-red-700 px-4 py-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          <section className="bg-white rounded-2xl shadow p-6 mb-4">
            <h2 className="font-bold text-lg mb-3">参加チーム名（任意・カンマ区切り）</h2>
            <input
              type="text"
              value={allowedTeams}
              onChange={(e) => setAllowedTeams(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2"
              placeholder="工学部, 理学部, 文学部"
            />
            <p className="text-xs text-gray-500 mt-1">
              空欄にすると自由なチーム名で参加できます
            </p>
          </section>

          <section className="bg-white rounded-2xl shadow p-6 mb-4">
            <h2 className="font-bold text-lg mb-3">初期風船数</h2>
            <div className="flex gap-3">
              {[50, 100, 150].map((n) => (
                <button
                  key={n}
                  onClick={() => setStartBalloons(n)}
                  className={`flex-1 py-3 rounded-xl font-bold transition ${
                    startBalloons === n
                      ? 'bg-sky-deep text-white shadow-lg'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  🎈 {n}
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow p-6 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-lg">問題リスト ({questions.length})</h2>
              <button
                onClick={addQuestion}
                className="px-3 py-1 bg-sky-deep text-white rounded-lg text-sm font-bold"
              >
                + 問題を追加
              </button>
            </div>
            <ul className="space-y-3">
              {questions.map((q, i) => (
                <li
                  key={q.id}
                  className="border-2 border-gray-200 rounded-xl p-3 grid gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-500">問題 {i + 1}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => moveQuestion(q.id, -1)}
                        disabled={i === 0}
                        className="px-2 py-0.5 text-xs bg-gray-100 rounded disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveQuestion(q.id, 1)}
                        disabled={i === questions.length - 1}
                        className="px-2 py-0.5 text-xs bg-gray-100 rounded disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => removeQuestion(q.id)}
                        disabled={questions.length <= 1}
                        className="px-2 py-0.5 text-xs bg-red-100 text-red-600 rounded disabled:opacity-30"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    value={q.text}
                    onChange={(e) => updateQuestion(q.id, 'text', e.target.value)}
                    placeholder="問題文を入力"
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">正解</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={q.correctAnswer}
                      onChange={(e) => updateQuestion(q.id, 'correctAnswer', e.target.value)}
                      className="w-24 border-2 border-gray-200 rounded-lg px-3 py-2 text-right tabular-nums"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <button
            onClick={createRoom}
            disabled={!connected}
            className="w-full bg-gauge-accent disabled:bg-gray-300 hover:bg-red-700 text-white text-2xl font-black py-5 rounded-2xl shadow-lg transition"
          >
            ルームを作成する
          </button>
        </div>
      </main>
    );
  }

  // ─── post-creation: control panel ─────────────────────────────────────

  const phase = snapshot?.phase;
  const teams = snapshot?.teams ?? [];
  const allAnswered =
    phase === 'waiting' ||
    (phase === 'answering' &&
      teams.length > 0 &&
      teams.filter((t) => !t.eliminated).every((t) => t.hasAnswered));

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-sky-deep">🎈 ルーム {room.roomId}</h1>
            <p className="text-sm text-gray-500">
              フェーズ: <strong className="text-sky-deep">{phase ?? '...'}</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionBadge connected={connected} />
            <button
              onClick={resetRoom}
              className="text-xs px-2 py-1 border border-gray-300 rounded text-gray-500 hover:bg-gray-100"
            >
              ルームをリセット
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-red-50 border-2 border-red-300 text-red-700 px-4 py-3 rounded-xl mb-4">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          <aside className="md:col-span-1 space-y-3">
            <div className="bg-white rounded-2xl shadow p-4">
              <h2 className="font-bold mb-3">参加用</h2>
              <QRCard url={joinUrl} label="QRで参加" size={200} />
              <button
                onClick={() => navigator.clipboard.writeText(joinUrl)}
                className="mt-2 w-full py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
              >
                URLをコピー
              </button>
            </div>
            <div className="bg-white rounded-2xl shadow p-4">
              <h2 className="font-bold mb-2">ディスプレイ</h2>
              <p className="text-xs text-gray-500 mb-2">大型スクリーン用</p>
              <a
                href={displayUrl}
                target="_blank"
                rel="noreferrer"
                className="block w-full bg-sky-deep text-white py-2 rounded-lg text-center text-sm font-bold"
              >
                ディスプレイを開く ↗
              </a>
              <code className="block text-xs break-all mt-2 text-gray-500">{displayUrl}</code>
            </div>
          </aside>

          <section className="md:col-span-2 space-y-3">
            {/* Phase controls */}
            <div className="bg-white rounded-2xl shadow p-4 space-y-3">
              <h2 className="font-bold">ゲーム進行</h2>
              {phase === 'lobby' && (
                <button
                  onClick={startGame}
                  disabled={teams.length < 2}
                  className="w-full py-4 bg-gauge-accent text-white font-black text-xl rounded-xl disabled:bg-gray-300"
                >
                  ゲームスタート ({teams.length}/2 以上)
                </button>
              )}
              {(phase === 'answering' || phase === 'waiting') && (
                <>
                  <div
                    className={`text-center py-2 rounded-lg ${
                      allAnswered ? 'bg-emerald-100 text-emerald-700 font-bold' : 'bg-gray-50'
                    }`}
                  >
                    {allAnswered ? '🎉 全員回答済み！' : '回答受付中…'}
                  </div>
                  <button
                    onClick={reveal}
                    className="w-full py-4 bg-gauge-accent text-white font-black text-xl rounded-xl"
                  >
                    正解を発表する 🎯
                  </button>
                </>
              )}
              {(phase === 'revealing' || phase === 'result') && (
                <button
                  onClick={nextQuestion}
                  className="w-full py-4 bg-sky-deep text-white font-black text-xl rounded-xl"
                >
                  {snapshot && snapshot.questionIndex >= snapshot.totalQuestions - 1
                    ? 'ゲーム終了へ →'
                    : '次の問題へ →'}
                </button>
              )}
              {phase === 'finished' && (
                <div className="bg-yellow-50 p-4 rounded-xl">
                  <h3 className="font-black text-lg mb-2">🏆 最終結果</h3>
                  <ol className="space-y-1">
                    {(ranking ?? snapshot?.ranking ?? []).map((r) => (
                      <li
                        key={r.teamName}
                        className="flex justify-between bg-white px-3 py-2 rounded-lg"
                      >
                        <span>
                          <strong>{r.rank}位</strong> {r.teamName}
                        </span>
                        <span className="font-bold">
                          🎈 {r.balloons} {r.eliminated && '(脱落)'}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {phase !== 'lobby' && phase !== 'finished' && (
                <button
                  onClick={endGame}
                  className="w-full text-xs py-2 text-gray-500 underline"
                >
                  ゲームを強制終了
                </button>
              )}
            </div>

            {/* Team status */}
            <div className="bg-white rounded-2xl shadow p-4">
              <h2 className="font-bold mb-2">参加チーム ({teams.length})</h2>
              {teams.length === 0 ? (
                <p className="text-sm text-gray-400">まだ参加者がいません</p>
              ) : (
                <ul className="grid grid-cols-2 gap-2">
                  {teams.map((t) => (
                    <li
                      key={t.name}
                      className={`px-3 py-2 rounded-lg border-2 ${
                        t.eliminated
                          ? 'bg-gray-50 border-gray-200 opacity-60'
                          : t.hasAnswered
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <strong>{t.name}</strong>
                        <span className="text-xs">
                          {t.online ? '🟢' : '⚪'} 🎈{t.balloons}
                        </span>
                      </div>
                      {phase !== 'lobby' && (
                        <div className="text-xs text-gray-500">
                          {t.eliminated
                            ? '脱落'
                            : t.hasAnswered
                            ? '回答済み'
                            : phase === 'answering'
                            ? '入力中'
                            : '–'}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Current question (preview) */}
            {snapshot?.currentQuestion && (
              <div className="bg-white rounded-2xl shadow p-4">
                <div className="text-xs text-gray-500">
                  現在の問題 ({snapshot.questionIndex + 1}/{snapshot.totalQuestions})
                </div>
                <div className="text-lg font-bold">{snapshot.currentQuestion.text}</div>
                {snapshot.reveal && (
                  <div className="text-sm mt-2 text-gauge-accent font-bold">
                    正解: {snapshot.reveal.correctAnswer}%
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={`text-xs px-2 py-1 rounded-full ${
        connected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {connected ? '🟢 接続中' : '🟡 接続待ち'}
    </span>
  );
}
