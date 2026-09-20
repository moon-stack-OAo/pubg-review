/**
 * A3 地图坐标对齐抽检（可复现，无外网）。
 * 用法：node scripts/check-map-coords.mjs
 *
 * 校验：
 * 1. mapSizeCm（Erangel 816000 / Sanhok 408000）
 * 2. 角落 / 中心：cm → 归一 → Low_Res 像素 / 画布
 * 3. 与 drawImage 源矩形比例一致（无 Y 翻转）
 * 4. Erangel 已知 POI 落在合理象限
 * 5. 社区 8192px ↔ cm ↔ Low_Res(≈819) 比例闭环
 */

import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const jiti = require("jiti")(import.meta.url, {
  alias: {
    "@": path.join(root, "src"),
  },
});

const {
  mapSizeCm,
  getMapById,
  getMapByApiName,
} = jiti(path.join(root, "src/lib/pubg/maps.ts"));
const {listPoisByMapId} = jiti(path.join(root, "src/lib/pubg/map-pois.ts"));
const {
  telemetryToNorm,
  telemetryToCanvas,
  telemetryToImagePx,
  communityPxToCm,
} = jiti(path.join(root, "src/lib/pubg/map-coords.ts"));

let failed = 0;
let passed = 0;

function ok(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function near(a, b, eps) {
  return Math.abs(a - b) <= eps;
}

function pngSize(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf[0] !== 0x89 || buf.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`not png: ${filePath}`);
  }
  return {w: buf.readUInt32BE(16), h: buf.readUInt32BE(20)};
}

function checkCorners(mapId, apiName, sizeCm) {
  console.log(`\n## ${mapId} (${apiName}) sizeCm=${sizeCm}`);
  ok("mapSizeCm(apiName)", mapSizeCm(apiName) === sizeCm, String(mapSizeCm(apiName)));
  const info = getMapById(mapId);
  ok("getMapById.sizeCm", info?.sizeCm === sizeCm);
  ok("getMapByApiName", getMapByApiName(apiName)?.id === mapId);

  const imgPath = path.join(root, "public", info.image.replace(/^\//, ""));
  ok("底图存在", fs.existsSync(imgPath), imgPath);
  const {w: imgW, h: imgH} = pngSize(imgPath);
  ok("底图为正方形", imgW === imgH, `${imgW}x${imgH}`);

  const samples = [
    {name: "NW角", x: 0, y: 0, nx: 0, ny: 0},
    {name: "NE角", x: sizeCm, y: 0, nx: 1, ny: 0},
    {name: "SW角", x: 0, y: sizeCm, nx: 0, ny: 1},
    {name: "SE角", x: sizeCm, y: sizeCm, nx: 1, ny: 1},
    {name: "中心", x: sizeCm / 2, y: sizeCm / 2, nx: 0.5, ny: 0.5},
  ];

  const canvas = {ox: 10, oy: 20, size: 400};
  for (const s of samples) {
    const n = telemetryToNorm(s.x, s.y, sizeCm);
    ok(
      `${s.name} 归一`,
      near(n.nx, s.nx, 1e-9) && near(n.ny, s.ny, 1e-9),
      `nx=${n.nx} ny=${n.ny}`,
    );

    const ip = telemetryToImagePx(s.x, s.y, sizeCm, imgW, imgH);
    ok(
      `${s.name} → 图像素`,
      near(ip.px, s.nx * imgW, 0.01) && near(ip.py, s.ny * imgH, 0.01),
      `px=${ip.px.toFixed(2)} py=${ip.py.toFixed(2)}`,
    );

    const c = telemetryToCanvas(s.x, s.y, sizeCm, canvas);
    const expectCx = canvas.ox + s.nx * canvas.size;
    const expectCy = canvas.oy + s.ny * canvas.size;
    ok(
      `${s.name} → 画布(zoom1居中)`,
      near(c.cx, expectCx, 0.01) && near(c.cy, expectCy, 0.01),
      `cx=${c.cx.toFixed(2)} cy=${c.cy.toFixed(2)}`,
    );
  }

  // Y 不翻转：增大 y 应增大 cy / py（向下）
  const a = telemetryToCanvas(sizeCm / 2, 0, sizeCm, canvas);
  const b = telemetryToCanvas(sizeCm / 2, sizeCm, sizeCm, canvas);
  ok("Y 轴无翻转（y↑ → cy↑）", b.cy > a.cy, `cy0=${a.cy} cy1=${b.cy}`);

  // 与 match-replay drawImage 源矩形：zoom=1 全图 → sx=0,sy=0,sw=imgW
  const zoom = 1;
  const centerX = sizeCm / 2;
  const centerY = sizeCm / 2;
  const half = (sizeCm * zoom) / 2;
  const sx = ((centerX - half) / sizeCm) * imgW;
  const sy = ((centerY - half) / sizeCm) * imgH;
  const sw = imgW * zoom;
  ok("drawImage 全图源矩形", near(sx, 0, 1e-6) && near(sy, 0, 1e-6) && near(sw, imgW, 1e-6), `sx=${sx} sy=${sy} sw=${sw}`);
}

function checkErangelPois() {
  console.log("\n## Erangel POI 象限（相对 sizeCm）");
  const sizeCm = 816_000;
  /** @type {{id:string, nxMin:number, nxMax:number, nyMin:number, nyMax:number}[]} */
  const expect = [
    {id: "erangel-pochinki", nxMin: 0.32, nxMax: 0.48, nyMin: 0.40, nyMax: 0.56},
    {id: "erangel-school", nxMin: 0.40, nxMax: 0.56, nyMin: 0.30, nyMax: 0.46},
    {id: "erangel-military", nxMin: 0.45, nxMax: 0.65, nyMin: 0.70, nyMax: 0.90},
    {id: "erangel-georgopol", nxMin: 0.12, nxMax: 0.30, nyMin: 0.25, nyMax: 0.45},
    {id: "erangel-primorsk", nxMin: 0.10, nxMax: 0.28, nyMin: 0.62, nyMax: 0.82},
    {id: "erangel-novo", nxMin: 0.60, nxMax: 0.80, nyMin: 0.60, nyMax: 0.80},
  ];
  const pois = listPoisByMapId("erangel");
  for (const e of expect) {
    const poi = pois.find((p) => p.id === e.id);
    if (!poi) {
      ok(`POI ${e.id} 存在`, false);
      continue;
    }
    const n = telemetryToNorm(poi.x, poi.y, sizeCm);
    const inBox =
      n.nx >= e.nxMin &&
      n.nx <= e.nxMax &&
      n.ny >= e.nyMin &&
      n.ny <= e.nyMax;
    ok(
      `${poi.name} 象限`,
      inBox,
      `norm=(${n.nx.toFixed(3)},${n.ny.toFixed(3)}) cm=(${poi.x},${poi.y})`,
    );
  }
}

function checkCommunityRoundTrip() {
  console.log("\n## 社区 8192px → cm → Low_Res 比例闭环");
  const sizeCm = 816_000;
  const community = 8192;
  const lowRes = 819; // public/maps/erangel.png
  const samples = [
    [1380, 1815], // S101
    [4661, 4420], // S108 Pochinki 南
    [0, 0],
    [8192, 8192],
  ];
  for (const [cpx, cpy] of samples) {
    const x = communityPxToCm(cpx, sizeCm, community);
    const y = communityPxToCm(cpy, sizeCm, community);
    const ip = telemetryToImagePx(x, y, sizeCm, lowRes, lowRes);
    const expectPx = (cpx / community) * lowRes;
    const expectPy = (cpy / community) * lowRes;
    // communityPxToCm 有 round，允许 1px 误差
    ok(
      `8192(${cpx},${cpy}) → Low_Res`,
      near(ip.px, expectPx, 1.1) && near(ip.py, expectPy, 1.1),
      `got=(${ip.px.toFixed(2)},${ip.py.toFixed(2)}) expect≈(${expectPx.toFixed(2)},${expectPy.toFixed(2)})`,
    );
  }
}

function checkSanhokSynthetic() {
  console.log("\n## Sanhok 合成点（无本地 POI 清单时）");
  const sizeCm = 408_000;
  ok("Savage_Main sizeCm", mapSizeCm("Savage_Main") === sizeCm);
  // 出生岛大致在北侧海域外/边缘：用地图外一点验证越界归一仍单调
  const north = telemetryToNorm(sizeCm * 0.5, sizeCm * 0.08, sizeCm);
  ok("北侧相对位置 ny 小", north.ny < 0.15, `ny=${north.ny.toFixed(3)}`);
  const south = telemetryToNorm(sizeCm * 0.5, sizeCm * 0.92, sizeCm);
  ok("南侧相对位置 ny 大", south.ny > 0.85, `ny=${south.ny.toFixed(3)}`);
}

checkCorners("erangel", "Baltic_Main", 816_000);
ok("Island_Main 同 Erangel 尺寸", mapSizeCm("Island_Main") === 816_000);
checkCorners("sanhok", "Savage_Main", 408_000);
checkErangelPois();
checkCommunityRoundTrip();
checkSanhokSynthetic();

console.log(`\n—— 合计 PASS=${passed} FAIL=${failed} ——`);
if (failed > 0) process.exit(1);
console.log("A3 坐标对齐抽检：通过（数学/比例；目视回放见 docs/08）");
