// make-meme.mjs — the tool that drew the meme in meme-final.png (the picture on the X post).
// "THE GTA VI WAITING ROOM": one fan ages 13 years in the same chair while the make.fun ghost
// waits in the chair beside him; in 2026 the sign flips to OUT NOW. 100% original, drawn in
// code — no image assets, no network, Node standard library only. Deterministic: every run
// writes the same bytes.   node make-meme.mjs   ->   meme-final.png (1200x1200)
import zlib from "node:zlib";
import { writeFileSync } from "node:fs";
// Minimal deterministic raster canvas + PNG encoder (Node stdlib only).


const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

class Canvas {
  constructor(w, h, bg = [255, 255, 255]) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      this.px[i * 3] = bg[0];
      this.px[i * 3 + 1] = bg[1];
      this.px[i * 3 + 2] = bg[2];
    }
  }
  set(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2];
  }
  fillRect(x, y, w, h, c) {
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w)), y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++)
      for (let xx = x0; xx < x1; xx++) this.set(xx, yy, c);
  }
  vGrad(x, y, w, h, top, bot) {
    const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      const t = h <= 1 ? 0 : (yy - y) / h;
      const c = [
        Math.round(top[0] + (bot[0] - top[0]) * t),
        Math.round(top[1] + (bot[1] - top[1]) * t),
        Math.round(top[2] + (bot[2] - top[2]) * t),
      ];
      this.fillRect(x, yy, w, 1, c);
    }
  }
  fillCircle(cx, cy, r, c) {
    const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
    const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (let yy = y0; yy <= y1; yy++)
      for (let xx = x0; xx <= x1; xx++) {
        const dx = xx - cx, dy = yy - cy;
        if (dx * dx + dy * dy <= r * r) this.set(xx, yy, c);
      }
  }
  fillEllipse(cx, cy, rx, ry, c) {
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let yy = y0; yy <= y1; yy++)
      for (let xx = x0; xx <= x1; xx++) {
        const dx = (xx - cx) / rx, dy = (yy - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(xx, yy, c);
      }
  }
  // filled circle clipped to half planes: dir 'up' keeps y<=cy etc.
  fillHalfCircle(cx, cy, r, c, keep) {
    const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
    const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (let yy = y0; yy <= y1; yy++)
      for (let xx = x0; xx <= x1; xx++) {
        const dx = xx - cx, dy = yy - cy;
        if (dx * dx + dy * dy > r * r) continue;
        if (keep === "up" && yy > cy) continue;
        if (keep === "down" && yy < cy) continue;
        if (keep === "left" && xx > cx) continue;
        if (keep === "right" && xx < cx) continue;
        this.set(xx, yy, c);
      }
  }
  fillPoly(pts, c) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(this.h - 1, Math.ceil(maxY));
    for (let yy = y0; yy <= y1; yy++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy)) {
          xs.push(a[0] + ((yy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2)
        this.fillRect(xs[i], yy, xs[i + 1] - xs[i], 1, c);
    }
  }
  thickLine(x0, y0, x1, y1, wdt, c) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / (wdt * 0.4)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.fillCircle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, wdt / 2, c);
    }
  }
  roundRect(x, y, w, h, r, c) {
    this.fillRect(x + r, y, w - 2 * r, h, c);
    this.fillRect(x, y + r, w, h - 2 * r, c);
    this.fillCircle(x + r, y + r, r, c);
    this.fillCircle(x + w - r, y + r, r, c);
    this.fillCircle(x + r, y + h - r, r, c);
    this.fillCircle(x + w - r, y + h - r, r, c);
  }
  toPNG() {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h);
    for (let yy = 0; yy < this.h; yy++) {
      raw[yy * (this.w * 3 + 1)] = 0;
      Buffer.from(this.px.buffer, yy * this.w * 3, this.w * 3).copy(raw, yy * (this.w * 3 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
    const idat = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", idat),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

// Classic 5x7 bitmap font, uppercase + digits + basic punctuation.
const FONT = {
  A: ["01110","10001","10001","11111","10001","10001","10001"],
  B: ["11110","10001","10001","11110","10001","10001","11110"],
  C: ["01110","10001","10000","10000","10000","10001","01110"],
  D: ["11100","10010","10001","10001","10001","10010","11100"],
  E: ["11111","10000","10000","11110","10000","10000","11111"],
  F: ["11111","10000","10000","11110","10000","10000","10000"],
  G: ["01110","10001","10000","10111","10001","10001","01111"],
  H: ["10001","10001","10001","11111","10001","10001","10001"],
  I: ["01110","00100","00100","00100","00100","00100","01110"],
  J: ["00111","00010","00010","00010","00010","10010","01100"],
  K: ["10001","10010","10100","11000","10100","10010","10001"],
  L: ["10000","10000","10000","10000","10000","10000","11111"],
  M: ["10001","11011","10101","10101","10001","10001","10001"],
  N: ["10001","11001","10101","10011","10001","10001","10001"],
  O: ["01110","10001","10001","10001","10001","10001","01110"],
  P: ["11110","10001","10001","11110","10000","10000","10000"],
  Q: ["01110","10001","10001","10001","10101","10010","01101"],
  R: ["11110","10001","10001","11110","10100","10010","10001"],
  S: ["01111","10000","10000","01110","00001","00001","11110"],
  T: ["11111","00100","00100","00100","00100","00100","00100"],
  U: ["10001","10001","10001","10001","10001","10001","01110"],
  V: ["10001","10001","10001","10001","10001","01010","00100"],
  W: ["10001","10001","10001","10101","10101","10101","01010"],
  X: ["10001","01010","00100","00100","00100","01010","10001"],
  Y: ["10001","01010","00100","00100","00100","00100","00100"],
  Z: ["11111","00001","00010","00100","01000","10000","11111"],
  "0": ["01110","10001","10011","10101","11001","10001","01110"],
  "1": ["00100","01100","00100","00100","00100","00100","01110"],
  "2": ["01110","10001","00001","00010","00100","01000","11111"],
  "3": ["11111","00010","00100","00010","00001","10001","01110"],
  "4": ["00010","00110","01010","10010","11111","00010","00010"],
  "5": ["11111","10000","11110","00001","00001","10001","01110"],
  "6": ["00110","01000","10000","11110","10001","10001","01110"],
  "7": ["11111","00001","00010","00100","01000","01000","01000"],
  "8": ["01110","10001","10001","01110","10001","10001","01110"],
  "9": ["01110","10001","10001","01111","00001","00010","01100"],
  ".": ["00000","00000","00000","00000","00000","01100","01100"],
  ",": ["00000","00000","00000","00000","01100","00100","01000"],
  "'": ["00100","00100","01000","00000","00000","00000","00000"],
  "!": ["00100","00100","00100","00100","00100","00000","00100"],
  "?": ["01110","10001","00001","00110","00100","00000","00100"],
  "-": ["00000","00000","00000","01110","00000","00000","00000"],
  ":": ["00000","01100","01100","00000","01100","01100","00000"],
  " ": ["00000","00000","00000","00000","00000","00000","00000"],
};

function textWidth(str, scale, tracking = 1) {
  return str.length * (5 + tracking) * scale - tracking * scale;
}

function drawText(cv, str, cx, y, scale, color, outline = null, outlinePx = 0) {
  const s = String(str).toUpperCase();
  const w = textWidth(s, scale);
  let x = Math.round(cx - w / 2);
  const draw = (dx, dy, col) => {
    let gx = x;
    for (const ch of s) {
      const g = FONT[ch] || FONT[" "];
      for (let r = 0; r < 7; r++)
        for (let cIdx = 0; cIdx < 5; cIdx++)
          if (g[r][cIdx] === "1") cv.fillRect(gx + cIdx * scale + dx, y + r * scale + dy, scale, scale, col);
      gx += 6 * scale;
    }
  };
  if (outline && outlinePx > 0) {
    for (let dx = -outlinePx; dx <= outlinePx; dx += Math.max(1, scale >> 1))
      for (let dy = -outlinePx; dy <= outlinePx; dy += Math.max(1, scale >> 1))
        if (dx || dy) draw(dx, dy, outline);
  }
  draw(0, 0, color);
  return w;
}

// "THE GTA VI WAITING ROOM" — one fan ages in the same chair, 2013 -> 2026.
// 100% original flat illustration drawn in code. Deterministic, no network.


const INK = [24, 28, 38];
const NAVY = [18, 22, 34];
const PAPER = [250, 246, 236];
const GOLD = [245, 197, 66];
const SKIN = [242, 192, 148];
const WALL_T = [250, 233, 196];
const WALL_B = [243, 214, 158];
const FLOOR = [176, 137, 104];
const FLOOR_D = [146, 110, 80];
const CHAIR = [142, 47, 50];
const CHAIR_L = [168, 58, 62];

function arc(cv, cx, cy, r, a0, a1, w, c) {
  const steps = 24;
  let px = cx + r * Math.cos(a0), py = cy + r * Math.sin(a0);
  for (let i = 1; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    cv.thickLine(px, py, x, y, w, c);
    px = x; py = y;
  }
}

function star(cv, cx, cy, r, c) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  cv.fillPoly(pts, c);
}

function sparkle(cv, cx, cy, r, c) {
  cv.fillPoly(
    [[cx, cy - r], [cx + r * 0.28, cy - r * 0.28], [cx + r, cy], [cx + r * 0.28, cy + r * 0.28],
     [cx, cy + r], [cx - r * 0.28, cy + r * 0.28], [cx - r, cy], [cx - r * 0.28, cy - r * 0.28]],
    c
  );
}

function sign(cv, cx, y, line2, line2Color) {
  const w = 330, h = 92;
  cv.roundRect(cx - w / 2 - 5, y - 5, w + 10, h + 10, 12, INK);
  cv.roundRect(cx - w / 2, y, w, h, 10, [34, 40, 54]);
  drawText(cv, "GTA VI", cx, y + 10, 6, PAPER);
  drawText(cv, line2, cx, y + 58, 3, line2Color);
}

function chair(cv, cx, seatY) {
  cv.roundRect(cx - 100, seatY - 168, 200, 178, 20, CHAIR);
  cv.roundRect(cx - 84, seatY - 152, 168, 146, 16, CHAIR_L);
  cv.roundRect(cx - 112, seatY - 6, 224, 44, 14, CHAIR);
  cv.roundRect(cx - 128, seatY - 44, 34, 52, 10, CHAIR);
  cv.roundRect(cx + 94, seatY - 44, 34, 52, 10, CHAIR);
  cv.fillRect(cx - 92, seatY + 38, 16, 30, [90, 60, 40]);
  cv.fillRect(cx + 76, seatY + 38, 16, 30, [90, 60, 40]);
}

function person(cv, cx, seatY, floorY, stage) {
  const P = {
    kid:     { torsoH: 96,  torsoW: 92,  headR: 41, pants: [46, 92, 140], shirt: [46, 158, 91],  shoeY: seatY + 80 },
    teen:    { torsoH: 122, torsoW: 106, headR: 43, pants: [38, 44, 56],  shirt: [63, 95, 191],  shoeY: floorY - 16 },
    adult:   { torsoH: 124, torsoW: 118, headR: 45, pants: [55, 71, 79],  shirt: [223, 227, 230], shoeY: floorY - 16 },
    grandpa: { torsoH: 112, torsoW: 116, headR: 43, pants: [90, 74, 58],  shirt: [122, 92, 62],  shoeY: floorY - 16 },
  }[stage];
  const topY = seatY - P.torsoH;
  const headCy = topY - P.headR + 12;
  const hunch = stage === "grandpa" ? 10 : 0;
  const hx = cx + hunch;

  // legs (seated, front view)
  const legW = 30;
  cv.fillRect(cx - 44, seatY + 22, legW, P.shoeY - seatY - 22, P.pants);
  cv.fillRect(cx + 14, seatY + 22, legW, P.shoeY - seatY - 22, P.pants);
  cv.fillEllipse(cx - 32, P.shoeY, 24, 10, [30, 30, 34]);
  cv.fillEllipse(cx + 30, P.shoeY - (stage === "kid" ? 10 : 0), 24, 10, [30, 30, 34]);

  // torso
  cv.roundRect(cx - P.torsoW / 2, topY, P.torsoW, P.torsoH + 20, 18, P.shirt);
  if (stage === "adult") {
    cv.fillPoly([[cx - 8, topY + 6], [cx + 8, topY + 6], [cx + 3, topY + 66], [cx - 3, topY + 66]], [176, 58, 46]); // tie
    cv.fillEllipse(cx + 6, seatY - 6, 40, 20, P.shirt); // belly hint
  }
  if (stage === "teen") cv.roundRect(cx - P.torsoW / 2 + 8, topY - 12, P.torsoW - 16, 26, 12, P.shirt); // hood

  // left arm down to lap
  cv.thickLine(cx - P.torsoW / 2 + 6, topY + 18, cx - P.torsoW / 2 - 12, seatY - 8, 17, P.shirt);
  cv.fillCircle(cx - P.torsoW / 2 - 12, seatY - 6, 10, SKIN);

  // right arm: grandpa raises the game case; others rest / hold props
  if (stage === "grandpa") {
    cv.thickLine(cx + P.torsoW / 2 - 6, topY + 16, cx + 96, topY - 26, 17, P.shirt);
    cv.fillCircle(cx + 98, topY - 28, 10, SKIN);
    // game case held high
    const gx = cx + 108, gy = topY - 30;
    cv.roundRect(gx - 32, gy - 42, 64, 84, 6, [16, 20, 28]);
    cv.roundRect(gx - 32, gy - 42, 64, 84, 6, [16, 20, 28]);
    cv.fillRect(gx - 32, gy - 42, 64, 10, GOLD);
    star(cv, gx, gy + 8, 17, GOLD);
    drawText(cv, "VI", gx, gy + 26, 2, PAPER);
    sparkle(cv, gx - 52, gy - 40, 13, GOLD);
    sparkle(cv, gx + 54, gy - 18, 10, GOLD);
    sparkle(cv, gx + 30, gy - 62, 8, [255, 225, 130]);
  } else {
    cv.thickLine(cx + P.torsoW / 2 - 6, topY + 18, cx + P.torsoW / 2 + 10, seatY - 10, 17, P.shirt);
    cv.fillCircle(cx + P.torsoW / 2 + 10, seatY - 8, 10, SKIN);
    if (stage === "teen") { // phone in right hand
      cv.roundRect(cx + P.torsoW / 2 - 2, seatY - 34, 22, 34, 4, [22, 24, 30]);
      cv.fillRect(cx + P.torsoW / 2 + 2, seatY - 30, 14, 22, [120, 180, 230]);
    }
    if (stage === "adult") { // coffee cup
      cv.roundRect(cx + P.torsoW / 2 - 4, seatY - 30, 26, 30, 4, [245, 245, 245]);
      cv.fillRect(cx + P.torsoW / 2 - 4, seatY - 30, 26, 7, [176, 58, 46]);
    }
  }

  // head
  cv.fillCircle(hx, headCy, P.headR, SKIN);
  const eyeY = headCy - 3, eyeDx = 15;
  if (stage === "adult") { // tired: half-lidded straight eyes + bags
    cv.thickLine(hx - eyeDx - 7, eyeY, hx - eyeDx + 7, eyeY, 4, INK);
    cv.thickLine(hx + eyeDx - 7, eyeY, hx + eyeDx + 7, eyeY, 4, INK);
    arc(cv, hx - eyeDx, eyeY + 10, 8, 0.15 * Math.PI, 0.85 * Math.PI, 3, [198, 158, 118]);
    arc(cv, hx + eyeDx, eyeY + 10, 8, 0.15 * Math.PI, 0.85 * Math.PI, 3, [198, 158, 118]);
  } else {
    cv.fillCircle(hx - eyeDx, eyeY, 4.5, INK);
    cv.fillCircle(hx + eyeDx, eyeY, 4.5, INK);
  }
  // mouths
  if (stage === "kid") arc(cv, hx, headCy + 12, 15, 0.1 * Math.PI, 0.9 * Math.PI, 5, INK); // big grin
  if (stage === "teen") cv.thickLine(hx - 9, headCy + 18, hx + 9, headCy + 18, 4, INK); // flat bored
  if (stage === "adult") arc(cv, hx, headCy + 26, 11, 1.15 * Math.PI, 1.85 * Math.PI, 4, INK); // small frown
  if (stage === "grandpa") { // huge open smile
    cv.fillHalfCircle(hx, headCy + 10, 16, INK, "down");
    cv.fillRect(hx - 16, headCy + 8, 32, 4, INK);
  }

  // hair / headgear per stage
  if (stage === "kid") {
    cv.fillHalfCircle(hx, headCy - 4, P.headR + 2, [214, 59, 47], "up");
    cv.fillEllipse(hx + 4, headCy - 6, 54, 10, [214, 59, 47]); // cap brim
    cv.fillCircle(hx, headCy - P.headR - 4, 7, [178, 42, 34]);
  }
  if (stage === "teen") {
    cv.fillHalfCircle(hx, headCy - 6, P.headR + 1, [52, 40, 32], "up");
    arc(cv, hx, headCy - 8, P.headR + 9, 1.05 * Math.PI, 1.95 * Math.PI, 9, [26, 28, 34]); // headphone band
    cv.roundRect(hx - P.headR - 13, headCy - 14, 15, 30, 6, [26, 28, 34]);
    cv.roundRect(hx + P.headR - 2, headCy - 14, 15, 30, 6, [26, 28, 34]);
  }
  if (stage === "adult") {
    cv.fillHalfCircle(hx, headCy - 8, P.headR, [58, 42, 30], "up");
    cv.fillHalfCircle(hx, headCy + 16, 30, [74, 52, 40], "down"); // beard
    cv.fillCircle(hx, headCy + 2, 17, SKIN); // face window over beard top
    cv.fillCircle(hx - eyeDx, eyeY, 4.5, INK); cv.fillCircle(hx + eyeDx, eyeY, 4.5, INK);
    cv.thickLine(hx - eyeDx - 7, eyeY, hx - eyeDx + 7, eyeY, 4, INK);
    cv.thickLine(hx + eyeDx - 7, eyeY, hx + eyeDx + 7, eyeY, 4, INK);
    arc(cv, hx, headCy + 26, 11, 1.15 * Math.PI, 1.85 * Math.PI, 4, INK);
  }
  if (stage === "grandpa") {
    cv.fillHalfCircle(hx - P.headR + 4, headCy + 2, 13, [207, 216, 220], "left"); // side hair
    cv.fillHalfCircle(hx + P.headR - 4, headCy + 2, 13, [207, 216, 220], "right");
    arc(cv, hx - eyeDx, eyeY - 2, 11, 0, Math.PI * 2, 3.5, INK); // glasses
    arc(cv, hx + eyeDx, eyeY - 2, 11, 0, Math.PI * 2, 3.5, INK);
    cv.thickLine(hx - eyeDx + 11, eyeY - 2, hx + eyeDx - 11, eyeY - 2, 3.5, INK);
    cv.fillCircle(hx - eyeDx, eyeY - 2, 4, INK); cv.fillCircle(hx + eyeDx, eyeY - 2, 4, INK);
    cv.fillHalfCircle(hx, headCy + 10, 16, INK, "down"); // re-draw smile over glasses bottom
    cv.fillEllipse(hx + 26, headCy + 16, 4, 7, [110, 180, 230]); // tear of joy
    // cane leaning on chair's left
    cv.thickLine(cx - 128, seatY + 66, cx - 104, seatY - 66, 7, [110, 82, 54]);
    arc(cv, cx - 104, seatY - 74, 10, Math.PI, Math.PI * 2, 7, [110, 82, 54]);
  }
}

function ghostChair(cv, gx, seatY) {
  cv.roundRect(gx - 58, seatY - 100, 116, 108, 14, CHAIR);
  cv.roundRect(gx - 46, seatY - 88, 92, 84, 10, CHAIR_L);
  cv.roundRect(gx - 64, seatY - 2, 128, 26, 9, CHAIR);
  cv.fillRect(gx - 48, seatY + 24, 10, 18, [90, 60, 40]);
  cv.fillRect(gx + 38, seatY + 24, 10, 18, [90, 60, 40]);
}

// make.fun's ghost mascot, drawn from its description: a white ghost with
// sparkle eyes, holding a magenta star coin. It never ages — it's a ghost.
function ghost(cv, gx, seatY, withCoin) {
  const topC = seatY - 60, R = 34;
  const pts = [[gx - R, seatY + 2], [gx - R, topC]];
  for (let a = 180; a >= 0; a -= 15)
    pts.push([gx + R * Math.cos((a * Math.PI) / 180), topC - R * Math.sin((a * Math.PI) / 180)]);
  pts.push([gx + R, seatY + 2]);
  for (const ccx of [gx + 22.7, gx, gx - 22.7])
    for (let t = 0; t <= 180; t += 30)
      pts.push([ccx + 11.3 * Math.cos((t * Math.PI) / 180), seatY + 2 + 11.3 * Math.sin((t * Math.PI) / 180)]);
  // outline pass, then fill
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    cv.thickLine(a[0], a[1], b[0], b[1], 7, INK);
  }
  cv.fillPoly(pts, [255, 255, 255]);
  // sparkle eyes + smile + blush
  sparkle(cv, gx - 13, topC - 4, 9, INK);
  sparkle(cv, gx + 13, topC - 4, 9, INK);
  arc(cv, gx, topC + 6, 7, 0.15 * Math.PI, 0.85 * Math.PI, 3.5, INK);
  cv.fillEllipse(gx - 23, topC + 8, 7, 4, [244, 164, 196]);
  cv.fillEllipse(gx + 23, topC + 8, 7, 4, [244, 164, 196]);
  // left arm nub
  cv.fillCircle(gx - R - 1, seatY - 24, 10, INK);
  cv.fillCircle(gx - R - 1, seatY - 24, 7.5, [255, 255, 255]);
  if (withCoin) {
    // right arm raised, holding the magenta star coin high
    cv.thickLine(gx + R - 4, seatY - 38, gx + 50, seatY - 94, 12, INK);
    cv.thickLine(gx + R - 4, seatY - 38, gx + 50, seatY - 94, 7, [255, 255, 255]);
    const kx = gx + 58, ky = seatY - 112;
    cv.fillCircle(kx, ky, 22, INK);
    cv.fillCircle(kx, ky, 19, [228, 60, 168]);
    star(cv, kx, ky, 10, GOLD);
    sparkle(cv, kx - 30, ky - 16, 9, GOLD);
    sparkle(cv, kx + 28, ky + 10, 7, GOLD);
  } else {
    cv.fillCircle(gx + R + 1, seatY - 24, 10, INK);
    cv.fillCircle(gx + R + 1, seatY - 24, 7.5, [255, 255, 255]);
  }
}

function panel(cv, x, y, w, h, year, stage, isFinal) {
  cv.roundRect(x - 4, y - 4, w + 8, h + 8, 16, INK);
  cv.vGrad(x, y, w, h, WALL_T, WALL_B);
  const floorY = y + h - 64;
  cv.fillRect(x, floorY, w, 64, FLOOR);
  for (let i = 1; i < 5; i++) cv.fillRect(x, floorY + i * 13, w, 2, FLOOR_D);
  sign(cv, x + w / 2, y + 8, isFinal ? "OUT NOW" : "COMING SOON", isFinal ? GOLD : [150, 164, 184]);
  const cx = x + w / 2 - 78, seatY = floorY - 58;
  chair(cv, cx, seatY);
  person(cv, cx, seatY, floorY, stage);
  // the make.fun ghost waits in the next chair, in every panel
  const gx = x + w - 118;
  ghostChair(cv, gx, seatY);
  ghost(cv, gx, seatY, isFinal);
  // year tag on the floor, bottom-left — clear of the sign and the chair
  cv.roundRect(x + 14, floorY + 5, 128, 54, 10, INK);
  drawText(cv, year, x + 78, floorY + 17, 5, PAPER);
  if (isFinal) {
    // punchline plaque on the floor, centre — grandpa's verdict
    cv.roundRect(x + 156, floorY + 4, 248, 56, 10, INK);
    cv.roundRect(x + 160, floorY + 8, 240, 48, 8, [255, 255, 255]);
    drawText(cv, "WORTH IT.", x + 280, floorY + 18, 4, INK);
  }
}

function renderMeme() {
  const W = 1200, H = 1200;
  const cv = new Canvas(W, H, NAVY);
  // title bar
  drawText(cv, "THE GTA VI WAITING ROOM", W / 2, 26, 8, PAPER, null, 0);
  cv.fillRect(0, 104, W, 5, GOLD);
  // panels 2x2
  const mx = 36, gap = 22, pw = (W - mx * 2 - gap) / 2, ph = 424, py = 128;
  panel(cv, mx, py, pw, ph, "2013", "kid", false);
  panel(cv, mx + pw + gap, py, pw, ph, "2018", "teen", false);
  panel(cv, mx, py + ph + gap, pw, ph, "2023", "adult", false);
  panel(cv, mx + pw + gap, py + ph + gap, pw, ph, "2026", "grandpa", true);
  // bottom bar
  const by = py + 2 * ph + gap + 22;
  cv.fillRect(0, by - 8, W, 5, GOLD);
  drawText(cv, "HE NEVER LEFT THE QUEUE.", W / 2, by + 22, 8, PAPER);
  return cv.toPNG();
}

const png = renderMeme();
writeFileSync(new URL("./meme-final.png", import.meta.url), png);
console.log("wrote meme-final.png", png.length, "bytes");
