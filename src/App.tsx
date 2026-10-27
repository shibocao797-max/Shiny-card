import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  Image,
  Layers3,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import ParticleField from "./ParticleField";
import CardShowcase3D from "./CardShowcase3D";
import {
  loadCards,
  loadStageSettings,
  saveCards,
  saveImageAsset,
  saveStageSettings,
} from "./storage";
import {
  cardAspectRatios,
  categories,
  resolveCardAspectRatio,
  type CardAspectRatio,
  type CardBackTextMode,
  type CardBackTheme,
  type CardCategory,
  type CardDraft,
  type CardFrontTextMode,
  type StageSettings,
  type VaultCard,
} from "./types";

const DEFAULT_STAGE_BACKGROUND = "/studio-background.svg";
const backThemes: { value: CardBackTheme; label: string }[] = [
  { value: "classic", label: "经典黑金" },
  { value: "midnight", label: "午夜海色" },
  { value: "porcelain", label: "象牙纸感" },
  { value: "carmine", label: "绯红暗纹" },
];
const backTextModes: { value: CardBackTextMode; label: string }[] = [
  { value: "default", label: "默认" },
  { value: "custom", label: "自定义" },
  { value: "none", label: "无文字" },
];
const frontTextModes: { value: CardFrontTextMode; label: string }[] = [
  { value: "default", label: "默认" },
  { value: "custom", label: "自定义" },
  { value: "none", label: "无文字" },
];

function getRecentCardId(cards: VaultCard[]) {
  return [...cards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id ?? null;
}

function App() {
  const [cards, setCards] = useState<VaultCard[]>([]);
  const [cardsReady, setCardsReady] = useState(false);
  const [stageSettings, setStageSettings] = useState<StageSettings>(loadStageSettings);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [screen, setScreen] = useState<"vault" | "space">("vault");
  const [composerOpen, setComposerOpen] = useState(false);
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const [transitionKey, setTransitionKey] = useState(0);
  const [isForming, setIsForming] = useState(false);
  const [toast, setToast] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void loadCards()
      .then((loadedCards) => {
        if (!active) return;
        setCards(loadedCards);
        setSelectedId(getRecentCardId(loadedCards));
        setCardsReady(true);
      })
      .catch(() => {
        if (!active) return;
        setToast("卡片仓库读取失败，请刷新页面重试");
        setCardsReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedCard = cards.find((card) => card.id === selectedId) ?? null;
  const editingCard = editingId ? cards.find((card) => card.id === editingId) ?? null : null;
  const orderedCards = useMemo(
    () => [...cards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [cards],
  );

  useEffect(() => {
    if (!cardsReady) return;
    try {
      saveCards(cards);
    } catch {
      setToast("本机空间不足，暂时无法保存");
    }
  }, [cards, cardsReady]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        saveStageSettings(stageSettings);
      } catch {
        setToast("背景图片太大，暂时无法保存");
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [stageSettings]);

  useEffect(() => {
    if (toast) {
      const timer = window.setTimeout(() => setToast(""), 2600);
      return () => window.clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (selectedId && cards.some((card) => card.id === selectedId)) return;
    setSelectedId(getRecentCardId(cards));
  }, [cards, selectedId]);

  if (!cardsReady) {
    return (
      <main className="vault-loading" aria-live="polite" aria-busy="true">
        正在读取卡片仓库…
      </main>
    );
  }

  function beginFormation() {
    setIsForming(true);
  }

  function selectCard(card: VaultCard) {
    setSelectedId(card.id);
    setTransitionKey((value) => value + 1);
    beginFormation();
    setSearchMessage("");
  }

  function searchCards(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchValue.trim().toLocaleLowerCase();
    if (!query) {
      setSearchMessage("输入卡片名称开始寻找");
      return;
    }

    const result = cards.find((card) => card.name.toLocaleLowerCase().includes(query));
    if (!result) {
      setSearchMessage("没有找到这张卡片");
      return;
    }

    selectCard(result);
    setSearchMessage(`已找到「${result.name}」`);
  }

  function saveCard(draft: CardDraft, id?: string) {
    const normalizedName = draft.name.trim().toLocaleLowerCase();
    const duplicate = cards.some(
      (card) => card.id !== id && card.name.trim().toLocaleLowerCase() === normalizedName,
    );
    if (duplicate) return "这个名字已经在仓库里了";

    const now = new Date().toISOString();
    if (id) {
      setCards((current) =>
        current.map((card) =>
          card.id === id
            ? {
                ...card,
                ...draft,
                name: draft.name.trim(),
                summary: draft.summary.trim(),
                updatedAt: now,
              }
            : card,
        ),
      );
      setSelectedId(id);
      setToast("卡片信息已更新");
    } else {
      const card: VaultCard = {
        ...draft,
        name: draft.name.trim(),
        summary: draft.summary.trim(),
        id: crypto.randomUUID(),
        notes: "",
        createdAt: now,
        updatedAt: now,
      };
      setCards((current) => [card, ...current]);
      setSelectedId(card.id);
      setTransitionKey((value) => value + 1);
      beginFormation();
      setSearchValue("");
      setSearchMessage("");
      setToast("新卡片已经成形");
    }

    if (!id) setScreen("vault");
    setComposerOpen(false);
    setEditingId(null);
    return null;
  }

  function saveNotes(id: string, notes: string) {
    setCards((current) =>
      current.map((card) =>
        card.id === id ? { ...card, notes, updatedAt: new Date().toISOString() } : card,
      ),
    );
    setToast("空间内容已保存");
  }

  function deleteSelectedCard() {
    if (!selectedCard) return;
    const nextCards = cards.filter((card) => card.id !== selectedCard.id);
    setCards(nextCards);
    setSelectedId(getRecentCardId(nextCards));
    if (nextCards.length) {
      setTransitionKey((value) => value + 1);
      beginFormation();
    } else {
      setIsForming(false);
    }
    setScreen("vault");
    setDeleteOpen(false);
    setToast("卡片已从仓库移除");
  }

  if (screen === "space" && selectedCard) {
    return (
      <>
        <CardSpace
          card={selectedCard}
          onBack={() => setScreen("vault")}
          onEdit={() => {
            setEditingId(selectedCard.id);
            setComposerOpen(true);
          }}
          onDelete={() => setDeleteOpen(true)}
          onSaveNotes={saveNotes}
        />
        {composerOpen && (
          <CardComposer
            key={editingCard?.id ?? "new"}
            card={editingCard}
            cards={cards}
            onClose={() => {
              setComposerOpen(false);
              setEditingId(null);
            }}
            onSave={saveCard}
          />
        )}
        {deleteOpen && selectedCard && (
          <DeleteDialog
            name={selectedCard.name}
            onCancel={() => setDeleteOpen(false)}
            onDelete={deleteSelectedCard}
          />
        )}
        <Toast message={toast} />
      </>
    );
  }

  return (
    <div className={`app-shell ${backgroundOpen ? "has-background-settings" : ""}`}>
      <header className="app-header">
        <div className="brand" aria-label="闪亮卡片">
          <span className="brand-symbol">
            <Sparkles size={17} strokeWidth={1.7} />
          </span>
          <span className="brand-copy">
            <strong>闪亮卡片</strong>
            <small>GLOW VAULT</small>
          </span>
        </div>
        <div className="header-context">
          <span className="status-led" />
          <span>仅保存在这台设备</span>
          <span className="context-divider" />
          <span>{cards.length.toString().padStart(2, "0")} 张卡片</span>
        </div>
        <button
          className="button button-primary header-create"
          type="button"
          onClick={() => {
            setEditingId(null);
            setComposerOpen(true);
          }}
        >
          <Plus size={17} />
          <span>创建卡片</span>
        </button>
      </header>

      <main className="workspace">
        <section className="page-heading">
          <div>
            <h1>卡片仓库</h1>
          </div>
        </section>

        <section className="vault-layout" aria-label="卡片仓库">
          <section className="stage-panel" aria-label="卡片展示区">
            <div className="stage-topline">
              <div className="stage-state">
                <span className="state-mark" />
              </div>
              <div className="stage-top-actions">
                <span className="stage-index">
                  {selectedCard ? `NO. ${String(orderedCards.findIndex((card) => card.id === selectedId) + 1).padStart(2, "0")}` : "EMPTY"}
                </span>
                <button
                  className="stage-background-button"
                  type="button"
                  aria-label="展示背景设置"
                  title="展示背景设置"
                  onClick={() => setBackgroundOpen(true)}
                >
                  <SlidersHorizontal size={15} />
                </button>
              </div>
            </div>

            <div className="particle-stage" ref={stageRef}>
              <div className="stage-backdrop" aria-hidden="true">
                {stageSettings.backgroundImage && (
                  <img className="stage-backdrop-underlay" src={DEFAULT_STAGE_BACKGROUND} alt="" />
                )}
                <img
                  className="stage-backdrop-image"
                  src={stageSettings.backgroundImage ?? DEFAULT_STAGE_BACKGROUND}
                  alt=""
                  style={{ opacity: stageSettings.backgroundOpacity }}
                />
              </div>
              <ParticleField
                card={selectedCard}
                transitionKey={transitionKey}
                hostRef={stageRef}
                onFormationStart={() => setIsForming(true)}
                onFormationComplete={() => setIsForming(false)}
              />
              {selectedCard ? (
                <div className={`card-focus ${isForming ? "is-forming" : ""}`}>
                  <CardShowcase3D
                    key={`${selectedCard.id}:${selectedCard.aspectRatio}:${selectedCard.imageAspectRatio}:${selectedCard.thickness}`}
                    card={selectedCard}
                    edition={orderedCards.findIndex((card) => card.id === selectedId) + 1}
                    isForming={isForming}
                    onOpen={() => setScreen("space")}
                  />
                </div>
              ) : (
                <div className="stage-empty">
                  <div className="empty-seal"><Sparkles size={22} strokeWidth={1.25} /></div>
                  <h2>让第一张卡片成形</h2>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => setComposerOpen(true)}
                  >
                    <Plus size={16} /> 创建第一张卡片
                  </button>
                </div>
              )}
            </div>
          </section>

          <aside className="library-panel" aria-label="我的卡片列表">
            {backgroundOpen ? (
              <BackgroundPanel
                settings={stageSettings}
                onClose={() => setBackgroundOpen(false)}
                onSave={setStageSettings}
              />
            ) : (
              <>
                <div className="library-heading">
                  <div>
                    <h2>我的卡片 <span>{cards.length.toString().padStart(2, "0")}</span></h2>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setComposerOpen(true);
                    }}
                    aria-label="创建卡片"
                    title="创建卡片"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                {orderedCards.length ? (
                  <div className="library-list">
                    {orderedCards.map((card, index) => (
                      <button
                        className={`library-item ${selectedId === card.id ? "is-selected" : ""}`}
                        type="button"
                        key={card.id}
                        onClick={() => selectCard(card)}
                        aria-current={selectedId === card.id ? "true" : undefined}
                      >
                        <span className={`library-index library-index-${card.category} ${card.image ? "has-image" : ""}`}>
                          {card.image ? <img src={card.image} alt="" /> : String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="library-item-copy">
                          <strong>{card.name}</strong>
                          <small>{card.category} <span>·</span> {card.id.startsWith("starter-") || card.id.startsWith("sample-") ? "示例卡" : formatDate(card.updatedAt)}</small>
                        </span>
                        <ChevronRight className="library-arrow" size={15} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="library-empty">
                    <Layers3 size={19} strokeWidth={1.5} />
                    <p>仓库还空着</p>
                  </div>
                )}
              </>
            )}

          </aside>
        </section>
        <div className="stage-footer">
          <form className="stage-search" onSubmit={searchCards} role="search">
            <Search size={17} strokeWidth={1.8} />
            <input
              aria-label="搜索卡片名称"
              value={searchValue}
              onChange={(event) => {
                setSearchValue(event.target.value);
                setSearchMessage("");
              }}
              placeholder="搜索你创建的卡片"
              autoComplete="off"
            />
            <kbd><Command size={11} /> ↵</kbd>
            <button className="search-submit" type="submit" aria-label="搜索卡片" title="搜索卡片">
              <ArrowRight size={16} />
            </button>
          </form>
          <div className="search-feedback" aria-live="polite">
            {searchMessage}
          </div>
        </div>
      </main>

      {composerOpen && (
        <CardComposer
          key={editingCard?.id ?? "new"}
          card={editingCard}
          cards={cards}
          onClose={() => {
            setComposerOpen(false);
            setEditingId(null);
          }}
          onSave={saveCard}
        />
      )}
      {deleteOpen && selectedCard && (
        <DeleteDialog
          name={selectedCard.name}
          onCancel={() => setDeleteOpen(false)}
          onDelete={deleteSelectedCard}
        />
      )}
      <Toast message={toast} />
      <button
        className="help-button"
        type="button"
        title="关于卡片仓库"
        aria-label="关于卡片仓库"
        onClick={() => setToast("卡片和空间内容只保存在当前浏览器。")}
      >
        <CircleHelp size={16} />
      </button>
    </div>
  );
}

function BackgroundPanel({
  settings,
  onClose,
  onSave,
}: {
  settings: StageSettings;
  onClose: () => void;
  onSave: (settings: StageSettings) => void;
}) {
  const [opacity, setOpacity] = useState(settings.backgroundOpacity);
  const [backgroundImage, setBackgroundImage] = useState(settings.backgroundImage);
  const [error, setError] = useState("");

  async function chooseBackground(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("图片不能超过 20 MB");
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const optimized = canvas.toDataURL("image/webp", 0.78);
      if (optimized.length > 1_500_000) {
        setError("图片过大，请选择更小的图片");
        return;
      }
      setBackgroundImage(optimized);
      onSave({ backgroundImage: optimized, backgroundOpacity: opacity });
      setError("");
    } catch {
      setError("这张图片暂时无法读取");
    }
  }

  function saveAndClose() {
    onSave({ backgroundImage, backgroundOpacity: opacity });
    onClose();
  }

  return (
    <section className="background-settings" aria-labelledby="background-title">
      <div className="background-settings-heading">
        <div className="background-dialog-title">
          <Image size={17} />
          <h2 id="background-title">展示背景</h2>
        </div>
        <button className="icon-button quiet" type="button" onClick={saveAndClose} aria-label="返回卡片仓库" title="返回卡片仓库">
          <X size={17} />
        </button>
      </div>
      <div className="background-preview">
        {backgroundImage && (
          <img className="background-preview-underlay" src={DEFAULT_STAGE_BACKGROUND} alt="" />
        )}
        <img
          className="background-preview-image"
          src={backgroundImage ?? DEFAULT_STAGE_BACKGROUND}
          alt=""
          style={{ opacity }}
        />
      </div>
      <div className="background-actions">
        <label className="button button-outline background-upload">
          <Image size={15} /> 更换图片
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              void chooseBackground(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {backgroundImage && (
          <button
            className="button button-quiet"
            type="button"
            onClick={() => {
              setBackgroundImage(undefined);
              onSave({ backgroundImage: undefined, backgroundOpacity: opacity });
            }}
          >
            <RotateCcw size={14} /> 恢复默认
          </button>
        )}
      </div>
      {error && <p className="field-error">{error}</p>}
      <label className="field-label setting-label" htmlFor="background-opacity">
        背景透明度 <output>{Math.round(opacity * 100)}%</output>
      </label>
      <input
        id="background-opacity"
        className="thickness-slider"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={opacity}
        onChange={(event) => {
          const value = Number(event.target.value);
          setOpacity(value);
          onSave({ backgroundImage, backgroundOpacity: value });
        }}
      />
      <div className="range-scale" aria-hidden="true"><span>透明</span><span>不透明</span></div>
      <div className="background-panel-footer">
        <button className="button button-primary" type="button" onClick={saveAndClose}>完成</button>
      </div>
    </section>
  );
}

type ComposerProps = {
  card: VaultCard | null;
  cards: VaultCard[];
  onClose: () => void;
  onSave: (draft: CardDraft, id?: string) => string | null;
};

function CardComposer({ card, cards, onClose, onSave }: ComposerProps) {
  const [name, setName] = useState(card?.name ?? "");
  const [category, setCategory] = useState<CardCategory>(card?.category ?? "灵感");
  const [summary, setSummary] = useState(card?.summary ?? "");
  const [image, setImage] = useState<string | undefined>(card?.image);
  const [imageAssetId, setImageAssetId] = useState(card?.imageAssetId);
  const [aspectRatio, setAspectRatio] = useState<CardAspectRatio>(card?.aspectRatio ?? "image");
  const [imageAspectRatio, setImageAspectRatio] = useState(card?.imageAspectRatio);
  const [thickness, setThickness] = useState(card?.thickness ?? 4);
  const [frontTextMode, setFrontTextMode] = useState<CardFrontTextMode>(
    card?.frontTextMode ?? (card?.showFaceText === false ? "none" : "default"),
  );
  const [frontTitle, setFrontTitle] = useState(card?.frontTitle ?? "");
  const [frontText, setFrontText] = useState(card?.frontText ?? "");
  const [backTextMode, setBackTextMode] = useState<CardBackTextMode>(card?.backTextMode ?? "default");
  const [backTheme, setBackTheme] = useState<CardBackTheme>(card?.backTheme ?? "classic");
  const [backImage, setBackImage] = useState<string | undefined>(card?.backImage);
  const [backImageAssetId, setBackImageAssetId] = useState(card?.backImageAssetId);
  const [backTitle, setBackTitle] = useState(card?.backTitle ?? "");
  const [backText, setBackText] = useState(card?.backText ?? "");
  const [imageError, setImageError] = useState("");
  const [backImageError, setBackImageError] = useState("");
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("先给这张卡片取个名字");
      nameRef.current?.focus();
      return;
    }
    const duplicate = cards.some(
      (item) => item.id !== card?.id && item.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
    );
    if (duplicate) {
      setError("这个名字已经在仓库里了");
      return;
    }
    onSave(
      {
        name,
        category,
        summary,
        image,
        imageAssetId,
        aspectRatio,
        imageAspectRatio,
        thickness,
        frontTextMode,
        frontTitle,
        frontText,
        showFaceText: frontTextMode !== "none",
        backTextMode,
        backTheme,
        backImage,
        backImageAssetId,
        backTitle,
        backText,
      },
      card?.id,
    );
  }

  async function selectImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageError("请选择图片文件");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setImageError("图片不能超过 50 MB");
      return;
    }

    try {
      const stored = await saveImageAsset(file);
      setImageAspectRatio(stored.width / stored.height);
      setImage(stored.imageUrl);
      setImageAssetId(stored.assetId);
      setImageError("");
    } catch {
      setImageError("原图无法写入本机图片仓库，请检查浏览器存储空间");
    }
  }

  async function selectBackImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setBackImageError("请选择图片文件");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setBackImageError("图片不能超过 50 MB");
      return;
    }

    try {
      const stored = await saveImageAsset(file);
      setBackImage(stored.imageUrl);
      setBackImageAssetId(stored.assetId);
      setBackImageError("");
    } catch {
      setBackImageError("原图无法写入本机图片仓库，请检查浏览器存储空间");
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="composer-dialog" role="dialog" aria-modal="true" aria-labelledby="composer-title">
        <div className="dialog-head">
          <div>
            <p className="eyebrow">{card ? "RESHAPE YOUR CARD" : "MAKE IT YOURS"}</p>
            <h2 id="composer-title">{card ? "编辑卡片" : "创建一张新卡片"}</h2>
          </div>
          <button className="icon-button quiet" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="card-name">卡片名称 <span>必填</span></label>
          <input
            ref={nameRef}
            id="card-name"
            className={`text-field ${error ? "has-error" : ""}`}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
            maxLength={28}
            placeholder="给它一个只有你知道的名字"
          />
          {error && <p className="field-error">{error}</p>}

          <span className="field-label">放进哪一类</span>
          <div className="category-options" role="group" aria-label="卡片类别">
            {categories.map((item) => (
              <button
                className={`category-option ${category === item ? "is-active" : ""}`}
                key={item}
                type="button"
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                <span className={`category-dot category-dot-${item}`} />
                {item}
              </button>
            ))}
          </div>

          <label className="field-label" htmlFor="card-summary">
            一句话介绍 <span>选填</span>
          </label>
          <textarea
            id="card-summary"
            className="text-field summary-field"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            maxLength={82}
            placeholder="这张卡片要替你收好什么？"
            rows={2}
          />
          <span className="field-label image-label">卡面图片 <span>选填</span></span>
          <div className={`image-picker ${image ? "has-image" : ""}`}>
            {image ? (
              <>
                <img
                  src={image}
                  alt="卡面预览"
                  onLoad={(event) => {
                    const { naturalWidth, naturalHeight } = event.currentTarget;
                    setImageAspectRatio((current) => current ?? naturalWidth / naturalHeight);
                  }}
                />
                <div className="image-picker-actions">
                  <label className="button button-quiet image-change">
                    更换图片
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => void selectImage(event.target.files?.[0])}
                    />
                  </label>
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={() => {
                      setImage(undefined);
                      setImageAssetId(undefined);
                      if (aspectRatio === "image") setImageAspectRatio(undefined);
                    }}
                  >
                    移除
                  </button>
                </div>
              </>
            ) : (
              <label className="image-drop">
                <Plus size={16} />
                <span>添加一张卡面图片</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => void selectImage(event.target.files?.[0])}
                />
              </label>
            )}
          </div>
          {imageError && <p className="field-error">{imageError}</p>}

          <div className="field-label setting-label">
            卡片比例
            <span>{aspectRatio === "image" ? "自动匹配图片" : "固定比例"}</span>
          </div>
          <select
            className="text-field setting-select"
            aria-label="卡片比例"
            value={aspectRatio}
            onChange={(event) => setAspectRatio(event.target.value as CardAspectRatio)}
          >
            <option value="image">跟随图片比例</option>
            {cardAspectRatios.map((ratio) => (
              <option key={ratio} value={ratio}>{ratio.replace(":", " : ")}</option>
            ))}
          </select>

          <label className="field-label setting-label" htmlFor="card-thickness">
            卡片厚度 <output>{thickness} mm</output>
          </label>
          <input
            id="card-thickness"
            className="thickness-slider"
            type="range"
            min={1}
            max={12}
            step={0.5}
            value={thickness}
            onChange={(event) => setThickness(Number(event.target.value))}
          />
          <div className="range-scale" aria-hidden="true"><span>薄</span><span>厚</span></div>

          <section className="front-design-section" aria-labelledby="front-design-title">
            <div className="back-design-heading">
              <Pencil size={15} />
              <strong id="front-design-title">卡面文字</strong>
              <span>未设置时使用默认模板</span>
            </div>
            <div className="front-text-modes" role="group" aria-label="卡面文字模式">
              {frontTextModes.map((mode) => (
                <button
                  className={frontTextMode === mode.value ? "is-active" : ""}
                  type="button"
                  key={mode.value}
                  aria-pressed={frontTextMode === mode.value}
                  onClick={() => {
                    if (mode.value === "custom" && frontTextMode !== "custom") {
                      if (!frontTitle.trim()) setFrontTitle(name);
                      if (!frontText.trim()) setFrontText(summary);
                    }
                    setFrontTextMode(mode.value);
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {frontTextMode === "custom" && (
              <div className="front-custom-fields">
                <input
                  className="text-field"
                  value={frontTitle}
                  onChange={(event) => setFrontTitle(event.target.value)}
                  maxLength={48}
                  aria-label="自定义卡面标题"
                  placeholder="卡面标题，可留空"
                />
                <textarea
                  className="text-field summary-field"
                  value={frontText}
                  onChange={(event) => setFrontText(event.target.value)}
                  maxLength={120}
                  aria-label="自定义卡面副文案"
                  placeholder="卡面副文案，可留空"
                  rows={2}
                />
              </div>
            )}
          </section>
          <section className="back-design-section" aria-labelledby="back-design-title">
            <div className="back-design-heading">
              <Palette size={15} />
              <strong id="back-design-title">卡背设计</strong>
              <span>未设置时使用默认卡背</span>
            </div>
            <div className="back-design-layout">
              <div className="back-design-controls">
                <span className="back-control-label">主题皮肤</span>
                <div className="back-theme-options" role="group" aria-label="卡背主题">
                  {backThemes.map((theme) => (
                    <button
                      className={`back-theme-option theme-${theme.value} ${backTheme === theme.value ? "is-active" : ""}`}
                      type="button"
                      key={theme.value}
                      title={theme.label}
                      aria-label={theme.label}
                      aria-pressed={backTheme === theme.value}
                      onClick={() => setBackTheme(theme.value)}
                    >
                      <span className="back-theme-preview" aria-hidden="true">
                        <i />
                        <i />
                      </span>
                      <small>{theme.label}</small>
                    </button>
                  ))}
                </div>

                <span className="back-control-label">文字内容</span>
                <div className="back-text-modes" role="group" aria-label="卡背文字模式">
                  {backTextModes.map((mode) => (
                    <button
                      className={backTextMode === mode.value ? "is-active" : ""}
                      type="button"
                      key={mode.value}
                      aria-pressed={backTextMode === mode.value}
                      onClick={() => {
                        if (mode.value === "custom" && backTextMode !== "custom") {
                          if (!backTitle.trim()) setBackTitle(name);
                          if (!backText.trim()) setBackText(summary);
                        }
                        setBackTextMode(mode.value);
                      }}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {backTextMode === "custom" && (
                  <div className="back-custom-fields">
                    <input
                      className="text-field"
                      value={backTitle}
                      onChange={(event) => setBackTitle(event.target.value)}
                      maxLength={48}
                      aria-label="自定义卡背标题"
                      placeholder="卡背标题，可留空"
                    />
                    <textarea
                      className="text-field summary-field"
                      value={backText}
                      onChange={(event) => setBackText(event.target.value)}
                      maxLength={420}
                      aria-label="自定义卡背文字"
                      placeholder="写一段卡背文字，可留空"
                      rows={3}
                    />
                  </div>
                )}

                <span className="back-control-label">卡背图片</span>
                <div className={`image-picker back-image-picker ${backImage ? "has-image" : ""}`}>
                  {backImage ? (
                    <>
                      <img src={backImage} alt="卡背图片预览" />
                      <div className="image-picker-actions">
                        <label className="button button-quiet image-change">
                          更换图片
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => {
                              void selectBackImage(event.target.files?.[0]);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                        <button
                          className="button button-quiet"
                          type="button"
                          onClick={() => {
                            setBackImage(undefined);
                            setBackImageAssetId(undefined);
                          }}
                        >
                          移除
                        </button>
                      </div>
                    </>
                  ) : (
                    <label className="image-drop">
                      <Plus size={15} />
                      <span>添加卡背图片</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          void selectBackImage(event.target.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
                {backImageError && <p className="field-error">{backImageError}</p>}
              </div>
              <aside className="back-preview-panel" aria-label="卡背实时预览">
                <div className="back-preview-heading">
                  <span>卡背预览</span>
                  <small>{backThemes.find((item) => item.value === backTheme)?.label}</small>
                </div>
                <div className={`back-preview-card back-theme-${backTheme} ${backImage ? "has-image" : ""}`}>
                  {backImage && <img src={backImage} alt="" />}
                  {backTextMode === "default" && (
                    <div className="back-preview-copy is-default">
                      <span>GLOW VAULT / REVERSE</span>
                      <strong>{name || "未命名卡片"}</strong>
                      <i />
                      <small>YOUR NOTES</small>
                      <p>{card?.notes || summary || "这张卡片的故事，等你来写。"}</p>
                      <footer>{category} · PRIVATE SPACE</footer>
                    </div>
                  )}
                  {backTextMode === "custom" && (
                    <div className="back-preview-copy is-custom">
                      {backTitle && <strong>{backTitle}</strong>}
                      {backText && <p>{backText}</p>}
                    </div>
                  )}
                </div>
                <button
                  className="back-preview-reset"
                  type="button"
                  onClick={() => {
                    setBackTheme("classic");
                    setBackTextMode("default");
                    setBackImage(undefined);
                    setBackImageAssetId(undefined);
                    setBackTitle("");
                    setBackText("");
                    setBackImageError("");
                  }}
                >
                  <RotateCcw size={13} /> 恢复默认
                </button>
              </aside>
            </div>
          </section>
          <div className="dialog-note"><Sparkles size={14} /> 保存后，粒子会聚拢成你的卡片。</div>
          <div className="dialog-actions">
            <button className="button button-quiet" type="button" onClick={onClose}>取消</button>
            <button className="button button-primary" type="submit">
              {card ? <Check size={16} /> : <Sparkles size={16} />}
              {card ? "保存修改" : "生成卡片"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

type SpaceProps = {
  card: VaultCard;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSaveNotes: (id: string, notes: string) => void;
};

function CardSpace({ card, onBack, onEdit, onDelete, onSaveNotes }: SpaceProps) {
  const [notes, setNotes] = useState(card.notes);
  const coverAspectRatio = resolveCardAspectRatio(card.aspectRatio, card.imageAspectRatio);

  useEffect(() => setNotes(card.notes), [card.id, card.notes]);

  return (
    <div className="space-shell">
      <header className="space-header">
        <button className="back-button" type="button" onClick={onBack}>
          <ArrowLeft size={16} /> <span>返回仓库</span>
        </button>
        <div className="brand space-brand">
          <span className="brand-symbol"><Sparkles size={17} strokeWidth={1.7} /></span>
          <span className="brand-copy"><strong>闪亮卡片</strong><small>GLOW VAULT</small></span>
        </div>
        <div className="space-actions">
          <button className="icon-button danger-quiet" type="button" onClick={onDelete} aria-label="删除卡片" title="删除卡片">
            <Trash2 size={16} />
          </button>
          <button className="button button-outline" type="button" onClick={onEdit}>
            <Pencil size={15} /> 编辑卡片
          </button>
        </div>
      </header>

      <main className="space-content">
        <div className="space-breadcrumb">
          <span>我的仓库</span><ChevronRight size={13} /><span>{card.name}</span><span className="breadcrumb-last">的空间</span>
        </div>
        <section className="space-title-block">
          {card.image ? (
            <img
              className="space-cover"
              src={card.image}
              alt=""
              style={{
                aspectRatio: coverAspectRatio,
                width: `${Math.min(116, Math.max(56, 76 * coverAspectRatio))}px`,
              }}
            />
          ) : (
            <div className="space-symbol"><Sparkles size={20} strokeWidth={1.4} /></div>
          )}
          <div>
            <p className="eyebrow">CARD SPACE <span>·</span> {card.category.toUpperCase()}</p>
            <h1>{card.name}</h1>
            <p>{card.summary || "这里属于你。把想法慢慢放进来。"}</p>
          </div>
        </section>
        <div className="space-rule"><span /><span>PRIVATE SPACE</span><span /></div>

        <section className="space-editor">
          <div className="editor-heading">
            <div>
              <p className="eyebrow">YOUR NOTES</p>
              <h2>卡片内容</h2>
            </div>
            <span className="save-indicator"><i /> 点保存后写入本机</span>
          </div>
          <textarea
            className="notes-editor"
            aria-label="编辑卡片空间内容"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="把想法、线索、清单或记录写在这里……"
          />
          <div className="editor-foot">
            <span>{notes.length} 个字符 <span className="foot-separator">·</span> 更新于 {formatDate(card.updatedAt)}</span>
            <button className="button button-primary" type="button" onClick={() => onSaveNotes(card.id, notes)}>
              <Check size={16} /> 保存内容
            </button>
          </div>
        </section>

        <div className="space-meta">
          <div><Clock3 size={14} /><span>建立于 {formatDate(card.createdAt)}</span></div>
          <div><Layers3 size={14} /><span>{card.category}卡片</span></div>
        </div>
      </main>
    </div>
  );
}

function DeleteDialog({ name, onCancel, onDelete }: { name: string; onCancel: () => void; onDelete: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
        <div className="confirm-icon"><Trash2 size={18} /></div>
        <p className="eyebrow">REMOVE FROM VAULT</p>
        <h2 id="delete-title">移除「{name}」？</h2>
        <p>这张卡片和空间里的内容都会从本机仓库删除。</p>
        <div className="dialog-actions">
          <button className="button button-quiet" type="button" onClick={onCancel}>保留卡片</button>
          <button className="button button-danger" type="button" onClick={onDelete}>删除卡片</button>
        </div>
      </section>
    </div>
  );
}

function Toast({ message }: { message: string }) {
  if (!message) return null;
  return <div className="toast-message" role="status"><Check size={15} />{message}</div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export default App;
