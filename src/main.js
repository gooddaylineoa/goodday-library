import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, getDocs, setDoc, deleteDoc, collection, query, where } from 'firebase/firestore';
import { initLineAuth } from './lineAuth.js';

function showToast(message, type = 'info', duration = 3200) {
  const container = document.getElementById('toast-container');
  const colors = { success: 'bg-emerald-500', error: 'bg-rose-500', info: 'bg-blue-500' };
  const toast = document.createElement('div');
  toast.className = `${colors[type] || colors.info} text-white rounded-2xl shadow-lg px-5 py-4 text-lg font-bold`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}
window.showToast = showToast;

function showView(id) {
  document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
window.showView = showView;

function showLoading(msg = 'กำลังประมวลผล...') {
  document.getElementById('loading-text').innerText = msg;
  const el = document.getElementById('loading-overlay');
  el.classList.remove('hidden'); el.classList.add('flex');
}
function hideLoading() {
  const el = document.getElementById('loading-overlay');
  el.classList.add('hidden'); el.classList.remove('flex');
}
window.showLoading = showLoading;
window.hideLoading = hideLoading;

let currentUid = null;
let currentUserData = null;

document.getElementById('btn-go-member-system').onclick = () => {
  window.location.href = 'https://goodday-member-system.vercel.app';
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    const snap = await getDoc(doc(db, 'users', currentUid));
    const data = snap.exists() ? snap.data() : null;

    if (!data || !data.profileComplete) {
      showView('not-member-view');
      return;
    }

    // ต้องเป็นสมาชิกห้องสมุด (มี libraryMember.joined = true) และเลือกสาขาแล้ว
    if (!data.libraryMember || !data.libraryMember.joined || !data.libraryMember.branchId) {
      showView('not-library-member-view');
      return;
    }

    currentUserData = data;
    showView('home-view');
    loadHomeData();
  } else {
    currentUid = null;
    try {
      await initLineAuth();
    } catch (err) {
      console.error('Auto LINE login failed:', err);
      showToast('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่', 'error');
    }
  }
});

function loadHomeData() {
  document.getElementById('lib-card-id').innerText = currentUserData.libraryMember.cardId || '-';
  document.getElementById('lib-card-name').innerText = currentUserData.name || '-';
  document.getElementById('lib-card-branch').innerText =
    `${currentUserData.libraryMember.branchName || '-'} · ${currentUserData.libraryMember.province || '-'}`;

  checkLibrarianStatus(); // 🆕 เพิ่มบรรทัดนี้
}

document.getElementById('btn-search-books').onclick = () => showToast('ค้นหาหนังสือ จะทำในเฟส 2', 'info');
document.getElementById('btn-my-books').onclick = () => showToast('หนังสือของฉัน จะทำในเฟส 3', 'info');
document.getElementById('btn-lib-activities').onclick = () => showToast('กิจกรรม จะทำในเฟส 4', 'info');
document.getElementById('btn-suggest-book').onclick = () => showToast('เสนอแนะหนังสือ จะทำในเฟส 5', 'info');
document.getElementById('btn-creative-community').onclick = () => showToast('ชุมชนสร้างสรรค์ จะทำในเฟส 5', 'info');
document.getElementById('btn-lib-calendar').onclick = () => showToast('ปฏิทินกิจกรรม จะทำในเฟส 4', 'info');
document.getElementById('tab-space-booking').onclick = () => showToast('จองพื้นที่ จะทำในเฟส 6', 'info');
document.getElementById('tab-news').onclick = () => showToast('ข่าวสาร จะทำในเฟส 7', 'info');

// ================= ค้นหาหนังสือ =================

let allBooksData = [];
let likedBookIds = new Set();
let currentBookCategory = 'all';
let currentBookTab = 'all';

document.getElementById('btn-search-books').onclick = () => {
  showView('book-search-view');
  loadBooks();
};
document.getElementById('btn-back-book-search').onclick = () => showView('home-view');

async function loadBooks() {
  const branchId = currentUserData.libraryMember.branchId;

  const q = query(collection(db, 'libraryBooks'), where('branchId', '==', branchId));
  const snap = await getDocs(q);
  allBooksData = [];
  snap.forEach(d => allBooksData.push({ id: d.id, ...d.data() }));

  const likedSnap = await getDocs(collection(db, 'users', currentUid, 'libraryLikedBooks'));
  likedBookIds = new Set();
  likedSnap.forEach(d => likedBookIds.add(d.id));

  renderBookCategories();
  renderBookGrid();
}

function renderBookCategories() {
  const categories = [...new Set(allBooksData.map(b => b.category).filter(c => c))];
  const container = document.getElementById('book-category-scroll');

  container.innerHTML = [
    `<button data-cat="all" class="book-cat-btn shrink-0 px-4 py-2 rounded-full text-base font-bold theme-pink text-white">ทั้งหมด</button>`,
    ...categories.map(c => `<button data-cat="${c}" class="book-cat-btn shrink-0 px-4 py-2 rounded-full text-base font-bold bg-gray-100 text-gray-600">${c}</button>`)
  ].join('');

  document.querySelectorAll('.book-cat-btn').forEach(btn => {
    btn.onclick = () => {
      currentBookCategory = btn.dataset.cat;
      document.querySelectorAll('.book-cat-btn').forEach(b => b.className = 'book-cat-btn shrink-0 px-4 py-2 rounded-full text-base font-bold bg-gray-100 text-gray-600');
      btn.className = 'book-cat-btn shrink-0 px-4 py-2 rounded-full text-base font-bold theme-pink text-white';
      renderBookGrid();
    };
  });
}

function isNewBook(book) {
  if (!book.createdAt) return false;
  const created = book.createdAt.toDate ? book.createdAt.toDate() : new Date(book.createdAt);
  const daysSince = (new Date() - created) / (1000 * 60 * 60 * 24);
  return daysSince <= 30;
}

document.getElementById('book-search-input').oninput = () => renderBookGrid();
document.getElementById('book-filter-new').onchange = () => renderBookGrid();

document.getElementById('book-tab-all').onclick = () => {
  currentBookTab = 'all';
  document.getElementById('book-tab-all').className = 'flex-1 py-3 text-lg font-black theme-text border-b-2 border-pink-500';
  document.getElementById('book-tab-liked').className = 'flex-1 py-3 text-lg font-black text-gray-400 border-b-2 border-transparent';
  renderBookGrid();
};
document.getElementById('book-tab-liked').onclick = () => {
  currentBookTab = 'liked';
  document.getElementById('book-tab-liked').className = 'flex-1 py-3 text-lg font-black theme-text border-b-2 border-pink-500';
  document.getElementById('book-tab-all').className = 'flex-1 py-3 text-lg font-black text-gray-400 border-b-2 border-transparent';
  renderBookGrid();
};

function renderBookGrid() {
  const term = document.getElementById('book-search-input').value.trim().toLowerCase();
  const newOnly = document.getElementById('book-filter-new').checked;

  let filtered = allBooksData;

  if (currentBookTab === 'liked') {
    filtered = filtered.filter(b => likedBookIds.has(b.id));
  }
  if (currentBookCategory !== 'all') {
    filtered = filtered.filter(b => b.category === currentBookCategory);
  }
  if (newOnly) {
    filtered = filtered.filter(isNewBook);
  }
  if (term) {
    filtered = filtered.filter(b =>
      (b.title || '').toLowerCase().includes(term) || (b.bookCode || '').toLowerCase().includes(term)
    );
  }

  const grid = document.getElementById('book-grid');
  if (filtered.length === 0) {
    grid.innerHTML = '<p class="col-span-2 text-center text-gray-400 text-lg py-8">ไม่พบหนังสือ</p>';
    return;
  }

  grid.innerHTML = filtered.map(b => {
    const shortDesc = (b.description || '').length > 40 ? b.description.slice(0, 40) + '...' : (b.description || '');
    return `
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer" onclick="openBookDetail('${b.id}')">
        <img src="${b.coverImage || ''}" class="w-full h-40 object-cover bg-gray-100">
        <div class="p-3">
          <h4 class="font-bold text-gray-800 text-base leading-tight mb-1 line-clamp-2">${b.title}</h4>
          <p class="text-sm text-gray-400 mb-1">รหัส: ${b.bookCode || '-'}</p>
          <p class="text-sm text-gray-500">${shortDesc}</p>
        </div>
      </div>`;
  }).join('');
}

let currentBookId = null;

function openBookDetail(bookId) {
  const b = allBooksData.find(x => x.id === bookId);
  if (!b) return;
  currentBookId = bookId;

  document.getElementById('bd-cover').src = b.coverImage || '';
  document.getElementById('bd-category').innerText = b.category || 'ไม่ระบุหมวดหมู่';
  document.getElementById('bd-title').innerText = b.title;
  document.getElementById('bd-author').innerText = b.author || '';
  document.getElementById('bd-code').innerText = b.bookCode || '-';
  document.getElementById('bd-available').innerText = b.availableCopies ?? 0;
  document.getElementById('bd-description').innerText = b.description || 'ยังไม่มีเรื่องย่อ';

  updateLikeButton(bookId);

  showView('book-detail-view');
}
window.openBookDetail = openBookDetail;

document.getElementById('btn-back-book-detail').onclick = () => showView('book-search-view');

function updateLikeButton(bookId) {
  const btn = document.getElementById('btn-like-book');
  const isLiked = likedBookIds.has(bookId);
  btn.innerHTML = isLiked ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
  btn.className = `w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${isLiked ? 'bg-rose-50 text-rose-500' : 'bg-gray-50 text-gray-400'}`;
}

document.getElementById('btn-like-book').onclick = async () => {
  const isLiked = likedBookIds.has(currentBookId);
  const likeRef = doc(db, 'users', currentUid, 'libraryLikedBooks', currentBookId);

  showLoading(isLiked ? 'กำลังเอาออกจากรายการถูกใจ...' : 'กำลังเพิ่มในรายการถูกใจ...');
  try {
    if (isLiked) {
      await deleteDoc(likeRef);
      likedBookIds.delete(currentBookId);
    } else {
      await setDoc(likeRef, { likedAt: new Date() });
      likedBookIds.add(currentBookId);
    }
    updateLikeButton(currentBookId);
  } catch (err) {
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
};

document.getElementById('btn-borrow-book').onclick = () => {
  showToast('ระบบยืมหนังสือ จะทำในเฟส 3', 'info');
};

// ================= ยืมหนังสือ =================

document.getElementById('btn-borrow-book').onclick = () => {
  const today = new Date();
  const minDate = new Date(today); minDate.setDate(today.getDate() + 1);
  const maxDate = new Date(today); maxDate.setMonth(today.getMonth() + 2);

  const dateInput = document.getElementById('borrow-due-date');
  dateInput.min = minDate.toISOString().split('T')[0];
  dateInput.max = maxDate.toISOString().split('T')[0];
  dateInput.value = maxDate.toISOString().split('T')[0];

  document.getElementById('borrow-modal').classList.remove('hidden');
  document.getElementById('borrow-modal').classList.add('flex');
};

document.getElementById('btn-close-borrow-modal').onclick = () => {
  document.getElementById('borrow-modal').classList.add('hidden');
  document.getElementById('borrow-modal').classList.remove('flex');
};

document.getElementById('btn-confirm-borrow').onclick = async () => {
  const dueDate = document.getElementById('borrow-due-date').value;
  if (!dueDate) { showToast('กรุณาเลือกวันที่จะคืน', 'error'); return; }

  showLoading('กำลังทำรายการยืม...');
  try {
    const res = await fetch('/api/borrow-book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: currentUid, bookId: currentBookId, dueDate })
    });
    const data = await res.json();
    hideLoading();

    if (!res.ok) { showToast(data.error || 'ยืมไม่สำเร็จ', 'error'); return; }

    document.getElementById('btn-close-borrow-modal').click();
    showToast('ทำรายการยืมสำเร็จ!', 'success');
    await openBorrowDetail(data.recordId);
  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  }
};

// ================= หนังสือของฉัน =================

let myBorrowRecords = [];

document.getElementById('btn-my-books').onclick = () => {
  showView('my-books-view');
  loadMyBooks();
};
document.getElementById('btn-back-my-books').onclick = () => showView('home-view');

const borrowStatusLabel = { pending_pickup: 'รอรับหนังสือ', borrowing: 'กำลังยืม', returned: 'คืนแล้ว', overdue: 'เกินกำหนด' };
const borrowStatusColor = {
  pending_pickup: 'bg-amber-50 text-amber-600',
  borrowing: 'bg-blue-50 text-blue-600',
  returned: 'bg-emerald-50 text-emerald-600',
  overdue: 'bg-rose-50 text-rose-600'
};

async function loadMyBooks() {
  const container = document.getElementById('my-books-list');
  container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">กำลังโหลด...</p>';

  const q = query(collection(db, 'libraryBorrowRecords'), where('uid', '==', currentUid));
  const snap = await getDocs(q);
  myBorrowRecords = [];
  snap.forEach(d => myBorrowRecords.push({ id: d.id, ...d.data() }));

  myBorrowRecords = myBorrowRecords
    .filter(r => r.status === 'pending_pickup' || r.status === 'borrowing')
    .sort((a, b) => (b.requestedAt?.seconds || 0) - (a.requestedAt?.seconds || 0));

  if (myBorrowRecords.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">ยังไม่มีหนังสือที่ยืมอยู่</p>';
    return;
  }

  container.innerHTML = myBorrowRecords.map(r => {
    const dueDate = r.dueDate.toDate ? r.dueDate.toDate() : new Date(r.dueDate);
    return `
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex gap-3 cursor-pointer" onclick="openBorrowDetail('${r.id}')">
        <img src="${r.bookCover || ''}" class="w-16 h-22 object-cover rounded-lg bg-gray-100 shrink-0">
        <div class="flex-1">
          <span class="text-xs font-bold px-2 py-0.5 rounded-full ${borrowStatusColor[r.status]}">${borrowStatusLabel[r.status]}</span>
          <h4 class="font-black text-gray-800 mt-1">${r.bookTitle}</h4>
          <p class="text-sm text-gray-400">กำหนดคืน: ${dueDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>
        <i class="fa-solid fa-chevron-right text-gray-300 self-center"></i>
      </div>`;
  }).join('');
}

async function openBorrowDetail(recordId) {
  let record = myBorrowRecords.find(r => r.id === recordId);
  if (!record) {
    const docSnap = await getDoc(doc(db, 'libraryBorrowRecords', recordId));
    record = { id: recordId, ...docSnap.data() };
  }

  const requestedAt = record.requestedAt.toDate ? record.requestedAt.toDate() : new Date(record.requestedAt);
  const dueDate = record.dueDate.toDate ? record.dueDate.toDate() : new Date(record.dueDate);

  document.getElementById('bod-status-badge').innerText = borrowStatusLabel[record.status];
  document.getElementById('bod-status-badge').className = `inline-block text-base font-bold px-3 py-1.5 rounded-full mb-4 ${borrowStatusColor[record.status]}`;
  document.getElementById('bod-cover').src = record.bookCover || '';
  document.getElementById('bod-title').innerText = record.bookTitle;
  document.getElementById('bod-borrower').innerText = record.borrowerName;
  document.getElementById('bod-requested').innerText = requestedAt.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('bod-due').innerText = dueDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

  // โชว์ QR เฉพาะตอนยังรอรับหนังสืออยู่เท่านั้น
  const qrSection = document.getElementById('bod-qr-section');
  if (record.status === 'pending_pickup') {
    qrSection.classList.remove('hidden');
    document.getElementById('bod-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(record.id)}`;
  } else {
    qrSection.classList.add('hidden');
  }

  showView('borrow-detail-view');
}
window.openBorrowDetail = openBorrowDetail;

document.getElementById('btn-back-borrow-detail').onclick = () => showView('my-books-view');

// ================= สแกนยืนยันการยืม (เฉพาะบรรณารักษ์) =================

// เพิ่มปุ่มสแกนในหน้าหลัก ถ้าเป็นบรรณารักษ์เท่านั้น
function checkLibrarianStatus() {
  if (currentUserData.isLibrarian) {
    const btn = document.createElement('div');
    btn.id = 'btn-librarian-scan';
    btn.className = 'fixed bottom-24 right-4 w-16 h-16 bg-gray-900 text-white rounded-full shadow-lg flex items-center justify-center text-2xl z-40 cursor-pointer';
    btn.innerHTML = '<i class="fa-solid fa-qrcode"></i>';
    btn.onclick = () => openLibrarianScan();
    document.body.appendChild(btn);
  }
}

let scanStream = null;
let scanInterval = null;

async function openLibrarianScan() {
  showView('librarian-scan-view');
  document.getElementById('scan-status-text').innerText = 'กำลังเปิดกล้อง...';

  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = document.getElementById('scan-video');
    video.srcObject = scanStream;
    await video.play();

    document.getElementById('scan-status-text').innerText = 'วาง QR Code ในกรอบเพื่อสแกน';

    const canvas = document.getElementById('scan-canvas');
    const ctx = canvas.getContext('2d');

    scanInterval = setInterval(() => {
      if (video.videoWidth === 0) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code && code.data) {
        clearInterval(scanInterval);
        handleScannedCode(code.data);
      }
    }, 300);
  } catch (err) {
    document.getElementById('scan-status-text').innerText = 'ไม่สามารถเปิดกล้องได้: ' + err.message;
  }
}

async function handleScannedCode(recordId) {
  stopScanning();
  showLoading('กำลังยืนยันการยืม...');

  try {
    const res = await fetch('/api/confirm-borrow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ librarianUid: currentUid, recordId })
    });
    const data = await res.json();
    hideLoading();

    if (!res.ok) {
      showToast(data.error || 'ยืนยันไม่สำเร็จ', 'error');
      setTimeout(() => openLibrarianScan(), 1500);
      return;
    }

    showToast(`ยืนยันสำเร็จ! ${data.borrowerName} ยืม "${data.bookTitle}"`, 'success');
    setTimeout(() => showView('home-view'), 1500);
  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  }
}

function stopScanning() {
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
}

document.getElementById('btn-back-librarian-scan').onclick = () => {
  stopScanning();
  showView('home-view');
};