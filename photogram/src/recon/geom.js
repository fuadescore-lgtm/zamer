/* ---------- геометрия камер: эпиполярная проверка, P3P, триангуляция, уточнение ---------- */
// камера: { R: [9], t: [3] }, K: { f, cx, cy }; X_cam = R·X + t
const camC = c => vscale(m3.Tv(c.R, c.t), -1);
function projK(K, c, X) { K = c.K || K; const p = vadd(m3.v(c.R, X), c.t); return p[2] > 1e-6 ? [K.f * p[0] / p[2] + K.cx, K.f * p[1] / p[2] + K.cy, p[2]] : null; }
const bearing = (K, p) => vnorm([(p[0] - K.cx) / K.f, (p[1] - K.cy) / K.f, 1]);

// существенная матрица по 8 точкам (нормированные координаты), RANSAC с расстоянием Сэмпсона
function essentialRansac(K, pa, pb, thrPx = 1.5, iters = 600, rng = laRng(7)) {
  const n = pa.length; if (n < 8) return null;
  const na = pa.map(p => [(p[0] - K.cx) / K.f, (p[1] - K.cy) / K.f]), nb = pb.map(p => [(p[0] - K.cx) / K.f, (p[1] - K.cy) / K.f]);
  const thr = (thrPx / K.f) ** 2;
  const fit = idx => {
    const E0 = laNull(idx.map(i => { const [x1, y1] = na[i], [x2, y2] = nb[i]; return [x2 * x1, x2 * y1, x2, y2 * x1, y2 * y1, y2, x1, y1, 1]; }));
    const d = svd3(E0), s = (d.s[0] + d.s[1]) / 2;   // сингулярные числа (s, s, 0)
    return m3.mul(m3.mul(d.U, [s, 0, 0, 0, s, 0, 0, 0, 0]), m3.T(d.V));
  };
  const err = (E, i) => {
    const x1 = [na[i][0], na[i][1], 1], x2 = [nb[i][0], nb[i][1], 1], Ex1 = m3.v(E, x1), Etx2 = m3.Tv(E, x2), v = vdot(x2, Ex1);
    return v * v / (Ex1[0] ** 2 + Ex1[1] ** 2 + Etx2[0] ** 2 + Etx2[1] ** 2);
  };
  let best = null, bestN = 0;
  for (let it = 0; it < iters; it++) {
    const s = new Set(); while (s.size < 8) s.add(Math.floor(rng() * n));
    const E = fit([...s]); let c = 0; for (let i = 0; i < n; i++) if (err(E, i) < thr) c++;
    if (c > bestN) { bestN = c; best = E; if (c > 0.9 * n) break; }
  }
  if (!best) return null;
  let inl = []; for (let i = 0; i < n; i++) if (err(best, i) < thr) inl.push(i);
  if (inl.length >= 8) { const E2 = fit(inl), inl2 = []; for (let i = 0; i < n; i++) if (err(E2, i) < thr) inl2.push(i); if (inl2.length >= inl.length) inl = inl2; }
  return inl;
}

// корни многочлена 4-й степени (Дюран — Кернер), только вещественные
function quarticRoots(c) {   // c[0] x^4 + ... + c[4]
  const a = c.map(v => v / c[0]); let z = [[0.4, 0.9], [-0.65, 0.72], [0.31, -0.5], [-0.9, -0.3]].map(p => [p[0] * 2, p[1] * 2]);
  const ev = (re, im) => { let r = 1, i = 0; for (let k = 1; k <= 4; k++) { const nr = r * re - i * im + a[k], ni = r * im + i * re; r = nr; i = ni; } return [r, i]; };
  for (let it = 0; it < 200; it++) {
    let mv = 0;
    z = z.map((zi, k) => {
      let [nr, ni] = ev(zi[0], zi[1]), dr = 1, di = 0;
      for (let j = 0; j < 4; j++) if (j !== k) { const er = zi[0] - z[j][0], ei = zi[1] - z[j][1], tr = dr * er - di * ei, ti = dr * ei + di * er; dr = tr; di = ti; }
      const den = dr * dr + di * di || 1e-30, qr = (nr * dr + ni * di) / den, qi = (ni * dr - nr * di) / den; mv = Math.max(mv, Math.hypot(qr, qi));
      return [zi[0] - qr, zi[1] - qi];
    });
    if (mv < 1e-14) break;
  }
  return z.filter(r => Math.abs(r[1]) < 1e-6 * (1 + Math.abs(r[0]))).map(r => {
    let x = r[0]; for (let k = 0; k < 3; k++) { let f = 1, d = 0; for (let j = 1; j <= 4; j++) { d = d * x + f; f = f * x + a[j]; } if (Math.abs(d) > 1e-14) x -= f / d; } return x; });
}
// поворот и сдвиг по трём (и более) парам точек: Q = R·P + t (кватернион Хорна)
function absOrient(P, Q) {
  const n = P.length, mp = [0, 0, 0], mq = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { mp[k] += P[i][k] / n; mq[k] += Q[i][k] / n; }
  const S = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) { const a = vsub(P[i], mp), b = vsub(Q[i], mq); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r * 3 + c] += a[r] * b[c]; }
  const [Sxx, Sxy, Sxz, Syx, Syy, Syz, Szx, Szy, Szz] = S;
  const N = [[Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx], [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz], [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy], [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz]];
  const [w, x, y, z] = laEig(N).vec[3];
  const R = [w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y), 2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x), 2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z];
  return { R, t: vsub(mq, m3.v(R, mp)) };
}
// P3P (Грунерт): единичные лучи j[3], точки мира P[3] → варианты камер
function p3p(j, P) {
  const a = vlen(vsub(P[1], P[2])), b = vlen(vsub(P[0], P[2])), c = vlen(vsub(P[0], P[1]));
  if (a < 1e-9 || b < 1e-9 || c < 1e-9) return [];
  const ca = vdot(j[1], j[2]), cb = vdot(j[0], j[2]), cg = vdot(j[0], j[1]);
  const a2 = a * a, b2 = b * b, c2 = c * c, q = (a2 - c2) / b2, p = (a2 + c2) / b2;
  const A4 = (q - 1) ** 2 - 4 * c2 / b2 * ca * ca;
  const A3 = 4 * (q * (1 - q) * cb - (1 - p) * ca * cg + 2 * c2 / b2 * ca * ca * cb);
  const A2 = 2 * (q * q - 1 + 2 * q * q * cb * cb + 2 * (b2 - c2) / b2 * ca * ca - 4 * p * ca * cb * cg + 2 * (b2 - a2) / b2 * cg * cg);
  const A1 = 4 * (-q * (1 + q) * cb + 2 * a2 / b2 * cg * cg * cb - (1 - p) * ca * cg);
  const A0 = (1 + q) ** 2 - 4 * a2 / b2 * cg * cg;
  if (Math.abs(A4) < 1e-14) return [];
  const out = [];
  for (const v of quarticRoots([A4, A3, A2, A1, A0])) {
    if (v <= 0) continue;
    const den = 2 * (cg - v * ca); if (Math.abs(den) < 1e-12) continue;
    const u = ((-1 + q) * v * v - 2 * q * cb * v + 1 + q) / den; if (u <= 0) continue;
    const s1sq = c2 / (1 + u * u - 2 * u * cg); if (!(s1sq > 0)) continue;
    const s1 = Math.sqrt(s1sq), s2 = u * s1, s3 = v * s1;
    out.push(absOrient(P, [vscale(j[0], s1), vscale(j[1], s2), vscale(j[2], s3)]));
  }
  return out;
}
// уточнение камеры по точкам (Гаусс — Ньютон с весами Хьюбера)
function refineCam(K, cam, X, x, iters = 8, huber = 2) {
  K = cam.K || K; let R = cam.R.slice(), t = cam.t.slice();
  for (let it = 0; it < iters; it++) {
    const JtJ = Array.from({ length: 6 }, () => new Array(6).fill(0)), Jtr = new Array(6).fill(0);
    for (let i = 0; i < X.length; i++) {
      const RX = m3.v(R, X[i]), p = vadd(RX, t); if (p[2] < 1e-6) continue;
      const iz = 1 / p[2], u = K.f * p[0] * iz + K.cx, v = K.f * p[1] * iz + K.cy, ru = u - x[i][0], rv = v - x[i][1];
      const e = Math.hypot(ru, rv), wgt = e < huber ? 1 : huber / e;
      const du = [K.f * iz, 0, -K.f * p[0] * iz * iz], dv = [0, K.f * iz, -K.f * p[1] * iz * iz];
      // dp = ω × RX, dp/dt = I
      const cr = d => [RX[1] * d[2] - RX[2] * d[1], RX[2] * d[0] - RX[0] * d[2], RX[0] * d[1] - RX[1] * d[0]];   // ∂u/∂ω = RX × ∂u/∂p
      const Ju = [...cr(du), ...du], Jv = [...cr(dv), ...dv];
      for (let a = 0; a < 6; a++) { Jtr[a] += wgt * (Ju[a] * ru + Jv[a] * rv); for (let b = 0; b < 6; b++) JtJ[a][b] += wgt * (Ju[a] * Ju[b] + Jv[a] * Jv[b]); }
    }
    for (let a = 0; a < 6; a++) JtJ[a][a] *= 1.0001;
    const d = laSolve(JtJ, Jtr.map(v => -v)); if (!d) break;
    R = orthoR(m3.mul(rodR([d[0], d[1], d[2]]), R)); t = vadd(t, [d[3], d[4], d[5]]);
    if (Math.hypot(...d) < 1e-9) break;
  }
  return { R, t, K };
}
function pnpRansac(K, X, x, thrPx = 3, iters = 700, rng = laRng(11)) {
  const n = X.length; if (n < 6) return null;
  const J = x.map(p => bearing(K, p));
  const count = c => { let k = 0; for (let i = 0; i < n; i++) { const q = projK(K, c, X[i]); if (q && Math.hypot(q[0] - x[i][0], q[1] - x[i][1]) < thrPx) k++; } return k; };
  let best = null, bestN = 0;
  for (let it = 0; it < iters; it++) {
    const s = new Set(); while (s.size < 3) s.add(Math.floor(rng() * n)); const id = [...s];
    for (const c of p3p(id.map(i => J[i]), id.map(i => X[i]))) { c.K = K; const k = count(c); if (k > bestN) { bestN = k; best = c; } }
    if (bestN > 0.95 * n) break;
  }
  if (!best || bestN < 6) return null;
  let inl = [];
  for (let pass = 0; pass < 3; pass++) {
    inl = []; for (let i = 0; i < n; i++) { const q = projK(K, best, X[i]); if (q && Math.hypot(q[0] - x[i][0], q[1] - x[i][1]) < thrPx) inl.push(i); }
    best = refineCam(K, best, inl.map(i => X[i]), inl.map(i => x[i]));
  }
  inl = []; for (let i = 0; i < n; i++) { const q = projK(K, best, X[i]); if (q && Math.hypot(q[0] - x[i][0], q[1] - x[i][1]) < thrPx) inl.push(i); }
  return { cam: best, inl };
}
// триангуляция по двум и более видам (линейная, затем Гаусс — Ньютон)
function triangulate(K, cams, xs) {
  const rows = [];
  cams.forEach((c, k) => {
    const P = [...c.R.slice(0, 3), c.t[0], ...c.R.slice(3, 6), c.t[1], ...c.R.slice(6, 9), c.t[2]];
    const Kc = c.K || K, u = (xs[k][0] - Kc.cx) / Kc.f, v = (xs[k][1] - Kc.cy) / Kc.f;
    rows.push([0, 1, 2, 3].map(i => u * P[8 + i] - P[i]), [0, 1, 2, 3].map(i => v * P[8 + i] - P[4 + i]));
  });
  const h = laNull(rows); if (Math.abs(h[3]) < 1e-12) return null;
  return refinePoint(K, cams, xs, [h[0] / h[3], h[1] / h[3], h[2] / h[3]]);
}
function refinePoint(K, cams, xs, X, iters = 5) {
  for (let it = 0; it < iters; it++) {
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], g = [0, 0, 0];
    for (let k = 0; k < cams.length; k++) {
      const c = cams[k], Kc = c.K || K, p = vadd(m3.v(c.R, X), c.t); if (p[2] < 1e-6) return X;
      const iz = 1 / p[2], ru = Kc.f * p[0] * iz + Kc.cx - xs[k][0], rv = Kc.f * p[1] * iz + Kc.cy - xs[k][1];
      const du = [Kc.f * iz, 0, -Kc.f * p[0] * iz * iz], dv = [0, Kc.f * iz, -Kc.f * p[1] * iz * iz];
      const Ju = m3.Tv(c.R, du), Jv = m3.Tv(c.R, dv);
      for (let a = 0; a < 3; a++) { g[a] += Ju[a] * ru + Jv[a] * rv; for (let b = 0; b < 3; b++) A[a][b] += Ju[a] * Ju[b] + Jv[a] * Jv[b]; }
    }
    const d = laSolve(A, g.map(v => -v)); if (!d) break;
    X = vadd(X, d); if (vlen(d) < 1e-6) break;
  }
  return X;
}
// поза камеры по гомографии «фото → плоскость стены (t, z), мм»; мир: x вдоль стены, y внутрь дома, z вверх
function poseFromWallH(K, Hm) {
  const Hi = laInv3(Hm), Ki = [1 / K.f, 0, -K.cx / K.f, 0, 1 / K.f, -K.cy / K.f, 0, 0, 1], B = m3.mul(Ki, Hi);
  let r1 = [B[0], B[3], B[6]], r2 = [B[1], B[4], B[7]], t = [B[2], B[5], B[8]];
  const s = 2 / (vlen(r1) + vlen(r2)); r1 = vscale(r1, s); r2 = vscale(r2, s); t = vscale(t, s);
  if (t[2] < 0) { r1 = vscale(r1, -1); r2 = vscale(r2, -1); t = vscale(t, -1); }
  const r3 = vcross(r2, r1);
  return { R: orthoR([r1[0], r3[0], r2[0], r1[1], r3[1], r2[1], r1[2], r3[2], r2[2]]), t, K };
}
// проверка совпадений плоскостями: дом состоит из плоскостей (стены, скаты, земля) — последовательный RANSAC гомографий
function planesRansac(pa, pb, thrPx = 2, minIn = 12, maxPlanes = 4, rng = laRng(5)) {
  const norm = P => { let mx = 0, my = 0; P.forEach(p => { mx += p[0]; my += p[1]; }); mx /= P.length; my /= P.length; let d = 0; P.forEach(p => d += Math.hypot(p[0] - mx, p[1] - my)); const s = Math.SQRT2 / (d / P.length || 1); return { f: p => [(p[0] - mx) * s, (p[1] - my) * s], T: [s, 0, -mx * s, 0, s, -my * s, 0, 0, 1] }; };
  let idx = pa.map((_, i) => i); const keep = [], groups = [];
  const err = (H, i) => { const q = laApplyH(H, pa[i]); return Math.hypot(q[0] - pb[i][0], q[1] - pb[i][1]); };
  for (let pl = 0; pl < maxPlanes && idx.length >= minIn; pl++) {
    const Na = norm(idx.map(i => pa[i])), Nb = norm(idx.map(i => pb[i]));
    const fit = ids => { const Hn = laHomog(ids.map(i => Na.f(pa[i])), ids.map(i => Nb.f(pb[i]))); return m3.mul(m3.mul(laInv3(Nb.T), Hn), Na.T); };
    let best = null, bestN = 0;
    for (let it = 0; it < 400; it++) {
      const s = new Set(); while (s.size < 4) s.add(idx[Math.floor(rng() * idx.length)]);
      const H = fit([...s]); if (!H.every(Number.isFinite)) continue;
      let c = 0; for (const i of idx) if (err(H, i) < thrPx) c++;
      if (c > bestN) { bestN = c; best = H; }
    }
    if (!best || bestN < minIn) break;
    let inl = idx.filter(i => err(best, i) < thrPx);
    const H2 = fit(inl), inl2 = idx.filter(i => err(H2, i) < thrPx); if (inl2.length >= inl.length) inl = inl2;
    keep.push(...inl); groups.push(inl); const S = new Set(inl); idx = idx.filter(i => !S.has(i));
  }
  keep.groups = groups; return keep;
}
// плоскость по точкам (RANSAC + МНК): n·X = c
function fitPlaneR(P, thr = 30, rng = laRng(9)) {
  if (P.length < 3) return null;
  let best = null;
  for (let it = 0; it < 80; it++) {
    const a = P[Math.floor(rng() * P.length)], b = P[Math.floor(rng() * P.length)], c = P[Math.floor(rng() * P.length)];
    const n = vcross(vsub(b, a), vsub(c, a)), l = vlen(n); if (l < 1e-6) continue;
    const nn = vscale(n, 1 / l), cc = vdot(nn, a), inl = P.filter(p => Math.abs(vdot(nn, p) - cc) < thr);
    if (!best || inl.length > best.length) best = inl;
  }
  if (!best || best.length < Math.max(5, P.length * 0.6)) return null;
  const m = [0, 1, 2].map(k => best.reduce((s, p) => s + p[k], 0) / best.length);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (const p of best) { const d = vsub(p, m); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  const e = laEig(C), n = e.vec[0];
  if (Math.sqrt(e.val[0] / best.length) > thr) return null;
  // точки не на одной прямой (иначе плоскость не определена)
  if (e.val[1] / best.length < 200 * 200) return null;
  return { n, c: vdot(n, m) };
}
