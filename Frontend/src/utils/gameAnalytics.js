const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const GAME_ANALYTICS_CONFIG = [
  {
    id: "aviator",
    label: "Aviator",
    collection: "aviatorBets",
    timeField: "createdAt",
    betField: "betAmount",
    payoutResolver: (bet) => Number(bet.winAmount || 0),
  },
  {
    id: "coinflip",
    label: "Coin Flip",
    collection: "coinFlipHistory",
    timeField: "createdAt",
    betField: "betAmount",
    payoutResolver: (bet) => Number(bet.winAmount || 0),
  },
  {
    id: "teenpatti",
    label: "Teen Patti",
    collection: "teenPattiHistory",
    timeField: "createdAt",
    betField: "betAmount",
    payoutResolver: (bet) => (bet.won ? Number(bet.winAmount || (Number(bet.betAmount || 0) * 1.9)) : 0),
  },
  {
    id: "dragontiger",
    label: "Dragon Tiger",
    collection: "dtHistory",
    timeField: "createdAt",
    betField: "betAmount",
    payoutResolver: (bet) => {
      if (!bet.won) return 0;
      const betAmount = Number(bet.betAmount || 0);
      const multiplier = bet.betSide === "tie" ? 8 : 1.9;
      return Number(bet.winAmount || betAmount * multiplier);
    },
  },
  {
    id: "andarbahar",
    label: "Andar Bahar",
    collection: "abHistory",
    timeField: "createdAt",
    betField: "betAmount",
    payoutResolver: (bet) => (bet.won ? Number(bet.winAmount || (Number(bet.betAmount || 0) * 1.9)) : 0),
  },
  {
    id: "colorprediction",
    label: "Color Prediction",
    collection: "colorBets",
    timeField: "createdAt",
    betField: "betAmount",
    payoutResolver: (bet) => Number(bet.winAmount || 0),
  },
  {
    id: "diceroll",
    label: "Dice Roll",
    collection: "diceBets",
    timeField: "createdAt",
    betField: "betAmount",
    payoutResolver: (bet) => Number(bet.winAmount || 0),
  },
  {
    id: "wingame",
    label: "1 to 12 Win",
    collection: "wingame_bets",
    timeField: "createdAt",
    betField: "amount",
    payoutResolver: (bet) => Number(bet.winnings || 0),
  },
  {
    id: "roulette",
    label: "Roulette",
    collection: "rouletteBets",
    timeField: "timestamp",
    betField: "betAmount",
    payoutResolver: (bet) => Number(bet.winnings || 0),
  },
];

export function calculateGameMetrics(records = []) {
  return records.reduce(
    (summary, record) => {
      const betAmount = roundMoney(record.betAmount);
      const payout = roundMoney(record.payout);

      summary.betCount += 1;
      summary.totalWagered = roundMoney(summary.totalWagered + betAmount);
      summary.totalPayout = roundMoney(summary.totalPayout + payout);
      summary.net = roundMoney(summary.totalWagered - summary.totalPayout);
      if (record.userId) {
        summary.userIds.add(record.userId);
      }

      return summary;
    },
    {
      betCount: 0,
      totalWagered: 0,
      totalPayout: 0,
      net: 0,
      userIds: new Set(),
    }
  );
}
