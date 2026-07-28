/** True on iPhone/iPad/iPod, including iPadOS 13+ which reports as "MacIntel"
 *  but exposes multi-touch (real Macs don't). */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}
