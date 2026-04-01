# 🔥 Firebase Firestore — Naye Collections Setup

## Yeh collections automatically ban jayenge jab users pehli baar game khelenge.
## Manually kuch banana nahi hai. Bas Firestore Rules update karo.

---

## firestore.rules mein ADD karo (existing rules ke andar):

```
// ── New Games ──────────────────────────────────
match /aviatorHistory/{id} {
  allow read, write: if request.auth != null;
}
match /aviatorBets/{id} {
  allow read, write: if request.auth != null;
}
match /colorHistory/{id} {
  allow read, write: if request.auth != null;
}
match /colorBets/{id} {
  allow read, write: if request.auth != null;
}
match /coinFlipHistory/{id} {
  allow read, write: if request.auth != null;
}
match /diceBets/{id} {
  allow read, write: if request.auth != null;
}
match /teenPattiHistory/{id} {
  allow read, write: if request.auth != null;
}
match /dtHistory/{id} {
  allow read, write: if request.auth != null;
}
match /abHistory/{id} {
  allow read, write: if request.auth != null;
}
```

---

## houseEdge.js — Copy karo yahan:
`Frontend/src/utils/houseEdge.js`

(File already provided in download)

---

## CHECKLIST

- [ ] `utils/houseEdge.js` → `Frontend/src/utils/houseEdge.js`
- [ ] `Aviator.jsx`        → `Frontend/src/Pages/Aviator.jsx`
- [ ] `TeenPatti.jsx`      → `Frontend/src/Pages/TeenPatti.jsx`
- [ ] `DragonTiger.jsx`    → `Frontend/src/Pages/DragonTiger.jsx`
- [ ] `AndarBahar.jsx`     → `Frontend/src/Pages/AndarBahar.jsx`
- [ ] `ColorPrediction.jsx`→ `Frontend/src/Pages/ColorPrediction.jsx`
- [ ] `CoinFlip.jsx`       → `Frontend/src/Pages/CoinFlip.jsx`
- [ ] `DiceRoll.jsx`       → `Frontend/src/Pages/DiceRoll.jsx`
- [ ] `App.jsx` mein imports + routes add kiye
- [ ] `Home.jsx` mein games grid paste ki
- [ ] `firestore.rules` update ki
- [ ] `firebase deploy --only firestore:rules` run kiya
- [ ] `npm run build && npm run deploy` (ya Vercel auto deploy)
