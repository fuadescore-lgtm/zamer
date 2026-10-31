/* ---------- сборка 3D по снимкам обхода: камеры и облако точек ---------- */
// imgs: { key: { gray: Float32Array, w, h } }, order: ключи по кругу обхода, ref: { key, pts: [ВЛ,ВП,НП,НЛ], W, H } — эталон-стена
async function reconstruct(imgs, order, ref, opt = {}) {
  const say = opt.progress || (() => {}), tick = () => new Promise(r => setTimeout(r, 0));
  const keys = order.filter(k => imgs[k]);
  // своя камера у каждого снимка (вертикальные и горизонтальные кадры): фокус ≈ 0,72 × длинная сторона
  const KK = {}; for (const k of keys) { const im = imgs[k]; KK[k] = { f: im.f || opt.f || 0.72 * Math.max(im.w, im.h), cx: im.w / 2, cy: im.h / 2 }; }
  const K = KK[ref.key];
  const F = {}, log = [];
  for (let i = 0; i < keys.length; i++) {
    say(`Поиск точек: снимок ${i + 1} из ${keys.length}`, i / keys.length * 0.45); await tick();
    const im = imgs[keys[i]], gray = im.gray || Float32Array.from(im.g8, v => v / 255); F[keys[i]] = siftDetect(gray, im.w, im.h, opt.nFeat || 2000, opt.ct || 0.02);
  }
  // пары соседних по обходу снимков (± ring)
  const ring = opt.ring || 2, pairs = [];
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = order.indexOf(keys[i]), b = order.indexOf(keys[j]), d = Math.min(Math.abs(a - b), order.length - Math.abs(a - b));
    if (d <= ring) pairs.push([keys[i], keys[j]]);
  }
  const M = [];
  for (let n = 0; n < pairs.length; n++) {
    const [a, b] = pairs[n]; say(`Сопоставление снимков: ${n + 1} из ${pairs.length}`, 0.45 + n / pairs.length * 0.3); await tick();
    const m = siftMatch(F[a], F[b], opt.ratio || 0.8); if (m.length < 16) continue;
    const pa = m.map(([i]) => [F[a].pts[2 * i], F[a].pts[2 * i + 1]]), pb = m.map(([, j]) => [F[b].pts[2 * j], F[b].pts[2 * j + 1]]);
    const inl = planesRansac(pa, pb, 2, 12); if (!inl || inl.length < 16) continue;
    M.push({ a, b, m: inl.map(i => m[i]), groups: inl.groups.map(g => g.map(i => m[i])) });
  }
  log.push("пары: " + M.map(p => p.a + "-" + p.b + ":" + p.m.length).join(" "));
  // треки (объединение совпадений)
  const par = new Map(), id = (k, i) => k + ":" + i;
  const find = x => { let r = x; while (par.has(r) && par.get(r) !== r) r = par.get(r); let y = x; while (par.has(y) && par.get(y) !== r) { const nx = par.get(y); par.set(y, r); y = nx; } return r; };
  for (const p of M) for (const [i, j] of p.m) { const ra = find(id(p.a, i)), rb = find(id(p.b, j)); if (!par.has(ra)) par.set(ra, ra); if (!par.has(rb)) par.set(rb, rb); if (ra !== rb) par.set(ra, rb); }
  const groups = new Map();
  for (const x of par.keys()) { const r = find(x); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(x); }
  const tracks = [], obs = new Map();   // obs: "key:i" → track
  for (const g of groups.values()) {
    const ks = g.map(s => s.slice(0, s.lastIndexOf(":"))); if (new Set(ks).size !== ks.length) continue;
    const t = tracks.length; tracks.push(g.map(s => { const c = s.lastIndexOf(":"); return [s.slice(0, c), +s.slice(c + 1)]; })); for (const s of g) obs.set(s, t);
  }
  const pt = (k, i) => [F[k].pts[2 * i], F[k].pts[2 * i + 1]];
  // опорный снимок: поза по эталону-стене, точки на стене — сразу в 3D
  const Hm = laHomog(ref.pts, [[0, ref.H], [ref.W, ref.H], [ref.W, 0], [0, 0]]);
  const cams = { [ref.key]: poseFromWallH(KK[ref.key], Hm) }, X = new Map();
  const inQuad = (p, q, m) => { for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], cr = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]), L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (cr / L < m) return false; } return true; };
  // знак обхода четырёхугольника (ВЛ→ВП→НП→НЛ по часовой в координатах фото → внутренняя сторона справа)
  const qs = (() => { let s = 0; for (let i = 0; i < 4; i++) { const a = ref.pts[i], b = ref.pts[(i + 1) % 4]; s += a[0] * b[1] - b[0] * a[1]; } return s > 0 ? ref.pts : ref.pts.slice().reverse(); })();
  for (let i = 0; i < F[ref.key].n; i++) {
    const t = obs.get(id(ref.key, i)); if (t === undefined) continue;
    const p = pt(ref.key, i); if (!inQuad(p, qs, 15)) continue;
    const q = laApplyH(Hm, p); X.set(t, [q[0], 0, q[1]]);
  }
  log.push("точек на эталонной стене: " + X.size);
  const reproj = (c, Xw, p) => { const q = projK(K, c, Xw); return q ? Math.hypot(q[0] - p[0], q[1] - p[1]) : 1e9; };
  const triangulateNew = () => {
    let n = 0;
    tracks.forEach((g, t) => {
      if (X.has(t)) return;
      const vs = g.filter(([k]) => cams[k]); if (vs.length < 2) return;
      let best = null;
      for (let a = 0; a < vs.length; a++) for (let b = a + 1; b < vs.length; b++) { const d = vlen(vsub(camC(cams[vs[a][0]]), camC(cams[vs[b][0]]))); if (!best || d > best[0]) best = [d, vs[a], vs[b]]; }
      const Xw = triangulate(K, [cams[best[1][0]], cams[best[2][0]]], [pt(...best[1]), pt(...best[2])]); if (!Xw) return;
      // угол между лучами не слишком мал
      const r1 = vnorm(vsub(Xw, camC(cams[best[1][0]]))), r2 = vnorm(vsub(Xw, camC(cams[best[2][0]])));
      if (vdot(r1, r2) > Math.cos(2 * Math.PI / 180)) return;
      if (reproj(cams[best[1][0]], Xw, pt(...best[1])) < 4 && reproj(cams[best[2][0]], Xw, pt(...best[2])) < 4 && vs.filter(([k, i]) => reproj(cams[k], Xw, pt(k, i)) < 4).length >= Math.max(2, Math.ceil(vs.length * 0.6))) { X.set(t, Xw); n++; }
    });
    return n;
  };
  const failed = new Set();
  while (true) {
    const links = k => {   // 2D–3D связи снимка k: известные точки + точки, достроенные по плоскостям из соседних привязанных снимков
      const L = new Map();
      for (let i = 0; i < F[k].n; i++) { const t = obs.get(id(k, i)); if (t !== undefined && X.has(t)) L.set(i, X.get(t)); }
      for (const pr of M) {
        const other = pr.a === k ? pr.b : pr.b === k ? pr.a : null; if (!other || !cams[other]) continue;
        const ia = pr.a === k ? 1 : 0;   // индекс снимка-соседа в паре совпадения
        for (const g of pr.groups) {
          const known = g.map(mm => { const t = obs.get(id(other, mm[ia])); return t !== undefined && X.has(t) ? X.get(t) : null; }).filter(Boolean);
          if (known.length < 6) continue;
          const pl = fitPlaneR(known); if (!pl) continue;
          const C = camC(cams[other]);
          for (const mm of g) {
            const ik = mm[1 - ia]; if (L.has(ik)) continue;
            const d = m3.Tv(cams[other].R, bearing(cams[other].K, pt(other, mm[ia]))), den = vdot(pl.n, d); if (Math.abs(den) < 0.05) continue;
            const s = (pl.c - vdot(pl.n, C)) / den; if (s <= 0) continue;
            L.set(ik, vadd(C, vscale(d, s)));
          }
        }
      }
      return L;
    };
    const cand = keys.filter(k => !cams[k] && !failed.has(k)).map(k => { const L = links(k); return [L.size, k, L]; }).sort((a, b) => b[0] - a[0]);
    if (!cand.length || cand[0][0] < 12) { if (cand.length) log.push("не удалось привязать: " + cand.map(c => c[1]).join(", ")); break; }
    const k = cand[0][1], Xs = [], xs = [];
    for (const [i, Xw] of cand[0][2]) { Xs.push(Xw); xs.push(pt(k, i)); }
    say(`Положение камеры: ${Object.keys(cams).length + 1} из ${keys.length}`, 0.75 + Object.keys(cams).length / keys.length * 0.15); await tick();
    const r = pnpRansac(KK[k], Xs, xs, 3);
    if (!r || r.inl.length < 12) { log.push("слабая привязка " + k); failed.add(k); continue; }
    cams[k] = r.cam; let nn = triangulateNew();
    if (Object.keys(cams).length > 2) { refineAll(8, 2); nn += triangulateNew(); }
    log.push(`${k}: связей ${cand[0][0]}, согласных ${r.inl.length}, новых точек ${nn}`);
  }
  // уточнение: попеременно камеры и точки (опорный снимок закреплён — он задаёт масштаб и оси)
  function refineAll(thr, rounds) {
    for (let round = 0; round < rounds; round++) {
      for (const [t, Xw] of X) {
        const vs = tracks[t].filter(([k, i]) => cams[k] && reproj(cams[k], Xw, pt(k, i)) < thr);
        if (vs.length < 2) { X.delete(t); continue; }
        X.set(t, refinePoint(K, vs.map(([k]) => cams[k]), vs.map(v => pt(...v)), Xw, 3));
      }
      for (const k of Object.keys(cams)) {
        if (k === ref.key) continue;
        const Xs = [], xs = [];
        for (let i = 0; i < F[k].n; i++) { const t = obs.get(id(k, i)); if (t !== undefined && X.has(t) && reproj(cams[k], X.get(t), pt(k, i)) < thr) { Xs.push(X.get(t)); xs.push(pt(k, i)); } }
        if (Xs.length >= 8) cams[k] = refineCam(K, cams[k], Xs, xs, 3, 1.5);
      }
    }
  }
  for (const thr of [12, 4, 2]) { say("Уточнение модели", 0.92); await tick(); refineAll(thr, opt.rounds || 6); triangulateNew(); }
  let se = 0, ne = 0;
  const points = [];
  for (const [t, Xw] of X) {
    const ob = tracks[t].filter(([k, i]) => cams[k] && reproj(cams[k], Xw, pt(k, i)) < 2);
    if (ob.length < 2) continue;
    for (const [k, i] of ob) { se += reproj(cams[k], Xw, pt(k, i)) ** 2; ne++; }
    points.push({ X: Xw, obs: ob });
  }
  log.push(`точек: ${points.length}, ошибка репроекции ${Math.sqrt(se / Math.max(1, ne)).toFixed(2)} px`);
  return { K, cams, points, log };
}
