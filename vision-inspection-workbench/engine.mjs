/** Original synthetic image generator and geometric inspection. No DOM or dependencies. */
export const WIDTH = 160;
export const HEIGHT = 120;
export const DEFAULTS = Object.freeze({ exposure: 0, noise: 6, threshold: 120, widthTolerance: 6, centreTolerance: 6 });

export function random(seed) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function generateSample(seed, index, options = {}, forcedDefect) {
  const settings = { ...DEFAULTS, ...options };
  const rng = random(`${seed}:${index}`);
  const defect = forcedDefect ?? (index % 2 === 0 ? 'none' : ['missing-hole', 'offset-hole', 'narrow-body'][Math.floor(rng() * 3)]);
  if (!['none', 'missing-hole', 'offset-hole', 'narrow-body'].includes(defect)) throw new Error('Unknown defect');
  const cx = 80 + Math.floor(rng() * 5) - 2;
  const cy = 60 + Math.floor(rng() * 5) - 2;
  const width = (defect === 'narrow-body' ? 70 : 90) + Math.floor(rng() * 5) - 2;
  const height = 64 + Math.floor(rng() * 5) - 2;
  const radius = 9 + rng() * 2;
  const holeX = cx + (defect === 'offset-hole' ? (rng() > 0.5 ? 18 : -18) : Math.floor(rng() * 3) - 1);
  const holeY = cy + Math.floor(rng() * 3) - 1;
  const x0 = Math.round(cx - width / 2), y0 = Math.round(cy - height / 2);
  const pixels = new Uint8ClampedArray(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const body = x >= x0 && x < x0 + width && y >= y0 && y < y0 + height;
    const hole = defect !== 'missing-hole' && (x - holeX) ** 2 + (y - holeY) ** 2 <= radius ** 2;
    const base = body && !hole ? 205 : 27;
    pixels[y * WIDTH + x] = base + settings.exposure + (rng() * 2 - 1) * settings.noise;
  }
  return { id: `${seed}-${String(index + 1).padStart(3, '0')}`, index, seed: String(seed), label: defect === 'none' ? 'good' : 'defect', defect, width: WIDTH, height: HEIGHT, pixels };
}

function components(mask, width, height, target) {
  const seen = new Uint8Array(mask.length), found = [];
  for (let origin = 0; origin < mask.length; origin++) {
    if (seen[origin] || mask[origin] !== target) continue;
    const queue = [origin]; seen[origin] = 1;
    let minX = width, maxX = -1, minY = height, maxY = -1, sumX = 0, sumY = 0, edge = false;
    for (let head = 0; head < queue.length; head++) {
      const p = queue[head], x = p % width, y = Math.floor(p / width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      sumX += x; sumY += y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edge = true;
      for (const neighbor of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
        if (neighbor >= 0 && !seen[neighbor] && mask[neighbor] === target) { seen[neighbor] = 1; queue.push(neighbor); }
      }
    }
    found.push({ area: queue.length, minX, maxX, minY, maxY, cx: sumX / queue.length, cy: sumY / queue.length, edge });
  }
  return found.sort((a, b) => b.area - a.area);
}

export function inspect(sample, options = {}) {
  const settings = { ...DEFAULTS, ...options };
  const mask = Uint8Array.from(sample.pixels, pixel => pixel >= settings.threshold ? 1 : 0);
  const body = components(mask, sample.width, sample.height, 1)[0];
  const reasons = [];
  if (!body || body.area < 600) return { prediction: 'defect', reasons: ['Part not detected'], mask, body: null, hole: null, measurements: null };
  const width = body.maxX - body.minX + 1, height = body.maxY - body.minY + 1;
  const holes = components(mask, sample.width, sample.height, 0).filter(c => !c.edge && c.area >= 20 && c.minX > body.minX && c.maxX < body.maxX && c.minY > body.minY && c.maxY < body.maxY);
  const hole = holes[0] || null;
  const centreX = (body.minX + body.maxX) / 2, centreY = (body.minY + body.maxY) / 2;
  const offset = hole ? Math.hypot(hole.cx - centreX, hole.cy - centreY) : null;
  const radius = hole ? Math.sqrt(hole.area / Math.PI) : null;
  if (Math.abs(width - 90) > settings.widthTolerance) reasons.push('Body width outside tolerance');
  if (Math.abs(height - 64) > 6) reasons.push('Body height outside tolerance');
  if (!hole) reasons.push('Hole not detected');
  else {
    if (holes.length !== 1) reasons.push('Multiple enclosed regions');
    if (radius < 7 || radius > 13) reasons.push('Hole size outside tolerance');
    if (offset > settings.centreTolerance) reasons.push('Hole centre outside tolerance');
  }
  return { prediction: reasons.length ? 'defect' : 'good', reasons, mask, body, hole, measurements: { width, height, offset, radius } };
}

export function evaluate(seed, count = 40, options = {}) {
  if (!Number.isInteger(count) || count < 2 || count > 200) throw new Error('Count must be an integer from 2 to 200');
  const rows = Array.from({ length: count }, (_, index) => {
    const sample = generateSample(seed, index, options);
    return { sample, result: inspect(sample, options) };
  });
  const matrix = { goodAccepted: 0, goodRejected: 0, defectAccepted: 0, defectRejected: 0 };
  for (const { sample, result } of rows) matrix[`${sample.label}${result.prediction === 'good' ? 'Accepted' : 'Rejected'}`]++;
  return { seed: String(seed), rows, matrix, accuracy: (matrix.goodAccepted + matrix.defectRejected) / count };
}

export function toCSV(evaluation, options = {}, mode = 'evaluation') {
  const settings = { ...DEFAULTS, ...options };
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const headers = ['mode', 'seed', 'sample', 'ground_truth', 'defect_type', 'prediction', 'width_px', 'height_px', 'hole_offset_px', 'hole_radius_px', 'reasons', 'exposure', 'noise', 'threshold', 'width_tolerance_px', 'centre_tolerance_px'];
  const rows = evaluation.rows.map(({ sample, result }) => [mode, evaluation.seed, sample.id, sample.label, sample.defect, result.prediction, result.measurements?.width, result.measurements?.height, result.measurements?.offset?.toFixed(2), result.measurements?.radius?.toFixed(2), result.reasons.join('; '), settings.exposure, settings.noise, settings.threshold, settings.widthTolerance, settings.centreTolerance]);
  return [headers, ...rows].map(row => row.map(quote).join(',')).join('\r\n');
}
