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

  checkLibrarianStatus();
  loadHomeNewsAndBooks(); // 🆕 เพิ่มบรรทัดนี้
}

document.getElementById('btn-search-books').onclick = () => showToast('ค้นหาหนังสือ จะทำในเฟส 2', 'info');
document.getElementById('btn-my-books').onclick = () => showToast('หนังสือของฉัน จะทำในเฟส 3', 'info');
document.getElementById('btn-lib-activities').onclick = () => showToast('กิจกรรม จะทำในเฟส 4', 'info');
document.getElementById('btn-suggest-book').onclick = () => showToast('เสนอแนะหนังสือ จะทำในเฟส 5', 'info');
document.getElementById('btn-creative-community').onclick = () => showToast('ชุมชนสร้างสรรค์ จะทำในเฟส 5', 'info');
document.getElementById('btn-lib-calendar').onclick = () => showToast('ปฏิทินกิจกรรม จะทำในเฟส 4', 'info');
document.getElementById('tab-space-booking').onclick = () => {
  showView('space-booking-view');
  loadSpaceBookingTab();
};
document.getElementById('tab-news').onclick = () => {
  showView('news-feed-view');
  loadNewsFeed('all');
};

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

// ================= กิจกรรมห้องสมุด =================

let allLibEventsData = [];
let myLibBookings = [];
let currentLibEventTab = 'upcoming';
let selectedLibSlotId = null;

document.getElementById('btn-lib-activities').onclick = () => { showView('lib-events-view'); loadLibEvents(); };
document.getElementById('btn-back-lib-events').onclick = () => showView('home-view');

async function loadLibEvents() {
  const branchId = currentUserData.libraryMember.branchId;
  const q = query(collection(db, 'libraryEvents'), where('branchId', '==', branchId));
  const snap = await getDocs(q);
  allLibEventsData = [];
  snap.forEach(d => allLibEventsData.push({ id: d.id, ...d.data() }));
  renderLibEventsList();
}

document.getElementById('lib-event-tab-upcoming').onclick = () => {
  currentLibEventTab = 'upcoming';
  document.getElementById('lib-event-tab-upcoming').className = 'flex-1 py-3 text-lg font-black theme-text border-b-2 border-pink-500';
  document.getElementById('lib-event-tab-history').className = 'flex-1 py-3 text-lg font-black text-gray-400 border-b-2 border-transparent';
  renderLibEventsList();
};
document.getElementById('lib-event-tab-history').onclick = async () => {
  currentLibEventTab = 'history';
  document.getElementById('lib-event-tab-history').className = 'flex-1 py-3 text-lg font-black theme-text border-b-2 border-pink-500';
  document.getElementById('lib-event-tab-upcoming').className = 'flex-1 py-3 text-lg font-black text-gray-400 border-b-2 border-transparent';

  const snap = await getDocs(collection(db, 'users', currentUid, 'libraryEventBookings'));
  myLibBookings = [];
  snap.forEach(d => myLibBookings.push({ id: d.id, ...d.data() }));
  renderLibEventsList();
};

function renderLibEventsList() {
  const container = document.getElementById('lib-events-list');

  if (currentLibEventTab === 'upcoming') {
    if (allLibEventsData.length === 0) {
      container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">ยังไม่มีกิจกรรม</p>';
      return;
    }
    container.innerHTML = allLibEventsData.map(e => `
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer" onclick="openLibEventDetail('${e.id}')">
        <img src="${e.image || ''}" class="w-full h-32 object-cover bg-gray-100">
        <div class="p-3">
          <h4 class="font-black text-gray-800">${e.name}</h4>
          <p class="text-sm text-gray-400 truncate">${e.description || ''}</p>
        </div>
      </div>`).join('');
  } else {
    const confirmed = myLibBookings.filter(b => b.status === 'confirmed');
    if (confirmed.length === 0) {
      container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">ยังไม่มีประวัติการจอง</p>';
      return;
    }
    container.innerHTML = confirmed.map(b => `
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex gap-3 cursor-pointer" onclick="openLibBookingDetail('${b.id}')">
        <img src="${b.eventImage || ''}" class="w-16 h-16 rounded-xl object-cover bg-gray-100 shrink-0">
        <div class="flex-1">
          <h4 class="font-black text-gray-800">${b.eventName}</h4>
          <p class="text-sm text-gray-400">${b.date} · ${b.startTime}-${b.endTime}</p>
        </div>
        <i class="fa-solid fa-chevron-right text-gray-300 self-center"></i>
      </div>`).join('');
  }
}

function openLibEventDetail(eventId) {
  const e = allLibEventsData.find(x => x.id === eventId);
  if (!e) return;
  selectedLibSlotId = null;

  document.getElementById('led-image').src = e.image || '';
  document.getElementById('led-name').innerText = e.name;
  document.getElementById('led-description').innerText = e.description || '';
  document.getElementById('led-location').innerText = e.location || '-';

  document.getElementById('led-slots-list').innerHTML = (e.slots || []).map(s => {
    const full = (s.bookedSeats || 0) >= s.totalSeats;
    return `
      <button class="lib-slot-btn w-full text-left p-3 rounded-xl border-2 ${full ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed' : 'border-gray-200'}"
        data-slot="${s.slotId}" ${full ? 'disabled' : ''}>
        <p class="font-bold text-gray-800">${s.date} · ${s.startTime}-${s.endTime}</p>
        <p class="text-sm text-gray-400">เหลือที่นั่ง ${Math.max(s.totalSeats - (s.bookedSeats || 0), 0)}/${s.totalSeats}</p>
      </button>`;
  }).join('');

  document.querySelectorAll('.lib-slot-btn:not([disabled])').forEach(btn => {
    btn.onclick = () => {
      selectedLibSlotId = btn.dataset.slot;
      document.querySelectorAll('.lib-slot-btn').forEach(b => b.classList.remove('border-pink-500', 'bg-pink-50'));
      btn.classList.add('border-pink-500', 'bg-pink-50');
      const confirmBtn = document.getElementById('btn-confirm-lib-booking');
      confirmBtn.disabled = false;
      confirmBtn.className = 'w-full theme-pink text-white py-4 rounded-2xl font-black text-lg';
      confirmBtn.innerText = 'ยืนยันการจอง';
    };
  });

  document.getElementById('btn-confirm-lib-booking').disabled = true;
  document.getElementById('btn-confirm-lib-booking').className = 'w-full bg-gray-300 text-white py-4 rounded-2xl font-black text-lg';
  document.getElementById('btn-confirm-lib-booking').innerText = 'เลือกรอบเวลาก่อน';

  window.currentLibEventId = eventId;
  showView('lib-event-detail-view');
}
window.openLibEventDetail = openLibEventDetail;

document.getElementById('btn-back-lib-event-detail').onclick = () => showView('lib-events-view');

document.getElementById('btn-confirm-lib-booking').onclick = async () => {
  if (!selectedLibSlotId) return;

  showLoading('กำลังทำการจอง...');
  try {
    const res = await fetch('/api/book-library-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: currentUid, eventId: window.currentLibEventId, slotId: selectedLibSlotId })
    });
    const data = await res.json();
    hideLoading();

    if (!res.ok) { showToast(data.error || 'จองไม่สำเร็จ', 'error'); return; }

    showToast('จองสำเร็จ!', 'success');
    document.getElementById('lib-event-tab-history').click();
    showView('lib-events-view');
  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  }
};

let currentLibBookingId = null;

function openLibBookingDetail(bookingId) {
  const b = myLibBookings.find(x => x.id === bookingId);
  if (!b) return;
  currentLibBookingId = bookingId;

  document.getElementById('lbd-status-badge').innerText = b.status === 'confirmed' ? 'ยืนยันแล้ว' : 'ยกเลิกแล้ว';
  document.getElementById('lbd-status-badge').className = `inline-block text-base font-bold px-3 py-1.5 rounded-full mb-4 ${b.status === 'confirmed' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`;
  document.getElementById('lbd-image').src = b.eventImage || '';
  document.getElementById('lbd-name').innerText = b.eventName;
  document.getElementById('lbd-datetime').innerText = `${b.date} · ${b.startTime}-${b.endTime}`;
  document.getElementById('lbd-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(b.bookingCode)}`;
  document.getElementById('lbd-code').innerText = b.bookingCode;
  document.getElementById('btn-cancel-lib-booking').classList.toggle('hidden', b.status !== 'confirmed');

  showView('lib-booking-detail-view');
}
window.openLibBookingDetail = openLibBookingDetail;

document.getElementById('btn-back-lib-booking-detail').onclick = () => showView('lib-events-view');

document.getElementById('btn-cancel-lib-booking').onclick = async () => {
  if (!confirm('ยืนยันยกเลิกการจองนี้?')) return;

  showLoading('กำลังยกเลิก...');
  try {
    const res = await fetch('/api/cancel-library-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: currentUid, bookingId: currentLibBookingId })
    });
    const data = await res.json();
    hideLoading();

    if (!res.ok) { showToast(data.error || 'ยกเลิกไม่สำเร็จ', 'error'); return; }

    showToast('ยกเลิกการจองสำเร็จ', 'success');
    document.getElementById('lib-event-tab-history').click();
    showView('lib-events-view');
  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  }
};

// ================= เสนอแนะหนังสือ =================

document.getElementById('btn-suggest-book').onclick = () => {
  ['sb-title', 'sb-author', 'sb-detail'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('sb-image-preview').classList.add('hidden');
  document.getElementById('sb-image-placeholder').classList.remove('hidden');
  selectedSuggestionImageFile = null;
  showView('suggest-book-view');
};
document.getElementById('btn-back-suggest-book').onclick = () => showView('home-view');

let selectedSuggestionImageFile = null;

document.getElementById('sb-image-preview-box').onclick = () => document.getElementById('sb-image-input').click();
document.getElementById('sb-image-input').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedSuggestionImageFile = file;
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('sb-image-preview').src = ev.target.result;
    document.getElementById('sb-image-preview').classList.remove('hidden');
    document.getElementById('sb-image-placeholder').classList.add('hidden');
  };
  reader.readAsDataURL(file);
};

document.getElementById('btn-submit-suggestion').onclick = async () => {
  const title = document.getElementById('sb-title').value.trim();
  const author = document.getElementById('sb-author').value.trim();
  const detail = document.getElementById('sb-detail').value.trim();

  if (!title) { showToast('กรุณากรอกชื่อหนังสือ', 'error'); return; }

  showLoading('กำลังส่งคำแนะนำ...');
  try {
    let imageUrl = '';
    if (selectedSuggestionImageFile) {
      const formData = new FormData();
      formData.append('file', selectedSuggestionImageFile);
      formData.append('upload_preset', 'goodday_unsigned');
      const uploadRes = await fetch('https://api.cloudinary.com/v1_1/l1htg1ks/image/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      imageUrl = uploadData.secure_url || '';
    }

    await addDoc(collection(db, 'libraryBookSuggestions'), {
      uid: currentUid,
      suggesterName: currentUserData.name || 'สมาชิก',
      branchId: currentUserData.libraryMember.branchId,
      title,
      author,
      imageUrl,
      detail,
      status: 'pending',
      createdAt: new Date()
    });

    hideLoading();
    showToast('ส่งคำแนะนำสำเร็จ ขอบคุณครับ!', 'success');
    showView('home-view');
  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  }
};

// ================= ชุมชนสร้างสรรค์ (แผนที่) =================

let communityMapInstance = null;

document.getElementById('btn-creative-community').onclick = () => {
  showView('creative-community-view');
  openCommunityMap();
};
document.getElementById('btn-back-creative-community').onclick = () => showView('home-view');

async function openCommunityMap() {
  const branchId = currentUserData.libraryMember.branchId;

  // ดึงหมุดของสาขานี้จาก Firestore
  const spotsSnap = await getDocs(collection(db, 'libraryBranches', branchId, 'communitySpots'));
  const spots = [];
  spotsSnap.forEach(d => spots.push({ id: d.id, ...d.data() }));

  // ขอสิทธิ์ตำแหน่งผู้ใช้ (ถ้าปฏิเสธ ใช้ตำแหน่งเฉลี่ยของหมุดแทน)
  let centerLat = 13.7563, centerLng = 100.5018; // ค่า default กรุงเทพฯ เผื่อไม่มีข้อมูลอะไรเลย
  if (spots.length > 0) {
    centerLat = spots[0].lat;
    centerLng = spots[0].lng;
  }

  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
    });
    centerLat = pos.coords.latitude;
    centerLng = pos.coords.longitude;
  } catch (err) {
    console.log('ไม่ได้รับสิทธิ์ตำแหน่ง ใช้ตำแหน่งเริ่มต้นแทน');
  }

  // ถ้าเคยสร้างแผนที่ไว้แล้ว ให้ลบทิ้งก่อนสร้างใหม่ (กันซ้อนตอนกลับเข้าหน้านี้ซ้ำ)
  if (communityMapInstance) {
    communityMapInstance.remove();
    communityMapInstance = null;
  }

  communityMapInstance = L.map('community-map').setView([centerLat, centerLng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(communityMapInstance);

  // หมุดตำแหน่งผู้ใช้ (สีน้ำเงิน)
  L.circleMarker([centerLat, centerLng], { radius: 8, fillColor: '#3b82f6', color: '#fff', weight: 2, fillOpacity: 1 })
    .addTo(communityMapInstance)
    .bindPopup('ตำแหน่งของคุณ');

  // หมุดสถานที่สำคัญ (สีชมพู ตามธีมระบบ)
  spots.forEach(spot => {
    L.marker([spot.lat, spot.lng])
      .addTo(communityMapInstance)
      .bindPopup(`<b>${spot.name}</b><br>${spot.description || ''}`);
  });
}

// ================= จองพื้นที่ =================

let branchSpacesData = [];
let mySpaceBookings = [];
let currentSpaceTab = 'book';
let selectedSpace = null;
let currentSpaceBookingId = null;

document.getElementById('space-btn-tab-home').onclick = () => showView('home-view');
document.getElementById('space-btn-tab-space').onclick = () => showView('space-booking-view');
document.getElementById('space-btn-tab-news').onclick = () => {
  showView('news-feed-view');
  loadNewsFeed('all');
};
document.getElementById('news-btn-tab-home').onclick = () => showView('home-view');
document.getElementById('news-btn-tab-space').onclick = () => { showView('space-booking-view'); loadSpaceBookingTab(); };

function loadSpaceBookingTab() {
  currentSpaceTab = 'book';
  document.getElementById('space-tab-book').className = 'flex-1 py-3 text-lg font-black theme-text border-b-2 border-pink-500';
  document.getElementById('space-tab-history').className = 'flex-1 py-3 text-lg font-black text-gray-400 border-b-2 border-transparent';
  loadBranchSpaces();
}

async function loadBranchSpaces() {
  const container = document.getElementById('space-list');
  container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">กำลังโหลด...</p>';

  const branchId = currentUserData.libraryMember.branchId;
  const branchDoc = await getDoc(doc(db, 'libraryBranches', branchId));
  branchSpacesData = branchDoc.exists() ? (branchDoc.data().coWorkingSpaces || []) : [];

  if (branchSpacesData.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">สาขานี้ยังไม่มีพื้นที่ให้จอง</p>';
    return;
  }

  container.innerHTML = branchSpacesData.map(s => `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 cursor-pointer" onclick="openSpaceBookForm('${s.spaceId}')">
      <div class="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl shrink-0"><i class="fa-solid fa-door-open"></i></div>
      <div class="flex-1">
        <h4 class="font-black text-gray-800">${s.name}</h4>
        <p class="text-sm text-gray-400">รองรับ ${s.capacity || '-'} คน</p>
      </div>
      <i class="fa-solid fa-chevron-right text-gray-300"></i>
    </div>
  `).join('');
}

document.getElementById('space-tab-book').onclick = () => {
  currentSpaceTab = 'book';
  document.getElementById('space-tab-book').className = 'flex-1 py-3 text-lg font-black theme-text border-b-2 border-pink-500';
  document.getElementById('space-tab-history').className = 'flex-1 py-3 text-lg font-black text-gray-400 border-b-2 border-transparent';
  loadBranchSpaces();
};

document.getElementById('space-tab-history').onclick = async () => {
  currentSpaceTab = 'history';
  document.getElementById('space-tab-history').className = 'flex-1 py-3 text-lg font-black theme-text border-b-2 border-pink-500';
  document.getElementById('space-tab-book').className = 'flex-1 py-3 text-lg font-black text-gray-400 border-b-2 border-transparent';

  const container = document.getElementById('space-list');
  container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">กำลังโหลด...</p>';

  const q = query(collection(db, 'librarySpaceBookings'), where('uid', '==', currentUid));
  const snap = await getDocs(q);
  mySpaceBookings = [];
  snap.forEach(d => mySpaceBookings.push({ id: d.id, ...d.data() }));

  const confirmed = mySpaceBookings
    .filter(b => b.status === 'confirmed')
    .sort((a, b) => (b.bookedAt?.seconds || 0) - (a.bookedAt?.seconds || 0));

  if (confirmed.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">ยังไม่มีประวัติการจอง</p>';
    return;
  }

  container.innerHTML = confirmed.map(b => `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer" onclick="openSpaceBookingDetail('${b.id}')">
      <p class="font-black text-gray-800">${b.spaceName}</p>
      <p class="text-sm text-gray-400">${b.date} · ${b.startTime}-${b.endTime}</p>
      <p class="text-sm text-purple-600 font-bold mt-1">${b.bookingCode}</p>
    </div>
  `).join('');
};

function openSpaceBookForm(spaceId) {
  selectedSpace = branchSpacesData.find(s => s.spaceId === spaceId);
  if (!selectedSpace) return;

  document.getElementById('sf-space-name').innerText = selectedSpace.name;

  const today = new Date();
  document.getElementById('sf-date').min = today.toISOString().split('T')[0];
  document.getElementById('sf-date').value = today.toISOString().split('T')[0];
  document.getElementById('sf-start-time').value = '09:00';
  document.getElementById('sf-end-time').value = '11:00';

  showView('space-book-form-view');
}
window.openSpaceBookForm = openSpaceBookForm;

document.getElementById('btn-back-space-form').onclick = () => showView('space-booking-view');

document.getElementById('btn-confirm-space-booking').onclick = async () => {
  const date = document.getElementById('sf-date').value;
  const startTime = document.getElementById('sf-start-time').value;
  const endTime = document.getElementById('sf-end-time').value;

  if (!date || !startTime || !endTime) { showToast('กรุณากรอกข้อมูลให้ครบ', 'error'); return; }
  if (endTime <= startTime) { showToast('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม', 'error'); return; }

  showLoading('กำลังทำการจอง...');
  try {
    const res = await fetch('/api/book-space', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: currentUid,
        branchId: currentUserData.libraryMember.branchId,
        spaceId: selectedSpace.spaceId,
        spaceName: selectedSpace.name,
        date, startTime, endTime
      })
    });
    const data = await res.json();
    hideLoading();

    if (!res.ok) { showToast(data.error || 'จองไม่สำเร็จ', 'error'); return; }

    showToast('จองสำเร็จ!', 'success');
    showView('space-booking-view');
    document.getElementById('space-tab-history').click();
  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  }
};

let spaceDetailMapInstance = null;

async function openSpaceBookingDetail(bookingId) {
  const b = mySpaceBookings.find(x => x.id === bookingId);
  if (!b) return;
  currentSpaceBookingId = bookingId;

  document.getElementById('sbd-status-badge').innerText = b.status === 'confirmed' ? 'ยืนยันแล้ว' : 'ยกเลิกแล้ว';
  document.getElementById('sbd-status-badge').className = `inline-block text-base font-bold px-3 py-1.5 rounded-full mb-4 ${b.status === 'confirmed' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`;
  document.getElementById('sbd-code').innerText = b.bookingCode;
  document.getElementById('sbd-name').innerText = b.borrowerName;
  document.getElementById('sbd-space').innerText = b.spaceName;
  document.getElementById('sbd-datetime').innerText = `${b.date} · ${b.startTime}-${b.endTime}`;
  document.getElementById('sbd-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(b.bookingCode)}`;
  document.getElementById('btn-cancel-space-booking').classList.toggle('hidden', b.status !== 'confirmed');

  showView('space-booking-detail-view');

  // แสดงแผนที่ตำแหน่งสาขา
  const branchDoc = await getDoc(doc(db, 'libraryBranches', b.branchId));
  if (branchDoc.exists()) {
    const branch = branchDoc.data();
    if (branch.lat && branch.lng) {
      if (spaceDetailMapInstance) { spaceDetailMapInstance.remove(); spaceDetailMapInstance = null; }
      spaceDetailMapInstance = L.map('sbd-map').setView([branch.lat, branch.lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(spaceDetailMapInstance);
      L.marker([branch.lat, branch.lng]).addTo(spaceDetailMapInstance).bindPopup(branch.branchName);
    }
  }
}
window.openSpaceBookingDetail = openSpaceBookingDetail;

document.getElementById('btn-back-space-detail').onclick = () => showView('space-booking-view');

document.getElementById('btn-cancel-space-booking').onclick = async () => {
  if (!confirm('ยืนยันยกเลิกการจองนี้?')) return;

  showLoading('กำลังยกเลิก...');
  try {
    const res = await fetch('/api/cancel-space-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: currentUid, bookingId: currentSpaceBookingId })
    });
    const data = await res.json();
    hideLoading();

    if (!res.ok) { showToast(data.error || 'ยกเลิกไม่สำเร็จ', 'error'); return; }

    showToast('ยกเลิกการจองสำเร็จ', 'success');
    showView('space-booking-view');
    document.getElementById('space-tab-history').click();
  } catch (err) {
    hideLoading();
    showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
  }
};

// ================= ประชาสัมพันธ์ =================

let allLibraryNewsData = [];
let currentNewsFilter = 'all';

const newsTypeLabel = { news: 'ข่าวสาร', new_book: 'หนังสือใหม่', announcement: 'ประชาสัมพันธ์' };
const newsTypeColor = {
  news: 'bg-blue-50 text-blue-600',
  new_book: 'bg-emerald-50 text-emerald-600',
  announcement: 'bg-amber-50 text-amber-600'
};

async function fetchLibraryNews() {
  const branchId = currentUserData.libraryMember.branchId;

  // ดึงข่าวของสาขาตัวเอง + ข่าวที่เป็น "all" (ทุกสาขา) รวมกัน
  const branchSnap = await getDocs(query(collection(db, 'libraryNews'), where('branchId', '==', branchId)));
  const allBranchSnap = await getDocs(query(collection(db, 'libraryNews'), where('branchId', '==', 'all')));

  const items = [];
  branchSnap.forEach(d => items.push({ id: d.id, ...d.data() }));
  allBranchSnap.forEach(d => items.push({ id: d.id, ...d.data() }));

  return items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

async function loadNewsFeed(filter) {
  currentNewsFilter = filter;
  document.querySelectorAll('.news-filter-btn').forEach(b => {
    b.className = 'news-filter-btn flex-1 py-3 text-base font-black whitespace-nowrap px-4 text-gray-400 border-b-2 border-transparent';
  });
  document.querySelector(`[data-news-filter="${filter}"]`).className =
    'news-filter-btn flex-1 py-3 text-base font-black whitespace-nowrap px-4 theme-text border-b-2 border-pink-500';

  const container = document.getElementById('news-feed-list');
  container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">กำลังโหลด...</p>';

  allLibraryNewsData = await fetchLibraryNews();
  renderNewsFeedList();
}

document.querySelectorAll('.news-filter-btn').forEach(btn => {
  btn.onclick = () => loadNewsFeed(btn.dataset.newsFilter);
});

function renderNewsFeedList() {
  const filtered = currentNewsFilter === 'all'
    ? allLibraryNewsData
    : allLibraryNewsData.filter(n => n.type === currentNewsFilter);

  const container = document.getElementById('news-feed-list');

  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-400 text-lg py-8">ยังไม่มีข่าวในหมวดนี้</p>';
    return;
  }

  container.innerHTML = filtered.map(n => `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer flex gap-3 p-3" onclick="openNewsDetail('${n.id}')">
      <img src="${n.image || ''}" class="w-20 h-20 object-cover rounded-xl bg-gray-100 shrink-0">
      <div class="flex-1 min-w-0">
        <span class="text-xs font-bold px-2 py-0.5 rounded-full ${newsTypeColor[n.type] || ''}">${newsTypeLabel[n.type] || n.type}</span>
        <h4 class="font-black text-gray-800 mt-1 line-clamp-2">${n.title}</h4>
      </div>
    </div>
  `).join('');
}

function openNewsDetail(newsId) {
  const n = allLibraryNewsData.find(x => x.id === newsId);
  if (!n) return;

  document.getElementById('nd-image').src = n.image || '';
  document.getElementById('nd-type-badge').innerText = newsTypeLabel[n.type] || n.type;
  document.getElementById('nd-type-badge').className = `inline-block text-sm font-bold px-3 py-1 rounded-full mb-3 ${newsTypeColor[n.type] || ''}`;
  document.getElementById('nd-title').innerText = n.title;
  document.getElementById('nd-content').innerText = n.content || '';

  const createdAt = n.createdAt?.toDate ? n.createdAt.toDate() : new Date(n.createdAt);
  document.getElementById('nd-date').innerText = createdAt.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

  showView('news-detail-view');
}
window.openNewsDetail = openNewsDetail;

document.getElementById('btn-back-news-detail').onclick = () => showView('news-feed-view');

// ================= เชื่อมกับแถบประชาสัมพันธ์ + หนังสือเข้าใหม่ ในหน้าหลัก (เติมจากเฟส 1) =================

async function loadHomeNewsAndBooks() {
  const news = (await fetchLibraryNews()).slice(0, 8);
  const newsScroll = document.getElementById('home-news-scroll');

  if (news.length === 0) {
    newsScroll.innerHTML = '<p class="text-gray-400 text-base py-4">ยังไม่มีประชาสัมพันธ์</p>';
  } else {
    newsScroll.innerHTML = news.map(n => `
      <div class="min-w-[220px] w-[220px] bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden shrink-0 cursor-pointer" onclick="openHomeNewsDetail('${n.id}')">
        <img src="${n.image || ''}" class="w-full h-28 object-cover bg-gray-100">
        <div class="p-3">
          <span class="text-xs font-bold px-2 py-0.5 rounded-full ${newsTypeColor[n.type] || ''}">${newsTypeLabel[n.type] || n.type}</span>
          <h4 class="font-bold text-gray-800 text-sm mt-1 line-clamp-2">${n.title}</h4>
        </div>
      </div>
    `).join('');
  }

  const branchId = currentUserData.libraryMember.branchId;
  const booksSnap = await getDocs(query(collection(db, 'libraryBooks'), where('branchId', '==', branchId)));
  const books = [];
  booksSnap.forEach(d => books.push({ id: d.id, ...d.data() }));
  const newBooks = books.filter(isNewBook).slice(0, 8);

  const booksScroll = document.getElementById('home-new-books-scroll');
  if (newBooks.length === 0) {
    booksScroll.innerHTML = '<p class="text-gray-400 text-base py-4">ยังไม่มีหนังสือเข้าใหม่</p>';
  } else {
    booksScroll.innerHTML = newBooks.map(b => `
      <div class="min-w-[130px] w-[130px] bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden shrink-0 cursor-pointer" onclick="openHomeBookDetail('${b.id}')">
        <img src="${b.coverImage || ''}" class="w-full h-40 object-cover bg-gray-100">
        <div class="p-2">
          <h4 class="font-bold text-gray-800 text-xs line-clamp-2">${b.title}</h4>
        </div>
      </div>
    `).join('');
  }
}

// เก็บ handler แยกไว้ เพราะตอนกดจากหน้าหลัก อาจยังไม่ได้โหลด allBooksData/allLibraryNewsData เต็ม (ต้องโหลดสดใหม่)
async function openHomeNewsDetail(newsId) {
  allLibraryNewsData = await fetchLibraryNews();
  openNewsDetail(newsId);
}
window.openHomeNewsDetail = openHomeNewsDetail;

async function openHomeBookDetail(bookId) {
  await loadBooks();
  openBookDetail(bookId);
}
window.openHomeBookDetail = openHomeBookDetail;

// ================= ปฏิทินกิจกรรม =================

let calCurrentDate = new Date();
let calSelectedDateStr = null;

document.getElementById('btn-lib-calendar').onclick = () => {
  showView('lib-calendar-view');
  calCurrentDate = new Date();
  calSelectedDateStr = null;
  loadCalendarEvents();
};
document.getElementById('btn-back-lib-calendar').onclick = () => showView('home-view');

async function loadCalendarEvents() {
  if (allLibEventsData.length === 0) {
    const branchId = currentUserData.libraryMember.branchId;
    const q = query(collection(db, 'libraryEvents'), where('branchId', '==', branchId));
    const snap = await getDocs(q);
    allLibEventsData = [];
    snap.forEach(d => allLibEventsData.push({ id: d.id, ...d.data() }));
  }
  renderCalendarGrid();
}

const thaiMonthNames = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

function getEventDatesSet() {
  const dates = new Set();
  allLibEventsData.forEach(e => {
    (e.slots || []).forEach(s => dates.add(s.date));
  });
  return dates;
}

function renderCalendarGrid() {
  const year = calCurrentDate.getFullYear();
  const month = calCurrentDate.getMonth();

  document.getElementById('cal-month-label').innerText = `${thaiMonthNames[month]} ${year + 543}`;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const eventDates = getEventDatesSet();
  const todayStr = new Date().toISOString().split('T')[0];

  let cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  document.getElementById('cal-grid').innerHTML = cells.map(d => {
    if (!d) return `<div></div>`;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const hasEvent = eventDates.has(dateStr);
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === calSelectedDateStr;

    return `
      <button data-date="${dateStr}" class="cal-day-btn aspect-square rounded-xl flex flex-col items-center justify-center relative
        ${isSelected ? 'theme-pink text-white' : isToday ? 'bg-pink-50 theme-text font-bold' : 'bg-white text-gray-700'}">
        <span class="text-sm">${d}</span>
        ${hasEvent ? `<span class="w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-pink-500'} absolute bottom-1.5"></span>` : ''}
      </button>`;
  }).join('');

  document.querySelectorAll('.cal-day-btn').forEach(btn => {
    btn.onclick = () => {
      calSelectedDateStr = btn.dataset.date;
      renderCalendarGrid();
      renderCalendarDayEvents();
    };
  });

  if (calSelectedDateStr) renderCalendarDayEvents();
}

document.getElementById('cal-prev-month').onclick = () => {
  calCurrentDate.setMonth(calCurrentDate.getMonth() - 1);
  calSelectedDateStr = null;
  renderCalendarGrid();
  document.getElementById('cal-day-events-list').innerHTML = '';
  document.getElementById('cal-day-events').querySelector('h3').innerText = 'เลือกวันที่เพื่อดูกิจกรรม';
};
document.getElementById('cal-next-month').onclick = () => {
  calCurrentDate.setMonth(calCurrentDate.getMonth() + 1);
  calSelectedDateStr = null;
  renderCalendarGrid();
  document.getElementById('cal-day-events-list').innerHTML = '';
  document.getElementById('cal-day-events').querySelector('h3').innerText = 'เลือกวันที่เพื่อดูกิจกรรม';
};

function renderCalendarDayEvents() {
  const [y, m, d] = calSelectedDateStr.split('-').map(Number);
  document.getElementById('cal-day-events').querySelector('h3').innerText =
    `กิจกรรมวันที่ ${d} ${thaiMonthNames[m - 1]} ${y + 543}`;

  const eventsOnDay = [];
  allLibEventsData.forEach(e => {
    (e.slots || []).forEach(s => {
      if (s.date === calSelectedDateStr) eventsOnDay.push({ event: e, slot: s });
    });
  });

  const container = document.getElementById('cal-day-events-list');
  if (eventsOnDay.length === 0) {
    container.innerHTML = '<p class="text-center text-gray-400 py-6">ไม่มีกิจกรรมในวันนี้</p>';
    return;
  }

  container.innerHTML = eventsOnDay.map(({ event, slot }) => `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex gap-3 cursor-pointer" onclick="openLibEventDetailFromCalendar('${event.id}')">
      <img src="${event.image || ''}" class="w-16 h-16 rounded-xl object-cover bg-gray-100 shrink-0">
      <div class="flex-1">
        <h4 class="font-black text-gray-800">${event.name}</h4>
        <p class="text-sm text-gray-400">${slot.startTime}-${slot.endTime} · เหลือ ${Math.max(slot.totalSeats - (slot.bookedSeats || 0), 0)} ที่</p>
      </div>
      <i class="fa-solid fa-chevron-right text-gray-300 self-center"></i>
    </div>
  `).join('');
}

function openLibEventDetailFromCalendar(eventId) {
  openLibEventDetail(eventId);
}
window.openLibEventDetailFromCalendar = openLibEventDetailFromCalendar;