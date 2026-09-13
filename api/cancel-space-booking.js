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
    const bookingRef = adminDb.collection('librarySpaceBookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) return res.status(404).json({ error: 'ไม่พบรายการจองนี้' });
    const booking = bookingDoc.data();

    if (booking.uid !== uid) return res.status(403).json({ error: 'ไม่มีสิทธิ์ยกเลิกรายการนี้' });
    if (booking.status !== 'confirmed') return res.status(400).json({ error: 'รายการนี้ถูกยกเลิกไปแล้ว' });

    await bookingRef.update({ status: 'cancelled' });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}