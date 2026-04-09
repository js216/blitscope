// SPDX-License-Identifier: GPL-3.0
// overlay.js --- Grid, axes, labels, markers, stats overlay (Canvas 2D)
// Copyright (c) 2026 Jakob Kastelic
// ===== Canvas 2D Overlay =====
// Grid lines, axis labels, markers, legend, stats

import { getThemeColors } from './theme.js';
import { computeStats } from './analysis.js';

export const PADDING = { top: 30, right: 16, bottom: 36, left: 56 };
export const POLAR_PADDING = { top: 20, right: 20, bottom: 20, left: 20 };

export function getPlotArea(canvas, plotType) {
  const pad = plotType === 'polar' ? POLAR_PADDING : PADDING;
  return {
    x: pad.left,
    y: pad.top,
    w: canvas.width / (window.devicePixelRatio || 1) - pad.left - pad.right,
    h: canvas.height / (window.devicePixelRatio || 1) - pad.top - pad.bottom,
    pad,
  };
}

export function renderOverlay(ctx, canvas, plotConfig, traces, viewport, markers) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const colors = getThemeColors();
  const plotType = plotConfig.type;

  if (plotConfig.displayMode === 'spectrogram') {
    renderSpectrogramOverlay(ctx, w, h, plotConfig, colors);
  } else if (plotType === 'polar') {
    renderPolarGrid(ctx, w, h, plotConfig, viewport, colors);
  } else {
    renderCartesianGrid(ctx, w, h, plotConfig, viewport, colors);
  }

  // Draw trigger level line
  if (plotConfig.trigger && plotConfig.trigger.mode !== 'off'
      && plotConfig.displayMode !== 'spectrum' && plotConfig.displayMode !== 'spectrogram'
      && plotType === 'cartesian') {
    const area = getPlotArea(canvas, plotType);
    const { yMin, yMax } = viewport;
    const tLevel = plotConfig.trigger.level;
    const yPx = area.y + area.h - ((tLevel - yMin) / (yMax - yMin)) * area.h;
    if (yPx >= area.y && yPx <= area.y + area.h) {
      ctx.strokeStyle = '#f85149';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(area.x, yPx);
      ctx.lineTo(area.x + area.w, yPx);
      ctx.stroke();
      ctx.setLineDash([]);
      // Label
      ctx.fillStyle = '#f85149';
      ctx.font = '9px SF Mono, Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`T:${tLevel.toFixed(2)}`, area.x + 2, yPx - 3);
    }
  }

  if (plotConfig.showLegend && traces.length > 0) {
    renderLegend(ctx, w, traces, colors);
  }

  if (plotConfig.showStats && traces.length > 0) {
    renderStats(ctx, w, traces, colors);
  }

  if (markers && markers.length > 0) {
    renderMarkers(ctx, w, h, plotConfig, viewport, markers, traces, colors);
  }

  // Title
  if (plotConfig.title) {
    ctx.fillStyle = colors.textSecondary;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(plotConfig.title, w / 2, 14);
  }

  ctx.restore();
}

// ===== Cartesian Grid =====
function renderCartesianGrid(ctx, w, h, config, viewport, colors) {
  const area = {
    x: PADDING.left,
    y: PADDING.top,
    w: w - PADDING.left - PADDING.right,
    h: h - PADDING.top - PADDING.bottom,
  };

  const { xMin, xMax, yMin, yMax } = viewport;

  // Background border
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(area.x, area.y, area.w, area.h);

  // Grid
  if (config.showGrid) {
    const xTicks = config.xAxis.log ? logScale(xMin, xMax) : niceScale(xMin, xMax, 8);
    const yTicks = config.yAxis.log ? logScale(yMin, yMax) : niceScale(yMin, yMax, 6);

    const xLog = config.xAxis.log;
    const yLog = config.yAxis.log;

    // Minor grid
    ctx.strokeStyle = colors.gridMinor;
    ctx.lineWidth = 0.5;
    drawGridLines(ctx, xTicks.minor, area, viewport, 'x', xLog);
    drawGridLines(ctx, yTicks.minor, area, viewport, 'y', yLog);

    // Major grid
    ctx.strokeStyle = colors.gridMajor;
    ctx.lineWidth = 1;
    drawGridLines(ctx, xTicks.major, area, viewport, 'x', xLog);
    drawGridLines(ctx, yTicks.major, area, viewport, 'y', yLog);

    // Axis labels
    ctx.fillStyle = colors.axisText;
    ctx.font = '10px SF Mono, Consolas, monospace';
    ctx.textAlign = 'center';
    for (const v of xTicks.major) {
      const x = area.x + mapAxis(v, xMin, xMax, area.w, xLog);
      if (x >= area.x && x <= area.x + area.w) {
        ctx.fillText(formatTickValue(v), x, area.y + area.h + 14);
      }
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of yTicks.major) {
      const y = area.y + area.h - mapAxis(v, yMin, yMax, area.h, yLog);
      if (y >= area.y && y <= area.y + area.h) {
        ctx.fillText(formatTickValue(v), area.x - 6, y);
      }
    }
    ctx.textBaseline = 'alphabetic';

    // Y-axis reference lines
    for (const ref of (config.yAxis.referenceLines || [])) {
      const y = area.y + area.h - mapAxis(ref.value, yMin, yMax, area.h, yLog);
      if (y >= area.y && y <= area.y + area.h) {
        ctx.strokeStyle = ref.color || colors.accent;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(area.x, y);
        ctx.lineTo(area.x + area.w, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // X-axis reference lines
    for (const ref of (config.xAxis.referenceLines || [])) {
      const x = area.x + mapAxis(ref.value, xMin, xMax, area.w, xLog);
      if (x >= area.x && x <= area.x + area.w) {
        ctx.strokeStyle = ref.color || colors.accent;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, area.y);
        ctx.lineTo(x, area.y + area.h);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  // Axis labels
  ctx.fillStyle = colors.textSecondary;
  ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  const xLabel = config.xAxis.label + (config.xAxis.unit ? ` (${config.xAxis.unit})` : '');
  ctx.fillText(xLabel, area.x + area.w / 2, h - 4);

  ctx.save();
  ctx.translate(12, area.y + area.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  const yLabel = config.yAxis.label + (config.yAxis.unit ? ` (${config.yAxis.unit})` : '');
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

// ===== Polar Grid =====
function renderPolarGrid(ctx, w, h, config, viewport, colors) {
  const cx = w / 2;
  const cy = h / 2;
  const pad = POLAR_PADDING;
  const radius = Math.min(w - pad.left - pad.right, h - pad.top - pad.bottom) / 2;

  const maxR = Math.max(Math.abs(viewport.xMax), Math.abs(viewport.yMax), 1);
  const numCircles = 5;

  ctx.strokeStyle = colors.gridMajor;
  ctx.lineWidth = 0.5;

  // Concentric circles
  for (let i = 1; i <= numCircles; i++) {
    const r = (i / numCircles) * radius;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Label
    ctx.fillStyle = colors.axisText;
    ctx.font = '9px SF Mono, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(formatTickValue((i / numCircles) * maxR), cx + r + 2, cy - 2);
  }

  // Radial lines
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + radius * Math.cos(angle), cy - radius * Math.sin(angle));
    ctx.stroke();
    // Degree label
    ctx.fillStyle = colors.axisText;
    ctx.font = '9px SF Mono, Consolas, monospace';
    ctx.textAlign = 'center';
    const lx = cx + (radius + 12) * Math.cos(angle);
    const ly = cy - (radius + 12) * Math.sin(angle);
    ctx.fillText(`${i * 30}`, lx, ly + 3);
  }
}

// ===== Spectrogram Overlay =====
function renderSpectrogramOverlay(ctx, w, h, config, colors) {
  const area = {
    x: PADDING.left,
    y: PADDING.top,
    w: w - PADDING.left - PADDING.right,
    h: h - PADDING.top - PADDING.bottom,
  };

  // Border
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(area.x, area.y, area.w, area.h);

  // Compute real frequency axis: 0 to Nyquist (sampleRate / 2)
  const sampleRate = config._sampleRate || 1000;
  const nyquist = sampleRate / 2;

  if (config.showGrid) {
    const xTicks = niceScale(0, nyquist, 6);
    ctx.strokeStyle = colors.gridMajor;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.4;
    drawGridLines(ctx, xTicks.major, area, { xMin: 0, xMax: nyquist, yMin: 0, yMax: 1 }, 'x');
    ctx.globalAlpha = 1;

    // X-axis labels in Hz
    ctx.fillStyle = colors.axisText;
    ctx.font = '10px SF Mono, Consolas, monospace';
    ctx.textAlign = 'center';
    for (const v of xTicks.major) {
      const x = area.x + (v / nyquist) * area.w;
      if (x >= area.x && x <= area.x + area.w) {
        ctx.fillText(formatTickValue(v), x, area.y + area.h + 14);
      }
    }
  }

  // Axis labels
  ctx.fillStyle = colors.textSecondary;
  ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Frequency (Hz)', area.x + area.w / 2, h - 4);

  // Y-axis: time. Each row = one frame. Total rows = spectrogram height.
  // Time per row = pointsPerFrame / sampleRate
  const ptsPerFrame = config._pointsPerFrame || 512;
  const timePerRow = ptsPerFrame / sampleRate;
  const totalTime = (config.spectrogram.rows || 256) * timePerRow;

  ctx.save();
  ctx.translate(12, area.y + area.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText(`Time (${totalTime.toFixed(1)} s window)`, 0, 0);
  ctx.restore();

  // dB color scale indicator (right side)
  const scaleW = 12;
  const scaleX = area.x + area.w + 4;
  const scaleY = area.y;
  const scaleH = area.h;
  const gradient = ctx.createLinearGradient(scaleX, scaleY + scaleH, scaleX, scaleY);
  // Approximate inferno colormap for the scale bar
  gradient.addColorStop(0, '#000004');
  gradient.addColorStop(0.25, '#51127c');
  gradient.addColorStop(0.5, '#b73779');
  gradient.addColorStop(0.75, '#fc8961');
  gradient.addColorStop(1, '#fcfdbf');
  ctx.fillStyle = gradient;
  ctx.fillRect(scaleX, scaleY, scaleW, scaleH);
  ctx.strokeStyle = colors.border;
  ctx.strokeRect(scaleX, scaleY, scaleW, scaleH);

  // dB labels
  ctx.fillStyle = colors.axisText;
  ctx.font = '9px SF Mono, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('0 dB', scaleX + scaleW + 3, scaleY + 8);
  ctx.fillText('-90', scaleX + scaleW + 3, scaleY + scaleH);
}

// ===== Legend =====
function renderLegend(ctx, canvasW, traces, colors) {
  const x = PADDING.left + 6;
  let y = PADDING.top + 6;
  const lineH = 14;
  const visible = traces.filter(t => t.visible);
  if (visible.length === 0) return;

  // Background
  const maxLabelW = Math.max(...visible.map(t => ctx.measureText(t.label).width)) + 30;
  ctx.fillStyle = colors.bgPlot || 'rgba(0,0,0,0.6)';
  ctx.globalAlpha = 0.8;
  ctx.fillRect(x - 4, y - 4, maxLabelW + 8, visible.length * lineH + 8);
  ctx.globalAlpha = 1;

  ctx.font = '10px SF Mono, Consolas, monospace';
  for (const trace of visible) {
    // Color swatch
    ctx.fillStyle = trace.color;
    ctx.fillRect(x, y + 2, 10, 8);
    // Label
    ctx.fillStyle = colors.textPrimary;
    ctx.textAlign = 'left';
    ctx.fillText(trace.label, x + 16, y + 10);
    y += lineH;
  }
}

// ===== Stats =====
function renderStats(ctx, canvasW, traces, colors) {
  const visible = traces.filter(t => t.visible && !t.isDerived);
  if (visible.length === 0) return;
  const firstTrace = visible[0];
  const stats = computeStats(firstTrace.data);

  const x = canvasW - PADDING.right - 130;
  const y = PADDING.top + 6;
  const lineH = 13;
  const entries = [
    ['Min', formatStatValue(stats.min)],
    ['Max', formatStatValue(stats.max)],
    ['Mean', formatStatValue(stats.mean)],
    ['Pk-Pk', formatStatValue(stats.peakToPeak)],
    ['StdDev', formatStatValue(stats.stdDev)],
    ['RMS', formatStatValue(stats.rms)],
  ];

  // Background
  ctx.fillStyle = colors.bgPlot || 'rgba(0,0,0,0.6)';
  ctx.globalAlpha = 0.85;
  ctx.fillRect(x - 4, y - 4, 130, entries.length * lineH + 16);
  ctx.globalAlpha = 1;

  ctx.font = 'bold 9px SF Mono, Consolas, monospace';
  ctx.fillStyle = colors.textSecondary;
  ctx.textAlign = 'left';
  ctx.fillText(firstTrace.label + ' Stats', x, y + 8);

  ctx.font = '10px SF Mono, Consolas, monospace';
  let row = y + 20;
  for (const [label, val] of entries) {
    ctx.fillStyle = colors.textSecondary;
    ctx.textAlign = 'left';
    ctx.fillText(label, x, row);
    ctx.fillStyle = colors.textPrimary;
    ctx.textAlign = 'right';
    ctx.fillText(val, x + 122, row);
    row += lineH;
  }
}

// ===== Markers =====
export function renderMarkers(ctx, w, h, plotConfig, viewport, markers, traces, colors) {
  const area = {
    x: PADDING.left,
    y: PADDING.top,
    w: w - PADDING.left - PADDING.right,
    h: h - PADDING.top - PADDING.bottom,
  };
  const { xMin, xMax, yMin, yMax } = viewport;

  for (const marker of markers) {
    if (marker.type === 'standard' || marker.type === 'peak') {
      const px = area.x + ((marker.x - xMin) / (xMax - xMin)) * area.w;
      const py = area.y + area.h - ((marker.y - yMin) / (yMax - yMin)) * area.h;

      if (px < area.x || px > area.x + area.w) continue;

      // Vertical crosshair
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(px, area.y);
      ctx.lineTo(px, area.y + area.h);
      ctx.stroke();

      // Horizontal crosshair
      ctx.beginPath();
      ctx.moveTo(area.x, py);
      ctx.lineTo(area.x + area.w, py);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dot
      ctx.fillStyle = colors.accent;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = colors.accent;
      ctx.font = '10px SF Mono, Consolas, monospace';
      ctx.textAlign = 'left';
      const label = `(${formatStatValue(marker.x)}, ${formatStatValue(marker.y)})`;
      ctx.fillText(label, px + 8, py - 8);
    }

    if (marker.type === 'harmonic') {
      const fundamental = marker.fundamental;
      for (let h = 1; h <= (marker.harmonics || 5); h++) {
        const freq = fundamental * h;
        const px = area.x + ((freq - xMin) / (xMax - xMin)) * area.w;
        if (px < area.x || px > area.x + area.w) continue;

        ctx.strokeStyle = h === 1 ? colors.accent : colors.textMuted;
        ctx.lineWidth = h === 1 ? 1.5 : 0.5;
        ctx.setLineDash(h === 1 ? [] : [2, 2]);
        ctx.beginPath();
        ctx.moveTo(px, area.y);
        ctx.lineTo(px, area.y + area.h);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = colors.textSecondary;
        ctx.font = '9px SF Mono, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`H${h}`, px, area.y - 3);
      }
    }
  }
}

// ===== Log Scale Ticks =====
function logScale(min, max) {
  const safeMin = Math.max(min, 1e-10);
  const safeMax = Math.max(max, safeMin * 10);
  const logMin = Math.floor(Math.log10(safeMin));
  const logMax = Math.ceil(Math.log10(safeMax));
  const major = [];
  const minor = [];
  for (let exp = logMin; exp <= logMax; exp++) {
    const base = Math.pow(10, exp);
    major.push(base);
    for (let m = 2; m <= 9; m++) {
      const v = base * m;
      if (v > safeMin && v < safeMax) minor.push(v);
    }
  }
  return { major: major.filter(v => v >= safeMin && v <= safeMax), minor };
}

// Map a value to pixel position considering log option
function mapAxis(value, min, max, size, logEnabled) {
  if (logEnabled) {
    const safeVal = Math.max(value, 1e-10);
    const safeMin = Math.max(min, 1e-10);
    const safeMax = Math.max(max, safeMin * 10);
    return (Math.log10(safeVal) - Math.log10(safeMin)) /
           (Math.log10(safeMax) - Math.log10(safeMin)) * size;
  }
  return ((value - min) / (max - min)) * size;
}

// ===== Tick Calculation =====
function niceScale(min, max, targetTicks) {
  const range = max - min;
  if (range === 0) return { major: [min], minor: [] };

  const roughStep = range / targetTicks;
  const exp = Math.floor(Math.log10(roughStep));
  const pow10 = Math.pow(10, exp);
  let step;

  const frac = roughStep / pow10;
  if (frac <= 1.5) step = pow10;
  else if (frac <= 3) step = 2 * pow10;
  else if (frac <= 7) step = 5 * pow10;
  else step = 10 * pow10;

  const major = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max; v += step) {
    major.push(Math.round(v * 1e10) / 1e10);
  }

  const minor = [];
  const minorStep = step / 5;
  const minorStart = Math.ceil(min / minorStep) * minorStep;
  for (let v = minorStart; v <= max; v += minorStep) {
    const rounded = Math.round(v * 1e10) / 1e10;
    if (!major.includes(rounded)) minor.push(rounded);
  }

  return { major, minor };
}

function drawGridLines(ctx, values, area, viewport, axis, logEnabled = false) {
  const { xMin, xMax, yMin, yMax } = viewport;
  ctx.beginPath();
  for (const v of values) {
    if (axis === 'x') {
      const x = area.x + mapAxis(v, xMin, xMax, area.w, logEnabled);
      if (x >= area.x && x <= area.x + area.w) {
        ctx.moveTo(x, area.y);
        ctx.lineTo(x, area.y + area.h);
      }
    } else {
      const y = area.y + area.h - mapAxis(v, yMin, yMax, area.h, logEnabled);
      if (y >= area.y && y <= area.y + area.h) {
        ctx.moveTo(area.x, y);
        ctx.lineTo(area.x + area.w, y);
      }
    }
  }
  ctx.stroke();
}

function formatTickValue(v) {
  const abs = Math.abs(v);
  if (abs === 0) return '0';
  if (abs >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  if (abs >= 1) return v.toFixed(abs >= 100 ? 0 : abs >= 10 ? 1 : 2);
  if (abs >= 0.01) return v.toFixed(3);
  return v.toExponential(1);
}

function formatStatValue(v) {
  if (!isFinite(v)) return '--';
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(3);
  if (abs >= 0.001) return v.toFixed(5);
  return v.toExponential(2);
}

// ===== Viewport Calculation =====
export function computeViewport(plotConfig, traces) {
  const allTraces = traces.filter(t => t.visible && t.data && t.data.length > 0);
  if (allTraces.length === 0) return { xMin: 0, xMax: 1, yMin: -1, yMax: 1 };

  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;

  if (plotConfig.type === 'scatter') {
    // Scatter: pairs of traces as X, Y
    for (let t = 0; t + 1 < allTraces.length; t += 2) {
      const xTrace = allTraces[t];
      const yTrace = allTraces[t + 1];
      const n = Math.min(xTrace.data.length, yTrace.data.length);
      for (let i = 0; i < n; i++) {
        if (xTrace.data[i] < xMin) xMin = xTrace.data[i];
        if (xTrace.data[i] > xMax) xMax = xTrace.data[i];
        if (yTrace.data[i] < yMin) yMin = yTrace.data[i];
        if (yTrace.data[i] > yMax) yMax = yTrace.data[i];
      }
    }
  } else if (plotConfig.type === 'polar') {
    // Polar: symmetric around origin
    for (const t of allTraces) {
      for (let i = 0; i < t.data.length; i++) {
        const r = Math.abs(t.data[i]);
        if (r > xMax) xMax = r;
      }
    }
    xMin = -xMax; yMin = -xMax; yMax = xMax;
  } else {
    for (const t of allTraces) {
      const n = t.data.length;
      for (let i = 0; i < n; i++) {
        const x = t.xData ? t.xData[i] : i;
        const y = t.data[i];
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }
  }

  // Apply scaling strategy
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  return applyScaling(plotConfig, xMin, xMax, yMin, yMax, xRange, yRange);
}

const peakDecayState = new Map();

function applyScaling(config, xMin, xMax, yMin, yMax, xRange, yRange) {
  let vp = { xMin, xMax, yMin, yMax };

  // Y-axis scaling
  switch (config.yAxis.scaling) {
    case 'fixed':
      vp.yMin = config.yAxis.min ?? yMin;
      vp.yMax = config.yAxis.max ?? yMax;
      break;
    case 'windowed':
      // Add 5% padding
      vp.yMin = yMin - yRange * 0.05;
      vp.yMax = yMax + yRange * 0.05;
      break;
    case 'expand-only': {
      const key = config.id + '_y';
      const prev = peakDecayState.get(key) || { min: yMin, max: yMax };
      vp.yMin = Math.min(prev.min, yMin);
      vp.yMax = Math.max(prev.max, yMax);
      peakDecayState.set(key, { min: vp.yMin, max: vp.yMax });
      vp.yMin -= Math.abs(vp.yMax - vp.yMin) * 0.02;
      vp.yMax += Math.abs(vp.yMax - vp.yMin) * 0.02;
      break;
    }
    case 'peak-decay': {
      const key = config.id + '_ypd';
      const prev = peakDecayState.get(key) || { min: yMin, max: yMax };
      const decay = 0.995;
      const newMin = Math.min(yMin, prev.min);
      const newMax = Math.max(yMax, prev.max);
      vp.yMin = yMin < prev.min ? yMin : prev.min + (yMin - prev.min) * (1 - decay);
      vp.yMax = yMax > prev.max ? yMax : prev.max - (prev.max - yMax) * (1 - decay);
      peakDecayState.set(key, { min: vp.yMin, max: vp.yMax });
      break;
    }
    case 'symmetric-zero':
      const absMax = Math.max(Math.abs(yMin), Math.abs(yMax)) * 1.05;
      vp.yMin = -absMax;
      vp.yMax = absMax;
      break;
    case 'baseline-zero':
      vp.yMin = 0;
      vp.yMax = yMax * 1.05;
      break;
  }

  // X-axis scaling (same strategies as Y)
  switch (config.xAxis.scaling) {
    case 'fixed':
      vp.xMin = config.xAxis.min ?? xMin;
      vp.xMax = config.xAxis.max ?? xMax;
      break;
    case 'expand-only': {
      const key = config.id + '_x';
      const prev = peakDecayState.get(key) || { min: xMin, max: xMax };
      vp.xMin = Math.min(prev.min, xMin);
      vp.xMax = Math.max(prev.max, xMax);
      peakDecayState.set(key, { min: vp.xMin, max: vp.xMax });
      break;
    }
    case 'peak-decay': {
      const key = config.id + '_xpd';
      const prev = peakDecayState.get(key) || { min: xMin, max: xMax };
      const decay = 0.995;
      vp.xMin = xMin < prev.min ? xMin : prev.min + (xMin - prev.min) * (1 - decay);
      vp.xMax = xMax > prev.max ? xMax : prev.max - (prev.max - xMax) * (1 - decay);
      peakDecayState.set(key, { min: vp.xMin, max: vp.xMax });
      break;
    }
    case 'symmetric-zero': {
      const absMaxX = Math.max(Math.abs(xMin), Math.abs(xMax)) * 1.05;
      vp.xMin = -absMaxX;
      vp.xMax = absMaxX;
      break;
    }
    case 'baseline-zero':
      vp.xMin = 0;
      vp.xMax = xMax * 1.05;
      break;
    case 'windowed':
    default:
      vp.xMin = xMin;
      vp.xMax = xMax;
      break;
  }

  // Prevent zero-range
  if (vp.xMax - vp.xMin < 1e-10) { vp.xMin -= 0.5; vp.xMax += 0.5; }
  if (vp.yMax - vp.yMin < 1e-10) { vp.yMin -= 0.5; vp.yMax += 0.5; }

  return vp;
}

export function resetScalingState() {
  peakDecayState.clear();
}
