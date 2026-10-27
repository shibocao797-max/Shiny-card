import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import * as THREE from "three";
import { resolveCardAspectRatio, type VaultCard } from "./types";
import { calculateShowcaseLayout } from "./showcaseGeometry";

type Props = {
  card: VaultCard | null;
  transitionKey: number;
  hostRef: RefObject<HTMLDivElement | null>;
  onFormationStart?: () => void;
  onFormationComplete?: () => void;
};

type ParticleTargetDetail = {
  card: VaultCard | null;
  image: HTMLImageElement | null;
};

const maxParticleCount = 20_000;
const minParticleCount = 5_000;
const scatterDuration = 420;
const gatherDuration = 1220;
const formationDuration = scatterDuration + gatherDuration;

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3;
}

function easeInOutCubic(value: number) {
  return value < 0.5
    ? 4 * value ** 3
    : 1 - ((-2 * value + 2) ** 3) / 2;
}

function easeInCubic(value: number) {
  return value ** 3;
}

export default function ParticleField({
  card,
  transitionKey,
  hostRef,
  onFormationStart,
  onFormationComplete,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef(card);
  const onFormationStartRef = useRef(onFormationStart);
  const onFormationCompleteRef = useRef(onFormationComplete);
  cardRef.current = card;
  onFormationStartRef.current = onFormationStart;
  onFormationCompleteRef.current = onFormationComplete;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3000);
    camera.position.z = 1100;

    const positions = new Float32Array(maxParticleCount * 3);
    const formationStart = new Float32Array(maxParticleCount * 3);
    const targets = new Float32Array(maxParticleCount * 3);
    const scatterTargets = new Float32Array(maxParticleCount * 3);
    const sizes = new Float32Array(maxParticleCount);
    const colorValues = new Float32Array(maxParticleCount * 3);
    const random = new Float32Array(maxParticleCount * 3);
    let activeParticleCount = maxParticleCount;

    for (let i = 0; i < maxParticleCount; i += 1) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 900;
      positions[i3 + 1] = (Math.random() - 0.5) * 540;
      positions[i3 + 2] = (Math.random() - 0.5) * 180;
      random[i3] = Math.random();
      random[i3 + 1] = Math.random();
      random[i3 + 2] = Math.random();
      sizes[i] = 1.8 + Math.random() * 1.6;
      colorValues[i3] = 0.85;
      colorValues[i3 + 1] = 0.94;
      colorValues[i3 + 2] = 0.62;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colorValues, 3));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() } },
      vertexShader: `
        attribute float aSize;
        attribute vec3 aColor;
        uniform float uTime;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vec3 pos = position;
          pos.z += sin(uTime * 0.38 + position.x * 0.012 + position.y * 0.014) * 3.0;
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * uPixelRatio * (1250.0 / -mvPosition.z);
          vAlpha = 0.9 + 0.1 * sin(uTime * 0.65 + position.x * 0.02);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          float glow = smoothstep(0.5, 0.03, d);
          if (glow < 0.02) discard;
          gl_FragColor = vec4(vColor, glow * vAlpha * 0.9);
        }
      `,
    });

    geometry.setDrawRange(0, activeParticleCount);
    const particleSystem = new THREE.Points(geometry, material);
    particleSystem.frustumCulled = false;
    scene.add(particleSystem);
    const targetCanvas = document.createElement("canvas");
    const context = targetCanvas.getContext("2d", { willReadFrequently: true });
    let width = 1;
    let height = 1;
    let cardViewportX = 0;
    let cardViewportY = 0;
    let cardViewportWidth = 1;
    let cardViewportHeight = 1;
    let animationFrame = 0;
    let lastTime = 0;
    let transitionStartedAt = 0;
    let transitioning = true;
    let disposed = false;
    let active = !document.hidden;
    let mouseX = -10000;
    let mouseY = -10000;
    let activeImage: HTMLImageElement | null = null;
    let completionNotified = false;

    const updateFormationVisual = (progress: number) => {
      const normalized = THREE.MathUtils.clamp(progress, 0, 1);
      const cardReveal =
        normalized <= 0.84
          ? 0
          : easeOutCubic((normalized - 0.84) / 0.16);
      const particleFade =
        normalized <= 0.82
          ? 0.92
          : 0.92 - easeInCubic((normalized - 0.82) / 0.18) * 0.865;

      host.style.setProperty("--formation-progress", normalized.toFixed(3));
      host.style.setProperty("--card-reveal", cardReveal.toFixed(3));
      host.style.setProperty("--particle-alpha", particleFade.toFixed(3));
    };

    const beginTransition = () => {
      transitionStartedAt = performance.now();
      transitioning = !reducedMotion;
      completionNotified = false;
      onFormationStartRef.current?.();
      updateFormationVisual(reducedMotion ? 1 : 0);
      if (reducedMotion) {
        canvas.classList.add("is-idle");
      } else {
        canvas.classList.remove("is-idle");
      }
      formationStart.set(positions);
      for (let i = 0; i < activeParticleCount; i += 1) {
        const i3 = i * 3;
        const angle = random[i3] * Math.PI * 2;
        const distance = 78 + random[i3 + 1] * Math.min(width, height) * 0.42;
        scatterTargets[i3] = formationStart[i3] + Math.cos(angle) * distance;
        scatterTargets[i3 + 1] = formationStart[i3 + 1] + Math.sin(angle) * distance;
        scatterTargets[i3 + 2] =
          formationStart[i3 + 2] + (random[i3 + 2] - 0.5) * 140;
      }
      if (reducedMotion) {
        positions.set(targets);
        geometry.attributes.position.needsUpdate = true;
        onFormationCompleteRef.current?.();
      }
    };

    const buildTarget = (current: VaultCard | null, image: HTMLImageElement | null) => {
      if (!context) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      targetCanvas.width = Math.round(width * dpr);
      targetCanvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const compact = cardViewportWidth < 720;
      const aspectRatio = current
        ? resolveCardAspectRatio(current.aspectRatio, current.imageAspectRatio)
        : 0.75;
      const layout = calculateShowcaseLayout(
        cardViewportWidth,
        cardViewportHeight,
        aspectRatio,
      );
      const cardWidth = layout.pixelWidth;
      const cardHeight = layout.pixelHeight;
      const cardArea = cardWidth * cardHeight;
      const hardwareThreads = navigator.hardwareConcurrency || 6;
      const deviceLimit = compact
        ? 10_000
        : hardwareThreads <= 4
          ? 11_000
          : hardwareThreads <= 8
            ? 16_000
            : maxParticleCount;
      activeParticleCount = Math.max(
        minParticleCount,
        Math.min(deviceLimit, Math.floor(cardArea / 10.5)),
      );
      geometry.setDrawRange(0, activeParticleCount);
      const left = cardViewportX + (cardViewportWidth - cardWidth) / 2;
      const top =
        cardViewportY +
        (cardViewportHeight - cardHeight) / 2 -
        layout.pixelOffsetY;
      const radius = Math.min(cardWidth, cardHeight) * 0.055;

      context.save();
      context.beginPath();
      context.roundRect(left, top, cardWidth, cardHeight, radius);
      context.clip();
      const base = context.createLinearGradient(left, top, left + cardWidth, top + cardHeight);
      base.addColorStop(0, "#323a32");
      base.addColorStop(0.48, "#171c19");
      base.addColorStop(1, "#25221e");
      context.fillStyle = base;
      context.fillRect(left, top, cardWidth, cardHeight);

      if (image && image.complete && image.naturalWidth > 0) {
        const scale = Math.max(cardWidth / image.naturalWidth, cardHeight / image.naturalHeight);
        const drawWidth = image.naturalWidth * scale;
        const drawHeight = image.naturalHeight * scale;
        context.drawImage(
          image,
          left + (cardWidth - drawWidth) / 2,
          top + (cardHeight - drawHeight) / 2,
          drawWidth,
          drawHeight,
        );
      } else {
        context.strokeStyle = "rgba(231,218,185,0.12)";
        context.lineWidth = 1;
        for (let x = left - cardHeight; x < left + cardWidth; x += 18) {
          context.beginPath();
          context.moveTo(x, top);
          context.lineTo(x + cardHeight, top + cardHeight);
          context.stroke();
        }
      }
      context.restore();

      const frontTextMode = current
        ? current.frontTextMode ?? (current.showFaceText ? "default" : "none")
        : "none";
      const frontHasText =
        frontTextMode === "default" ||
        Boolean(current?.frontTitle.trim() || current?.frontText.trim());
      if (frontHasText) {
        context.save();
        context.beginPath();
        context.roundRect(left, top, cardWidth, cardHeight, radius);
        context.clip();
        const margin = cardWidth * 0.061;
        const topShade = context.createLinearGradient(0, top, 0, top + cardHeight * 0.34);
        topShade.addColorStop(0, "rgba(8,10,9,0.62)");
        topShade.addColorStop(1, "rgba(8,10,9,0)");
        context.fillStyle = topShade;
        context.fillRect(left, top, cardWidth, cardHeight * 0.34);

        const bottomShade = context.createLinearGradient(
          0,
          top + cardHeight * 0.56,
          0,
          top + cardHeight,
        );
        bottomShade.addColorStop(0, "rgba(6,8,7,0)");
        bottomShade.addColorStop(1, "rgba(6,8,7,0.92)");
        context.fillStyle = bottomShade;
        context.fillRect(left, top + cardHeight * 0.5, cardWidth, cardHeight * 0.5);

        const labelFont = Math.max(7, Math.min(10, cardWidth * 0.038));
        context.fillStyle = "rgba(249,244,231,0.82)";
        context.font = `500 ${labelFont}px Consolas, monospace`;
        context.textBaseline = "alphabetic";
        if (frontTextMode === "default") {
          context.fillText(current?.category ?? "", left + margin, top + cardHeight * 0.058, cardWidth - margin * 2);
        }

        const titleFont = Math.max(10, Math.min(21, cardHeight * 0.07, cardWidth * 0.075));
        context.fillStyle = "#f4f0e7";
        context.font = `500 ${titleFont}px "Microsoft YaHei", sans-serif`;
        context.shadowColor = "rgba(0,0,0,0.38)";
        context.shadowBlur = 6;
        const title = frontTextMode === "custom" ? current?.frontTitle ?? "" : current?.name ?? "";
        const titleLines = title
          ? wrapParticleText(context, title, cardWidth - margin * 2, 2)
          : [];
        titleLines.forEach((line, index) => {
          context.fillText(
            line,
            left + margin,
            top + cardHeight * 0.81 - (titleLines.length - 1 - index) * titleFont * 1.08,
            cardWidth - margin * 2,
          );
        });
        context.shadowBlur = 0;
        context.fillStyle = "rgba(246,242,229,0.82)";
        const summaryFont = Math.max(7, Math.min(10, cardWidth * 0.04));
        context.font = `400 ${summaryFont}px "Microsoft YaHei", sans-serif`;
        const summary = frontTextMode === "custom"
          ? current?.frontText ?? ""
          : current?.summary || "这张卡片的故事，等你来写。";
        wrapParticleText(context, summary, cardWidth - margin * 2, 2).forEach((line, index) => {
          context.fillText(line, left + margin, top + cardHeight * 0.91 + index * summaryFont * 1.3, cardWidth - margin * 2);
        });
        context.restore();
      }

      context.beginPath();
      context.roundRect(left, top, cardWidth, cardHeight, radius);
      context.strokeStyle = "rgba(255,245,230,0.68)";
      context.lineWidth = 1.2;
      context.stroke();

      const pixels = context.getImageData(0, 0, targetCanvas.width, targetCanvas.height).data;
      const candidates: number[] = [];
      const targetArea = cardArea * dpr * dpr;
      const stride = Math.max(
        1,
        Math.floor(Math.sqrt(targetArea / (activeParticleCount * 2))),
      );
      for (let y = 0; y < targetCanvas.height; y += stride) {
        for (let x = 0; x < targetCanvas.width; x += stride) {
          if (pixels[(y * targetCanvas.width + x) * 4 + 3] > 34) {
            candidates.push(y * targetCanvas.width + x);
          }
        }
      }

      for (let i = candidates.length - 1; i > 0; i -= 1) {
        const swapIndex = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[swapIndex]] = [candidates[swapIndex], candidates[i]];
      }

      for (let i = 0; i < activeParticleCount; i += 1) {
        const i3 = i * 3;
        if (candidates.length) {
          const spread = Math.floor((i / activeParticleCount) * candidates.length);
          const pixelIndex = candidates[Math.min(candidates.length - 1, spread)];
          const x = (pixelIndex % targetCanvas.width) / dpr;
          const y = Math.floor(pixelIndex / targetCanvas.width) / dpr;
          const pixelOffset = pixelIndex * 4;
          targets[i3] = x - width / 2;
          targets[i3 + 1] = height / 2 - y;
          targets[i3 + 2] = (random[i3 + 2] - 0.5) * 34;
          colorValues[i3] = Math.min(1, 0.18 + Math.sqrt(pixels[pixelOffset] / 255) * 0.88);
          colorValues[i3 + 1] = Math.min(1, 0.18 + Math.sqrt(pixels[pixelOffset + 1] / 255) * 0.88);
          colorValues[i3 + 2] = Math.min(1, 0.18 + Math.sqrt(pixels[pixelOffset + 2] / 255) * 0.88);
        } else {
          targets[i3] = (random[i3] - 0.5) * width * 0.72;
          targets[i3 + 1] = (random[i3 + 1] - 0.5) * height * 0.7;
          targets[i3 + 2] = (random[i3 + 2] - 0.5) * 110;
          colorValues[i3] = 0.85;
          colorValues[i3 + 1] = 0.94;
          colorValues[i3 + 2] = 0.62;
        }
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aColor.needsUpdate = true;
    };

    const syncViewport = () => {
      const rect = host.getBoundingClientRect();
      const showcaseFrame = host.querySelector<HTMLElement>(".showcase-3d");
      const showcaseRect = showcaseFrame?.getBoundingClientRect() ?? rect;
      const useShowcaseRect = !showcaseFrame?.classList.contains("is-fallback");
      const nextCardRect = useShowcaseRect ? showcaseRect : rect;
      const nextWidth = Math.max(1, rect.width);
      const nextHeight = Math.max(1, rect.height);
      const nextCardViewportX = nextCardRect.left - rect.left;
      const nextCardViewportY = nextCardRect.top - rect.top;
      const nextCardViewportWidth = Math.max(1, nextCardRect.width);
      const nextCardViewportHeight = Math.max(1, nextCardRect.height);
      const hasChanged =
        Math.abs(width - nextWidth) > 0.25 ||
        Math.abs(height - nextHeight) > 0.25 ||
        Math.abs(cardViewportX - nextCardViewportX) > 0.25 ||
        Math.abs(cardViewportY - nextCardViewportY) > 0.25 ||
        Math.abs(cardViewportWidth - nextCardViewportWidth) > 0.25 ||
        Math.abs(cardViewportHeight - nextCardViewportHeight) > 0.25;
      if (!hasChanged) return false;

      width = nextWidth;
      height = nextHeight;
      cardViewportX = nextCardViewportX;
      cardViewportY = nextCardViewportY;
      cardViewportWidth = nextCardViewportWidth;
      cardViewportHeight = nextCardViewportHeight;
      renderer.setSize(width, height, false);
      camera.left = -width / 2;
      camera.right = width / 2;
      camera.top = height / 2;
      camera.bottom = -height / 2;
      camera.updateProjectionMatrix();
      return true;
    };

    const resize = () => {
      if (!syncViewport()) return;
      buildTarget(cardRef.current, activeImage);
      beginTransition();
    };

    const onTarget = (event: Event) => {
      const detail = (event as CustomEvent<ParticleTargetDetail>).detail;
      if (!detail) return;
      syncViewport();
      activeImage = detail.image;
      buildTarget(detail.card, activeImage);
      beginTransition();
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
        mouseX = x - width / 2;
        mouseY = height / 2 - y;
      } else {
        mouseX = -10000;
        mouseY = -10000;
      }
    };

    const onVisibilityChange = () => {
      active = !document.hidden;
      if (active && !animationFrame) animationFrame = requestAnimationFrame(animate);
    };

    const animate = (time: number) => {
      animationFrame = 0;
      if (disposed || !active) return;
      const delta = Math.min(34, time - lastTime || 16);
      lastTime = time;
      material.uniforms.uTime.value = time * 0.001;

      const elapsed = time - transitionStartedAt;
      const scatterMix = easeOutCubic(Math.min(1, elapsed / scatterDuration));
      const gatherMix = easeInOutCubic(
        Math.min(1, Math.max(0, (elapsed - scatterDuration) / gatherDuration)),
      );
      const formationProgress =
        elapsed < scatterDuration
          ? 0
          : Math.min(1, Math.max(0, (elapsed - scatterDuration) / gatherDuration));

      if (transitioning) updateFormationVisual(formationProgress);

      if (transitioning && elapsed > formationDuration) {
        transitioning = false;
        updateFormationVisual(1);
        canvas.classList.add("is-idle");
        if (!completionNotified) {
          completionNotified = true;
          onFormationCompleteRef.current?.();
        }
      }

      for (let i = 0; i < activeParticleCount; i += 1) {
        const i3 = i * 3;
        if (transitioning) {
          const targetX =
            elapsed < scatterDuration
              ? THREE.MathUtils.lerp(formationStart[i3], scatterTargets[i3], scatterMix)
              : THREE.MathUtils.lerp(scatterTargets[i3], targets[i3], gatherMix);
          const targetY =
            elapsed < scatterDuration
              ? THREE.MathUtils.lerp(formationStart[i3 + 1], scatterTargets[i3 + 1], scatterMix)
              : THREE.MathUtils.lerp(scatterTargets[i3 + 1], targets[i3 + 1], gatherMix);
          const targetZ =
            elapsed < scatterDuration
              ? THREE.MathUtils.lerp(formationStart[i3 + 2], scatterTargets[i3 + 2], scatterMix)
              : THREE.MathUtils.lerp(scatterTargets[i3 + 2], targets[i3 + 2], gatherMix);
          positions[i3] = targetX;
          positions[i3 + 1] = targetY;
          positions[i3 + 2] = targetZ;
        } else {
          positions[i3] += (targets[i3] - positions[i3]) * 0.025;
          positions[i3 + 1] += (targets[i3 + 1] - positions[i3 + 1]) * 0.025;
          positions[i3 + 2] += (targets[i3 + 2] - positions[i3 + 2]) * 0.025;
        }

        const dx = positions[i3] - mouseX;
        const dy = positions[i3 + 1] - mouseY;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq < 5200) {
          const force = (1 - Math.sqrt(distanceSq) / 72) * 0.65 * (delta / 16);
          positions[i3] += dx * force;
          positions[i3 + 1] += dy * force;
        }
      }

      geometry.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
      if (transitioning || !reducedMotion) animationFrame = requestAnimationFrame(animate);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    canvas.addEventListener("particle-target", onTarget);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    resize();
    animationFrame = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      canvas.removeEventListener("particle-target", onTarget);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      cancelAnimationFrame(animationFrame);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [hostRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    let dispatched = false;
    let active = true;
    const dispatch = (image: HTMLImageElement | null) => {
      if (!active || dispatched) return;
      dispatched = true;
      canvas.dispatchEvent(new CustomEvent<ParticleTargetDetail>("particle-target", {
        detail: { card, image },
      }));
    };

    if (!card?.image) {
      dispatch(null);
      return;
    }

    const image = new Image();
    image.onload = () => dispatch(image);
    image.onerror = () => dispatch(null);
    image.src = card.image;
    if (image.complete && image.naturalWidth > 0) dispatch(image);

    return () => {
      active = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [card, hostRef, transitionKey]);

  return <canvas className="particle-canvas" ref={canvasRef} aria-hidden="true" />;
}

function wrapParticleText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  maxLines: number,
) {
  if (!value) return [];
  const lines: string[] = [];
  let line = "";
  for (const character of Array.from(value)) {
    if (line && context.measureText(line + character).width > maxWidth) {
      lines.push(line);
      line = character;
      if (lines.length === maxLines) break;
    } else {
      line += character;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && lines[maxLines - 1]) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`;
  }
  return lines;
}
