import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import Loader from './Loader';

const ResultChart = ({ marketName, onClose }) => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      try {
        const resultsRef = collection(db, 'results');
        const allResultsSnapshot = await getDocs(resultsRef); // Fetch all documents
        let allResults = allResultsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                // Convert Firestore Timestamp to JS Date
                date: data.date.toDate(),
            };
        });

        // Client-side filtering
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        allResults = allResults.filter(result => {
            const isSameMarket = result.marketName === marketName;
            const isCurrentMonth = result.date.getMonth() === currentMonth && result.date.getFullYear() === currentYear;
            return isSameMarket && isCurrentMonth;
        });

        // Client-side sorting by date in descending order
        allResults.sort((a, b) => b.date.getTime() - a.date.getTime());

        // Client-side limiting
        const fetchedResults = allResults.slice(0, 30);

        setResults(fetchedResults);
      } catch (error) {
          console.error("Error fetching results: ", error);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [marketName]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-700 bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-[#042346] px-5 py-4 text-white">
          <div>
            <h2 className="text-xl font-black">{marketName} Past Results</h2>
            <p className="text-xs uppercase tracking-[0.24em] text-blue-200">Current month only</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-red-500 p-2 text-black shadow-lg transition-colors hover:bg-red-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4 bg-gray-50">
          {loading ? (
            <Loader />
          ) : (
            <div className="overflow-x-auto">
              {results.length > 0 ? (
                <table className="w-full min-w-max table-auto border-collapse overflow-hidden rounded-2xl border border-gray-300 shadow-md">
                  <thead className="bg-gray-200">
                    <tr>
                      <th className="border border-gray-300 p-3 text-left">Date</th>
                      <th className="border border-gray-300 p-3 text-center">Number</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, index) => (
                      <tr key={result.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 p-3">{result.date.toLocaleDateString("en-IN")}</td>
                        <td className="border border-gray-300 p-3 text-center font-bold text-xl text-red-600">{result.number}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="py-8 text-center text-gray-500">Is month ka result abhi available nahi hai.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultChart;
