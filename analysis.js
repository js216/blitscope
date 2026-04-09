// SPDX-License-Identifier: GPL-3.0
// analysis.js --- Derived traces (moving average, max hold) and statistics
// Copyright (c) 2026 Jakob Kastelic
// ===== Derived Traces & Statistics =====

// --- Moving Average ---
export function movingAverage(data, windowSize) {
  const n = data.length;
  const out = new Float32Array(n);
  let sum = 0;
  const w = Math.min(windowSize, n);
  for (let i = 0; i < w; i++) sum += data[i];
  out[0] = sum / w;
  for (let i = 1; i < n; i++) {
    if (i >= w) sum -= data[i - w];
    if (i + w - 1 < n) sum += data[i + w - 1];
    out[i] = sum / Math.min(w, n - i);
  }
  // Simple centered-ish moving average
  const half = w >> 1;
  const result = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(n, i + half + 1);
    let s = 0;
    for (let j = start; j < end; j++) s += data[j];
    result[i] = s / (end - start);
  }
  return result;
}

// --- Max Hold ---
const maxHoldBuffers = new Map();

export function maxHold(traceId, data) {
  let held = maxHoldBuffers.get(traceId);
  if (!held || held.length !== data.length) {
    held = new Float32Array(data.length);
    held.fill(-Infinity);
    maxHoldBuffers.set(traceId, held);
  }
  for (let i = 0; i < data.length; i++) {
    if (data[i] > held[i]) held[i] = data[i];
  }
  return new Float32Array(held);
}

export function resetMaxHold(traceId) {
  maxHoldBuffers.delete(traceId);
}

export function resetAllMaxHold() {
  maxHoldBuffers.clear();
}

// --- Trace Statistics ---
export function computeStats(data) {
  if (!data || data.length === 0) {
    return { min: 0, max: 0, mean: 0, stdDev: 0, peakToPeak: 0, rms: 0 };
  }
  const n = data.length;
  let min = Infinity, max = -Infinity, sum = 0, sumSq = 0;
  for (let i = 0; i < n; i++) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  return {
    min,
    max,
    mean,
    stdDev: Math.sqrt(Math.max(0, variance)),
    peakToPeak: max - min,
    rms: Math.sqrt(sumSq / n),
  };
}

// --- Derived trace manager ---
export function computeDerivedTraces(plotConfig, traces) {
  const derived = [];
  for (const def of plotConfig.derivedTraces) {
    const source = traces.find(t => t.id === def.sourceTraceId);
    if (!source || !source.data) continue;
    switch (def.type) {
      case 'average': {
        const data = movingAverage(source.data, def.window || 16);
        derived.push({
          id: `${source.id}_avg`,
          label: `${source.label} (Avg)`,
          color: adjustAlpha(source.color, 0.7),
          visible: true,
          data,
          isDerived: true,
        });
        break;
      }
      case 'maxhold': {
        const data = maxHold(source.id, source.data);
        derived.push({
          id: `${source.id}_max`,
          label: `${source.label} (Max)`,
          color: adjustAlpha(source.color, 0.5),
          visible: true,
          data,
          isDerived: true,
        });
        break;
      }
    }
  }
  return derived;
}

function adjustAlpha(hexColor, alpha) {
  // Return a slightly lighter/different shade
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const mix = Math.round(255 * (1 - alpha));
  return `#${clamp(r + mix * 0.3).toString(16).padStart(2, '0')}${clamp(g + mix * 0.3).toString(16).padStart(2, '0')}${clamp(b + mix * 0.3).toString(16).padStart(2, '0')}`;
}

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }
