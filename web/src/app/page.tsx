import Link from 'next/link';

export default function Home() {
  return (
    <main className="display-bg min-h-screen flex flex-col items-center justify-center p-8">
      <div className="bg-white/95 rounded-3xl shadow-2xl px-10 py-12 max-w-2xl w-full text-center">
        <h1 className="text-4xl font-black text-sky-deep mb-2">🎈 パーセントバルーン</h1>
        <p className="text-lg text-gray-600 mb-8">学部対抗ゲームシステム</p>

        <div className="grid gap-4">
          <Link
            href="/admin"
            className="block bg-gauge-accent hover:bg-red-700 text-white text-xl font-bold py-5 rounded-2xl transition shadow-lg"
          >
            管理者として開始 / Admin
          </Link>
          <Link
            href="/join"
            className="block bg-sky-deep hover:bg-blue-800 text-white text-xl font-bold py-5 rounded-2xl transition shadow-lg"
          >
            参加者として参加 / Join
          </Link>
        </div>

        <p className="text-xs text-gray-400 mt-8">
          ディスプレイ画面は管理者がルーム作成後に表示される URL からアクセスしてください。
        </p>
      </div>
    </main>
  );
}
