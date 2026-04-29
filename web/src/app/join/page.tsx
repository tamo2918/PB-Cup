'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function JoinIndexPage() {
  const router = useRouter();
  const [roomId, setRoomId] = useState('');

  return (
    <main className="display-bg min-h-screen flex flex-col items-center justify-center p-6">
      <div className="bg-white/95 rounded-3xl shadow-2xl p-8 w-full max-w-md text-center">
        <h1 className="text-2xl font-black text-sky-deep mb-4">ルームIDを入力</h1>
        <input
          type="text"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          maxLength={6}
          placeholder="例: A3F7K2"
          className="w-full text-center text-3xl font-mono tracking-[0.4em] py-4 border-4 border-gauge-gold rounded-xl bg-yellow-50 mb-4"
        />
        <button
          disabled={roomId.length !== 6}
          onClick={() => router.push(`/join/${roomId}`)}
          className="w-full bg-sky-deep disabled:bg-gray-300 hover:bg-blue-800 text-white text-xl font-bold py-4 rounded-xl transition"
        >
          参加する
        </button>
      </div>
    </main>
  );
}
