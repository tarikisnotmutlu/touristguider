import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirebaseStorage } from "./firebase";

/** Uploads a Hidden Gem's photo straight to Firebase Storage at
 *  gems/{sessionId}/{filename} and returns its public downloadURL — the
 *  player app renders this directly in an <img>, no base64 round-trip. */
export async function uploadGemPhoto(sessionId: string, gemId: string, file: File): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "-");
  const path = `gems/${sessionId}/${gemId}-${Date.now()}-${safeName}`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}
