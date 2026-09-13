import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined
    })
  });
}

const adminDb = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'ใช้ได้เฉพาะ POST เท่านั้น' });

  const { uid, bookingId } = req.body;
  if (!uid || !bookingId) return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });

  try {
    const bookingRef = adminDb.collection('users').doc(uid).collection('libraryEventBookings').doc(bookingId);

    await adminDb.runTransaction(async (t) => {
      const bookingDoc = await t.get(bookingRef);
      if (!bookingDoc.exists) throw new Error('ไม่พบรายการจองนี้');
      const booking = bookingDoc.data();
      if (booking.status !== 'confirmed') throw new Error('รายการนี้ถูกยกเลิกไปแล้ว');

      const eventRef = adminDb.collection('libraryEvents').doc(booking.eventId);
      const eventDoc = await t.get(eventRef);
      if (eventDoc.exists) {
        const slots = eventDoc.data().slots || [];
        const idx = slots.findIndex(s => s.slotId === booking.slotId);
        if (idx !== -1) {
          slots[idx] = { ...slots[idx], bookedSeats: Math.max((slots[idx].bookedSeats || 0) - 1, 0) };
          t.update(eventRef, { slots });
        }
      }

      t.update(bookingRef, { status: 'cancelled' });
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}