import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import * as THREE from "three";
import { resolveCardAspectRatio, type CardBackTheme, type VaultCard } from "./types";
import {
  calculateShowcaseLayout,
  showcaseCameraDistance,
  showcaseCameraFov,
  showcaseCardHeight,
} from "./showcaseGeometry";

const canvasOverscan = 3;
const maxZoomScale = 2.5;

type Props = {
  card: VaultCard;
  edition: number;
  isForming: boolean;
  onOpen: () => void;
};

export default function CardShowcase3D({ card, edition, isForming, onOpen }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interactionRef = useRef<HTMLDivElement>(null);
  const frontCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const backCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frontTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const backTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const actionRef = useRef<{
    flip: () => void;
    zoom: (amount: number) => void;
  } | null>(null);
  const cardRef = useRef(card);
  cardRef.current = card;
  const [webglAvailable, setWebglAvailable] = useState(true);
  const [fallbackFlipped, setFallbackFlipped] = useState(false);
  const aspectRatio = resolveCardAspectRatio(card.aspectRatio, card.imageAspectRatio);
  const frontTextMode = card.frontTextMode ?? (card.showFaceText ? "default" : "none");
  const frontHasText =
    frontTextMode === "default" ||
    Boolean(card.frontTitle.trim() || card.frontText.trim());

  useEffect(() => {
    const canvas = canvasRef.current;
    const interaction = interactionRef.current;
    if (!canvas || !interaction) return;
    const renderCanvas = canvas;
    const interactionLayer = interaction;
    const cardHeight = showcaseCardHeight;
    const cardWidth = cardHeight * aspectRatio;
    const depth = cardRef.current.thickness / 40;
    const bevelThickness = Math.min(0.035, depth * 0.18);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: renderCanvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      setWebglAvailable(false);
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointerLayer =
      interactionLayer.closest<HTMLElement>(".particle-stage") ?? interactionLayer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(showcaseCameraFov, 1, 0.1, 100);
    camera.position.set(0, 0, showcaseCameraDistance);
    camera.zoom = 1 / canvasOverscan;
    camera.updateProjectionMatrix();
    scene.add(new THREE.HemisphereLight(0xf7f1df, 0x242821, 1.2));

    const keyLight = new THREE.DirectionalLight(0xfff4df, 3.2);
    keyLight.position.set(-3.5, 5, 5);
    scene.add(keyLight);
    const edgeLight = new THREE.DirectionalLight(0xb9d4c4, 2.25);
    edgeLight.position.set(4, 1, 3);
    scene.add(edgeLight);
    const rearLight = new THREE.DirectionalLight(0xf18060, 1.15);
    rearLight.position.set(-2, 1, -4);
    scene.add(rearLight);

    const environmentCanvas = createEnvironmentCanvas();
    const environment = new THREE.CanvasTexture(environmentCanvas);
    environment.mapping = THREE.EquirectangularReflectionMapping;
    environment.colorSpace = THREE.SRGBColorSpace;
    scene.environment = environment;
    scene.environmentIntensity = 0.8;

    const frontCanvas = createFaceCanvas(aspectRatio, renderer.capabilities.maxTextureSize);
    const backCanvas = createFaceCanvas(aspectRatio, renderer.capabilities.maxTextureSize);
    frontCanvasRef.current = frontCanvas;
    backCanvasRef.current = backCanvas;
    paintFront(frontCanvas, cardRef.current, edition);
    paintBack(backCanvas, cardRef.current);

    const frontTexture = new THREE.CanvasTexture(frontCanvas);
    const backTexture = new THREE.CanvasTexture(backCanvas);
    frontTexture.colorSpace = THREE.SRGBColorSpace;
    backTexture.colorSpace = THREE.SRGBColorSpace;
    configurePhotoTexture(frontTexture, renderer);
    configurePhotoTexture(backTexture, renderer);
    frontTextureRef.current = frontTexture;
    backTextureRef.current = backTexture;

    const cardGroup = new THREE.Group();
    scene.add(cardGroup);

    const outerShape = roundedShape(cardWidth, cardHeight, 0.16);
    const bodyGeometry = new THREE.ExtrudeGeometry(outerShape, {
      depth,
      bevelEnabled: true,
      bevelSegments: 5,
      bevelThickness,
      bevelSize: Math.min(0.028, depth * 0.18),
      curveSegments: 16,
      steps: 1,
    });
    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xe8dfcb,
      metalness: 0.82,
      roughness: 0.23,
      clearcoat: 0.92,
      clearcoatRoughness: 0.13,
    });
    const sideMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x9ba197,
      metalness: 0.88,
      roughness: 0.31,
      clearcoat: 0.7,
    });
    const body = new THREE.Mesh(bodyGeometry, [bodyMaterial, sideMaterial]);
    body.position.z = -depth / 2;
    cardGroup.add(body);

    const faceWidth = cardWidth - 0.075;
    const faceHeight = cardHeight - 0.075;
    const faceShape = roundedShape(faceWidth, faceHeight, 0.12);
    const faceGeometry = new THREE.ShapeGeometry(faceShape, 16);
    setFaceUvs(faceGeometry, faceWidth, faceHeight);
    const faceMaterial = new THREE.MeshBasicMaterial({
      map: frontTexture,
      toneMapped: false,
    });
    const backMaterial = new THREE.MeshBasicMaterial({
      map: backTexture,
      toneMapped: false,
    });
    const front = new THREE.Mesh(faceGeometry, faceMaterial);
    front.position.z = depth / 2 + bevelThickness + 0.006;
    front.renderOrder = 2;
    const backGeometry = faceGeometry.clone();
    const back = new THREE.Mesh(backGeometry, backMaterial);
    back.rotation.y = Math.PI;
    back.position.z = -depth / 2 - bevelThickness - 0.006;
    back.renderOrder = 2;
    cardGroup.add(front, back);

    const shadowTexture = new THREE.CanvasTexture(createShadowCanvas());
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(cardWidth * 1.5, cardHeight * 0.25),
      new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
      }),
    );
    shadow.position.set(0, -cardHeight * 0.56, -0.18);
    shadow.renderOrder = 0;
    scene.add(shadow);

    const hitObjects = [front, back, body];
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let rotationY = -0.09;
    let rotationX = 0.055;
    let velocityY = 0;
    let velocityX = 0;
    let flipAngle = 0;
    let flipTarget = 0;
    let zoomScale = 1;
    let fitScale = 1;
    let activePointer: number | null = null;
    let pointerOriginX = 0;
    let pointerOriginY = 0;
    let previousX = 0;
    let previousY = 0;
    let dragged = false;
    let lastFrame = 0;
    let animationFrame = 0;
    let disposed = false;

    function intersectsCard(clientX: number, clientY: number) {
      const rect = renderCanvas.getBoundingClientRect();
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(hitObjects, false).length > 0;
    }

    function renderFrame(time: number) {
      animationFrame = 0;
      if (disposed) return;

      const delta = Math.min(40, time - lastFrame || 16) / 16;
      lastFrame = time;
      if (!reducedMotion) {
        rotationY += velocityY * delta;
        rotationX += velocityX * delta;
        velocityY *= Math.pow(0.925, delta);
        velocityX *= Math.pow(0.925, delta);
        flipAngle += (flipTarget - flipAngle) * Math.min(1, 0.16 * delta);
        const seconds = time * 0.001;
        cardGroup.rotation.set(
          rotationX + Math.sin(seconds * 0.7) * 0.018,
          rotationY + flipAngle + Math.sin(seconds * 0.48) * 0.022,
          Math.sin(seconds * 0.56) * 0.007,
        );
      } else {
        cardGroup.rotation.set(rotationX, rotationY + flipAngle, 0);
      }
      cardGroup.scale.setScalar(fitScale * zoomScale);
      renderer.render(scene, camera);

      const stillMoving =
        Math.abs(velocityX) > 0.0004 ||
        Math.abs(velocityY) > 0.0004 ||
        Math.abs(flipTarget - flipAngle) > 0.001;
      if (!reducedMotion || stillMoving) animationFrame = requestAnimationFrame(renderFrame);
    }

    function scheduleRender() {
      if (!animationFrame) animationFrame = requestAnimationFrame(renderFrame);
    }

    function flip() {
      flipTarget += Math.PI;
      if (reducedMotion) flipAngle = flipTarget;
      scheduleRender();
    }

    function zoom(amount: number) {
      zoomScale = THREE.MathUtils.clamp(zoomScale + amount, 0.76, maxZoomScale);
      interactionLayer.closest(".particle-stage")?.classList.toggle("is-card-zoomed", zoomScale > 1.02);
      scheduleRender();
    }

    function onPointerDown(event: PointerEvent) {
      if ((event.target as HTMLElement).closest(".showcase-controls")) return;
      if (event.button !== 0 && event.pointerType !== "touch") return;
      if (!intersectsCard(event.clientX, event.clientY)) return;
      event.preventDefault();
      activePointer = event.pointerId;
      dragged = false;
      pointerOriginX = previousX = event.clientX;
      pointerOriginY = previousY = event.clientY;
      velocityX = 0;
      velocityY = 0;
      pointerLayer.setPointerCapture(event.pointerId);
      pointerLayer.style.cursor = "grabbing";
    }

    function onPointerMove(event: PointerEvent) {
      if (activePointer === event.pointerId) {
        const dx = event.clientX - previousX;
        const dy = event.clientY - previousY;
        if (
          Math.hypot(event.clientX - pointerOriginX, event.clientY - pointerOriginY) > 3
        ) {
          dragged = true;
        }
        if (dragged) {
          const sensitivity = 0.009;
          rotationY += dx * sensitivity;
          rotationX += dy * sensitivity;
          velocityY = reducedMotion ? 0 : dx * sensitivity * 0.34;
          velocityX = reducedMotion ? 0 : dy * sensitivity * 0.34;
          pointerLayer.style.cursor = "grabbing";
          scheduleRender();
        }
        previousX = event.clientX;
        previousY = event.clientY;
        return;
      }

      if (event.pointerType === "mouse") {
        pointerLayer.style.cursor = intersectsCard(event.clientX, event.clientY) ? "grab" : "";
      }
    }

    function onPointerUp(event: PointerEvent) {
      if (activePointer !== event.pointerId) return;
      activePointer = null;
      pointerLayer.style.cursor = "";
      if (!dragged) {
        velocityX = 0;
        velocityY = 0;
      }
      if (pointerLayer.hasPointerCapture(event.pointerId)) {
        pointerLayer.releasePointerCapture(event.pointerId);
      }
      scheduleRender();
    }

    function onDoubleClick(event: MouseEvent) {
      if ((event.target as HTMLElement).closest(".showcase-controls")) return;
      if (!intersectsCard(event.clientX, event.clientY)) return;
      event.preventDefault();
      flip();
    }

    function onKeyDown(event: KeyboardEvent) {
      const turn = 0.14;
      if (event.key === "ArrowLeft") rotationY -= turn;
      else if (event.key === "ArrowRight") rotationY += turn;
      else if (event.key === "ArrowUp") rotationX -= turn;
      else if (event.key === "ArrowDown") rotationX += turn;
      else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        flip();
        return;
      } else {
        return;
      }
      event.preventDefault();
      velocityX = 0;
      velocityY = 0;
      scheduleRender();
    }

    function onWheel(event: WheelEvent) {
      if (!intersectsCard(event.clientX, event.clientY)) return;
      event.preventDefault();
      zoom(event.deltaY < 0 ? 0.09 : -0.09);
    }

    function onWindowBlur() {
      activePointer = null;
      pointerLayer.style.cursor = "";
    }

    function onVisibilityChange() {
      if (document.hidden) {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      } else {
        scheduleRender();
      }
    }

    function resize() {
      const rect = renderCanvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.zoom = 1 / canvasOverscan;
      camera.updateProjectionMatrix();
      const layout = calculateShowcaseLayout(width / canvasOverscan, height / canvasOverscan, aspectRatio);
      fitScale = layout.fitScale;
      cardGroup.position.y = layout.positionY;
      scheduleRender();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(renderCanvas);
    pointerLayer.addEventListener("pointermove", onPointerMove);
    pointerLayer.addEventListener("pointerup", onPointerUp);
    pointerLayer.addEventListener("pointercancel", onPointerUp);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("dblclick", onDoubleClick, true);
    interactionLayer.addEventListener("keydown", onKeyDown);
    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);

    actionRef.current = {
      flip,
      zoom,
    };
    resize();
    scheduleRender();

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      pointerLayer.removeEventListener("pointermove", onPointerMove);
      pointerLayer.removeEventListener("pointerup", onPointerUp);
      pointerLayer.removeEventListener("pointercancel", onPointerUp);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("dblclick", onDoubleClick, true);
      interactionLayer.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (animationFrame) cancelAnimationFrame(animationFrame);
      actionRef.current = null;
      interactionLayer.closest(".particle-stage")?.classList.remove("is-card-zoomed");
      frontCanvasRef.current = null;
      backCanvasRef.current = null;
      frontTextureRef.current = null;
      backTextureRef.current = null;
      bodyGeometry.dispose();
      faceGeometry.dispose();
      backGeometry.dispose();
      bodyMaterial.dispose();
      sideMaterial.dispose();
      faceMaterial.dispose();
      backMaterial.dispose();
      shadow.geometry.dispose();
      shadow.material.dispose();
      frontTexture.dispose();
      backTexture.dispose();
      shadowTexture.dispose();
      environment.dispose();
      renderer.dispose();
    };
  }, [aspectRatio]);

  useEffect(() => {
    const frontCanvas = frontCanvasRef.current;
    const backCanvas = backCanvasRef.current;
    const frontTexture = frontTextureRef.current;
    const backTexture = backTextureRef.current;
    if (!frontCanvas || !backCanvas || !frontTexture || !backTexture) return;

    paintFront(frontCanvas, card, edition);
    paintBack(backCanvas, card);
    frontTexture.needsUpdate = true;
    backTexture.needsUpdate = true;

    let active = true;
    const frontImage = card.image ? new Image() : null;
    if (frontImage) {
      frontImage.onload = () => {
        if (!active) return;
        paintFront(frontCanvas, card, edition, frontImage);
        frontTexture.needsUpdate = true;
      };
      frontImage.onerror = () => undefined;
      frontImage.src = card.image!;
      if (frontImage.complete && frontImage.naturalWidth > 0) {
        paintFront(frontCanvas, card, edition, frontImage);
        frontTexture.needsUpdate = true;
      }
    }

    const backImage = card.backImage ? new Image() : null;
    if (backImage) {
      backImage.onload = () => {
        if (!active) return;
        paintBack(backCanvas, card, backImage);
        backTexture.needsUpdate = true;
      };
      backImage.onerror = () => undefined;
      backImage.src = card.backImage!;
      if (backImage.complete && backImage.naturalWidth > 0) {
        paintBack(backCanvas, card, backImage);
        backTexture.needsUpdate = true;
      }
    }

    return () => {
      active = false;
      if (frontImage) frontImage.onload = null;
      if (backImage) backImage.onload = null;
    };
  }, [card, edition]);

  function fallbackZoom(amount: number) {
    actionRef.current?.zoom(amount);
  }

  return (
    <div className={`showcase-3d ${isForming ? "is-forming" : ""} ${webglAvailable ? "" : "is-fallback"}`}>
      <div className="showcase-canvas-wrap">
        <canvas
          className="showcase-canvas"
          style={{ width: `${canvasOverscan * 100}%`, height: `${canvasOverscan * 100}%` }}
          ref={canvasRef}
          aria-label={`${card.name}，可拖动旋转的 3D 卡片`}
        />
        {!webglAvailable && (
          <div
            className={`showcase-fallback-card ${fallbackFlipped ? "is-flipped" : ""} ${card.image && frontHasText ? "has-cover" : ""}`}
            style={{ aspectRatio, width: `min(82%, ${40 * aspectRatio}svh)` }}
            onDoubleClick={() => setFallbackFlipped((value) => !value)}
          >
            {card.image && <img src={card.image} alt="" />}
            <div className="showcase-fallback-face fallback-front">
              {frontHasText && (
                <>
                  {frontTextMode === "default" && (
                    <span>GLOW / {String(edition).padStart(2, "0")}</span>
                  )}
                  <strong>{frontTextMode === "custom" ? card.frontTitle : card.name}</strong>
                  <small>
                    {frontTextMode === "custom"
                      ? card.frontText
                      : card.summary || "这张卡片的故事，等你来写。"}
                  </small>
                </>
              )}
            </div>
            <div className={`showcase-fallback-face fallback-back back-theme-${card.backTheme} ${card.backImage ? "has-back-image" : ""}`}>
              {card.backImage && <img className="fallback-back-image" src={card.backImage} alt="" />}
              {card.backTextMode === "default" && (
                <>
                  <span>GLOW VAULT / REVERSE</span>
                  <strong>{card.name}</strong>
                  <span>YOUR NOTES</span>
                  <small>{card.notes || card.summary || "这张卡片的故事，等你来写。"}</small>
                  <small className="fallback-back-footer">{card.category} · PRIVATE SPACE</small>
                </>
              )}
              {card.backTextMode === "custom" && (card.backTitle || card.backText) && (
                <div className="fallback-custom-copy">
                  {card.backTitle && <strong>{card.backTitle}</strong>}
                  {card.backText && <small>{card.backText}</small>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <div
        className="showcase-hit-area"
        ref={interactionRef}
        role="group"
        tabIndex={0}
        aria-label={`${card.name} 3D 卡片，可用方向键旋转，回车翻面`}
      />
      <div className="showcase-controls" aria-label="卡片操作">
        <button
          className="showcase-icon-button"
          type="button"
          title="翻转卡片"
          aria-label="翻转卡片"
          onClick={() => {
            if (webglAvailable) actionRef.current?.flip();
            else setFallbackFlipped((value) => !value);
          }}
        >
          <RotateCw size={16} />
        </button>
        <button
          className="showcase-icon-button"
          type="button"
          title="缩小卡片"
          aria-label="缩小卡片"
          onClick={() => {
            if (webglAvailable) fallbackZoom(-0.16);
          }}
        >
          <ZoomOut size={16} />
        </button>
        <button
          className="showcase-icon-button"
          type="button"
          title="放大卡片"
          aria-label="放大卡片"
          onClick={() => {
            if (webglAvailable) fallbackZoom(0.16);
          }}
        >
          <ZoomIn size={16} />
        </button>
        <span className="showcase-control-rule" />
        <button className="showcase-open-button" type="button" onClick={onOpen}>
          进入空间 <ArrowUpRight size={14} />
        </button>
      </div>
    </div>
  );
}

function createFaceCanvas(aspectRatio: number, deviceTextureLimit: number) {
  const canvas = document.createElement("canvas");
  const maxDimension = Math.max(1024, Math.min(4096, deviceTextureLimit));
  const pixelBudget = Math.min(12_582_912, maxDimension * maxDimension);
  const scale = Math.min(
    1,
    maxDimension / Math.sqrt(pixelBudget * aspectRatio),
    maxDimension / Math.sqrt(pixelBudget / aspectRatio),
  );
  canvas.width = Math.max(1, Math.floor(Math.sqrt(pixelBudget * aspectRatio) * scale));
  canvas.height = Math.max(1, Math.floor(Math.sqrt(pixelBudget / aspectRatio) * scale));
  return canvas;
}

function configurePhotoTexture(texture: THREE.CanvasTexture, renderer: THREE.WebGLRenderer) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
}

function createEnvironmentCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  const base = context.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0, "#eee8d9");
  base.addColorStop(0.38, "#777b73");
  base.addColorStop(0.52, "#282c29");
  base.addColorStop(1, "#dad4c7");
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const strips = [
    { x: 64, width: 84, alpha: 0.8 },
    { x: 220, width: 35, alpha: 0.55 },
    { x: 410, width: 120, alpha: 0.84 },
    { x: 685, width: 48, alpha: 0.58 },
    { x: 866, width: 96, alpha: 0.72 },
  ];
  for (const strip of strips) {
    const light = context.createLinearGradient(strip.x, 0, strip.x + strip.width, 0);
    light.addColorStop(0, "rgba(255,250,235,0)");
    light.addColorStop(0.5, `rgba(255,250,235,${strip.alpha})`);
    light.addColorStop(1, "rgba(255,250,235,0)");
    context.fillStyle = light;
    context.fillRect(strip.x, 0, strip.width, canvas.height);
  }
  return canvas;
}

function createShadowCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const gradient = context.createRadialGradient(256, 80, 8, 256, 80, 250);
  gradient.addColorStop(0, "rgba(0,0,0,0.62)");
  gradient.addColorStop(0.45, "rgba(0,0,0,0.28)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 160);
  return canvas;
}

function roundedShape(width: number, height: number, radius: number) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function setFaceUvs(geometry: THREE.BufferGeometry, width: number, height: number) {
  const positions = geometry.getAttribute("position");
  const uvs = geometry.getAttribute("uv");
  for (let index = 0; index < positions.count; index += 1) {
    uvs.setXY(
      index,
      (positions.getX(index) + width / 2) / width,
      (positions.getY(index) + height / 2) / height,
    );
  }
  uvs.needsUpdate = true;
}

function paintFront(
  canvas: HTMLCanvasElement,
  card: VaultCard,
  edition: number,
  image?: HTMLImageElement,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.save();
  context.beginPath();
  const corner = Math.min(width * 0.08, height * 0.055, 72);
  context.roundRect(0, 0, width, height, corner);
  context.clip();

  if (image && image.naturalWidth > 0) {
    const ratio = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * ratio;
    const drawHeight = image.naturalHeight * ratio;
    context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  } else {
    const base = context.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, "#323a32");
    base.addColorStop(0.48, "#171c19");
    base.addColorStop(1, "#25221e");
    context.fillStyle = base;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(231,218,185,0.12)";
    context.lineWidth = 2;
    for (let x = -height; x < width; x += 54) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x + height, height);
      context.stroke();
    }
  }

  const frontTextMode = card.frontTextMode ?? (card.showFaceText ? "default" : "none");
  const frontHasText =
    frontTextMode === "default" ||
    Boolean(card.frontTitle.trim() || card.frontText.trim());
  if (frontHasText) {
    const topShade = context.createLinearGradient(0, 0, 0, height * 0.34);
    topShade.addColorStop(0, "rgba(8,10,9,0.62)");
    topShade.addColorStop(1, "rgba(8,10,9,0)");
    context.fillStyle = topShade;
    context.fillRect(0, 0, width, height * 0.34);

    const bottomShade = context.createLinearGradient(0, height * 0.56, 0, height);
    bottomShade.addColorStop(0, "rgba(6,8,7,0)");
    bottomShade.addColorStop(1, "rgba(6,8,7,0.92)");
    context.fillStyle = bottomShade;
    context.fillRect(0, height * 0.5, width, height * 0.5);
  }

  context.strokeStyle = "rgba(255,247,229,0.46)";
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(18, 18, width - 36, height - 36, Math.min(width * 0.065, height * 0.045, 58));
  context.stroke();

  if (frontHasText) {
    const margin = width * 0.061;
    const headerFont = Math.max(15, Math.min(24, height * 0.025));
    context.fillStyle = "rgba(249,244,231,0.82)";
    context.font = `500 ${headerFont}px 'Cascadia Code', Consolas, monospace`;
    if (frontTextMode === "default") {
      context.fillText(`GLOW  /  ${String(edition).padStart(2, "0")}`, margin, height * 0.058);
      context.font = `400 ${headerFont}px 'Microsoft YaHei', sans-serif`;
      context.textAlign = "right";
      context.fillText(card.category, width - margin, height * 0.058);
      context.textAlign = "left";
    }

    context.fillStyle = "#f4f0e7";
    context.shadowColor = "rgba(0,0,0,0.38)";
    context.shadowBlur = 18;
    const titleFont = Math.max(24, Math.min(62, height * 0.07, width * 0.075));
    context.font = `500 ${titleFont}px 'Microsoft YaHei', sans-serif`;
    const title = frontTextMode === "custom" ? card.frontTitle : card.name;
    const titleLines = title ? wrapText(context, title, width - margin * 2, 2) : [];
    const titleLineHeight = titleFont * 1.1;
    let titleY = height * 0.81 - (titleLines.length - 1) * titleLineHeight;
    titleLines.forEach((line) => {
      context.fillText(line, margin, titleY);
      titleY += titleLineHeight;
    });
    context.shadowBlur = 0;
    context.fillStyle = "rgba(246,242,229,0.82)";
    const summaryFont = Math.max(14, Math.min(26, height * 0.036, width * 0.04));
    context.font = `400 ${summaryFont}px 'Microsoft YaHei', sans-serif`;
    const summary = frontTextMode === "custom"
      ? card.frontText
      : card.summary || "这张卡片的故事，等你来写。";
    wrapText(context, summary, width - margin * 2, 2).forEach((line, index) => {
      context.fillText(line, margin + 2, height * 0.91 + index * summaryFont * 1.35);
    });
  }
  context.restore();
}

function paintBack(canvas: HTMLCanvasElement, card: VaultCard, image?: HTMLImageElement) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const theme = getBackTheme(card.backTheme);
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, theme.background[0]);
  background.addColorStop(0.5, theme.background[1]);
  background.addColorStop(1, theme.background[2]);
  context.fillStyle = background;
  context.beginPath();
  context.roundRect(0, 0, width, height, 72);
  context.fill();

  if (image && image.naturalWidth > 0) {
    context.save();
    context.beginPath();
    context.roundRect(0, 0, width, height, 72);
    context.clip();
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    context.restore();
  }

  const margin = width * 0.065;
  context.strokeStyle = theme.border;
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(18, 18, width - 36, height - 36, Math.min(width * 0.065, height * 0.045, 58));
  context.stroke();

  if (card.backTextMode === "default") {
    context.fillStyle = theme.label;
    context.font = `500 ${Math.max(15, Math.min(24, height * 0.025))}px 'Cascadia Code', Consolas, monospace`;
    context.fillText("GLOW VAULT  /  REVERSE", margin, height * 0.058);
    context.strokeStyle = theme.rule;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(margin, height * 0.09);
    context.lineTo(width - margin, height * 0.09);
    context.stroke();

    context.fillStyle = theme.text;
    const titleFont = Math.max(24, Math.min(54, height * 0.055, width * 0.07));
    context.font = `500 ${titleFont}px 'Microsoft YaHei', sans-serif`;
    wrapText(context, card.name, width - margin * 2, 2).forEach((line, index) => {
      context.fillText(line, margin, height * 0.43 + index * titleFont * 1.16);
    });
    context.fillStyle = theme.label;
    const notesLabelFont = Math.max(12, Math.min(22, height * 0.028));
    context.font = `400 ${notesLabelFont}px 'Cascadia Code', Consolas, monospace`;
    context.fillText("YOUR NOTES", margin, height * 0.58);
    context.fillStyle = theme.body;
    const notesFont = Math.max(14, Math.min(27, height * 0.04));
    context.font = `400 ${notesFont}px 'Microsoft YaHei', sans-serif`;
    const notesLines = Math.max(1, Math.floor((height * 0.29) / (notesFont * 1.55)));
    wrapText(context, card.notes || card.summary || "这里属于你。把想法慢慢放进来。", width - margin * 2, notesLines).forEach((line, index) => {
      context.fillText(line, margin, height * 0.63 + index * notesFont * 1.55);
    });
    context.fillStyle = theme.footer;
    context.font = `400 ${Math.max(12, Math.min(20, height * 0.025))}px 'Microsoft YaHei', sans-serif`;
    context.fillText(`${card.category}  ·  PRIVATE SPACE`, margin, height * 0.95);
  } else if (card.backTextMode === "custom") {
    context.fillStyle = theme.text;
    const titleFont = Math.max(24, Math.min(54, height * 0.055, width * 0.07));
    context.font = `500 ${titleFont}px 'Microsoft YaHei', sans-serif`;
    const titleLines = card.backTitle ? wrapText(context, card.backTitle, width - margin * 2, 2) : [];
    titleLines.forEach((line, index) => {
      context.fillText(line, margin, height * 0.42 + index * titleFont * 1.16);
    });

    if (card.backText) {
      context.fillStyle = theme.body;
      const textFont = Math.max(14, Math.min(27, height * 0.04));
      context.font = `400 ${textFont}px 'Microsoft YaHei', sans-serif`;
      const textY = titleLines.length ? height * 0.57 : height * 0.44;
      const maxLines = Math.max(1, Math.floor((height * (0.86 - textY / height)) / (textFont * 1.55)));
      wrapText(context, card.backText, width - margin * 2, maxLines).forEach((line, index) => {
        context.fillText(line, margin, textY + index * textFont * 1.55);
      });
    }
  }
}

function getBackTheme(theme: CardBackTheme) {
  const themes = {
    classic: {
      background: ["#242a25", "#151a17", "#29251f"],
      border: "rgba(224,214,190,0.46)",
      label: "rgba(235,228,209,0.7)",
      text: "#f1eee3",
      body: "rgba(241,238,227,0.82)",
      footer: "rgba(235,228,209,0.48)",
      rule: "rgba(231,218,185,0.22)",
    },
    midnight: {
      background: ["#233b43", "#14252c", "#1b3039"],
      border: "rgba(190,218,218,0.5)",
      label: "rgba(194,222,221,0.76)",
      text: "#ecf5f0",
      body: "rgba(231,243,238,0.84)",
      footer: "rgba(190,218,218,0.58)",
      rule: "rgba(190,218,218,0.24)",
    },
    porcelain: {
      background: ["#f1ecdf", "#ded6c5", "#f6f2e8"],
      border: "rgba(82,75,61,0.48)",
      label: "rgba(70,66,55,0.72)",
      text: "#292b27",
      body: "rgba(43,45,40,0.83)",
      footer: "rgba(70,66,55,0.58)",
      rule: "rgba(82,75,61,0.24)",
    },
    carmine: {
      background: ["#482b2e", "#25191c", "#3b2427"],
      border: "rgba(233,194,177,0.48)",
      label: "rgba(235,202,184,0.74)",
      text: "#f6eee7",
      body: "rgba(246,235,225,0.84)",
      footer: "rgba(233,194,177,0.56)",
      rule: "rgba(233,194,177,0.24)",
    },
  } satisfies Record<CardBackTheme, {
    background: [string, string, string];
    border: string;
    label: string;
    text: string;
    body: string;
    footer: string;
    rule: string;
  }>;
  return themes[theme];
}

function wrapText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  maxLines: number,
) {
  const characters = Array.from(value);
  const lines: string[] = [];
  let line = "";
  for (const character of characters) {
    if (line && context.measureText(line + character).width > maxWidth) {
      lines.push(line);
      line = character;
      if (lines.length === maxLines) break;
    } else {
      line += character;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (characters.length && lines.length === maxLines) {
    const last = lines[maxLines - 1] ?? "";
    lines[maxLines - 1] = last.length > 1 ? `${last.slice(0, -1)}…` : `${last}…`;
  }
  return lines;
}
