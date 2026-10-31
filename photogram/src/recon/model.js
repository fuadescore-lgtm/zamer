/* ---------- от облака точек к модели дома: стены, развёртки фасадов, проёмы, крыша, дымоход ---------- */
const OMM = 10, OZ = 7000;   // развёртка: 10 мм на пиксель, по высоте до 7 м
// вертикальные плоскости стен (RANSAC по прямым в плане)
function findWalls(P, rng = laRng(1)) {
  let rest = P.filter(p => p[2] > 250); const planes = [];
  for (let it = 0; it < 8 && rest.length > 60; it++) {
    let best = null;
    for (let k = 0; k < 2500; k++) {
      const a = rest[Math.floor(rng() * rest.length)], b = rest[Math.floor(rng() * rest.length)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      if (L < 800) continue;
      const n = [-dy / L, dx / L], c = n[0] * a[0] + n[1] * a[1]; let cnt = 0;
      for (const p of rest) if (Math.abs(n[0] * p[0] + n[1] * p[1] - c) < 35) cnt++;
      if (!best || cnt > best.cnt) best = { n, c, cnt };
    }
    if (!best || best.cnt < 60) break;
    let Q = rest.filter(p => Math.abs(best.n[0] * p[0] + best.n[1] * p[1] - best.c) < 35);
    // МНК-прямая
    const mx = Q.reduce((s, p) => s + p[0], 0) / Q.length, my = Q.reduce((s, p) => s + p[1], 0) / Q.length;
    let sxx = 0, sxy = 0, syy = 0; for (const p of Q) { const x = p[0] - mx, y = p[1] - my; sxx += x * x; sxy += x * y; syy += y * y; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), n = [-Math.sin(th), Math.cos(th)], c = n[0] * mx + n[1] * my;
    Q = rest.filter(p => Math.abs(n[0] * p[0] + n[1] * p[1] - c) < 35);
    planes.push({ n, c, pts: Q }); const S = new Set(Q); rest = rest.filter(p => !S.has(p));
  }
  if (planes.length < 3) return null;
  const cx = P.reduce((s, p) => s + p[0], 0) / P.length, cy = P.reduce((s, p) => s + p[1], 0) / P.length;
  for (const p of planes) { if (p.n[0] * cx + p.n[1] * cy - p.c > 0) { p.n = [-p.n[0], -p.n[1]]; p.c = -p.c; } p.ang = Math.atan2(p.n[1], p.n[0]) * 180 / Math.PI; }
  // одна плоскость на направление (самая населённая); сторона по направлению нормали: 1 — (0,−1), 2 — (1,0), 3 — (0,1), 4 — (−1,0)
  const bySide = {};
  for (const p of planes) {
    const s = [[1, -90], [2, 0], [3, 90], [4, 180]].map(([s, a]) => [s, Math.abs(((p.ang - a + 540) % 360) - 180)]).sort((a, b) => a[1] - b[1])[0];
    if (s[1] > 20) continue;
    if (!bySide[s[0]] || bySide[s[0]].pts.length < p.pts.length) bySide[s[0]] = { ...p, side: s[0] };
  }
  const walls = [1, 2, 3, 4].map(s => bySide[s]).filter(Boolean);
  if (walls.length < 4) return { walls, err: "найдено стен: " + walls.length + " из 4" };
  const meet = (a, b) => { const det = a.n[0] * b.n[1] - a.n[1] * b.n[0]; return [(a.c * b.n[1] - a.n[1] * b.c) / det, (a.n[0] * b.c - a.c * b.n[0]) / det]; };
  walls.forEach((w, i) => { w.a = meet(walls[(i + 3) % 4], w); w.b = meet(w, walls[(i + 1) % 4]); w.len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); w.u = [(w.b[0] - w.a[0]) / w.len, (w.b[1] - w.a[1]) / w.len]; });
  return { walls };
}
// развёртка стены по лучшему снимку (смотрит на стену прямее всего)
function makeOrtho(w, cams, imgs, K) {
  let best = null;
  for (const [k, c] of Object.entries(cams)) { if (!imgs[k] || !imgs[k].rgba) continue; const fwd = [c.R[6], c.R[7], c.R[8]], s = -(fwd[0] * w.n[0] + fwd[1] * w.n[1]); if (!best || s > best[0]) best = [s, k]; }
  const k = best[1], c = cams[k], im = imgs[k], W = Math.ceil(w.len / OMM) + 1, H = Math.ceil(OZ / OMM) + 1, out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = x * OMM, z = OZ - y * OMM, X = [w.a[0] + w.u[0] * s, w.a[1] + w.u[1] * s, z], q = projK(K, c, X), o = (y * W + x) * 4;
    out[o + 3] = 255; if (!q || q[0] < 0 || q[1] < 0 || q[0] > im.w - 2 || q[1] > im.h - 2) continue;
    const x0 = q[0] | 0, y0 = q[1] | 0, ax = q[0] - x0, ay = q[1] - y0, p = (y0 * im.w + x0) * 4, d = im.rgba, r = im.w * 4;
    for (let ch = 0; ch < 3; ch++) out[o + ch] = (d[p + ch] * (1 - ax) + d[p + 4 + ch] * ax) * (1 - ay) + (d[p + r + ch] * (1 - ax) + d[p + r + 4 + ch] * ax) * ay;
  }
  return { k, W, H, rgba: out };
}
function rgb2lab(r, g, b) {
  const f = v => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; }, R = f(r), G = f(g), B = f(b);
  let X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const h = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; X = h(X); Y = h(Y); Z = h(Z);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
function morph(m, W, H, r, dil) {   // квадратное окно (2r+1): дилатация или эрозия
  const t = new Uint8Array(W * H), o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = dil ? 0 : 1; for (let d = -r; d <= r; d++) { const xx = Math.min(W - 1, Math.max(0, x + d)); const q = m[y * W + xx]; if (dil ? q : !q) { v = dil ? 1 : 0; break; } } t[y * W + x] = v; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = dil ? 0 : 1; for (let d = -r; d <= r; d++) { const yy = Math.min(H - 1, Math.max(0, y + d)); const q = t[yy * W + x]; if (dil ? q : !q) { v = dil ? 1 : 0; break; } } o[y * W + x] = v; }
  return o;
}
function fitLineR(pts, thr = 25, rng = laRng(0)) {
  let best = null;
  for (let it = 0; it < 400; it++) {
    const a = pts[Math.floor(rng() * pts.length)], b = pts[Math.floor(rng() * pts.length)]; if (Math.abs(b[0] - a[0]) < 300) continue;
    const k = (b[1] - a[1]) / (b[0] - a[0]), c = a[1] - k * a[0], inl = pts.filter(p => Math.abs(p[1] - (k * p[0] + c)) < thr);
    if (!best || inl.length > best.length) best = inl;
  }
  if (!best || best.length < 3) return null;
  const n = best.length, sx = best.reduce((s, p) => s + p[0], 0), sy = best.reduce((s, p) => s + p[1], 0), sxx = best.reduce((s, p) => s + p[0] * p[0], 0), sxy = best.reduce((s, p) => s + p[0] * p[1], 0);
  const k = (n * sxy - sx * sy) / (n * sxx - sx * sx), c = (sy - k * sx) / n;
  return { k, c, inl: new Set(best) };
}
// разбор развёртки: где стена, её верх (карниз/щипец), цоколь, проёмы
function analyzeWall(w, O) {
  const { W, H, rgba } = O, N = W * H;
  const ch = [0, 1, 2].map(c => { const a = new Float32Array(N); for (let i = 0; i < N; i++) a[i] = rgba[i * 4 + c]; return gaussBlur(a, W, H, 3); });
  const lab = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const L = rgb2lab(ch[0][i], ch[1][i], ch[2][i]); lab[3 * i] = L[0]; lab[3 * i + 1] = L[1]; lab[3 * i + 2] = L[2]; }
  // цвет стены — по пикселям, где лежат 3D-точки этой стены
  const samp = [];
  for (const p of w.pts) { const s = (p[0] - w.a[0]) * w.u[0] + (p[1] - w.a[1]) * w.u[1], x = Math.round(s / OMM), y = Math.round((OZ - p[2]) / OMM); if (x >= 0 && x < W && y >= 0 && y < H) samp.push(y * W + x); }
  if (samp.length < 20) return null;
  const med = [0, 1, 2].map(c => { const v = samp.map(i => lab[3 * i + c]).sort((a, b) => a - b); return v[v.length >> 1]; });
  const C = [[4, 0, 0], [0, 4, 0], [0, 0, 4]];
  for (const i of samp) { const d = [0, 1, 2].map(c => lab[3 * i + c] - med[c]); for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += d[a] * d[b] / samp.length; }
  const Ci = laInv3(C.flat()), wall0 = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const d = [lab[3 * i] - med[0], lab[3 * i + 1] - med[1], lab[3 * i + 2] - med[2]], m = m3.v(Ci, d); wall0[i] = (d[0] * m[0] + d[1] * m[1] + d[2] * m[2]) < 16 && rgba[i * 4 + 3] ? 1 : 0; }
  let wall = morph(morph(wall0, W, H, 2, false), W, H, 2, true); wall = morph(morph(wall, W, H, 4, true), W, H, 4, false);
  // верх стены по столбцам
  const cols = [];
  for (let x = 5; x < W - 5; x += 4) { let top = -1, cnt = 0; for (let y = 0; y < H; y++) if (wall[y * W + x]) { if (top < 0) top = y; cnt++; } if (cnt >= 20) cols.push([x * OMM, OZ - top * OMM]); }
  if (cols.length < 10) return null;
  const L1 = fitLineR(cols); if (!L1) return null;
  const res = { side: w.side, len: w.len, ortho: O };
  let topZ;
  const rest = cols.filter(p => !L1.inl.has(p));
  if (Math.abs(Math.atan(L1.k)) > 8 * Math.PI / 180 && rest.length > 10) {
    const L2 = fitLineR(rest);
    if (L2 && Math.sign(L2.k) !== Math.sign(L1.k)) {
      const xs = (L2.c - L1.c) / (L1.k - L2.k), zs = L1.k * xs + L1.c, up = L1.k > 0 ? L1 : L2, dn = L1.k > 0 ? L2 : L1;
      res.type = "gable"; res.apex = [xs, zs]; res.pitch = [Math.atan(up.k), Math.atan(-dn.k)].map(a => a * 180 / Math.PI);
      res.cornerZ = [up.c, dn.k * w.len + dn.c];
      topZ = s => Math.min(up.k * s + up.c, dn.k * s + dn.c); res.lines = [up, dn];
    }
  }
  // доля «стены» по строкам (без краёв)
  const rowFrac = y => { let c = 0, n = 0; for (let x = (W / 10) | 0; x < W - W / 10; x++) { c += wall[y * W + x]; n++; } return c / n; };
  // цоколь: снизу вверх, пока строка в основном «не стена» (кирпич, отмостка)
  // цоколь: самая резкая смена цвета по высоте между 150 и 1200 мм (средний цвет строк, без краёв)
  const rowLab = y => { const m = [0, 0, 0]; let n = 0; for (let x = (W / 10) | 0; x < W - W / 10; x += 2) { const i = y * W + x; m[0] += lab[3 * i]; m[1] += lab[3 * i + 1]; m[2] += lab[3 * i + 2]; n++; } return m.map(v => v / n); };
  const RL = []; for (let y = 0; y < H; y++) RL.push(OZ - y * OMM <= 1500 ? rowLab(y) : null);
  let plinth = 0, bestD = 12;
  for (let y = 0; y < H - 8; y++) { const z = OZ - y * OMM; if (z > 1200 || z < 150) continue; let a = [0, 0, 0], b = [0, 0, 0];
    for (let d = 1; d <= 8; d++) for (let c = 0; c < 3; c++) { a[c] += RL[y - d][c] / 8; b[c] += RL[y + d][c] / 8; }
    const D = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (D > bestD) { bestD = D; plinth = z; } }
  res.plinth = plinth;
  if (!res.type) {
    // карнизная стена: верх — первая сплошная полоса «не стены» (свес, софит) выше 1,5 м
    let eave = null, run = 0;
    for (let y = Math.floor((OZ - 1500) / OMM); y >= 0; y--) { if (rowFrac(y) < 0.25) { if (++run >= 10) { eave = OZ - (y + run) * OMM; break; } } else run = 0; }
    if (eave == null) eave = L1.k * w.len / 2 + L1.c;
    res.type = "eave"; res.top = eave; topZ = () => eave; res.lines = [{ k: 0, c: eave }];
  }
  // проёмы: «не стена» внутри контура выше цоколя
  const hole = new Uint8Array(N), yPl = Math.floor((OZ - plinth) / OMM) - 2;
  for (let x = 0; x < W; x++) { const y0 = Math.floor((OZ - topZ(x * OMM)) / OMM) + 6; for (let y = Math.max(0, y0); y < Math.min(H, yPl); y++) if (!wall[y * W + x]) hole[y * W + x] = 1; }
  const lbl = new Int32Array(N), boxes = [];
  for (let i = 0; i < N; i++) {
    if (!hole[i] || lbl[i]) continue;
    const id = boxes.length + 1, st = [i]; lbl[i] = id; let x0 = W, x1 = 0, y0 = H, y1 = 0, area = 0;
    while (st.length) { const q = st.pop(), x = q % W, y = (q / W) | 0; area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const nq of [q - 1, q + 1, q - W, q + W]) if (nq >= 0 && nq < N && hole[nq] && !lbl[nq] && Math.abs((nq % W) - x) <= 1) { lbl[nq] = id; st.push(nq); } }
    boxes.push({ x0, x1: x1 + 1, y0, y1: y1 + 1, area });
  }
  let ops = [];
  for (let bi = 0; bi < boxes.length; bi++) {
    let b = boxes[bi];
    // к проёму может прилипнуть козырёк или тень (широкая полоса сверху) — оставляем самый длинный участок строк с ширинами как у медианы
    if (b.area < 0.75 * (b.x1 - b.x0) * (b.y1 - b.y0) && b.y1 - b.y0 > 20) {
      const rw = [];
      for (let y = b.y0; y < b.y1; y++) { let c = 0, lo = W, hi = -1; for (let x = b.x0; x < b.x1; x++) if (lbl[y * W + x] === bi + 1) { c++; if (x < lo) lo = x; if (x > hi) hi = x; } rw.push([c, lo, hi]); }
      const med = rw.map(r => r[0]).filter(c => c > 0).sort((a, c) => a - c); const m = med[med.length >> 1] || 0;
      let best = null, st = -1;
      for (let i = 0; i <= rw.length; i++) { const ok = i < rw.length && Math.abs(rw[i][0] - m) <= 0.2 * m && m > 0; if (ok && st < 0) st = i; if (!ok && st >= 0) { if (!best || i - st > best[1] - best[0]) best = [st, i]; st = -1; } }
      if (best && best[1] - best[0] > 20) { const rs = rw.slice(best[0], best[1]); b = { x0: Math.min(...rs.map(r => r[1])), x1: Math.max(...rs.map(r => r[2])) + 1, y0: b.y0 + best[0], y1: b.y0 + best[1], area: rs.reduce((a, r) => a + r[0], 0) }; }
    }
    const w2 = b.x1 - b.x0, h2 = b.y1 - b.y0;
    if (w2 * OMM < 400 || h2 * OMM < 400 || b.area < 0.75 * w2 * h2 || b.x0 < 3 || b.x1 > W - 3) continue;
    const zb = OZ - b.y1 * OMM, door = zb <= Math.max(plinth + 120, 300);   // низ у цоколя — дверь (проходит сквозь цоколь)
    ops.push({ type: door ? "door" : "win", x0: b.x0, x1: b.x1, y0: b.y0, y1: door ? Math.round(OZ / OMM) : b.y1 });
  }
  // половинки окна, разделённые импостом → одно окно
  ops.sort((a, b) => a.x0 - b.x0); const mg = [];
  for (const q of ops) { const m = mg[mg.length - 1];
    if (m && m.type === q.type && (q.x0 - m.x1) * OMM < 250 && Math.min(m.y1, q.y1) - Math.max(m.y0, q.y0) > 0.8 * Math.min(m.y1 - m.y0, q.y1 - q.y0)) { m.x1 = Math.max(m.x1, q.x1); m.y0 = Math.min(m.y0, q.y0); m.y1 = Math.max(m.y1, q.y1); continue; }
    mg.push({ ...q }); }
  // края — по наружной кромке рамы (сильнейший перепад яркости в 0…200 мм наружу)
  const gr = new Float32Array(N); for (let i = 0; i < N; i++) gr[i] = 0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2];
  const gb = gaussBlur(gr, W, H, 1.2), gx = (x, y) => Math.abs(gb[y * W + x + 1] - gb[y * W + x - 1]) * 2, gy = (x, y) => Math.abs(gb[(y + 1) * W + x] - gb[(y - 1) * W + x]) * 2;
  const bestOff = prof => { if (prof.length < 5) return 0; let k = 3; for (let i = 3; i < prof.length; i++) if (prof[i] > prof[k]) k = i; const s = prof.slice().sort((a, b) => a - b), med = s[s.length >> 1]; return prof[k] > 2 * med && prof[k] > 25 ? k : 0; };
  const mean = (f, a, b, c) => { let s = 0, n = 0; for (let i = a; i < b; i++) { s += f(i); n++; } return s / Math.max(1, n); };
  for (const q of mg) {
    const ys = [q.y0 + 3, Math.min(H - 2, q.y1 - 3)], xs = [q.x0 + 3, q.x1 - 3], P = [];
    const dl = bestOff(Array.from({ length: Math.min(21, q.x0 - 1) }, (_, o) => mean(y => gx(q.x0 - o, y), ys[0], ys[1])));
    const dr = bestOff(Array.from({ length: Math.min(21, W - q.x1 - 2) }, (_, o) => mean(y => gx(q.x1 + o, y), ys[0], ys[1])));
    const dt = bestOff(Array.from({ length: Math.min(21, q.y0 - 1) }, (_, o) => mean(x => gy(x, q.y0 - o), xs[0], xs[1])));
    const db = q.type === "win" ? bestOff(Array.from({ length: Math.min(21, H - q.y1 - 2) }, (_, o) => mean(x => gy(x, q.y1 + o), xs[0], xs[1]))) : 0;
    q.x0 -= dl; q.x1 += dr; q.y0 -= dt; q.y1 += db;
  }
  res.open = mg.map(q => ({ type: q.type, s: q.x0 * OMM, w: (q.x1 - q.x0) * OMM, sill: q.type === "door" ? 0 : OZ - q.y1 * OMM, h: q.type === "door" ? OZ - q.y0 * OMM : (q.y1 - q.y0) * OMM }));
  res.wallMask = wall; res.cols = cols;
  return res;
}
// всё вместе: результат сборки → описание модели для редактора
function buildModelFromRecon(R, imgs, ref, sky, refSide = 1) {
  const P = R.points.map(p => p.X), fw = findWalls(P);
  if (!fw || fw.err) return { err: "Не удалось найти стены по точкам" + (fw && fw.err ? ": " + fw.err : "") };
  // стороны считались от стены-эталона; переводим в нумерацию объекта (эталон на стороне refSide)
  for (const w of fw.walls) w.side = ((w.side - 1) + (refSide - 1)) % 4 + 1;
  const an = fw.walls.map(w => analyzeWall(w, makeOrtho(w, R.cams, imgs, R.K)));
  const side = s => an.find(a => a && a.side === s), wl = s => fw.walls.find(w => w.side === s);
  const A = (wl(1).len + wl(3).len) / 2, B = (wl(2).len + wl(4).len) / 2;
  const gables = an.filter(a => a && a.type === "gable");
  let roof = null;
  const ht = ref.H;
  if (gables.length) {
    const ang = gables.flatMap(g => g.pitch).reduce((s, v) => s + v, 0) / (gables.length * 2);
    const along = gables.some(g => g.side === 2 || g.side === 4) ? "x" : "y", span = along === "x" ? B : A, rise = Math.tan(ang * Math.PI / 180) * span / 2;
    roof = { type: "gable", along, ang: Math.round(ang * 10) / 10, rise, ridgeZ: ht + rise, ov: 500, th: 250, n: gables.length };
  }
  // дымоход: по силуэтам над крышей
  let chim = null;
  if (roof && sky) {
    const eaves = fw.walls.filter(w => !gables.some(g => g.side === w.side));
    const zr = p => { let dmin = 1e9; for (const w of eaves) dmin = Math.min(dmin, Math.abs(w.n[0] * p[0] + w.n[1] * p[1] - w.c)); return ht + Math.tan(roof.ang * Math.PI / 180) * Math.min(dmin, (roof.along === "x" ? B : A) / 2); };
    const c = findChimney(R, sky, zr);
    if (c) {
      // верх видимой грани ≈ передняя кромка; центр трубы — глубже на полсечения (приближение: сдвиг к коньку не делаем)
      const w1 = wl(1), d = [c.x - w1.a[0], c.y - w1.a[1]], x1 = d[0] * w1.u[0] + d[1] * w1.u[1], y1 = -(d[0] * w1.n[0] + d[1] * w1.n[1]);
      const sw = Math.abs(w1.u[0]) > 0.5;   // оси эталона и стороны 1 совпадают или повёрнуты на 90°
      chim = { x: x1, y: y1, w: sw ? c.w : c.l, l: sw ? c.l : c.w, top: c.top, two: c.views >= 2, n: c.n };
    }
  }
  const holes = [];
  for (const a of an) if (a) for (const o of a.open) {
    const len = a.side % 2 ? A : B, pos = o.s + o.w / 2;
    if (o.sill + o.h > ht + 50 || pos < 0 || pos > len) continue;
    holes.push({ side: a.side - 1, t: o.type === "door" ? "door" : "win", pos, width: o.w, height: o.h, sill: o.sill });
  }
  return { A, B, ht, walls: fw.walls, an, roof, chim, holes };
}
// силуэт по небу: для каждого столбца — первая строка сверху, где кончается небо (плавный градиент без скачков)
function skyline(rgba, w, h) {
  const s = new Int16Array(w);
  for (let x = 0; x < w; x++) {
    let y = 1;
    for (; y < h; y++) {
      const o = (y * w + x) * 4, u = o - w * 4, d = Math.abs(rgba[o] - rgba[u]) + Math.abs(rgba[o + 1] - rgba[u + 1]) + Math.abs(rgba[o + 2] - rgba[u + 2]);
      if (d > 18 || rgba[o + 2] < rgba[o] - 5) break;
    }
    s[x] = y;
  }
  return s;
}
// дымоход: узкий выступ над линией крыши на силуэтах; лучи на его верх с разных снимков сходятся в одной точке
function findChimney(R, sky, roofTop) {
  const views = [];
  for (const [k, sl] of Object.entries(sky)) {
    const c = R.cams[k]; if (!c) continue;
    const w = sl.length, win = Math.round(w / 8), base = new Float32Array(w);
    for (let x = 0; x < w; x++) { const a = []; for (let d = -win; d <= win; d += 3) { const q = x + d; if (q >= 0 && q < w) a.push(sl[q]); } a.sort((p, q) => p - q); base[x] = a[Math.floor(a.length * 0.6)]; }
    let x = 0;
    while (x < w) {
      if (!(sl[x] < base[x] - 12 && sl[x] < c.K.cy * 2 - 5)) { x++; continue; }
      let x1 = x; while (x1 < w && sl[x1] < base[x1] - 12) x1++;
      const bw = x1 - x;
      if (bw >= 6 && bw < w / 10) {
        let top = 1e9; for (let q = x; q < x1; q++) top = Math.min(top, sl[q]);
        const xm = (x + x1 - 1) / 2, C = camC(c), dir = p => m3.Tv(c.R, bearing(c.K, p));
        views.push({ k, C, d: dir([xm, top + 1]), dl: dir([x, top + 1]), dr: dir([x1 - 1, top + 1]), bw });
      }
      x = x1;
    }
  }
  if (views.length < 2) return null;
  // попарные пересечения лучей (с разных точек съёмки), согласованные группы
  const meet = (a, b) => { const w0 = vsub(a.C, b.C), A = vdot(a.d, a.d), B = vdot(a.d, b.d), Cc = vdot(b.d, b.d), D = vdot(a.d, w0), E = vdot(b.d, w0), den = A * Cc - B * B; if (Math.abs(den) < 1e-9) return null;
    const s = (B * E - Cc * D) / den, t = (A * E - B * D) / den; if (s <= 0 || t <= 0) return null; const p = vadd(a.C, vscale(a.d, s)), q = vadd(b.C, vscale(b.d, t)); return { p: vscale(vadd(p, q), 0.5), gap: vlen(vsub(p, q)), ang: Math.acos(Math.min(1, vdot(a.d, b.d))) }; };
  const cand = [];
  for (let i = 0; i < views.length; i++) for (let j = i + 1; j < views.length; j++) { if (views[i].k === views[j].k) continue; const m = meet(views[i], views[j]); if (m && m.gap < 250 && m.ang > 0.15 && m.p[2] > roofTop(m.p) + 200) cand.push({ ...m, i, j }); }
  if (!cand.length) return null;
  let best = null;
  for (const c of cand) { const g = cand.filter(o => vlen(vsub(o.p, c.p)) < 400); if (!best || g.length > best.length) best = g; }
  const P = [0, 1, 2].map(k => best.reduce((s, o) => s + o.p[k], 0) / best.length);
  // уточнение: верх силуэта — передняя верхняя кромка грани, обращённой к камере; грань стоит на полсечения ближе центра
  const used = [...new Set(best.flatMap(o => [o.i, o.j]))].map(i => views[i]);
  let w = 0, l = 0;
  for (let pass = 0; pass < 4; pass++) {
    const xs = [], ys = [], zs = [], ws = [], ls = [];
    for (const v of used) {
      const dir = vsub(P, v.C), ax = Math.abs(dir[1]) >= Math.abs(dir[0]) ? 1 : 0;   // смотрит вдоль Y → грань ⟂ Y
      const half = (ax === 1 ? l : w) / 2, face = P[ax] - Math.sign(dir[ax]) * half;
      const hit = d => { if (Math.abs(d[ax]) < 1e-6) return null; const t = (face - v.C[ax]) / d[ax]; return t > 0 ? vadd(v.C, vscale(d, t)) : null; };
      const M = hit(v.d), Lh = hit(v.dl), Rh = hit(v.dr); if (!M || !Lh || !Rh) continue;
      const o = 1 - ax, size = Math.abs(Lh[o] - Rh[o]); zs.push(M[2]);
      if (Math.abs(dir[o]) > Math.abs(dir[ax]) * 0.3) continue;   // косой вид: видны две грани — размер и центр не берём
      const side = (ax === 1 ? l : w) * Math.abs(dir[o] / dir[ax]);   // боковая грань, видимая сбоку
      if (ax === 1) { xs.push(M[0]); ws.push(size - side); } else { ys.push(M[1]); ls.push(size - side); }
    }
    const med = a => a.length ? a.slice().sort((p, q) => p - q)[a.length >> 1] : null;
    w = med(ws) || med(ls) || 500; l = med(ls) || med(ws) || 500;
    if (xs.length) P[0] = med(xs); if (ys.length) P[1] = med(ys); if (zs.length) P[2] = med(zs);
  }
  return { x: P[0], y: P[1], top: P[2], w: Math.max(250, w), l: Math.max(250, l), n: best.length, views: used.length };
}
// компактный результат для передачи из фонового потока (без тяжёлых промежуточных данных)
function packResult(R, M) {
  const transfer = [], pts = new Float32Array(R.points.length * 3);
  R.points.forEach((p, i) => pts.set(p.X, i * 3)); transfer.push(pts.buffer);
  const out = { log: R.log, cams: Object.fromEntries(Object.entries(R.cams).map(([k, c]) => [k, { R: c.R, t: c.t, K: c.K, C: camC(c) }])), pts };
  if (M.err) { out.err = M.err; return { out, transfer }; }
  out.model = { A: M.A, B: M.B, ht: M.ht, roof: M.roof, chim: M.chim, holes: M.holes,
    walls: M.walls.map(w => ({ side: w.side, a: w.a, b: w.b, len: w.len, n: w.n, c: w.c })),
    an: M.an.map(a => a && { side: a.side, len: a.len, type: a.type, pitch: a.pitch, apex: a.apex, cornerZ: a.cornerZ, top: a.top, plinth: a.plinth, open: a.open, lines: a.lines.map(l => ({ k: l.k, c: l.c })),
      ortho: { k: a.ortho.k, W: a.ortho.W, H: a.ortho.H, rgba: a.ortho.rgba }, mask: a.wallMask }) };
  for (const a of out.model.an) if (a) transfer.push(a.ortho.rgba.buffer, a.mask.buffer);
  return { out, transfer };
}
