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

  const { uid, branchId, spaceId, spaceName, date, startTime, endTime } = req.body;
  if (!uid || !branchId || !spaceId || !date || !startTime || !endTime) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });
  }

  try {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'ไม่พบข้อมูลสมาชิก' });
    const userData = userDoc.data();

    const chosenDate = new Date(date);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (chosenDate < today) {
      return res.status(400).json({ error: 'ไม่สามารถจองวันที่ผ่านมาแล้วได้' });
    }

    let bookingCode;

    await adminDb.runTransaction(async (t) => {
      // เช็คว่าพื้นที่นี้ วันนี้ ถูกจองไปแล้วหรือยัง (สถานะ confirmed เท่านั้น)
      const existingSnap = await adminDb.collection('librarySpaceBookings')
        .where('spaceId', '==', spaceId)
        .where('date', '==', date)
        .where('status', '==', 'confirmed')
        .get();

      if (!existingSnap.empty) {
        throw new Error('พื้นที่นี้ถูกจองไปแล้วในวันที่เลือก กรุณาเลือกวันอื่น');
      }

      bookingCode = 'SPB-' + Date.now().toString().slice(-8);
      const bookingRef = adminDb.collection('librarySpaceBookings').doc();
      t.set(bookingRef, {
        uid,
        branchId,
        spaceId,
        spaceName,
        date,
        startTime,
        endTime,
        borrowerName: userData.name || 'สมาชิก',
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