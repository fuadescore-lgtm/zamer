/* ---------- SIFT: поиск характерных точек и их описаний (Lowe 2004, по схеме OpenCV) ---------- */
function gaussBlur(src, w, h, sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3.5)), k = new Float32Array(2 * r + 1); let s = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      if (x >= r && x < w - r) { for (let i = -r, p = row + x - r; i <= r; i++, p++) acc += src[p] * k[i + r]; }
      else for (let i = -r; i <= r; i++) { let xx = x + i; xx = xx < 0 ? -xx - 1 : xx >= w ? 2 * w - xx - 1 : xx; acc += src[row + xx] * k[i + r]; }
      tmp[row + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      if (y >= r && y < h - r) { for (let i = -r, p = (y - r) * w + x; i <= r; i++, p += w) acc += tmp[p] * k[i + r]; }
      else for (let i = -r; i <= r; i++) { let yy = y + i; yy = yy < 0 ? -yy - 1 : yy >= h ? 2 * h - yy - 1 : yy; acc += tmp[yy * w + x] * k[i + r]; }
      out[y * w + x] = acc;
    }
  }
  return out;
}
function siftDetect(gray, W, H, maxN = 1500, CT = 0.04, up = false) {
  const S = 3, SIG = 1.6, ER = 10, D = 4, NB = 8;
  let sc = 1;
  if (up) {   // удвоение (как в OpenCV): больше мелких точек
    const w2 = W * 2, h2 = H * 2, g2 = new Float32Array(w2 * h2);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const fx = Math.min(W - 1.001, x / 2), fy = Math.min(H - 1.001, y / 2), x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0, p = y0 * W + x0;
      g2[y * w2 + x] = (gray[p] * (1 - ax) + gray[p + 1] * ax) * (1 - ay) + (gray[p + W] * (1 - ax) + gray[p + W + 1] * ax) * ay; }
    gray = g2; W = w2; H = h2; sc = 0.5;
  }
  const nOct = Math.max(1, Math.floor(Math.log2(Math.min(W, H) / 16)));
  const kk = Math.pow(2, 1 / S), inc = [0];
  for (let i = 1; i < S + 3; i++) { const p = Math.pow(kk, i - 1) * SIG, t = p * kk; inc.push(Math.sqrt(t * t - p * p)); }
  const kps = [];
  let base = gaussBlur(gray, W, H, Math.sqrt(SIG * SIG - (up ? 1 : 0.25))), w = W, h = H;
  for (let o = 0; o < nOct; o++) {
    const G = [base]; for (let i = 1; i < S + 3; i++) G.push(gaussBlur(G[i - 1], w, h, inc[i]));
    const DG = []; for (let i = 0; i < S + 2; i++) { const d = new Float32Array(w * h), a = G[i + 1], b = G[i]; for (let p = 0; p < d.length; p++) d[p] = a[p] - b[p]; DG.push(d); }
    const thr0 = 0.5 * CT / S / 1, B = 5;
    for (let l = 1; l <= S; l++) {
      const d0 = DG[l - 1], d1 = DG[l], d2 = DG[l + 1];
      for (let y = B; y < h - B; y++) for (let x = B; x < w - B; x++) {
        const p = y * w + x, v = d1[p];
        if (Math.abs(v) <= thr0 * 0.6) continue;
        let ext = true;
        if (v > 0) {
          for (let dy = -1; dy <= 1 && ext; dy++) for (let dx = -1; dx <= 1; dx++) { const q = p + dy * w + dx; if (d0[q] >= v || d2[q] >= v || (q !== p && d1[q] >= v)) { ext = false; break; } }
        } else {
          for (let dy = -1; dy <= 1 && ext; dy++) for (let dx = -1; dx <= 1; dx++) { const q = p + dy * w + dx; if (d0[q] <= v || d2[q] <= v || (q !== p && d1[q] <= v)) { ext = false; break; } }
        }
        if (!ext) continue;
        // уточнение положения (квадратичная аппроксимация)
        let xi = x, yi = y, li = l, X = null, ok = false;
        for (let it = 0; it < 5; it++) {
          const a = DG[li - 1], b = DG[li], c = DG[li + 1], q = yi * w + xi;
          const dx = (b[q + 1] - b[q - 1]) / 2, dy = (b[q + w] - b[q - w]) / 2, ds = (c[q] - a[q]) / 2;
          const v2 = b[q] * 2, dxx = b[q + 1] + b[q - 1] - v2, dyy = b[q + w] + b[q - w] - v2, dss = c[q] + a[q] - v2;
          const dxy = (b[q + w + 1] - b[q + w - 1] - b[q - w + 1] + b[q - w - 1]) / 4, dxs = (c[q + 1] - c[q - 1] - a[q + 1] + a[q - 1]) / 4, dys = (c[q + w] - c[q - w] - a[q + w] + a[q - w]) / 4;
          X = laSolve([[dxx, dxy, dxs], [dxy, dyy, dys], [dxs, dys, dss]], [-dx, -dy, -ds]);
          if (!X) break;
          if (Math.abs(X[0]) < 0.5 && Math.abs(X[1]) < 0.5 && Math.abs(X[2]) < 0.5) { ok = true; X.push(b[q] + 0.5 * (dx * X[0] + dy * X[1] + ds * X[2]), dxx, dyy, dxy); break; }
          xi += Math.round(X[0]); yi += Math.round(X[1]); li += Math.round(X[2]);
          if (li < 1 || li > S || xi < B || xi >= w - B || yi < B || yi >= h - B) break;
        }
        if (!ok) continue;
        const contr = X[3]; if (Math.abs(contr) * S < CT) continue;
        const tr = X[4] + X[5], det = X[4] * X[5] - X[6] * X[6]; if (det <= 0 || tr * tr * ER >= (ER + 1) * (ER + 1) * det) continue;
        const layer = li + X[2], sclOct = SIG * Math.pow(2, layer / S);
        kps.push({ o, l: li, xo: xi + X[0], yo: yi + X[1], sclOct, resp: Math.abs(contr), x: (xi + X[0]) * (1 << o) * sc, y: (yi + X[1]) * (1 << o) * sc, w, h, G });
      }
    }
    // следующая октава: G[S], каждый второй пиксель
    if (o < nOct - 1) { const nw = w >> 1, nh = h >> 1, nb = new Float32Array(nw * nh), g = G[S]; for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) nb[y * nw + x] = g[(2 * y) * w + 2 * x]; base = nb; w = nw; h = nh; }
  }
  // самые контрастные (до ориентаций, с запасом)
  kps.sort((a, b) => b.resp - a.resp); kps.length = Math.min(kps.length, Math.round(maxN * 1.15));
  const out = [];
  for (const kp of kps) {
    const img = kp.G[kp.l], w = kp.w, h = kp.h, cx = Math.round(kp.xo), cy = Math.round(kp.yo);
    // ориентация
    const rad = Math.round(3 * 1.5 * kp.sclOct), es = -1 / (2 * (1.5 * kp.sclOct) ** 2), hist = new Float64Array(36);
    for (let i = -rad; i <= rad; i++) { const y = cy + i; if (y <= 0 || y >= h - 1) continue;
      for (let j = -rad; j <= rad; j++) { const x = cx + j; if (x <= 0 || x >= w - 1) continue;
        const dx = img[y * w + x + 1] - img[y * w + x - 1], dy = img[(y - 1) * w + x] - img[(y + 1) * w + x];
        let a = Math.atan2(dy, dx) * 180 / Math.PI; if (a < 0) a += 360;
        let bin = Math.round(a * 36 / 360); if (bin >= 36) bin -= 36;
        hist[bin] += Math.exp((i * i + j * j) * es) * Math.hypot(dx, dy); } }
    const sm = new Float64Array(36);
    for (let i = 0; i < 36; i++) sm[i] = (hist[(i + 34) % 36] + hist[(i + 2) % 36]) / 16 + (hist[(i + 35) % 36] + hist[(i + 1) % 36]) * 4 / 16 + hist[i] * 6 / 16;
    const mx = Math.max(...sm);
    for (let i = 0; i < 36; i++) {
      const L = sm[(i + 35) % 36], R = sm[(i + 1) % 36];
      if (sm[i] > L && sm[i] > R && sm[i] >= 0.8 * mx) {
        let bin = i + 0.5 * (L - R) / (L - 2 * sm[i] + R); bin = bin < 0 ? 36 + bin : bin >= 36 ? bin - 36 : bin;
        out.push({ ...kp, ori: 360 / 36 * bin });
      }
    }
  }
  out.sort((a, b) => b.resp - a.resp); out.length = Math.min(out.length, maxN);
  // описатели 4×4×8
  const n = out.length, desc = new Uint8Array(n * 128), pts = new Float32Array(n * 2), dhist = new Float64Array((D + 2) * (D + 2) * (NB + 2));
  out.forEach((kp, t) => {
    const img = kp.G[kp.l], w = kp.w, h = kp.h, cx = Math.round(kp.xo), cy = Math.round(kp.yo);
    const ori = kp.ori * Math.PI / 180, hw = 3 * kp.sclOct, cos_t = Math.cos(ori) / hw, sin_t = Math.sin(ori) / hw, bpr = NB / (2 * Math.PI), es = -1 / (D * D * 0.5);
    const rad = Math.min(Math.round(hw * Math.SQRT2 * (D + 1) * 0.5), Math.round(Math.hypot(w, h)));
    dhist.fill(0);
    for (let i = -rad; i <= rad; i++) for (let j = -rad; j <= rad; j++) {
      const c_rot = j * cos_t - i * sin_t, r_rot = j * sin_t + i * cos_t, rbin = r_rot + D / 2 - 0.5, cbin = c_rot + D / 2 - 0.5;
      const r = cy + i, c = cx + j;
      if (!(rbin > -1 && rbin < D && cbin > -1 && cbin < D && r > 0 && r < h - 1 && c > 0 && c < w - 1)) continue;
      const dx = img[r * w + c + 1] - img[r * w + c - 1], dy = img[(r - 1) * w + c] - img[(r + 1) * w + c];
      let obin = (Math.atan2(dy, dx) - ori) * bpr; obin = ((obin % NB) + NB) % NB;
      const mag = Math.hypot(dx, dy) * Math.exp((c_rot * c_rot + r_rot * r_rot) * es);
      const r0 = Math.floor(rbin), c0 = Math.floor(cbin), o0 = Math.floor(obin), rf = rbin - r0, cf = cbin - c0, of = obin - o0;
      const v_r1 = mag * rf, v_r0 = mag - v_r1, v_rc11 = v_r1 * cf, v_rc10 = v_r1 - v_rc11, v_rc01 = v_r0 * cf, v_rc00 = v_r0 - v_rc01;
      const v111 = v_rc11 * of, v110 = v_rc11 - v111, v101 = v_rc10 * of, v100 = v_rc10 - v101, v011 = v_rc01 * of, v010 = v_rc01 - v011, v001 = v_rc00 * of, v000 = v_rc00 - v001;
      const idx = ((r0 + 1) * (D + 2) + c0 + 1) * (NB + 2) + o0;
      dhist[idx] += v000; dhist[idx + 1] += v001; dhist[idx + NB + 2] += v010; dhist[idx + NB + 3] += v011;
      dhist[idx + (D + 2) * (NB + 2)] += v100; dhist[idx + (D + 2) * (NB + 2) + 1] += v101; dhist[idx + (D + 3) * (NB + 2)] += v110; dhist[idx + (D + 3) * (NB + 2) + 1] += v111;
    }
    const v = new Float64Array(128);
    for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) {
      const idx = ((i + 1) * (D + 2) + j + 1) * (NB + 2); dhist[idx] += dhist[idx + NB]; dhist[idx + 1] += dhist[idx + NB + 1];
      for (let k = 0; k < NB; k++) v[(i * D + j) * NB + k] = dhist[idx + k];
    }
    let nr = 0; for (let i = 0; i < 128; i++) nr += v[i] * v[i];
    const thr = Math.sqrt(nr) * 0.2; nr = 0;
    for (let i = 0; i < 128; i++) { v[i] = Math.min(v[i], thr); nr += v[i] * v[i]; }
    const sc = 512 / Math.max(Math.sqrt(nr), 1e-7);
    for (let i = 0; i < 128; i++) desc[t * 128 + i] = Math.min(255, Math.round(v[i] * sc));
    pts[2 * t] = kp.x; pts[2 * t + 1] = kp.y;
  });
  return { n, pts, desc };
}
// сопоставление: ближайший сосед с проверкой отношения (Lowe 0.75) — пары индексов [i, j]
function siftMatch(A, B, ratio = 0.75) {
  const out = [], da = A.desc, db = B.desc, r2 = ratio * ratio;
  for (let i = 0; i < A.n; i++) {
    let b1 = 1e18, b2 = 1e18, bj = -1; const oa = i * 128;
    for (let j = 0; j < B.n; j++) {
      let s = 0; const ob = j * 128;
      for (let k = 0; k < 128; k += 4) { const e0 = da[oa + k] - db[ob + k], e1 = da[oa + k + 1] - db[ob + k + 1], e2 = da[oa + k + 2] - db[ob + k + 2], e3 = da[oa + k + 3] - db[ob + k + 3]; s += e0 * e0 + e1 * e1 + e2 * e2 + e3 * e3; if (s >= b2) break; }
      if (s < b1) { b2 = b1; b1 = s; bj = j; } else if (s < b2) b2 = s;
    }
    if (bj >= 0 && b1 < r2 * b2) out.push([i, bj]);
  }
  return out;
}
