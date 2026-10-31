/* ---------- линейная алгебра (малые матрицы) ---------- */
// собственные числа/векторы симметричной матрицы n×n (Якоби); матрица — массив строк
function laEig(Ain) {
  const n = Ain.length, A = Ain.map(r => r.slice()), V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  const idx = [...Array(n).keys()].sort((a, b) => A[a][a] - A[b][b]);   // по возрастанию
  return { val: idx.map(i => A[i][i]), vec: idx.map(i => V.map(r => r[i])) };
}
// наименьший собственный вектор AᵀA для строк A (решение однородной системы)
function laNull(rows) {
  const n = rows[0].length, M = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const r of rows) for (let i = 0; i < n; i++) { const ri = r[i]; if (!ri) continue; for (let j = i; j < n; j++) M[i][j] += ri * r[j]; }
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) M[i][j] = M[j][i];
  return laEig(M).vec[0];
}
function laSolve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-15) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
// 3×3 как плоский массив из 9 чисел (по строкам)
const m3 = {
  mul: (a, b) => { const r = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return r; },
  T: a => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]],
  v: (a, v) => [a[0] * v[0] + a[1] * v[1] + a[2] * v[2], a[3] * v[0] + a[4] * v[1] + a[5] * v[2], a[6] * v[0] + a[7] * v[1] + a[8] * v[2]],
  Tv: (a, v) => [a[0] * v[0] + a[3] * v[1] + a[6] * v[2], a[1] * v[0] + a[4] * v[1] + a[7] * v[2], a[2] * v[0] + a[5] * v[1] + a[8] * v[2]],
  det: a => a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]),
};
// SVD 3×3: A = U diag(s) Vᵀ (через собственные векторы AᵀA, с ортогонализацией)
function svd3(A) {
  const AtA = m3.mul(m3.T(A), A), e = laEig([[AtA[0], AtA[1], AtA[2]], [AtA[3], AtA[4], AtA[5]], [AtA[6], AtA[7], AtA[8]]]);
  const v = [e.vec[2], e.vec[1], e.vec[0]], s = [e.val[2], e.val[1], e.val[0]].map(x => Math.sqrt(Math.max(0, x)));
  const u0 = vnorm(m3.v(A, v[0])); let u1 = m3.v(A, v[1]); u1 = vnorm(vsub(u1, vscale(u0, vdot(u0, u1)))); const u2 = vcross(u0, u1);
  return { U: [u0[0], u1[0], u2[0], u0[1], u1[1], u2[1], u0[2], u1[2], u2[2]], s, V: [v[0][0], v[1][0], v[2][0], v[0][1], v[1][1], v[2][1], v[0][2], v[1][2], v[2][2]] };
}
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], vscale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vlen = a => Math.hypot(a[0], a[1], a[2]), vnorm = a => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// вектор поворота ↔ матрица (Родриг)
function rodR(w) {
  const th = vlen(w); if (th < 1e-12) return [1, -w[2], w[1], w[2], 1, -w[0], -w[1], w[0], 1];
  const k = vscale(w, 1 / th), c = Math.cos(th), s = Math.sin(th), C = 1 - c, [x, y, z] = k;
  return [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
}
function rodW(R) {
  const c = Math.max(-1, Math.min(1, (R[0] + R[4] + R[8] - 1) / 2)), th = Math.acos(c);
  if (th < 1e-9) return [0, 0, 0];
  if (Math.PI - th < 1e-6) {   // 180°
    const x = Math.sqrt(Math.max(0, (R[0] + 1) / 2)), y = Math.sqrt(Math.max(0, (R[4] + 1) / 2)) * (R[1] >= 0 ? 1 : -1), z = Math.sqrt(Math.max(0, (R[8] + 1) / 2)) * (R[2] >= 0 ? 1 : -1);
    return vscale(vnorm([x, y, z]), th);
  }
  const k = th / (2 * Math.sin(th)); return [(R[7] - R[5]) * k, (R[2] - R[6]) * k, (R[3] - R[1]) * k];
}
// ортогонализация матрицы поворота
function orthoR(R) { const d = svd3(R); let Q = m3.mul(d.U, m3.T(d.V)); if (m3.det(Q) < 0) { const U = d.U.slice(); U[2] = -U[2]; U[5] = -U[5]; U[8] = -U[8]; Q = m3.mul(U, m3.T(d.V)); } return Q; }
// детерминированный генератор случайных чисел
function laRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function laInv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
// гомография по ≥4 парам точек src → dst (DLT)
function laHomog(src, dst) {
  const rows = [];
  src.forEach(([x, y], k) => { const [u, v] = dst[k]; rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, -u], [0, 0, 0, x, y, 1, -v * x, -v * y, -v]); });
  const h = laNull(rows); return h.map(v => v / h[8]);
}
const laApplyH = (H, [x, y]) => { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; };
