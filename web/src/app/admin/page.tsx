'use client';

import { useEffect, useMemo, useState } from 'react';
import { KINDAI_STUDENT_COUNCIL_TEAMS, TEAM_NAME_MAX_LENGTH } from '@husen/shared';
import type { RankingEntry, RoomSnapshot } from '@husen/shared';
import { useSocket } from '@/hooks/useSocket';
import { QRCard } from '@/components/QRCard';
import { QuestionCountdown } from '@/components/QuestionCountdown';

interface QuestionDraft {
  id: string;
  text: string;
  imageUrl: string;
  correctAnswer: string; // keep as string for input flexibility
}

interface TeamDraft {
  id: string;
  name: string;
}

const newDraftId = () => Math.random().toString(36).slice(2, 9);
const makeTeamDrafts = (names: readonly string[]): TeamDraft[] =>
  names.map((name) => ({ id: newDraftId(), name }));

const SAMPLE_QUESTIONS: QuestionDraft[] = [
  {
    id: newDraftId(),
    text: '携帯の充電器を毎日持ち歩いている人、何％？',
    imageUrl: '',
    correctAnswer: '28',
  },
  {
    id: newDraftId(),
    text: '全国の企業でSNSを運用している割合は何％？',
    imageUrl: '',
    correctAnswer: '45',
  },
  {
    id: newDraftId(),
    text: '訪日外国人で最も美味しかった日本食は『寿司』と答えた人、何％',
    imageUrl: '',
    correctAnswer: '19',
  },
];

export default function AdminPage() {
  const { socket, connected } = useSocket();
  const [questions, setQuestions] = useState<QuestionDraft[]>(SAMPLE_QUESTIONS);
  const [teamDrafts, setTeamDrafts] = useState<TeamDraft[]>(() =>
    makeTeamDrafts(KINDAI_STUDENT_COUNCIL_TEAMS)
  );
  const [startBalloons, setStartBalloons] = useState(100);
  const [room, setRoom] = useState<{ roomId: string; adminToken: string } | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [ranking, setRanking] = useState<RankingEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const snapshotAllowedTeamsKey = snapshot?.allowedTeams.join('\n') ?? '';

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

  useEffect(() => {
    if (!snapshotAllowedTeamsKey) return;
    setTeamDrafts(makeTeamDrafts(snapshotAllowedTeamsKey.split('\n')));
  }, [snapshot?.roomId, snapshotAllowedTeamsKey]);

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
    setQuestions((q) => [...q, { id: newDraftId(), text: '', imageUrl: '', correctAnswer: '' }]);

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
    const allowedTeams = normalizeTeamDrafts(teamDrafts);
    const teamError = validateTeamNames(allowedTeams);
    if (teamError) {
      setError(teamError);
      return;
    }
    const payload = {
      questions: questions.map((q) => ({
        text: q.text.trim(),
        imageUrl: q.imageUrl.trim() || undefined,
        correctAnswer: Number(q.correctAnswer),
      })),
      startBalloons,
      allowedTeams,
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
  const startAnswering = () =>
    room &&
    socket?.emit('admin:start_answering', {
      roomId: room.roomId,
      adminToken: room.adminToken,
    });
  const reveal = () =>
    room && socket?.emit('admin:reveal', { roomId: room.roomId, adminToken: room.adminToken });
  const nextQuestion = () =>
    room &&
    socket?.emit('admin:next_question', { roomId: room.roomId, adminToken: room.adminToken });
  const endGame = () =>
    room && socket?.emit('admin:end_game', { roomId: room.roomId, adminToken: room.adminToken });

  const addTeamDraft = () =>
    setTeamDrafts((teams) => [...teams, { id: newDraftId(), name: '' }]);

  const updateTeamDraft = (id: string, name: string) =>
    setTeamDrafts((teams) => teams.map((team) => (team.id === id ? { ...team, name } : team)));

  const removeTeamDraft = (id: string) =>
    setTeamDrafts((teams) => (teams.length <= 2 ? teams : teams.filter((team) => team.id !== id)));

  const resetTeamDrafts = () => setTeamDrafts(makeTeamDrafts(KINDAI_STUDENT_COUNCIL_TEAMS));

  const saveRoomTeams = () => {
    if (!room || !socket) return;
    setError(null);
    const allowedTeams = normalizeTeamDrafts(teamDrafts);
    const teamError = validateTeamNames(allowedTeams);
    if (teamError) {
      setError(teamError);
      return;
    }

    socket.emit(
      'admin:update_teams',
      { roomId: room.roomId, adminToken: room.adminToken, allowedTeams },
      (res) => {
        if (!res?.ok) setError(res?.error ?? '参加チーム候補を更新できませんでした');
      }
    );
  };

  const copyJoinUrl = async () => {
    if (!joinUrl || typeof window === 'undefined') return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(joinUrl);
        return;
      }
      fallbackCopyText(joinUrl);
    } catch {
      fallbackCopyText(joinUrl);
    }
  };

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
            <TeamEditor
              teams={teamDrafts}
              onAdd={addTeamDraft}
              onChange={updateTeamDraft}
              onRemove={removeTeamDraft}
              onReset={resetTeamDrafts}
            />
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
                  <label className="grid gap-1">
                    <span className="text-sm text-gray-500">画像URL（任意）</span>
                    <input
                      type="text"
                      value={q.imageUrl}
                      onChange={(e) => updateQuestion(q.id, 'imageUrl', e.target.value)}
                      placeholder="/question-images/q1.jpg または https://..."
                      className="w-full border-2 border-gray-200 rounded-lg px-3 py-2"
                    />
                  </label>
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
  const activeTeams = teams.filter((team) => !team.eliminated);
  const allAnswered = activeTeams.length > 0 && activeTeams.every((team) => team.hasAnswered);

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
              <QRCard url={joinUrl} label="QRで参加" size={240} />
              <button
                onClick={copyJoinUrl}
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
            {phase === 'lobby' && (
              <div className="bg-white rounded-2xl shadow p-4">
                <TeamEditor
                  teams={teamDrafts}
                  onAdd={addTeamDraft}
                  onChange={updateTeamDraft}
                  onRemove={removeTeamDraft}
                  onReset={resetTeamDrafts}
                  onSave={saveRoomTeams}
                  saveDisabled={!connected}
                  compact
                />
              </div>
            )}

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
              {phase === 'reading' && (
                <>
                  <QuestionCountdown pending compact />
                  <div className="rounded-lg bg-sky-50 py-2 text-center font-bold text-sky-deep">
                    問題の読み上げ中
                  </div>
                  <button
                    onClick={startAnswering}
                    className="w-full rounded-xl bg-sky-deep py-4 text-xl font-black text-white"
                  >
                    回答スタート（10秒）
                  </button>
                </>
              )}
              {(phase === 'answering' || phase === 'waiting') && (
                <>
                  <QuestionCountdown
                    deadline={snapshot?.answerDeadline}
                    closed={phase === 'waiting'}
                    compact
                  />
                  <div
                    className={`text-center py-2 rounded-lg ${
                      allAnswered ? 'bg-emerald-100 text-emerald-700 font-bold' : 'bg-gray-50'
                    }`}
                  >
                    {allAnswered
                      ? '🎉 全員回答済み！'
                      : phase === 'waiting'
                        ? '回答時間が終了しました'
                        : '回答受付中…'}
                  </div>
                  <button
                    onClick={reveal}
                    disabled={phase !== 'waiting' || snapshot?.finalizingAnswers}
                    className="w-full py-4 bg-gauge-accent text-white font-black text-xl rounded-xl disabled:bg-gray-300"
                  >
                    {snapshot?.finalizingAnswers
                      ? '最終回答を取得中…'
                      : phase === 'waiting'
                        ? '正解を発表する 🎯'
                        : '回答時間の終了を待っています'}
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
                {snapshot.currentQuestion.imageUrl && (
                  <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                    <PreviewImage src={snapshot.currentQuestion.imageUrl} />
                  </div>
                )}
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

function PreviewImage({ src }: { src: string }) {
  // Admin-provided image URLs may be local public paths or arbitrary remote URLs.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-32 w-full object-cover" />;
}

function TeamEditor({
  teams,
  onAdd,
  onChange,
  onRemove,
  onReset,
  onSave,
  saveDisabled = false,
  compact = false,
}: {
  teams: TeamDraft[];
  onAdd: () => void;
  onChange: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onReset: () => void;
  onSave?: () => void;
  saveDisabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className={`font-bold ${compact ? '' : 'text-lg'}`}>参加チーム候補</h2>
          <p className="text-xs text-gray-500">
            参加画面では、この候補から選択して参加します
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-200"
          >
            標準に戻す
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="rounded-lg bg-sky-deep px-3 py-1.5 text-xs font-bold text-white"
          >
            + 追加
          </button>
        </div>
      </div>

      <ul className="grid gap-2 md:grid-cols-2">
        {teams.map((team, index) => (
          <li key={team.id} className="flex items-center gap-2">
            <span className="w-7 shrink-0 text-right text-xs font-bold text-gray-400">
              {index + 1}
            </span>
            <input
              type="text"
              value={team.name}
              maxLength={TEAM_NAME_MAX_LENGTH}
              onChange={(event) => onChange(team.id, event.target.value)}
              placeholder="チーム名"
              className="min-w-0 flex-1 rounded-lg border-2 border-gray-200 px-3 py-2 text-sm font-bold"
            />
            <button
              type="button"
              onClick={() => onRemove(team.id)}
              disabled={teams.length <= 2}
              className="rounded-lg bg-red-50 px-2.5 py-2 text-xs font-bold text-red-600 disabled:opacity-30"
            >
              削除
            </button>
          </li>
        ))}
      </ul>

      {onSave && (
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled}
          className="mt-3 w-full rounded-xl bg-sky-deep py-3 text-sm font-black text-white disabled:bg-gray-300"
        >
          参加チーム候補を反映
        </button>
      )}
    </div>
  );
}

function normalizeTeamDrafts(teams: TeamDraft[]): string[] {
  return teams.map((team) => team.name.trim()).filter(Boolean);
}

function validateTeamNames(names: string[]): string | null {
  if (names.length < 2) return '参加チーム候補は2つ以上登録してください。';

  const seen = new Set<string>();
  for (const name of names) {
    if (name.length > TEAM_NAME_MAX_LENGTH) {
      return `チーム名は${TEAM_NAME_MAX_LENGTH}文字以内で入力してください。`;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) return `チーム名が重複しています: ${name}`;
    seen.add(key);
  }
  return null;
}

function fallbackCopyText(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}
