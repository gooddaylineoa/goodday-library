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

  const { uid, bookId, dueDate } = req.body;
  if (!uid || !bookId || !dueDate) return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });

  try {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'ไม่พบข้อมูลสมาชิก' });
    const userData = userDoc.data();

    // เช็ควันคืนไม่เกิน 2 เดือนนับจากวันนี้
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 2);
    const chosenDate = new Date(dueDate);
    if (chosenDate > maxDate) {
      return res.status(400).json({ error: 'สามารถยืมได้ไม่เกิน 2 เดือน' });
    }
    if (chosenDate < new Date()) {
      return res.status(400).json({ error: 'วันที่คืนต้องเป็นวันในอนาคต' });
    }

    const bookRef = adminDb.collection('libraryBooks').doc(bookId);
    const bookDoc = await bookRef.get();
    if (!bookDoc.exists) return res.status(404).json({ error: 'ไม่พบหนังสือนี้' });
    const bookData = bookDoc.data();

    if ((bookData.availableCopies || 0) <= 0) {
      return res.status(400).json({ error: 'หนังสือเล่มนี้ถูกยืมหมดแล้ว' });
    }

    // เช็คว่ากำลังยืมเล่มนี้อยู่แล้วหรือเปล่า (กันยืมซ้ำเล่มเดียวกัน)
    const existingSnap = await adminDb.collection('libraryBorrowRecords')
      .where('uid', '==', uid)
      .where('bookId', '==', bookId)
      .where('status', 'in', ['pending_pickup', 'borrowing'])
      .get();
    if (!existingSnap.empty) {
      return res.status(400).json({ error: 'คุณกำลังยืมหนังสือเล่มนี้อยู่แล้ว' });
    }

    const recordRef = await adminDb.collection('libraryBorrowRecords').add({
      uid,
      bookId,
      bookTitle: bookData.title,
      bookCover: bookData.coverImage || '',
      branchId: bookData.branchId,
      borrowerName: userData.name || 'สมาชิก',
      requestedAt: new Date(),
      dueDate: chosenDate,
      status: 'pending_pickup'
    });

    await bookRef.update({ availableCopies: bookData.availableCopies - 1 });

    return res.status(200).json({ success: true, recordId: recordRef.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}