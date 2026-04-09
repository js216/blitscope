// SPDX-License-Identifier: GPL-3.0
// canvas-renderer.js --- Canvas 2D fallback renderer
// Copyright (c) 2026 Jakob Kastelic
// ===== Canvas 2D Fallback Renderer =====
// Used when WebGL is not available (headless browsers, older GPUs)

import { COLOR_MAPS } from './state.js';
import { PADDING, POLAR_PADDING } from './overlay.js';

// Color map functions for spectrogram/gradient (JS equivalents)
const colorMaps = {
  inferno: (t) => {
    t = Math.max(0, Math.min(1, t));
    if (t < 0.5) return lerpColor([0, 0, 4], [217, 80, 7], t * 2);
    return lerpColor([217, 80, 7], [252, 253, 191], (t - 0.5) * 2);
  },
  viridis: (t) => {
    t = Math.max(0, Math.min(1, t));
    if (t < 0.5) return lerpColor([68, 1, 84], [33, 145, 140], t * 2);
    return lerpColor([33, 145, 140], [253, 231, 37], (t - 0.5) * 2);
  },
  plasma: (t) => {
    t = Math.max(0, Math.min(1, t));
    if (t < 0.5) return lerpColor([13, 8, 135], [204, 71, 120], t * 2);
    return lerpColor([204, 71, 120], [240, 249, 33], (t - 0.5) * 2);
  },
  magma: (t) => {
    t = Math.max(0, Math.min(1, t));
    if (t < 0.5) return lerpColor([0, 0, 4], [183, 55, 121], t * 2);
    return lerpColor([183, 55, 121], [252, 253, 191], (t - 0.5) * 2);
  },
  turbo: (t) => {
    t = Math.max(0, Math.min(1, t));
    if (t < 0.25) return lerpColor([48, 18, 59], [33, 144, 222], t * 4);
    if (t < 0.5) return lerpColor([33, 144, 222], [144, 222, 33], (t - 0.25) * 4);
    if (t < 0.75) return lerpColor([144, 222, 33], [242, 110, 26], (t - 0.5) * 4);
    return lerpColor([242, 110, 26], [122, 4, 3], (t - 0.75) * 4);
  },
  grayscale: (t) => {
    const v = Math.round(Math.max(0, Math.min(1, t)) * 255);
    return [v, v, v];
  },
};

function lerpColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export class Canvas2DRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;

    // Persistence: offscreen canvas for accumulation
    this.persistCanvas = document.createElement('canvas');
    this.persistCtx = this.persistCanvas.getContext('2d');

    // Gradient: separate accumulation
    this.gradientCanvas = document.createElement('canvas');
    this.gradientCtx = this.gradientCanvas.getContext('2d');

    // Spectrogram state
    this.spectrogramData = null;
    this.spectrogramRow = 0;
    this.spectrogramRows = 256;
    this.spectrogramWidth = 512;
    this.spectrogramImage = null;
  }

  // Plot area in physical pixels (inside axis padding)
  _plotArea(plotType) {
    const dpr = window.devicePixelRatio || 1;
    const pad = plotType === 'polar' ? POLAR_PADDING : PADDING;
    return {
      x: pad.left * dpr,
      y: pad.top * dpr,
      w: this.width - (pad.left + pad.right) * dpr,
      h: this.height - (pad.top + pad.bottom) * dpr,
    };
  }

  // Set clipping to plot area
  _clip(ctx, plotType) {
    const a = this._plotArea(plotType);
    ctx.save();
    ctx.beginPath();
    ctx.rect(a.x, a.y, a.w, a.h);
    ctx.clip();
  }

  _unclip(ctx) {
    ctx.restore();
  }

  resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.width = this.canvas.width;
    this.height = this.canvas.height;

    this.persistCanvas.width = this.width;
    this.persistCanvas.height = this.height;
    this.gradientCanvas.width = this.width;
    this.gradientCanvas.height = this.height;

    this.spectrogramImage = this.ctx.createImageData(this.spectrogramWidth, this.spectrogramRows);
    this.spectrogramRow = 0;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  clearPersistence() {
    this.persistCtx.clearRect(0, 0, this.width, this.height);
    this.gradientCtx.clearRect(0, 0, this.width, this.height);
    if (this.spectrogramImage) {
      this.spectrogramImage.data.fill(0);
    }
    this.spectrogramRow = 0;
  }

  renderStandard(traces, viewport, plotType) {
    this.clear();
    if (plotType === 'scatter') {
      this._renderScatter(traces, viewport);
    } else if (plotType === 'polar') {
      this._renderPolar(traces, viewport);
    } else {
      this._renderLines(traces, viewport);
    }
  }

  renderPersistence(traces, viewport, plotType, decay) {
    const ctx = this.ctx;
    const pCtx = this.persistCtx;

    // Decay previous frame
    pCtx.globalAlpha = decay;
    pCtx.drawImage(this.persistCanvas, 0, 0);
    pCtx.globalAlpha = 1.0;

    // Draw new traces with additive-like blending
    pCtx.globalCompositeOperation = 'lighter';
    this._drawTracesTo(pCtx, traces, viewport, plotType, 0.4);
    pCtx.globalCompositeOperation = 'source-over';

    // Copy to main canvas
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.drawImage(this.persistCanvas, 0, 0);
  }

  renderSpectrogram(spectralData, viewport, config) {
    if (!spectralData || spectralData.length === 0 || !this.spectrogramImage) return;
    const ctx = this.ctx;
    const img = this.spectrogramImage;
    const w = this.spectrogramWidth;

    // Write new row
    const mapFn = colorMaps[config.colorMap] || colorMaps.inferno;
    const dbMin = -90, dbMax = 0;
    const rowOffset = this.spectrogramRow * w * 4;
    const n = Math.min(spectralData.length, w);
    for (let i = 0; i < n; i++) {
      const normalized = (spectralData[i] - dbMin) / (dbMax - dbMin);
      const rgb = mapFn(Math.max(0, Math.min(1, normalized)));
      const idx = rowOffset + i * 4;
      img.data[idx] = rgb[0];
      img.data[idx + 1] = rgb[1];
      img.data[idx + 2] = rgb[2];
      img.data[idx + 3] = 255;
    }
    this.spectrogramRow = (this.spectrogramRow + 1) % this.spectrogramRows;

    // Render: draw the image data reordered so newest row is at bottom
    ctx.clearRect(0, 0, this.width, this.height);
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = w;
    tmpCanvas.height = this.spectrogramRows;
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.putImageData(img, 0, 0);

    // Draw into the plot area (inside axis padding)
    const a = this._plotArea('cartesian');
    const topPart = this.spectrogramRows - this.spectrogramRow;
    ctx.drawImage(tmpCanvas, 0, this.spectrogramRow, w, topPart,
      a.x, a.y, a.w, (topPart / this.spectrogramRows) * a.h);
    if (this.spectrogramRow > 0) {
      ctx.drawImage(tmpCanvas, 0, 0, w, this.spectrogramRow,
        a.x, a.y + (topPart / this.spectrogramRows) * a.h, a.w,
        (this.spectrogramRow / this.spectrogramRows) * a.h);
    }
  }

  renderGradient(traces, viewport, plotType, config) {
    const ctx = this.ctx;
    const gCtx = this.gradientCtx;

    // Decay
    gCtx.globalAlpha = config.decay;
    gCtx.drawImage(this.gradientCanvas, 0, 0);
    gCtx.globalAlpha = 1.0;

    // Accumulate (additive)
    gCtx.globalCompositeOperation = 'lighter';
    this._drawTracesTo(gCtx, traces, viewport, plotType, 0.15, '#ffffff');
    gCtx.globalCompositeOperation = 'source-over';

    // Color map the accumulated intensity
    ctx.clearRect(0, 0, this.width, this.height);
    const imageData = gCtx.getImageData(0, 0, this.width, this.height);
    const mapFn = colorMaps[config.colorMap || 'inferno'] || colorMaps.inferno;
    const out = ctx.createImageData(this.width, this.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const intensity = imageData.data[i] / 255;
      const rgb = mapFn(intensity);
      out.data[i] = rgb[0];
      out.data[i + 1] = rgb[1];
      out.data[i + 2] = rgb[2];
      out.data[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }

  _drawTracesTo(targetCtx, traces, viewport, plotType, alpha = 1, colorOverride = null) {
    if (plotType === 'scatter') {
      this._renderScatterTo(targetCtx, traces, viewport, alpha, colorOverride);
    } else if (plotType === 'polar') {
      this._renderPolarTo(targetCtx, traces, viewport, alpha, colorOverride);
    } else {
      this._renderLinesTo(targetCtx, traces, viewport, alpha, colorOverride, plotType);
    }
  }

  _renderLines(traces, viewport) {
    this._renderLinesTo(this.ctx, traces, viewport);
  }

  _renderLinesTo(ctx, traces, viewport, alpha = 1, colorOverride = null, plotType = 'cartesian') {
    const { xMin, xMax, yMin, yMax } = viewport;
    const a = this._plotArea(plotType);

    this._clip(ctx, plotType);
    for (const trace of traces) {
      if (!trace.visible || !trace.data || trace.data.length === 0) continue;
      const n = trace.data.length;
      ctx.strokeStyle = colorOverride || trace.color || '#58a6ff';
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = trace.xData ? trace.xData[i] : i;
        const px = a.x + ((x - xMin) / (xMax - xMin)) * a.w;
        const py = a.y + a.h - ((trace.data[i] - yMin) / (yMax - yMin)) * a.h;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    this._unclip(ctx);
  }

  _renderScatter(traces, viewport) {
    this._renderScatterTo(this.ctx, traces, viewport);
  }

  _renderScatterTo(ctx, traces, viewport, alpha = 1, colorOverride = null) {
    const { xMin, xMax, yMin, yMax } = viewport;
    const a = this._plotArea('scatter');

    this._clip(ctx, 'scatter');
    for (let t = 0; t + 1 < traces.length; t += 2) {
      const xTrace = traces[t];
      const yTrace = traces[t + 1];
      if (!xTrace.visible || !yTrace.visible) continue;
      const n = Math.min(xTrace.data.length, yTrace.data.length);
      const color = colorOverride || yTrace.color || '#58a6ff';
      // Connecting line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const px = a.x + ((xTrace.data[i] - xMin) / (xMax - xMin)) * a.w;
        const py = a.y + a.h - ((yTrace.data[i] - yMin) / (yMax - yMin)) * a.h;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      // Dots
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      for (let i = 0; i < n; i++) {
        const px = a.x + ((xTrace.data[i] - xMin) / (xMax - xMin)) * a.w;
        const py = a.y + a.h - ((yTrace.data[i] - yMin) / (yMax - yMin)) * a.h;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    this._unclip(ctx);
  }

  _renderPolar(traces, viewport) {
    this._renderPolarTo(this.ctx, traces, viewport);
  }

  _renderPolarTo(ctx, traces, viewport, alpha = 1, colorOverride = null) {
    const range = Math.max(
      Math.abs(viewport.xMin), Math.abs(viewport.xMax),
      Math.abs(viewport.yMin), Math.abs(viewport.yMax), 1
    );
    const a = this._plotArea('polar');
    const cx = a.x + a.w / 2;
    const cy = a.y + a.h / 2;
    const radius = Math.min(a.w, a.h) / 2;
    const scale = radius * 0.9 / range;

    this._clip(ctx, 'polar');
    for (const trace of traces) {
      if (!trace.visible || !trace.data || trace.data.length === 0) continue;
      const n = trace.data.length;
      ctx.strokeStyle = colorOverride || trace.color || '#58a6ff';
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const theta = (2 * Math.PI * i) / n;
        const r = trace.data[i] * scale;
        const px = cx + r * Math.cos(theta);
        const py = cy - r * Math.sin(theta);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    this._unclip(ctx);
  }
}
