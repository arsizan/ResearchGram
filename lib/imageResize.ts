/*
 * Smaller profile pictures and cover photos (Phase 5).
 *
 * Before upload, the picture is scaled down to what the page shows (with room
 * for sharp screens) and saved again as WebP, or JPEG where the browser cannot
 * write WebP. A 4 MB phone photo becomes a few hundred KB, so profiles, the
 * feed and the nav load faster. Saving it again also drops the hidden photo
 * data phones add, such as the GPS location where it was taken.
 *
 * GIFs and animated PNG or WebP pictures are left as they are (only their
 * first frame would survive), and so are pictures too big to open safely on a
 * phone. Anything that goes wrong here returns the original file, so an upload
 * never fails because of it.
 */

/** Longest side, in pixels. */
export const AVATAR_MAX_SIDE = 512;
export const COVER_MAX_SIDE = 1600;

/** Pictures larger than this are not opened in the browser at all. */
export const MAX_SHRINKABLE_BYTES = 25 * 1024 * 1024;

/** Nor pictures with more pixels than this (about 160 MB of memory to open). */
export const MAX_SHRINKABLE_PIXELS = 40_000_000;

const SHRINKABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

/** True for an animated PNG ("acTL") or WebP ("ANIM"), found near the start of the file. */
async function isAnimated(file: File): Promise<boolean> {
  if (file.type !== "image/png" && file.type !== "image/webp") return false;
  const head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  const marker = file.type === "image/png" ? "acTL" : "ANIM";
  const codes = Array.from(marker, (ch) => ch.charCodeAt(0));
  for (let i = 0; i + 4 <= head.length; i++) {
    if (head[i] === codes[0] && head[i + 1] === codes[1] && head[i + 2] === codes[2] && head[i + 3] === codes[3]) return true;
  }
  return false;
}

/** Width x height from the picture's header, without decoding all of it. */
async function pixelCount(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The picture could not be read."));
      image.src = url;
    });
    return image.naturalWidth * image.naturalHeight;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      // Turned the right way up, as phones store it.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() };
    } catch {
      // Older browsers: fall back to an <img>.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function shrinkImage(file: File, maxSide: number, quality = 0.85): Promise<File> {
  if (typeof document === "undefined" || !SHRINKABLE.has(file.type) || file.size > MAX_SHRINKABLE_BYTES) {
    return file;
  }

  try {
    if (await isAnimated(file)) return file;
    if ((await pixelCount(file)) > MAX_SHRINKABLE_PIXELS) return file;

    const image = await decode(file);
    try {
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height, 1));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return file;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image.source, 0, 0, width, height);

      let type = "image/webp";
      let blob = await toBlob(canvas, type, quality);

      if (!blob || blob.type !== "image/webp") {
        // No WebP writer (older Safari): JPEG, on white where the picture was see-through.
        type = "image/jpeg";
        context.globalCompositeOperation = "destination-over";
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        blob = await toBlob(canvas, type, quality);
      }

      if (!blob || blob.type !== type) return file;

      // A small picture that was not scaled: keep the original if saving it
      // again made it bigger, except a JPEG, which may hold a GPS location.
      if (scale === 1 && blob.size >= file.size && file.type !== "image/jpeg") return file;

      const base = file.name.replace(/\.[^.]*$/, "") || "image";
      return new File([blob], `${base}.${type === "image/webp" ? "webp" : "jpg"}`, {
        type,
        lastModified: Date.now(),
      });
    } finally {
      image.done();
    }
  } catch {
    return file;
  }
}
