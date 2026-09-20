/**
 * 遥测厘米坐标 ↔ 画布 / 底图像素。
 * 约定与 match-replay / map-poi-viewer 一致：x→水平、y→垂直向下，**无 Y 轴翻转**。
 */

export type NormPoint = {nx: number; ny: number};
export type CanvasPoint = {cx: number; cy: number};
export type ImagePoint = {px: number; py: number};

/** 遥测 cm → [0,1] 归一（可越界；调用方自行 clamp） */
export function telemetryToNorm(
  x: number,
  y: number,
  sizeCm: number,
): NormPoint {
  return {nx: x / sizeCm, ny: y / sizeCm};
}

/**
 * 全图居中、zoom=1 时的画布投影（与 match-replay.toCanvas 同式）。
 * ox/oy 为方图画布左上角，size 为方边长（像素）。
 */
export function telemetryToCanvas(
  x: number,
  y: number,
  sizeCm: number,
  opts: {
    ox: number;
    oy: number;
    size: number;
    centerX?: number;
    centerY?: number;
    zoom?: number;
  },
): CanvasPoint {
  const zoom = opts.zoom ?? 1;
  const centerX = opts.centerX ?? sizeCm / 2;
  const centerY = opts.centerY ?? sizeCm / 2;
  return {
    cx: opts.ox + opts.size / 2 + ((x - centerX) / sizeCm) * opts.size * zoom,
    cy: opts.oy + opts.size / 2 + ((y - centerY) / sizeCm) * opts.size * zoom,
  };
}

/** 遥测 cm → 底图源像素（与 drawImage 的 sx/sy 比例一致） */
export function telemetryToImagePx(
  x: number,
  y: number,
  sizeCm: number,
  imgW: number,
  imgH: number,
): ImagePoint {
  return {
    px: (x / sizeCm) * imgW,
    py: (y / sizeCm) * imgH,
  };
}

/** 社区图鉴常用 8192 全图像素 → 遥测厘米 */
export function communityPxToCm(px: number, sizeCm: number, communityMapPx = 8192): number {
  return Math.round((px / communityMapPx) * sizeCm);
}
