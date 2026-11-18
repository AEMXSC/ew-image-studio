/**
 * Browser image helpers: base64 for the model API, JPEG re-encoding for
 * the site (Gemini returns large PNGs; EDS sites cap uploads at 4.5 MB on
 * some setups), and File objects for dragging onto the canvas.
 */
export const MAX_INPUT_SIDE = 2048;

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Couldn\'t read the image.'));
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(data, mime) {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

/** Re-encodes to JPEG, scaling down so the long side is at most `maxSide`. */
export async function toJpeg(blob, { quality = 0.9, maxSide = 0 } = {}) {
  const bitmap = await createImageBitmap(blob);
  const scale = maxSide ? Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height)) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // transparent areas become white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn\'t prepare the image.'))), 'image/jpeg', quality);
  });
}

/** An image as the model wants it: JPEG, not huge, base64. */
export async function modelInput(blob) {
  const jpeg = await toJpeg(blob, { quality: 0.88, maxSide: MAX_INPUT_SIDE });
  return { mime: 'image/jpeg', data: await blobToBase64(jpeg) };
}

/** Object URLs for previews, revoked together when the panel drops them. */
export function urlPool() {
  const urls = new Map();
  return {
    url(key, blob) {
      if (!urls.has(key)) urls.set(key, URL.createObjectURL(blob));
      return urls.get(key);
    },
    drop(key) {
      const u = urls.get(key);
      if (u) URL.revokeObjectURL(u);
      urls.delete(key);
    },
  };
}
