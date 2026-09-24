import { supabase } from './supabaseClient';

/**
 * Bilder auf Karteikarten (Audit 23.09.2026: nur Text war möglich).
 * Eigener privater Bucket `card-images` (backend/migration_card_images.sql),
 * Pfad {userId}/{cardId}-{zufall}.{ext}. Angezeigt über signierte Links,
 * die eine Stunde gelten und hier zwischengespeichert werden.
 */
export const CARD_IMAGE_BUCKET = 'card-images';
export const MAX_IMAGE_EDGE = 1280;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const SIGNED_URL_SECONDS = 60 * 60;
const URL_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export class CardImageError extends Error {
  constructor(public code: 'not-image' | 'too-large' | 'not-set-up' | 'upload') { super(code); }
}

/** Zielgröße: längste Kante höchstens MAX_IMAGE_EDGE, Seitenverhältnis bleibt. */
export const fitWithin = (w: number, h: number, max = MAX_IMAGE_EDGE): { w: number; h: number } => {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));

/** Verkleinert und komprimiert im Browser (WebP, sonst JPEG). GIFs bleiben unverändert (Animation). */
export const compressImage = async (file: File): Promise<Blob> => {
  if (!file.type.startsWith('image/')) throw new CardImageError('not-image');
  if (file.size > MAX_INPUT_BYTES) throw new CardImageError('too-large');
  if (file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file);
  const { w, h } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const webp = await canvasToBlob(canvas, 'image/webp', 0.82);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.85);
  if (!jpeg) throw new CardImageError('upload');
  return jpeg;
};

const extFor = (type: string) => (type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : type === 'image/gif' ? 'gif' : 'jpg');

export const uploadCardImage = async (userId: string, cardId: string, file: File): Promise<string> => {
  const blob = await compressImage(file);
  const path = `${userId}/${cardId}-${Math.random().toString(36).slice(2, 8)}.${extFor(blob.type)}`;
  const { error } = await supabase.storage.from(CARD_IMAGE_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new CardImageError('not-set-up');
    throw new CardImageError('upload');
  }
  return path;
};

/** Bestmöglich löschen: ein verwaistes Bild ist kein Grund, eine Karte nicht zu speichern. */
export const deleteCardImage = async (path: string | undefined): Promise<void> => {
  if (!path) return;
  urlCache.delete(path);
  await supabase.storage.from(CARD_IMAGE_BUCKET).remove([path]).catch(() => {});
};

const urlCache = new Map<string, { url: string; expires: number }>();
const pending = new Map<string, Promise<string | null>>();

/** Signierter Link; null, wenn das Bild fehlt oder fremd ist (z. B. geteilter Stapel). */
export const getCardImageUrl = (path: string, now = Date.now()): Promise<string | null> => {
  const hit = urlCache.get(path);
  if (hit && hit.expires - URL_REFRESH_MARGIN_MS > now) return Promise.resolve(hit.url);
  const inflight = pending.get(path);
  if (inflight) return inflight;
  const p = supabase.storage.from(CARD_IMAGE_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS)
    .then(({ data, error }) => {
      if (error || !data?.signedUrl) return null;
      urlCache.set(path, { url: data.signedUrl, expires: now + SIGNED_URL_SECONDS * 1000 });
      return data.signedUrl;
    })
    .catch(() => null)
    .finally(() => pending.delete(path));
  pending.set(path, p);
  return p;
};

/** Bild gehört dem Nutzer (erstes Pfadsegment = userId). Fremde Bilder nicht löschen. */
export const isOwnImage = (path: string | undefined, userId: string | undefined): boolean =>
  !!path && !!userId && path.startsWith(`${userId}/`);
