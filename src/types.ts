export type CardCategory = "灵感" | "计划" | "收藏" | "角色";

export type CardAspectRatio =
  | "image"
  | "9:16"
  | "3:4"
  | "2:3"
  | "1:1"
  | "4:3"
  | "16:9";

export type CardBackTextMode = "default" | "custom" | "none";
export type CardFrontTextMode = "default" | "custom" | "none";
export type CardBackTheme = "classic" | "midnight" | "porcelain" | "carmine";

export type VaultCard = {
  id: string;
  name: string;
  category: CardCategory;
  summary: string;
  image?: string;
  imageAssetId?: string;
  aspectRatio: CardAspectRatio;
  imageAspectRatio?: number;
  thickness: number;
  frontTextMode: CardFrontTextMode;
  frontTitle: string;
  frontText: string;
  showFaceText: boolean;
  backTextMode: CardBackTextMode;
  backTheme: CardBackTheme;
  backImage?: string;
  backImageAssetId?: string;
  backTitle: string;
  backText: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type CardDraft = Pick<
  VaultCard,
  | "name"
  | "category"
  | "summary"
  | "image"
  | "imageAssetId"
  | "aspectRatio"
  | "imageAspectRatio"
  | "thickness"
  | "frontTextMode"
  | "frontTitle"
  | "frontText"
  | "showFaceText"
  | "backTextMode"
  | "backTheme"
  | "backImage"
  | "backImageAssetId"
  | "backTitle"
  | "backText"
>;

export type StageSettings = {
  backgroundImage?: string;
  backgroundOpacity: number;
};

export const categories: CardCategory[] = ["灵感", "计划", "收藏", "角色"];

export const cardAspectRatios: Exclude<CardAspectRatio, "image">[] = [
  "9:16",
  "3:4",
  "2:3",
  "1:1",
  "4:3",
  "16:9",
];

export function resolveCardAspectRatio(
  aspectRatio: CardAspectRatio,
  imageAspectRatio?: number,
) {
  if (aspectRatio === "image") {
    return imageAspectRatio && Number.isFinite(imageAspectRatio)
      ? Math.min(2.2, Math.max(0.38, imageAspectRatio))
      : 0.75;
  }
  const [width, height] = aspectRatio.split(":").map(Number);
  return width / height;
}

export function isCardAspectRatio(value: unknown): value is CardAspectRatio {
  return value === "image" || cardAspectRatios.includes(value as Exclude<CardAspectRatio, "image">);
}
