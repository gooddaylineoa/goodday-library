import { signInWithCustomToken } from 'firebase/auth';
import { auth } from './firebase.js';

const LIFF_ID = '2009970638-GrD1aOi9';
const LOGIN_ENDPOINT = '/api/line-login';

export async function initLineAuth() {
  await liff.init({ liffId: LIFF_ID });

  if (!liff.isLoggedIn()) {
    liff.login();
    return;
  }

  const idToken = liff.getIDToken();
  if (!idToken) {
    throw new Error('ไม่พบ LIFF ID Token');
  }

  const res = await fetch(LOGIN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  const data = await res.json();

  if (!res.ok || !data.customToken) {
    throw new Error(data.error || 'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ');
  }

  await signInWithCustomToken(auth, data.customToken);
}