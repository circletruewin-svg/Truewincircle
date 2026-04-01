import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import admin from 'firebase-admin';

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;

// 🔥 FIREBASE INIT
import serviceAccount from './firebaseAdmin.json' assert { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();


// ==============================
// 🎯 AUTO RESULT SYSTEM (1–12 WIN)
// ==============================

setInterval(async () => {
  try {
    console.log("⏱ Running Win Game Result...");

    // 👉 current round
    const roundRef = db.collection("wingame_rounds").doc("current");
    const roundDoc = await roundRef.get();

    if (!roundDoc.exists) {
      await roundRef.set({ roundId: Date.now() });
      return;
    }

    const roundId = roundDoc.data().roundId;

    // 🎯 RANDOM RESULT (1–12)
    const result = Math.floor(Math.random() * 12) + 1;

    console.log("🎯 Result:", result);

    // 👉 SAVE RESULT
    await db.collection("results").add({
      gameType: "winGame",
      roundId,
      result,
      createdAt: new Date()
    });

    // 👉 FETCH BETS
    const betsSnapshot = await db.collection("wingame_bets")
      .where("roundId", "==", roundId)
      .get();

    for (let doc of betsSnapshot.docs) {
      const bet = doc.data();

      if (bet.number === result) {
        const winAmount = bet.amount * 9;

        // 💰 UPDATE USER BALANCE
        await db.collection("users").doc(bet.userId).update({
          balance: admin.firestore.FieldValue.increment(winAmount),
          winningMoney: admin.firestore.FieldValue.increment(winAmount)
        });

        // 🧾 TRANSACTION LOG
        await db.collection("transactions").add({
          userId: bet.userId,
          amount: winAmount,
          type: "win",
          gameType: "winGame",
          roundId,
          createdAt: new Date()
        });
      }
    }

    // 🔁 NEW ROUND
    await roundRef.set({
      roundId: Date.now()
    });

  } catch (err) {
    console.log("❌ Error:", err);
  }
}, 5 * 60 * 1000); // हर 5 मिनट


// ==============================
// 🚀 SERVER START
// ==============================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});