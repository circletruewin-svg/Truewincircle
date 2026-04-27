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

// Option B: 35% user win on coin-style games ⇒ ~33% house edge on 1.9x payouts.
function shouldUserWin() { return rand() < 0.35; }

function biasedWinnerFromSides(userBet, sides) {
  if (shouldUserWin()) return userBet;
  const losing = sides.filter(s => s !== userBet);
  return losing[Math.floor(rand() * losing.length)];
}

function rollAviatorCrash() {
  // Tightened distribution — heavy early crash, hard cap at 15x.
  // Mirrors Frontend/src/utils/houseEdge.js exactly. House edge
  // approximations: 1.3x → ~36%, 1.5x → ~42%, 2.0x → ~52%, 3.0x → ~66%.
  const r = rand();
  if (r < 0.45) return +(1.00 + rand() * 0.20).toFixed(2);
  if (r < 0.67) return +(1.20 + rand() * 0.40).toFixed(2);
  if (r < 0.83) return +(1.60 + rand() * 0.70).toFixed(2);
  if (r < 0.93) return +(2.30 + rand() * 1.20).toFixed(2);
  if (r < 0.98) return +(3.50 + rand() * 2.50).toFixed(2);
  return +(6.00 + rand() * 9.00).toFixed(2);
}

// Per-colour win rate so the house keeps an edge on every choice
// (2x, 3x, 4.5x payouts each need a different cap to stay house-positive).
function rollColor(userBet) {
  const winRates = { red: 0.35, green: 0.22, violet: 0.14 };
  if (rand() < (winRates[userBet] ?? 0.20)) return userBet;
  const losing = ['red', 'green', 'violet'].filter(c => c !== userBet);
  return losing[Math.floor(rand() * losing.length)];
}

function rollDice(userBet) {
  if (rand() < 0.12) return userBet;
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

  // Public doc — visible to logged-in clients. NEVER include the
  // crash point here: rules cannot project away individual fields, so
  // anything written here is readable by every authenticated user and
  // would let them deterministically beat the round.
  await db.collection('aviator_rounds').doc('current').set({
    roundId,
    startsAt,
    state: 'scheduled',
  });

  // Secret doc — admin-only via Firestore rules. The Admin SDK on the
  // backend bypasses rules so cashout below can still read it.
  await db.collection('aviator_secrets').doc('current').set({
    roundId,
    crashPoint,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
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

    // Read public state to confirm the round is still current, then read
    // the crash point from the admin-only secrets doc. Keeping these
    // separate prevents clients from seeing crashPoint via Firestore.
    const [roundSnap, secretSnap] = await Promise.all([
      db.collection('aviator_rounds').doc('current').get(),
      db.collection('aviator_secrets').doc('current').get(),
    ]);
    if (!roundSnap.exists || roundSnap.data().roundId !== roundId) {
      return res.status(400).json({ error: 'Round expired' });
    }
    if (!secretSnap.exists || secretSnap.data().roundId !== roundId) {
      return res.status(400).json({ error: 'Round secret missing' });
    }
    const startsAtMs = roundSnap.data().startsAt?.toMillis?.() ?? 0;
    const elapsedMs = Date.now() - startsAtMs;
    if (elapsedMs < 0) {
      return res.status(400).json({ error: 'Round has not started yet' });
    }
    // Defence in depth: even if crashPoint somehow leaks, cap the
    // multiplier at one consistent with elapsed time. Aviator climbs
    // ~1x → 1x + elapsed_seconds (i.e. 0.025 per second is a soft
    // upper bound; we use a generous 0.04/s + 1 floor).
    const maxAllowedMult = 1 + Math.max(0, elapsedMs / 1000) * 0.04 + 0.5;
    if (mult > maxAllowedMult) {
      return res.status(400).json({ error: 'Multiplier exceeds elapsed time' });
    }

    const { crashPoint } = secretSnap.data();
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
// 1–12 Win game — auto result every 5 minutes
// ────────────────────────────────────────────────────────────
// Result picker mirrors Frontend/src/Pages/WinGame.jsx:
// with HOUSE_BIAS_PROBABILITY chance picks the least-bet number
// (so house wins everything that round); otherwise fair 1/12 random.
const WINGAME_HOUSE_BIAS_PROBABILITY = 0.30;
const WINGAME_PAYOUT_MULTIPLIER = 10;

async function pickWinGameResult(roundId) {
  const betsSnap = await db.collection('wingame_bets').where('roundId', '==', roundId).get();
  const volume = {};
  for (let i = 1; i <= 12; i++) volume[i] = 0;
  betsSnap.forEach((d) => {
    const bet = d.data();
    if (typeof bet.number === 'number' && typeof bet.amount === 'number' && bet.number >= 1 && bet.number <= 12) {
      volume[bet.number] = (volume[bet.number] || 0) + bet.amount;
    }
  });

  if (rand() < WINGAME_HOUSE_BIAS_PROBABILITY) {
    const minVol = Math.min(...Object.values(volume));
    const candidates = Object.entries(volume).filter(([, v]) => v === minVol).map(([n]) => Number(n));
    return candidates[Math.floor(rand() * candidates.length)];
  }
  return Math.floor(rand() * 12) + 1;
}

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
    const result = await pickWinGameResult(roundId);
    console.log('🎯 Result:', result);

    await db.collection('results').add({
      gameType: 'winGame', roundId, result, createdAt: new Date(),
    });

    const betsSnapshot = await db.collection('wingame_bets')
      .where('roundId', '==', roundId).get();

    for (const doc of betsSnapshot.docs) {
      const bet = doc.data();
      if (bet.number === result) {
        const winAmount = bet.amount * WINGAME_PAYOUT_MULTIPLIER;
        await db.collection('users').doc(bet.userId).update({
          balance: admin.firestore.FieldValue.increment(winAmount),
          winningMoney: admin.firestore.FieldValue.increment(winAmount),
        });
        await db.collection('transactions').add({
          userId: bet.userId, amount: winAmount, type: 'win',
          gameType: 'winGame', roundId, createdAt: new Date(),
        });
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
