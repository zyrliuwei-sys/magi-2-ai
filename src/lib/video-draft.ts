import type { VideoSettings } from '@/config/magi-video';

type StudioPath = '/' | '/text-to-video' | '/image-to-video';

type Draft = {
  prompt: string;
  settings: VideoSettings;
  path?: StudioPath;
  hadStartingImage?: boolean;
  hadEndingImage?: boolean;
  frameKey?: string;
  savedAt?: number;
};

type Frames = { image?: File; endingImage?: File; savedAt: number };

const draftKey = 'magi-video-draft';
const frameStore = 'frames';
const retentionMs = 24 * 60 * 60 * 1000;

export function studioPath(path?: string): StudioPath {
  if (path === '/text-to-video' || path === '/image-to-video') return path;
  return '/';
}

export function studioDraftUrl(path?: string) {
  return `${studioPath(path)}?restore=true#studio`;
}

export function readVideoDraft(): Draft | undefined {
  try {
    const raw = sessionStorage.getItem(draftKey);
    if (!raw) return;
    const draft = JSON.parse(raw) as Draft;
    if (typeof draft?.prompt !== 'string' || !draft.settings) return;
    if (draft.savedAt && Date.now() - draft.savedAt > retentionMs) {
      sessionStorage.removeItem(draftKey);
      return;
    }
    return draft;
  } catch {
    return;
  }
}

function withFrames<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('magi-video-drafts', 1);
    open.onupgradeneeded = () => open.result.createObjectStore(frameStore);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('Video draft storage is blocked'));
    open.onsuccess = () => {
      const db = open.result;
      try {
        const transaction = db.transaction(frameStore, mode);
        const request = run(transaction.objectStore(frameStore));
        transaction.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        transaction.onabort = () => {
          db.close();
          reject(transaction.error);
        };
      } catch (error) {
        db.close();
        reject(error);
      }
    };
  });
}

export async function saveVideoDraft(
  input: Pick<Draft, 'prompt' | 'settings' | 'path'>,
  image?: File,
  endingImage?: File
) {
  const savedAt = Date.now();
  const previous = readVideoDraft();
  const draft: Draft = {
    ...input,
    hadStartingImage: !!image,
    hadEndingImage: !!endingImage,
    savedAt,
  };
  if (image || endingImage) {
    try {
      const frameKey = previous?.frameKey ?? crypto.randomUUID();
      await withFrames('readwrite', (store) => {
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (!row) return;
          if (savedAt - row.value.savedAt > retentionMs) row.delete();
          row.continue();
        };
        return store.put(
          { image, endingImage, savedAt } satisfies Frames,
          frameKey
        );
      });
      draft.frameKey = frameKey;
    } catch {
      // The text draft and the re-select notice still work without IndexedDB.
    }
  }
  try {
    sessionStorage.setItem(draftKey, JSON.stringify(draft));
  } catch {
    if (draft.frameKey) {
      void withFrames('readwrite', (store) =>
        store.delete(draft.frameKey!)
      ).catch(() => {});
    }
  }
}

export async function readVideoDraftFrames(
  frameKey?: string
): Promise<Partial<Frames>> {
  if (!frameKey) return {};
  try {
    const files: Frames | undefined = await withFrames('readonly', (store) =>
      store.get(frameKey)
    );
    if (files && Date.now() - files.savedAt <= retentionMs) return files;
  } catch {
    // The form can still restore the text and ask for any missing frames.
  }
  return {};
}

export function clearVideoDraft() {
  const frameKey = readVideoDraft()?.frameKey;
  try {
    sessionStorage.removeItem(draftKey);
  } catch {
    // Browser storage can be disabled.
  }
  if (frameKey) {
    void withFrames('readwrite', (store) => store.delete(frameKey)).catch(
      () => {}
    );
  }
}
