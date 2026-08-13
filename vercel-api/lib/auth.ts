import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const FIREBASE_PROJECT_ID = 'kpi---engenharia-cerne';

if (!getApps().length) {
  // Só verificamos a assinatura de ID tokens (contra os certificados públicos do
  // Google) — não precisa de credenciais de service account para isso.
  initializeApp({ projectId: FIREBASE_PROJECT_ID });
}

/** Extrai e valida o ID token do Firebase Auth enviado no header Authorization. Lança se inválido. */
export async function requireFirebaseUser(authorizationHeader: string | undefined): Promise<void> {
  const token = authorizationHeader?.startsWith('Bearer ') ? authorizationHeader.slice(7) : null;
  if (!token) throw new Error('Token de autenticação ausente.');
  await getAuth().verifyIdToken(token);
}
