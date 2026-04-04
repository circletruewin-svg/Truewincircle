export const USER_HISTORY_SOURCES = [
  {
    id: "wingame",
    collection: "wingame_bets",
    mapRecord: (docSnap) => {
      const data = docSnap.data();
      const status = data.status || "pending";
      const amount = Number(data.amount || 0);
      const payout = status === "win" ? Number(data.winnings || 0) : 0;
      return {
        id: docSnap.id,
        gameName: "1 to 12 Win",
        title: `Number ${data.number ?? "-"}`,
        subtitle: status,
        amount,
        payout,
        status,
        createdAt: data.createdAt || null,
      };
    },
  },
  {
    id: "haruf",
    collection: "harufBets",
    mapRecord: (docSnap) => {
      const data = docSnap.data();
      const status = data.status || "pending";
      const amount = Number(data.betAmount || 0);
      const payout = status === "win" ? Number(data.winnings || 0) : 0;
      return {
        id: docSnap.id,
        gameName: data.marketName || "Haruf",
        title: `Number ${data.selectedNumber ?? "-"}`,
        subtitle: status,
        amount,
        payout,
        status,
        createdAt: data.timestamp || null,
      };
    },
  },
  {
    id: "roulette",
    collection: "rouletteBets",
    mapRecord: (docSnap) => {
      const data = docSnap.data();
      const status = data.status || "pending";
      return {
        id: docSnap.id,
        gameName: "Roulette",
        title: `${String(data.betType ?? "-")}`,
        subtitle: status,
        amount: Number(data.betAmount || 0),
        payout: status === "win" ? Number(data.winnings || 0) : 0,
        status,
        createdAt: data.timestamp || null,
      };
    },
  },
  {
    id: "aviator",
    collection: "aviatorBets",
    mapRecord: (docSnap) => {
      const data = docSnap.data();
      const status = data.won ? "win" : "loss";
      return {
        id: docSnap.id,
        gameName: "Aviator",
        title: data.cashoutMultiplier ? `Cashout ${Number(data.cashoutMultiplier).toFixed(2)}x` : `Crash ${Number(data.crashPoint || 0).toFixed(2)}x`,
        subtitle: status,
        amount: Number(data.betAmount || 0),
        payout: Number(data.winAmount || 0),
        status,
        createdAt: data.createdAt || null,
      };
    },
  },
  {
    id: "coinflip",
    collection: "coinFlipHistory",
    mapRecord: (docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        gameName: "Coin Flip",
        title: `${String(data.betSide || "-").toUpperCase()} vs ${String(data.result || "-").toUpperCase()}`,
        subtitle: data.won ? "win" : "loss",
        amount: Number(data.betAmount || 0),
        payout: Number(data.winAmount || 0),
        status: data.won ? "win" : "loss",
        createdAt: data.createdAt || null,
      };
    },
  },
  {
    id: "teenpatti",
    collection: "teenPattiHistory",
    mapRecord: (docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        gameName: "Teen Patti",
        title: `${String(data.betSide || "-").toUpperCase()} / Winner ${String(data.winner || "-").toUpperCase()}`,
        subtitle: data.won ? "win" : "loss",
        amount: Number(data.betAmount || 0),
        payout: Number(data.winAmount || 0),
        status: data.won ? "win" : "loss",
        createdAt: data.createdAt || null,
      };
    },
  },
  {
    id: "dragontiger",
    collection: "dtHistory",
    mapRecord: (docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        gameName: "Dragon Tiger",
        title: `${String(data.betSide || "-").toUpperCase()} / Winner ${String(data.winner || "-").toUpperCase()}`,
        subtitle: data.won ? "win" : "loss",
        amount: Number(data.betAmount || 0),
        payout: Number(data.winAmount || 0),
        status: data.won ? "win" : "loss",
        createdAt: data.createdAt || null,
      };
    },
  },
  {
    id: "andarbahar",
    collection: "abHistory",
    mapRecord: (docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        gameName: "Andar Bahar",
        title: `${String(data.betSide || "-").toUpperCase()} / Winner ${String(data.winner || "-").toUpperCase()}`,
        subtitle: data.won ? "win" : "loss",
        amount: Number(data.betAmount || 0),
        payout: Number(data.winAmount || 0),
        status: data.won ? "win" : "loss",
        createdAt: data.createdAt || null,
      };
    },
  },
  {
    id: "diceroll",
    collection: "diceBets",
    mapRecord: (docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        gameName: "Dice Roll",
        title: `Bet ${data.betNum ?? "-"} / Result ${data.result ?? "-"}`,
        subtitle: data.won ? "win" : "loss",
        amount: Number(data.betAmount || 0),
        payout: Number(data.winAmount || 0),
        status: data.won ? "win" : "loss",
        createdAt: data.createdAt || null,
      };
    },
  },
  {
    id: "colorprediction",
    collection: "colorBets",
    mapRecord: (docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        gameName: "Color Prediction",
        title: `${String(data.betColor || "-").toUpperCase()} / Winner ${String(data.winnerColor || "-").toUpperCase()}`,
        subtitle: data.won ? "win" : "loss",
        amount: Number(data.betAmount || 0),
        payout: Number(data.winAmount || 0),
        status: data.won ? "win" : "loss",
        createdAt: data.createdAt || null,
      };
    },
  },
];

export function summarizeUserHistory(records = []) {
  return records.reduce(
    (summary, item) => {
      if (item.status === "win") {
        summary.win += Number(item.payout || 0);
        summary.winCount += 1;
      } else if (item.status === "loss") {
        summary.loss += Number(item.amount || 0);
        summary.lossCount += 1;
      }
      return summary;
    },
    { win: 0, loss: 0, winCount: 0, lossCount: 0 }
  );
}
