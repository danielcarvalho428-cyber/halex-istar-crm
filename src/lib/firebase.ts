import { initializeApp, getApps } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCPPfGumAAg14o2n6kfr9qmlUfyhRjPKl4",
  authDomain: "halex-istar-crm.firebaseapp.com",
  projectId: "halex-istar-crm",
  storageBucket: "halex-istar-crm.firebasestorage.app",
  messagingSenderId: "1073625741024",
  appId: "1:1073625741024:web:811576aeab87e1c59ec285",
  measurementId: "G-YP7CWBRYTB"
};

// Initialize Firebase only if it hasn't been initialized already
export const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Use initializeFirestore with experimentalForceLongPolling: true to prevent WebSocket/gRPC blockages in Electron
export const db = initializeFirestore(firebaseApp, {
  experimentalForceLongPolling: true
});
