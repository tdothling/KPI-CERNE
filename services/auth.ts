
import { auth } from "../firebase";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  User 
} from "firebase/auth";

// Domain suffix to make emails valid for Firebase
const INVISIBLE_DOMAIN = "@cerne.internal";

export const loginWithUsername = async (username: string, password: string, remember: boolean = false) => {
  if (!auth) throw new Error("Firebase Auth not initialized");
  
  // Clean username and append domain
  const cleanUsername = username.trim().toLowerCase();
  const email = `${cleanUsername}${INVISIBLE_DOMAIN}`;

  try {
    // Set persistence based on user preference
    const persistenceType = remember ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistenceType);

    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error: any) {
    console.error("Login error:", error);
    throw error;
  }
};

export const logoutUser = async () => {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout error:", error);
  }
};

export const subscribeToAuth = (callback: (user: User | null) => void) => {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
};

export const formatUsername = (email: string | null) => {
    if (!email) return 'Convidado';
    // Remove the invisible domain and format the name
    const rawName = email.replace(INVISIBLE_DOMAIN, '');
    // Split by dot if exists (thiago.dothling -> Thiago Dothling)
    return rawName
        .split('.')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};
