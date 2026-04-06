import { isDateInRange, toDateValue } from "./dateHelpers";

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const GAME_ANALYTICS_CONFIG = [
  {
    id: "aviator",
    label: "Aviator",
    sources: [
      {
        collection: "aviatorBets",
        mapRecord: (bet) => ({
          userId: bet.userId || null,
          betAmount: Number(bet.betAmount || bet.amount || 0),
          payout: Number(bet.winAmount || bet.winnings || 0),
          createdAt: bet.createdAt || bet.timestamp || null,
        }),
      },
      {
        collection: "aviatorHistory",
        mapRecord: (bet) => ({
          userId: bet.userId || null,
          betAmount: Number(bet.betAmount || bet.amount || 0),
          payout: Number(bet.winAmount || bet.winnings || 0),
          createdAt: bet.createdAt || bet.timestamp || null,
        }),
      },
    ],
  },
  {
    id: "coinflip",
    label: "Coin Flip",
    sources: [
      {
        collection: "coinFlipHistory",
        mapRecord: (bet) => ({
          userId: bet.userId || null,
          betAmount: Number(bet.betAmount || bet.amount || 0),
          payout: Number(bet.winAmount || bet.winnings || 0),
          createdAt: bet.createdAt || bet.timestamp || null,
        }),
      },
    ],
  },
  {
    id: "teenpatti",
    label: "Teen Patti",
    sources: [
      {
        collection: "teenPattiHistory",
        mapRecord: (bet) => ({
          userId: bet.userId || bet.uid || null,
          betAmount: Number(bet.betAmount || bet.amount || 0),
          payout: bet.won ? Number(bet.winAmount || bet.winnings || (Number(bet.betAmount || bet.amount || 0) * 1.9)) : 0,
          createdAt: bet.createdAt || bet.timestamp || null,
        }),
      },
    ],
  },
  {
    id: "dragontiger",
    label: "Dragon Tiger",
    sources: [
      {
        collection: "dtHistory",
        mapRecord: (bet) => ({
          userId: bet.userId || bet.uid || null,
          betAmount: Number(bet.betAmount || bet.amount || 0),
          payout: bet.won ? Number(bet.winAmount || bet.winnings || 0) : 0,
          createdAt: bet.createdAt || bet.timestamp || null,
        }),
      },
    ],
  },
  {
    id: "andarbahar",
    label: "Andar Bahar",
    sources: [
      {
        collection: "abHistory",
        mapRecord: (bet) => ({
          userId: bet.userId || bet.uid || null,
          betAmount: Number(bet.betAmount || bet.amount || 0),
          payout: bet.won ? Number(bet.winAmount || bet.winnings || 0) : 0,
          createdAt: bet.createdAt || bet.timestamp || null,
        }),
      },
    ],
  },
  {
    id: "colorprediction",
    label: "Color Prediction",
    sources: [
      {
        collection: "colorBets",
        mapRecord: (bet) => ({
          userId: bet.userId || bet.uid || null,
          betAmount: Number(bet.betAmount || bet.amount || 0),
          payout: Number(bet.winAmount || bet.winnings || 0),
          createdAt: bet.createdAt || bet.timestamp || null,
        }),
      },
      {
        collection: "colorHistory",
        mapRecord: (bet) => ({
          userId: bet.userId || bet.uid || null,
          betAmount: Number(bet.betAmount || bet.amount || 0),
          payout: Number(bet.winAmount || bet.winnings || 0),
          createdAt: bet.createdAt || bet.timestamp || null,
        }),
      },
    ],
  },
  {
    id: "diceroll",
    label: "Dice Roll",
    sources: [
      {
        collection: "diceBets",
        mapRecord: (bet) => ({
          userId: bet.userId || bet.uid || null,
          betAmount: Number(bet.betAmount || bet.amount || 0),
          payout: Number(bet.winAmount || bet.winnings || 0),
          createdAt: bet.createdAt || bet.timestamp || null,
        }),
      },
    ],
  },
  {
    id: "wingame",
    label: "1 to 12 Win",
    sources: [
      {
        collection: "wingame_bets",
        mapRecord: (bet) => ({
          userId: bet.userId || null,
          betAmount: Number(bet.amount || bet.betAmount || 0),
          payout: Number(bet.winnings || bet.winAmount || 0),
          createdAt: bet.createdAt || bet.timestamp || null,
        }),
      },
    ],
  },
  {
    id: "roulette",
    label: "Roulette",
    sources: [
      {
        collection: "rouletteBets",
        mapRecord: (bet) => ({
          userId: bet.userId || null,
          betAmount: Number(bet.betAmount || 0),
          payout: Number(bet.winnings || 0),
          createdAt: bet.timestamp || bet.createdAt || null,
        }),
      },
    ],
  },
];

export function filterAnalyticsRecords(records = [], startDate, endDate) {
  return records.filter((record) => {
    const createdAt = toDateValue(record.createdAt);
    if (!createdAt) return false;
    if (Number(record.betAmount || 0) <= 0) return false;
    return isDateInRange(createdAt, startDate, endDate);
  });
}

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
