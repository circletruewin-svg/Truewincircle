import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

/**
 * Create a notification for a user.
 * Stored at users/{userId}/notifications/{notifId}.
 *
 * Valid types: 'win', 'deposit', 'withdrawal', 'referral', 'system'.
 */
export async function createNotification(userId, { type = 'system', title, body, link = null }) {
  if (!userId || !title) return;
  try {
    await addDoc(collection(db, 'users', userId, 'notifications'), {
      type,
      title,
      body: body || '',
      link,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

export async function markNotificationRead(userId, notifId) {
  if (!userId || !notifId) return;
  try {
    await updateDoc(doc(db, 'users', userId, 'notifications', notifId), { read: true });
  } catch (err) {
    console.error('Failed to mark notification read:', err);
  }
}

export async function markAllNotificationsRead(userId, notifications) {
  if (!userId || !notifications?.length) return;
  const batch = writeBatch(db);
  for (const n of notifications) {
    if (!n.read) {
      batch.update(doc(db, 'users', userId, 'notifications', n.id), { read: true });
    }
  }
  try { await batch.commit(); }
  catch (err) { console.error('Failed to mark all read:', err); }
}
