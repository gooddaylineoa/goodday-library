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

  const { librarianUid, recordId } = req.body;
  if (!librarianUid || !recordId) return res.status(400).json({ error: 'ข้อมูลไม่ครบ' });

  try {
    const librarianDoc = await adminDb.collection('users').doc(librarianUid).get();
    if (!librarianDoc.exists || !librarianDoc.data().isLibrarian) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์บรรณารักษ์' });
    }
    const librarianBranchId = librarianDoc.data().librarianBranchId;

    const recordRef = adminDb.collection('libraryBorrowRecords').doc(recordId);
    const recordDoc = await recordRef.get();
    if (!recordDoc.exists) return res.status(404).json({ error: 'ไม่พบรายการยืมนี้' });
    const record = recordDoc.data();

    if (record.branchId !== librarianBranchId) {
      return res.status(403).json({ error: 'รายการนี้ไม่ได้เป็นของสาขาคุณ' });
    }
    if (record.status !== 'pending_pickup') {
      return res.status(400).json({ error: 'รายการนี้ยืนยันไปแล้ว หรือถูกยกเลิก' });
    }

    await recordRef.update({
      status: 'borrowing',
      librarianConfirmedBy: librarianUid,
      librarianConfirmedAt: new Date()
    });

    return res.status(200).json({ success: true, borrowerName: record.borrowerName, bookTitle: record.bookTitle });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}