
import dotenv from 'dotenv';
dotenv.config();
 
let firebaseApp = null;
let firebaseReady = false;
 
async function initFirebase() {
  if (firebaseReady || !process.env.FIREBASE_SERVICE_ACCOUNT_PATH) return;
 
  try {
    const admin = await import('firebase-admin');
    const { readFileSync } = await import('fs');
    const serviceAccount = JSON.parse(readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));
 
    firebaseApp = admin.default.initializeApp({
      credential: admin.default.credential.cert(serviceAccount),
    });
    firebaseReady = true;
    console.log('[pushService] Firebase Admin da san sang - push notification se gui THAT');
  } catch (err) {
    // firebase-admin chua duoc cai, hoac file key khong hop le -> roi ve che do gia lap
    console.warn('[pushService] Khong the khoi tao Firebase Admin, dang chay CHE DO GIA LAP:', err.message);
  }
}
 
initFirebase();
 
/**
 * Gui push notification cho 1 user (dua tren fcmToken luu trong User doc).
 * @param {object} user - User document (can co fcmToken)
 * @param {{ title: string, body: string, data?: object }} payload
 */
export const sendPushToUser = async (user, payload) => {
  if (!user?.fcmToken) {
    console.log(`[pushService] (gia lap) User ${user?._id} khong co fcmToken -> bo qua push`);
    return { sent: false, reason: 'no_token' };
  }
 
  if (!firebaseReady) {
    console.log(`[pushService] (gia lap) Se gui push cho user ${user._id}: "${payload.title}" - ${payload.body}`);
    return { sent: false, reason: 'firebase_not_configured' };
  }
 
  try {
    const admin = await import('firebase-admin');
    await admin.default.messaging(firebaseApp).send({
      token: user.fcmToken,
      notification: { title: payload.title, body: payload.body },
      data: payload.data || {},
    });
    return { sent: true };
  } catch (err) {
    console.error('[pushService] Gui push that bai:', err.message);
    // Token co the da het han/khong con hop le -> nen xoa de lan sau khong thu lai
    if (err.code === 'messaging/registration-token-not-registered') {
      await user.updateOne({ fcmToken: null });
    }
    return { sent: false, reason: err.message };
  }
};