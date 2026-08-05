/** Google Drive "shareable link" formats point at an HTML viewer page, not
 *  raw image bytes — dropped straight into an <img src>, they just render a
 *  broken-image icon. This extracts the file id (present in every share-link
 *  variant Drive generates) and rebuilds it as a `uc?export=view` URL, which
 *  does serve the image directly. Falls back to the original URL untouched
 *  if no id can be found, so a non-Drive (or already-direct) URL still gets
 *  used as-is rather than silently breaking. */
export function convertDriveLinkToDirectImage(url: string): string {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/, // https://drive.google.com/file/d/FILE_ID/view...
    /[?&]id=([a-zA-Z0-9_-]+)/, // https://drive.google.com/open?id=FILE_ID
  ];
  for (const pattern of patterns) {
    const fileId = url.match(pattern)?.[1];
    if (fileId) return `https://drive.google.com/uc?export=view&id=${fileId}`;
  }
  return url;
}
