import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve path relative to this file (utils/firebase.js → project root)
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)          // absolute path from .env
  : path.resolve(__dirname, "../serviceAccountKey.json");             // default: project root

console.log("🔍 Firebase: Looking for service account at:", serviceAccountPath);
let isFirebaseInitialized = false;

if (fs.existsSync(serviceAccountPath)) {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      isFirebaseInitialized = true;
      console.log("✅ Firebase Admin initialized successfully");
    } else {
      isFirebaseInitialized = true;
    }
  } catch (error) {
    console.error("❌ Failed to initialize Firebase Admin:", error.message);
  }
} else {
  console.warn("⚠️ Firebase service account key not found at:", serviceAccountPath);
}

/**
 * Send push notification to a single FCM device token
 */
export const sendPushNotification = async (fcmToken, { title, body, data = {} }) => {
  if (!isFirebaseInitialized || !fcmToken) return null;

  try {
    const stringifiedData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v ?? "")])
    );

    const message = {
      token: fcmToken,
      notification: {
        title,
        body,
      },
      data: stringifiedData,
    };

    const response = await admin.messaging().send(message);
    console.log("✅ Push notification sent successfully:", response);
    return response;
  } catch (error) {
    console.error("❌ Error sending push notification:", error.message);
    return null;
  }
};

/**
 * Send push notification to multiple FCM device tokens
 */
export const sendMulticastNotification = async (fcmTokens, { title, body, data = {} }) => {
  if (!isFirebaseInitialized) return null;

  const validTokens = (fcmTokens || []).filter((token) => Boolean(token) && typeof token === "string");
  if (validTokens.length === 0) return null;

  try {
    const stringifiedData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v ?? "")])
    );

    const message = {
      tokens: validTokens,
      notification: {
        title,
        body,
      },
      data: stringifiedData,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`✅ Multicast notification sent: ${response.successCount} successes, ${response.failureCount} failures`);
    return response;
  } catch (error) {
    console.error("❌ Error sending multicast push notification:", error.message);
    return null;
  }
};

export default admin;
