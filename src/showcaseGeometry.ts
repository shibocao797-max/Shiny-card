export const showcaseCardHeight = 3.1;
export const showcaseCameraFov = 34;
export const showcaseCameraDistance = 6.35;

export function calculateShowcaseLayout(width: number, height: number, aspectRatio: number) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const visibleHeight =
    showcaseCameraDistance * 2 * Math.tan((showcaseCameraFov * Math.PI) / 360);
  const visibleWidth = visibleHeight * (safeWidth / safeHeight);
  const compact = safeWidth < 720;
  const cardWidth = showcaseCardHeight * aspectRatio;
  const fitScale = Math.min(
    (visibleHeight * 0.52) / showcaseCardHeight,
    (visibleWidth * (compact ? 0.86 : 0.82)) / cardWidth,
  );
  const positionY = Math.max(0.1, showcaseCardHeight * (compact ? 0.02 : 0.04));
  const pixelsPerUnit = safeHeight / visibleHeight;

  return {
    fitScale,
    positionY,
    pixelWidth: cardWidth * fitScale * pixelsPerUnit,
    pixelHeight: showcaseCardHeight * fitScale * pixelsPerUnit,
    pixelOffsetY: positionY * pixelsPerUnit,
  };
}
