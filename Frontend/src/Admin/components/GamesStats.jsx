import React, { useEffect, useState } from 'react';
import { collection, getCountFromServer } from 'firebase/firestore';
import { RefreshCw } from 'lucide-react';
import { db } from '../../firebase';

const collections = [
  { key: 'aviatorBets', label: 'Aviator Bets' },
  { key: 'colorBets', label: 'Color Prediction Bets' },
  { key: 'coinFlipHistory', label: 'Coin Flip Rounds' },
  { key: 'dtHistory', label: 'Dragon Tiger Rounds' },
  { key: 'teenPattiHistory', label: 'Teen Patti Rounds' },
  { key: 'abHistory', label: 'Andar Bahar Rounds' },
  { key: 'diceBets', label: 'Dice Bets' },
  { key: 'rouletteBets', label: 'Roulette Bets' },
  { key: 'wingame_bets', label: '1 to 12 Bets' },
];

export default function GamesStats() {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        collections.map(async (item) => {
          const snapshot = await getCountFromServer(collection(db, item.key));
          return {
            ...item,
            count: snapshot.data().count || 0,
          };
        })
      );

      setStats(results);
    } catch (error) {
      console.error('Failed to load game stats:', error);
      setStats(collections.map((item) => ({ ...item, count: 0 })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-gray-900">Games Stats</h3>
          <p className="mt-1 text-sm text-gray-600">Live casino aur featured games ki collection-level activity summary.</p>
        </div>

        <button
          onClick={loadStats}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stats.map((item) => (
          <div key={item.key} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">{item.label}</p>
            <p className="mt-3 text-4xl font-black text-gray-900">{loading ? '...' : item.count}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-blue-600">{item.key}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
