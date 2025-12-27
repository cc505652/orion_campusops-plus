import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCHLXM2zOkE7EHqbvNlUaG6s81nv7Q3eQM",
  authDomain: "campusops-plus.firebaseapp.com",
  projectId: "campusops-plus",
  storageBucket: "campusops-plus.firebasestorage.app",
  messagingSenderId: "1045675352740",
  appId: "1:1045675352740:web:4dfeecfbffe121a8967c31",
  measurementId: "G-00WHD7EFK5"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
