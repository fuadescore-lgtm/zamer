/* ---------- PHOTOGRAM · перспектива фасада по одному снимку и подгонка окон ----------
   Линии фасада → вертикальная точка схода → горизонт → направления стен (X, Y, грани эркера) →
   объектив по ⟂ направлениям → окна от нейросети подгоняются по перспективе своей плоскости. */
const PV = {};
// отрезки прямых: рост областей с одинаковым направлением градиента (упрощённый LSD)
PV.segments = function (gray, W, H) {
  const gx = new Float32Array(W * H), gy = new Float32Array(W * H), mag = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x;
    const a = gray[p - W - 1], b = gray[p - W], c = gray[p - W + 1], d = gray[p - 1], f = gray[p + 1], g = gray[p + W - 1], h = gray[p + W], i = gray[p + W + 1];
    const sx = (c + 2 * f + i) - (a + 2 * d + g), sy = (g + 2 * h + i) - (a + 2 * b + c);
    gx[p] = sx; gy[p] = sy; mag[p] = Math.hypot(sx, sy);
  }
  const thr = 40, idx = [];
  for (let p = 0; p < W * H; p++) if (mag[p] > thr) idx.push(p);
  idx.sort((a, b) => mag[b] - mag[a]);
  const used = new Uint8Array(W * H), out = [], tol = Math.PI / 8;
  const ang = p => Math.atan2(gx[p], -gy[p]);      // направление линии уровня
  for (const s of idx) {
    if (used[s]) continue;
    let ca = Math.cos(ang(s)), sa = Math.sin(ang(s)); const reg = [s]; used[s] = 1;
    for (let k = 0; k < reg.length; k++) {
      const p = reg[k], px = p % W, py = (p / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const qx = px + dx, qy = py + dy; if (qx < 1 || qy < 1 || qx >= W - 1 || qy >= H - 1) continue;
        const q = qy * W + qx; if (used[q] || mag[q] <= thr) continue;
        const a = ang(q), th = Math.atan2(sa, ca);
        let d = Math.abs(a - th); d = Math.min(d, 2 * Math.PI - d); if (d > tol) continue;
        used[q] = 1; reg.push(q); ca += Math.cos(a); sa += Math.sin(a);
      }
    }
    if (reg.length < 15) continue;
    let mx = 0, my = 0; for (const p of reg) { mx += p % W; my += (p / W) | 0; } mx /= reg.length; my /= reg.length;
    let sxx = 0, sxy = 0, syy = 0; for (const p of reg) { const x = p % W - mx, y = ((p / W) | 0) - my; sxx += x * x; sxy += x * y; syy += y * y; }
    const t = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(t), uy = Math.sin(t);
    let lo = 1e9, hi = -1e9, wd = 0;
    for (const p of reg) { const x = p % W - mx, y = ((p / W) | 0) - my, s1 = x * ux + y * uy; if (s1 < lo) lo = s1; if (s1 > hi) hi = s1; wd += (x * uy - y * ux) ** 2; }
    wd = Math.sqrt(wd / reg.length);
    if (hi - lo < 20 || wd > 2.2) continue;
    out.push([mx + ux * lo, my + uy * lo, mx + ux * hi, my + uy * hi]);
  }
  return { segs: out, gx, gy };
};
const pvCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const pvLine = s => pvCross([s[0], s[1], 1], [s[2], s[3], 1]);
const pvLen = s => Math.hypot(s[2] - s[0], s[3] - s[1]);
// угол (град.) между отрезком и направлением от его середины на точку схода vp (однородные координаты)
PV.dev = function (s, vp) {
  const mx = (s[0] + s[2]) / 2, my = (s[1] + s[3]) / 2, dx = s[2] - s[0], dy = s[3] - s[1];
  let tx, ty; if (Math.abs(vp[2]) < 1e-9) { tx = vp[0]; ty = vp[1]; } else { tx = vp[0] / vp[2] - mx; ty = vp[1] / vp[2] - my; }
  const c = Math.abs(dx * tx + dy * ty) / (Math.hypot(dx, dy) * Math.hypot(tx, ty) + 1e-9);
  return Math.acos(Math.min(1, c)) * 180 / Math.PI;
};
function pvRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// точка схода по отрезкам (RANSAC с весом по длине + МНК)
PV.ransacVP = function (S, mask, iters = 1200, thr = 1.5, rng = pvRng(1)) {
  const idx = []; for (let i = 0; i < S.length; i++) if (mask[i]) idx.push(i);
  if (idx.length < 3) return null;
  const L = idx.map(i => pvLen(S[i])), tot = L.reduce((a, b) => a + b, 0), cum = []; let acc = 0; for (const l of L) { acc += l / tot; cum.push(acc); }
  const pick = () => { const r = rng(); let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; } return idx[lo]; };
  let best = null;
  for (let it = 0; it < iters; it++) {
    const i = pick(), j = pick(); if (i === j) continue;
    let vp = pvCross(pvLine(S[i]), pvLine(S[j])); const n = Math.hypot(...vp); if (n < 1e-12) continue; vp = vp.map(v => v / n);
    let sc = 0; for (const k of idx) if (PV.dev(S[k], vp) < thr) sc += pvLen(S[k]);
    if (!best || sc > best.sc) best = { sc, vp };
  }
  if (!best) return null;
  // уточнение: наименьший собственный вектор Σ w·l lᵀ
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const k of idx) if (PV.dev(S[k], best.vp) < thr) { const l = pvLine(S[k]), n = Math.hypot(l[0], l[1]), w = pvLen(S[k]); for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) M[a][b] += w * l[a] * l[b] / (n * n); }
  let vp = laEig(M).vec[0]; const n = Math.hypot(...vp); vp = vp.map(v => v / n);
  const inl = S.map((s, k) => mask[k] && PV.dev(s, vp) < thr);
  return { vp, inl };
};
PV.analyze = function (gray, W, H) {
  const { segs: S, gx, gy } = PV.segments(gray, W, H), c = [W / 2, H / 2];
  const ang = S.map(s => ((Math.atan2(s[3] - s[1], s[2] - s[0]) * 180 / Math.PI) % 180 + 180) % 180);
  const vert = ang.map(a => Math.abs(a - 90) < 25), V = PV.ransacVP(S, vert);
  if (!V) return null;
  // фокус: вертикаль ⟂ горизонтали; f² = −(v−c)·(h−c) по всем найденным горизонтальным точкам схода
  let mask = S.map((s, k) => !V.inl[k] && (ang[k] < 50 || ang[k] > 130)); const fc = [];
  for (let r = 0; r < 3; r++) {
    const Hh = PV.ransacVP(S, mask, 600, 1.0); if (!Hh) break;
    if (Math.abs(V.vp[2]) > 1e-9 && Math.abs(Hh.vp[2]) > 1e-9) {
      const a = [V.vp[0] / V.vp[2] - c[0], V.vp[1] / V.vp[2] - c[1]], b = [Hh.vp[0] / Hh.vp[2] - c[0], Hh.vp[1] / Hh.vp[2] - c[1]], f2 = -(a[0] * b[0] + a[1] * b[1]);
      if (f2 > 0) { const f = Math.sqrt(f2); if (f > 0.3 * Math.max(W, H) && f < 2 * Math.max(W, H)) fc.push(f); }
    }
    mask = mask.map((m, k) => m && !Hh.inl[k]);
  }
  fc.sort((a, b) => a - b);
  const f = fc.length ? fc[fc.length >> 1] : 0.72 * Math.max(W, H);
  const K = [f, 0, c[0], 0, f, c[1], 0, 0, 1], Ki = laInv3(K);
  let u = vnorm(m3.v(Ki, V.vp)); if (u[1] > 0) u = vscale(u, -1);
  let e1 = vcross(u, [0, 0, 1]); e1 = vlen(e1) < 1e-6 ? [1, 0, 0] : vnorm(e1); const e2 = vcross(u, e1);
  const vpOf = th => m3.v(K, vadd(vscale(e1, Math.cos(th)), vscale(e2, Math.sin(th))));
  const thetaOf = l => { const Ke1 = m3.v(K, e1), Ke2 = m3.v(K, e2), a = vdot(l, Ke1), b = vdot(l, Ke2); return ((Math.atan2(-a, b) % Math.PI) + Math.PI) % Math.PI; };
  const hor = S.map((s, k) => !V.inl[k] && (ang[k] < 50 || ang[k] > 130));
  const th = S.map(s => thetaOf(pvLine(s)));
  const ok = S.map((s, k) => hor[k] && PV.dev(s, vpOf(th[k])) < 1.0);
  // направления стен: пики гистограммы направлений на горизонте
  const nb = 180, hist = new Float64Array(nb);
  S.forEach((s, k) => { if (ok[k]) hist[Math.floor(th[k] / Math.PI * nb) % nb] += pvLen(s); });
  const hs = new Float64Array(nb); for (let i = 0; i < nb; i++) for (let d = -2; d <= 2; d++) hs[i] += hist[(i + d + nb) % nb] / 5;
  const order = [...hs.keys()].sort((a, b) => hs[b] - hs[a]), peaks = [], mx = hs[order[0]];
  for (const k of order) { if (hs[k] < 0.08 * mx) break; if (peaks.every(p => Math.min(Math.abs(k - p), nb - Math.abs(k - p)) > 6)) peaks.push(k); if (peaks.length >= 5) break; }
  const dirs = peaks.map(k => {
    let re = 0, im = 0, wt = 0; const sel = S.map((s, i) => ok[i] && Math.abs((((th[i] / Math.PI * nb - k) + nb / 2) % nb + nb) % nb - nb / 2) < 3);
    S.forEach((s, i) => { if (sel[i]) { const l = pvLen(s); re += l * Math.cos(2 * th[i]); im += l * Math.sin(2 * th[i]); wt += l; } });
    return { t: ((Math.atan2(im, re) / 2) % Math.PI + Math.PI) % Math.PI, sel, wt };
  });
  return { S, gx, gy, W, H, vv: V.vp, iv: V.inl, f, K, e1, e2, dirs, th, ok, vpOf };
};
const pvThrough = (vp, p) => pvCross([p[0], p[1], 1], vp);
const pvMeet = (l1, l2) => { const q = pvCross(l1, l2); return [q[0] / q[2], q[1] / q[2]]; };
// сила края вдоль прямой l на участке [a,b] (медиана градиента поперёк)
PV.edgeScore = function (A, l, a, b) {
  const n = Math.hypot(l[0], l[1]), nx = l[0] / n, ny = l[1] / n, vals = [];
  for (let k = 0; k < 40; k++) {
    const t = 0.12 + 0.76 * k / 39; let px = a[0] * (1 - t) + b[0] * t, py = a[1] * (1 - t) + b[1] * t;
    const d = (px * l[0] + py * l[1] + l[2]) / n; px -= d * nx; py -= d * ny;
    const x = Math.min(A.W - 1, Math.max(0, px | 0)), y = Math.min(A.H - 1, Math.max(0, py | 0)), p = y * A.W + x;
    vals.push(Math.abs(A.gx[p] * nx + A.gy[p] * ny));
  }
  vals.sort((u, v) => u - v); return vals[vals.length >> 1];
};
// подгонка окна: верх/низ — через горизонтальную точку схода плоскости, бока — через вертикальную
PV.fitWindow = function (A, q, Hvp, rad = 12) {
  const edges = [], sc = []; let tot = 0;
  for (const [i, j, vp] of [[0, 1, Hvp], [3, 2, Hvp], [0, 3, A.vv], [1, 2, A.vv]]) {
    const a = q[i], b = q[j], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const nn = Math.hypot(nx, ny); nx /= nn; ny /= nn;
    let best = null;
    for (let o = -rad; o <= rad; o += 0.5) { const l = pvThrough(vp, [mid[0] + nx * o, mid[1] + ny * o]), s = PV.edgeScore(A, l, a, b); if (!best || s > best.s) best = { s, l }; }
    const ok = best.s > 25; edges.push(ok ? best.l : pvThrough(vp, mid)); sc.push(ok ? best.s : 0); tot += sc[sc.length - 1];
  }
  return { edges, tot, sc };
};
PV.corners = e => { const [top, bot, lef, rig] = e; return [pvMeet(top, lef), pvMeet(top, rig), pvMeet(bot, rig), pvMeet(bot, lef)]; };
// окно → своя плоскость (главные направления или собственная грань эркера по горизонталям рамы) → подгонка
PV.placeWindows = function (A, quads) {
  const S = A.S, res = [];
  for (const q of quads) {
    const xs = q.map(p => p[0]), ys = q.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const inside = S.map((s, k) => A.ok[k] && (s[0] + s[2]) / 2 > x0 && (s[0] + s[2]) / 2 < x1 && (s[1] + s[3]) / 2 > y0 - 8 && (s[1] + s[3]) / 2 < y1 + 8);
    const cands = A.dirs.map(d => d.t);
    S.forEach((s, k) => { if (inside[k] && cands.every(t => Math.abs((((A.th[k] - t) + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2) > 6 * Math.PI / 180)) cands.push(A.th[k]); });
    let best = null;
    cands.forEach((t, k) => {
      const Hvp = A.vpOf(t); let vote = 0;
      S.forEach((s, i) => { if (inside[i] && Math.abs((((A.th[i] - t) + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2) < 4 * Math.PI / 180) vote += pvLen(s); });
      const fw = PV.fitWindow(A, q, Hvp), tot = fw.tot + 2 * vote;
      if (!best || tot > best.tot) best = { tot, e: fw.edges, sc: fw.sc, Hvp, k };
    });
    res.push({ q, e: best.e, sc: best.sc, H: best.Hvp, k: best.k, main: best.k < A.dirs.length });
  }
  // окна одного ряда на соседних гранях — общий верх и низ (линия переходит через ребро)
  res.sort((a, b) => PV.corners(a.e).reduce((s, p) => s + p[0], 0) - PV.corners(b.e).reduce((s, p) => s + p[0], 0));
  for (let i = 0; i + 1 < res.length; i++) {
    const A1 = res[i], B1 = res[i + 1], qa = PV.corners(A1.e), qb = PV.corners(B1.e);
    const ya = qa.map(p => p[1]), yb = qb.map(p => p[1]), ov = Math.min(Math.max(...ya), Math.max(...yb)) - Math.max(Math.min(...ya), Math.min(...yb));
    if (ov < 0.4 * Math.min(Math.max(...ya) - Math.min(...ya), Math.max(...yb) - Math.min(...yb))) continue;
    const xm = [(qa[1][0] + qa[2][0] + qb[0][0] + qb[3][0]) / 4, (qa[1][1] + qa[2][1] + qb[0][1] + qb[3][1]) / 4], vl = pvThrough(A.vv, xm);
    for (const k of [0, 1]) {
      if (B1.sc[k] < 0.7 * A1.sc[k]) B1.e[k] = pvThrough(B1.H, pvMeet(A1.e[k], vl));
      else if (A1.sc[k] < 0.7 * B1.sc[k]) A1.e[k] = pvThrough(A1.H, pvMeet(B1.e[k], vl));
    }
  }
  return res.map(r => ({ pts: PV.corners(r.e), main: r.main, k: r.k }));
};
// нейросеть окон (углы): тепловые карты 4 углов + центра → окна
PV.decodeWindows = function (hm, tag, Wd, Hd, k, thrC = 0.3) {
  const C = 96, N = C * C, peaks = (ch, thr) => {
    const out = [];
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const v = hm[ch * N + y * C + x]; if (v <= thr) continue; let m = true;
      for (let dy = -2; dy <= 2 && m; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= C || xx >= C) continue; if (hm[ch * N + yy * C + xx] > v) { m = false; break; } }
      if (m) out.push([x, y, v]);
    }
    return out;
  };
  const P = [0, 1, 2, 3].map(ch => peaks(ch, 0.1)), dirs = [[-1, -1], [-1, 1], [1, 1], [1, -1]], wins = [];
  for (const [cx, cy] of peaks(4, thrC)) {
    const q = [];
    for (let ch = 0; ch < 4; ch++) {
      const cand = P[ch].filter(([x, y]) => (x - cx) * dirs[ch][0] > 0 && (y - cy) * dirs[ch][1] > 0 && Math.abs(x - cx) < 60 && Math.abs(y - cy) < 60);
      if (!cand.length) break;
      cand.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy)); q.push(cand[0]);
    }
    if (q.length === 4) wins.push([q[0], q[3], q[2], q[1]].map(([x, y]) => [(x * 4 + 2) / k, (y * 4 + 2) / k]));   // по часовой: ЛВ, ПВ, ПН, ЛН
  }
  return wins;
};
// правило двери: проём нижнего этажа, низ которого заметно ниже подоконников окон этого этажа (доходит к полу)
PV.doorRule = function (items, Hh) {
  // этаж — окна, перекрывающиеся по высоте; дверь — проём этажа, низ которого заметно ниже низа остальных (доходит к полу)
  const bot = it => Math.max(...it.pts.map(p => p[1])), top = it => Math.min(...it.pts.map(p => p[1]));
  for (const it of items) {
    const floor = items.filter(o => Math.min(bot(o), bot(it)) - Math.max(top(o), top(it)) > 0.5 * Math.min(bot(o) - top(o), bot(it) - top(it)));
    if (floor.length < 3) continue;
    // линия низа остальных проёмов этажа (в перспективе она наклонена) — сравниваем с ней, а не с горизонталью кадра
    const pts = floor.filter(o => o !== it).map(o => { const q = o.pts; return [(q[2][0] + q[3][0]) / 2, (q[2][1] + q[3][1]) / 2]; });
    const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
    let sxx = 0, sxy = 0; for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); }
    const k = sxx > 1e-6 ? sxy / sxx : 0, cx = (it.pts[2][0] + it.pts[3][0]) / 2, line = my + k * (cx - mx), h = bot(it) - top(it);
    const w = Math.hypot(it.pts[1][0] - it.pts[0][0], it.pts[1][1] - it.pts[0][1]);
    if (bot(it) > line + 0.3 * h && top(it) > Hh * 0.3 && h > 1.7 * w) it.type = "door";   // дверь — высокая и узкая
  }
};
