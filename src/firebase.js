import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDVThOUC6Fnesy7f16WTzQ6F8EujH9A4R8",
  authDomain: "goodday-lineoa.firebaseapp.com",
  projectId: "goodday-lineoa",
  storageBucket: "goodday-lineoa.firebasestorage.app",
  messagingSenderId: "116298554834",
  appId: "1:116298554834:web:4d4521116035bc59477c0b"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
