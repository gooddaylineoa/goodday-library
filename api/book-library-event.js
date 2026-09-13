import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

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

  const { uid, eventId, slotId } = req.body;
  if (!uid || !eventId || !slotId) return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });

  try {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'ไม่พบข้อมูลสมาชิก' });
    const userData = userDoc.data();

    const eventRef = adminDb.collection('libraryEvents').doc(eventId);
    let bookingCode;

    await adminDb.runTransaction(async (t) => {
      const eventDoc = await t.get(eventRef);
      if (!eventDoc.exists) throw new Error('ไม่พบกิจกรรมนี้');
      const eventData = eventDoc.data();

      const slots = eventData.slots || [];
      const slotIndex = slots.findIndex(s => s.slotId === slotId);
      if (slotIndex === -1) throw new Error('ไม่พบรอบเวลานี้');

      const slot = slots[slotIndex];
      if ((slot.bookedSeats || 0) >= slot.totalSeats) {
        throw new Error('ที่นั่งเต็มแล้ว');
      }

      // เช็คว่าจองรอบนี้ซ้ำหรือยัง
      const existingSnap = await adminDb.collection('users').doc(uid)
        .collection('libraryEventBookings')
        .where('eventId', '==', eventId)
        .where('slotId', '==', slotId)
        .where('status', '==', 'confirmed')
        .get();
      if (!existingSnap.empty) throw new Error('คุณจองรอบนี้ไปแล้ว');

      slots[slotIndex] = { ...slot, bookedSeats: (slot.bookedSeats || 0) + 1 };
      t.update(eventRef, { slots });

      bookingCode = 'LEB-' + Date.now().toString().slice(-8);
      const bookingRef = adminDb.collection('users').doc(uid).collection('libraryEventBookings').doc();
      t.set(bookingRef, {
        eventId,
        slotId,
        eventName: eventData.name,
        eventImage: eventData.image || '',
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        location: eventData.location || '',
        branchId: eventData.branchId,
        bookerName: userData.name || 'สมาชิก',
        bookingCode,
        status: 'confirmed',
        bookedAt: Timestamp.now()
      });
    });

    return res.status(200).json({ success: true, bookingCode });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}