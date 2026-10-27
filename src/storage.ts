import {
  isCardAspectRatio,
  type CardBackTextMode,
  type CardBackTheme,
  type CardFrontTextMode,
  type StageSettings,
  type VaultCard,
} from "./types";

const STORAGE_KEY = "shining-card-vault:v1";
const PHOTO_SAMPLES_KEY = "shining-card-vault:photo-samples-v1";
const STAGE_SETTINGS_KEY = "shining-card-vault:stage-settings-v1";
const IMAGE_DB_NAME = "shining-card-vault-images";
const IMAGE_STORE_NAME = "assets";
const IMAGE_DB_VERSION = 1;
const ORPHAN_RETENTION_MS = 24 * 60 * 60 * 1000;

type ImageAssetRecord = {
  blob: Blob;
  createdAt: number;
};

const defaultCardBack = {
  backTextMode: "default",
  backTheme: "classic",
  backTitle: "",
  backText: "",
} as const;

const starterCards: VaultCard[] = [
  {
    ...defaultCardBack,
    id: "starter-orbit",
    name: "轨道上的灵感",
    category: "灵感",
    summary: "还没成形的想法，也值得先有个位置。",
    aspectRatio: "3:4",
    thickness: 4,
    frontTextMode: "default",
    frontTitle: "",
    frontText: "",
    showFaceText: true,
    notes: "把突然冒出来的点子放在这里。\n\n可以慢慢补充线索、图片链接，或下一步想尝试的事情。",
    createdAt: "2026-10-20T10:30:00.000Z",
    updatedAt: "2026-10-20T10:30:00.000Z",
  },
  {
    ...defaultCardBack,
    id: "starter-map",
    name: "下一段旅程",
    category: "计划",
    summary: "收好目的地、路线和一路上的小发现。",
    aspectRatio: "3:4",
    thickness: 4,
    frontTextMode: "default",
    frontTitle: "",
    frontText: "",
    showFaceText: true,
    notes: "目的地：\n\n想去的地方：\n\n准备清单：",
    createdAt: "2026-10-21T10:30:00.000Z",
    updatedAt: "2026-10-21T10:30:00.000Z",
  },
  {
    ...defaultCardBack,
    id: "starter-character",
    name: "月面来客",
    category: "角色",
    summary: "给一个还在长大的角色留一张卡片。",
    aspectRatio: "3:4",
    thickness: 4,
    frontTextMode: "default",
    frontTitle: "",
    frontText: "",
    showFaceText: true,
    notes: "名字：\n\n外观：\n\n故事线索：",
    createdAt: "2026-10-22T10:30:00.000Z",
    updatedAt: "2026-10-22T10:30:00.000Z",
  },
];

const photoSamples: VaultCard[] = [
  {
    ...defaultCardBack,
    id: "sample-silver-traveler",
    name: "浅桃旅人",
    category: "角色",
    summary: "薄荷色发梢与粉色行李，停在旅程开始的那一刻。",
    aspectRatio: "3:4",
    thickness: 4,
    frontTextMode: "default",
    frontTitle: "",
    frontText: "",
    showFaceText: true,
    notes: "卡面主题：薄荷色短发、粉色条纹与红色行李。\n\n可以在这里补充角色设定、收藏来源，或你想继续发展的灵感。",
    createdAt: "2026-10-26T10:00:00.000Z",
    updatedAt: "2026-10-26T10:00:00.000Z",
  },
  {
    ...defaultCardBack,
    id: "sample-midnight-traveler",
    name: "夜航旅人",
    category: "收藏",
    summary: "城市灯火之外，一张属于夜晚的收藏。",
    aspectRatio: "3:4",
    thickness: 4,
    frontTextMode: "default",
    frontTitle: "",
    frontText: "",
    showFaceText: true,
    notes: "卡面主题：夜景车厢、城市灯火与一段安静的旅程。\n\n在这里记录人物设定、画面灵感或你想保存的故事。",
    createdAt: "2026-10-26T10:01:00.000Z",
    updatedAt: "2026-10-26T10:01:00.000Z",
  },
];

export async function loadCards(): Promise<VaultCard[]> {
  const cards = readCardsFromStorage();
  let metadataChanged = false;
  let migrationFailed = false;

  for (const card of cards) {
    for (const side of ["front", "back"] as const) {
      const imageKey = side === "front" ? "image" : "backImage";
      const assetKey = side === "front" ? "imageAssetId" : "backImageAssetId";
      const image = card[imageKey];
      if (!image?.startsWith("data:image/") || card[assetKey]) continue;

      try {
        const blob = await (await fetch(image)).blob();
        const assetId = `legacy:${card.id}:${side}`;
        await writeImageAsset(assetId, blob);
        const stored = await readImageAsset(assetId);
        if (!stored || !(await hasMatchingImageBytes(blob, stored))) {
          throw new Error("Image asset verification failed");
        }
        card[assetKey] = assetId;
        metadataChanged = true;
      } catch {
        migrationFailed = true;
      }
    }
  }

  if (metadataChanged) {
    try {
      persistCards(cards);
    } catch {
      migrationFailed = true;
    }
  }

  const missingAssets: string[] = [];
  for (const card of cards) {
    for (const side of ["front", "back"] as const) {
      const imageKey = side === "front" ? "image" : "backImage";
      const assetKey = side === "front" ? "imageAssetId" : "backImageAssetId";
      const assetId = card[assetKey];
      if (!assetId) continue;
      try {
        const blob = await readImageAsset(assetId);
        if (!blob) {
          missingAssets.push(card.name);
          continue;
        }
        card[imageKey] = URL.createObjectURL(blob);
      } catch {
        missingAssets.push(card.name);
      }
    }
  }

  await removeOldOrphanedAssets(cards).catch(() => undefined);
  if (missingAssets.length) {
    console.warn("Some saved card images could not be loaded.", [...new Set(missingAssets)]);
  }
  if (migrationFailed) {
    console.warn("Some card images could not be moved to IndexedDB; original data was retained.");
  }
  return cards;
}

function readCardsFromStorage(): VaultCard[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [...starterCards, ...photoSamples];

    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [...starterCards, ...photoSamples];

    const cards = parsed.map(normalizeCard).filter((card): card is VaultCard => card !== null);
    if (localStorage.getItem(PHOTO_SAMPLES_KEY) === "done") return cards;

    const existingIds = new Set(cards.map((card) => card.id));
    return [...photoSamples.filter((card) => !existingIds.has(card.id)), ...cards];
  } catch {
    return [...starterCards, ...photoSamples];
  }
}

export function saveCards(cards: VaultCard[]) {
  persistCards(cards);
  localStorage.setItem(PHOTO_SAMPLES_KEY, "done");
}

function persistCards(cards: VaultCard[]) {
  const storedCards = cards.map((card) => {
    const stored = { ...card };
    if (card.imageAssetId) delete stored.image;
    if (card.backImageAssetId) delete stored.backImage;
    return stored;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storedCards));
}

export async function saveImageAsset(file: File) {
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close();

  const assetId = crypto.randomUUID();
  await writeImageAsset(assetId, file);
  return {
    assetId,
    imageUrl: URL.createObjectURL(file),
    width,
    height,
  };
}

async function hasMatchingImageBytes(source: Blob, stored: Blob) {
  if (source.size !== stored.size || source.type !== stored.type) return false;
  const [sourceHash, storedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", await source.arrayBuffer()),
    crypto.subtle.digest("SHA-256", await stored.arrayBuffer()),
  ]);
  const sourceBytes = new Uint8Array(sourceHash);
  const storedBytes = new Uint8Array(storedHash);
  return sourceBytes.every((value, index) => value === storedBytes[index]);
}

function openImageDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IMAGE_STORE_NAME)) {
        request.result.createObjectStore(IMAGE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open image storage"));
    request.onblocked = () => reject(new Error("Image storage upgrade is blocked"));
  });
}

async function writeImageAsset(assetId: string, blob: Blob) {
  const database = await openImageDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(IMAGE_STORE_NAME, "readwrite");
      transaction.objectStore(IMAGE_STORE_NAME).put(
        { blob, createdAt: Date.now() } satisfies ImageAssetRecord,
        assetId,
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save image"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Image save was aborted"));
    });
  } finally {
    database.close();
  }
}

async function readImageAsset(assetId: string) {
  const database = await openImageDatabase();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const request = database
        .transaction(IMAGE_STORE_NAME, "readonly")
        .objectStore(IMAGE_STORE_NAME)
        .get(assetId);
      request.onsuccess = () => {
        const record = request.result as ImageAssetRecord | undefined;
        resolve(record?.blob);
      };
      request.onerror = () => reject(request.error ?? new Error("Unable to read image"));
    });
  } finally {
    database.close();
  }
}

async function removeOldOrphanedAssets(cards: VaultCard[]) {
  const database = await openImageDatabase();
  try {
    const retained = new Set(
      cards.flatMap((card) => [card.imageAssetId, card.backImageAssetId].filter(Boolean)),
    );
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(IMAGE_STORE_NAME, "readwrite");
      const store = transaction.objectStore(IMAGE_STORE_NAME);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const assetId = String(cursor.key);
        const record = cursor.value as ImageAssetRecord;
        if (!retained.has(assetId) && Date.now() - record.createdAt > ORPHAN_RETENTION_MS) {
          cursor.delete();
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to clean images"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Image cleanup was aborted"));
    });
  } finally {
    database.close();
  }
}

export function loadStageSettings(): StageSettings {
  try {
    const saved = localStorage.getItem(STAGE_SETTINGS_KEY);
    if (!saved) return { backgroundOpacity: 0.94 };

    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return { backgroundOpacity: 0.94 };

    const settings = parsed as Partial<StageSettings>;
    return {
      backgroundImage:
        typeof settings.backgroundImage === "string" ? settings.backgroundImage : undefined,
      backgroundOpacity:
        typeof settings.backgroundOpacity === "number" &&
        Number.isFinite(settings.backgroundOpacity)
          ? Math.min(1, Math.max(0, settings.backgroundOpacity))
          : 0.94,
    };
  } catch {
    return { backgroundOpacity: 0.94 };
  }
}

export function saveStageSettings(settings: StageSettings) {
  localStorage.setItem(STAGE_SETTINGS_KEY, JSON.stringify(settings));
}

function normalizeCard(value: unknown): VaultCard | null {
  if (!value || typeof value !== "object") return null;
  const card = value as Partial<VaultCard>;
  if (!(
    typeof card.id === "string" &&
    typeof card.name === "string" &&
    typeof card.summary === "string" &&
    (card.image === undefined || typeof card.image === "string") &&
    typeof card.notes === "string" &&
    typeof card.createdAt === "string" &&
    typeof card.updatedAt === "string" &&
    ["灵感", "计划", "收藏", "角色"].includes(card.category ?? "")
  )) return null;

  return {
    ...card,
    aspectRatio: isCardAspectRatio(card.aspectRatio) ? card.aspectRatio : "3:4",
    imageAspectRatio:
      typeof card.imageAspectRatio === "number" &&
      Number.isFinite(card.imageAspectRatio) &&
      card.imageAspectRatio > 0
        ? card.imageAspectRatio
        : undefined,
    thickness:
      typeof card.thickness === "number" && Number.isFinite(card.thickness)
        ? Math.min(12, Math.max(1, card.thickness))
        : 4,
    frontTextMode: isCardFrontTextMode(card.frontTextMode)
      ? card.frontTextMode
      : card.showFaceText === false
        ? "none"
        : "default",
    frontTitle: typeof card.frontTitle === "string" ? card.frontTitle.slice(0, 48) : "",
    frontText: typeof card.frontText === "string" ? card.frontText.slice(0, 120) : "",
    showFaceText:
      isCardFrontTextMode(card.frontTextMode)
        ? card.frontTextMode !== "none"
        : card.showFaceText !== false,
    backTextMode: isCardBackTextMode(card.backTextMode) ? card.backTextMode : "default",
    backTheme: isCardBackTheme(card.backTheme) ? card.backTheme : "classic",
    backImage: typeof card.backImage === "string" ? card.backImage : undefined,
    imageAssetId: typeof card.imageAssetId === "string" ? card.imageAssetId : undefined,
    backImageAssetId:
      typeof card.backImageAssetId === "string" ? card.backImageAssetId : undefined,
    backTitle: typeof card.backTitle === "string" ? card.backTitle.slice(0, 48) : "",
    backText: typeof card.backText === "string" ? card.backText.slice(0, 420) : "",
  } as VaultCard;
}

function isCardBackTextMode(value: unknown): value is CardBackTextMode {
  return value === "default" || value === "custom" || value === "none";
}

function isCardFrontTextMode(value: unknown): value is CardFrontTextMode {
  return value === "default" || value === "custom" || value === "none";
}

function isCardBackTheme(value: unknown): value is CardBackTheme {
  return value === "classic" || value === "midnight" || value === "porcelain" || value === "carmine";
}
