import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import admin from './firebaseAdmin.js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;

if (!admin) {
  console.error('Firebase Admin failed to initialize — aborting server start.');
  process.exit(1);
}

const db = admin.firestore();

// ────────────────────────────────────────────────────────────
// Auth middleware — expects Authorization: Bearer <idToken>
// ────────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing auth token' });
    const decoded = await admin.auth().verifyIdToken(token);
    req.userId = decoded.uid;
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    res.status(401).json({ error: 'Invalid auth token' });
  }
}

// ────────────────────────────────────────────────────────────
// Server-side RNG helpers (mirrors Frontend/src/utils/houseEdge.js
// but authoritative — clients cannot modify these rates).
// ────────────────────────────────────────────────────────────
function rand() { return Math.random(); }

function shouldUserWin() { return rand() < 0.40; }

function biasedWinnerFromSides(userBet, sides) {
  if (shouldUserWin()) return userBet;
  const losing = sides.filter(s => s !== userBet);
  return losing[Math.floor(rand() * losing.length)];
}

function rollAviatorCrash() {
  const r = rand();
  if (r < 0.30) return +(1.00 + rand() * 0.40).toFixed(2);
  if (r < 0.60) return +(1.40 + rand() * 0.60).toFixed(2);
  if (r < 0.80) return +(2.00 + rand() * 1.50).toFixed(2);
  if (r < 0.92) return +(3.50 + rand() * 3.50).toFixed(2);
  if (r < 0.98) return +(7.00 + rand() * 8.00).toFixed(2);
  return +(15.00 + rand() * 25.00).toFixed(2);
}

function rollColor(userBet) {
  const r = rand();
  let winner;
  if (r < 0.42) winner = 'red';
  else if (r < 0.84) winner = 'green';
  else winner = 'violet';
  if (winner === 'violet' && userBet === 'violet' && rand() < 0.35) {
    winner = rand() < 0.5 ? 'red' : 'green';
  }
  return winner;
}

function rollDice(userBet) {
  if (rand() < 0.14) return userBet;
  const others = [1, 2, 3, 4, 5, 6].filter(n => n !== userBet);
  return others[Math.floor(rand() * others.length)];
}

// ────────────────────────────────────────────────────────────
// Shared bet settlement — debits funds, writes history, credits
// winnings all inside a single Firestore transaction so users can
// never be double-charged or double-credited.
// ────────────────────────────────────────────────────────────
async function settleBet({
  userId, betAmount, won, winAmount, gameType, historyCollection, extraHistory,
}) {
  const userRef = db.collection('users').doc(userId);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new Error('User not found');
    const data = userSnap.data();
    const balance = Number(data.balance || 0);
    const winningMoney = Number(data.winningMoney || 0);
    const suspended = !!data.suspended;
    if (suspended) throw new Error('Account suspended');
    if (balance + winningMoney < betAmount) throw new Error('Insufficient funds');

    // Debit from balance first, then winningMoney.
    let remaining = betAmount;
    const debitFromBalance = Math.min(balance, remaining);
    remaining -= debitFromBalance;
    const debitFromWinnings = Math.min(winningMoney, remaining);

    tx.update(userRef, {
      balance: admin.firestore.FieldValue.increment(-debitFromBalance),
      winningMoney: admin.firestore.FieldValue.increment(
        won ? winAmount - debitFromWinnings : -debitFromWinnings
      ),
    });

    const historyRef = db.collection(historyCollection).doc();
    tx.set(historyRef, {
      userId,
      betAmount,
      winAmount: won ? winAmount : 0,
      won,
      gameType,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(extraHistory || {}),
    });

    if (won) {
      const notifRef = db.collection('users').doc(userId)
        .collection('notifications').doc();
      tx.set(notifRef, {
        type: 'win',
        title: `You won ₹${winAmount.toFixed(2)}!`,
        body: `${gameType} payout credited to your winnings.`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });
}

// ────────────────────────────────────────────────────────────
// Instant game endpoints
// ────────────────────────────────────────────────────────────
app.post('/api/game/coinflip', requireAuth, async (req, res) => {
  try {
    const { userBet, betAmount } = req.body;
    if (!['heads', 'tails'].includes(userBet)) return res.status(400).json({ error: 'Invalid bet side' });
    const amount = Number(betAmount);
    if (!(amount > 0)) return res.status(400).json({ error: 'Invalid amount' });

    const winner = biasedWinnerFromSides(userBet, ['heads', 'tails']);
    const won = winner === userBet;
    const winAmount = won ? +(amount * 1.9).toFixed(2) : 0;

    await settleBet({
      userId: req.userId, betAmount: amount, won, winAmount,
      gameType: 'coinFlip', historyCollection: 'coinFlipHistory',
      extraHistory: { userBet, result: winner },
    });
    res.json({ winner, won, winAmount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/game/dice', requireAuth, async (req, res) => {
  try {
    const { userBet, betAmount } = req.body;
    const pick = Number(userBet);
    if (!Number.isInteger(pick) || pick < 1 || pick > 6) return res.status(400).json({ error: 'Invalid dice pick' });
    const amount = Number(betAmount);
    if (!(amount > 0)) return res.status(400).json({ error: 'Invalid amount' });

    const result = rollDice(pick);
    const won = result === pick;
    const winAmount = won ? +(amount * 5.5).toFixed(2) : 0;

    await settleBet({
      userId: req.userId, betAmount: amount, won, winAmount,
      gameType: 'diceRoll', historyCollection: 'diceBets',
      extraHistory: { userBet: pick, result },
    });
    res.json({ result, won, winAmount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/game/color', requireAuth, async (req, res) => {
  try {
    const { userBet, betAmount } = req.body;
    if (!['red', 'green', 'violet'].includes(userBet)) return res.status(400).json({ error: 'Invalid colour' });
    const amount = Number(betAmount);
    if (!(amount > 0)) return res.status(400).json({ error: 'Invalid amount' });

    const winner = rollColor(userBet);
    const won = winner === userBet;
    const multiplierMap = { red: 2, green: 3, violet: 4.5 };
    const winAmount = won ? +(amount * multiplierMap[userBet]).toFixed(2) : 0;

    await settleBet({
      userId: req.userId, betAmount: amount, won, winAmount,
      gameType: 'colorPrediction', historyCollection: 'colorHistory',
      extraHistory: { userBet, result: winner },
    });
    res.json({ result: winner, won, winAmount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// Aviator — round loop (server-authoritative crash point)
// ────────────────────────────────────────────────────────────
const AVIATOR_ROUND_INTERVAL_MS = 40 * 1000;
const AVIATOR_REVEAL_DELAY_MS = 6 * 1000; // matches ROUND_WAIT on frontend

async function startAviatorRound() {
  const roundId = Date.now();
  const crashPoint = rollAviatorCrash();
  const startsAt = admin.firestore.Timestamp.fromMillis(roundId + AVIATOR_REVEAL_DELAY_MS);
  await db.collection('aviator_rounds').doc('current').set({
    roundId,
    crashPoint, // visible once round is revealed — see rules
    startsAt,
    state: 'scheduled',
  });
}

setInterval(async () => {
  try { await startAviatorRound(); }
  catch (err) { console.error('Aviator round scheduling failed:', err.message); }
}, AVIATOR_ROUND_INTERVAL_MS);

app.post('/api/game/aviator/cashout', requireAuth, async (req, res) => {
  try {
    const { roundId, betAmount, multiplier } = req.body;
    const amount = Number(betAmount);
    const mult = Number(multiplier);
    if (!roundId || !(amount > 0) || !(mult >= 1)) return res.status(400).json({ error: 'Invalid payload' });

    const roundSnap = await db.collection('aviator_rounds').doc('current').get();
    if (!roundSnap.exists || roundSnap.data().roundId !== roundId) {
      return res.status(400).json({ error: 'Round expired' });
    }
    const { crashPoint } = roundSnap.data();
    const won = mult <= crashPoint;
    const winAmount = won ? +(amount * mult).toFixed(2) : 0;

    await settleBet({
      userId: req.userId, betAmount: amount, won, winAmount,
      gameType: 'aviator', historyCollection: 'aviatorHistory',
      extraHistory: { crashPoint, cashoutMultiplier: mult, roundId },
    });
    res.json({ won, winAmount, crashPoint });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────
// 1–12 Win game — auto result every 5 minutes (kept as-is)
// ────────────────────────────────────────────────────────────
setInterval(async () => {
  try {
    console.log('⏱ Running Win Game Result...');

    const roundRef = db.collection('wingame_rounds').doc('current');
    const roundDoc = await roundRef.get();
    if (!roundDoc.exists) {
      await roundRef.set({ roundId: Date.now() });
      return;
    }

    const roundId = roundDoc.data().roundId;
    const result = Math.floor(Math.random() * 12) + 1;
    console.log('🎯 Result:', result);

    await db.collection('results').add({
      gameType: 'winGame', roundId, result, createdAt: new Date(),
    });

    const betsSnapshot = await db.collection('wingame_bets')
      .where('roundId', '==', roundId).get();

    for (const doc of betsSnapshot.docs) {
      const bet = doc.data();
      if (bet.number === result) {
        const winAmount = bet.amount * 9;
        await db.collection('users').doc(bet.userId).update({
          balance: admin.firestore.FieldValue.increment(winAmount),
          winningMoney: admin.firestore.FieldValue.increment(winAmount),
        });
        await db.collection('transactions').add({
          userId: bet.userId, amount: winAmount, type: 'win',
          gameType: 'winGame', roundId, createdAt: new Date(),
        });
        // Notify the winner
        await db.collection('users').doc(bet.userId)
          .collection('notifications').add({
            type: 'win',
            title: `You won ₹${winAmount.toFixed(2)}!`,
            body: `1–12 Win round ${roundId}: number ${result} paid out.`,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
      }
    }

    await roundRef.set({ roundId: Date.now() });
  } catch (err) {
    console.log('❌ Error:', err);
  }
}, 5 * 60 * 1000);

// ────────────────────────────────────────────────────────────
// 🚀 SERVER START
// ────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.send('TrueWinCircle API ok'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startAviatorRound().catch(() => {}); // seed the first round immediately
});
