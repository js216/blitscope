// SPDX-License-Identifier: GPL-3.0
// plot.js --- Plot panel: ties renderer, overlay, data, and interaction
// Copyright (c) 2026 Jakob Kastelic
// ===== Plot Management =====
// Each plot has a WebGL canvas + overlay canvas, manages its own traces

import { WebGLRenderer } from './renderer.js';
import { Canvas2DRenderer } from './canvas-renderer.js';
import { renderOverlay, computeViewport, getPlotArea } from './overlay.js';
import { TRACE_COLORS } from './state.js';
import { fft, magnitudeSpectrum, applyWindow, nextPow2 } from './fft.js';
import { computeDerivedTraces, computeStats } from './analysis.js';

export class PlotPanel {
  constructor(plotConfig, container) {
    this.config = plotConfig;
    this.container = container;
    this.traces = [];
    this.viewport = { xMin: 0, xMax: 1, yMin: -1, yMax: 1 };
    this.markers = [];
    this.stripBuffer = new Map(); // traceId -> ring buffer for continuous mode

    this._buildDOM();
    this._initRenderer();
    this._setupInteraction();
  }

  _buildDOM() {
    this.panel = document.createElement('div');
    this.panel.className = 'plot-panel';

    this.glCanvas = document.createElement('canvas');
    this.glCanvas.className = 'webgl-canvas';

    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.className = 'overlay-canvas';

    this.panel.appendChild(this.glCanvas);
    this.panel.appendChild(this.overlayCanvas);
    this.container.appendChild(this.panel);
  }

  _initRenderer() {
    let webglOk = false;
    try {
      this.renderer = new WebGLRenderer(this.glCanvas);
      // Verify WebGL is actually functional by checking shader compilation
      const gl = this.renderer.gl;
      if (!gl || gl.isContextLost() || !this.renderer.lineProgram) {
        throw new Error('WebGL context not functional');
      }
      webglOk = true;
      this.useWebGL = true;
      // Listen for context loss and switch to Canvas2D
      this.glCanvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.warn('WebGL context lost, switching to Canvas 2D');
        this._switchToCanvas2D();
      });
    } catch (e) {
      console.warn('WebGL not available, using Canvas 2D fallback:', e.message);
      this._switchToCanvas2D();
    }
    this.overlayCtx = this.overlayCanvas.getContext('2d');
  }

  _switchToCanvas2D() {
    const canvas2d = document.createElement('canvas');
    canvas2d.className = 'webgl-canvas';
    this.panel.replaceChild(canvas2d, this.glCanvas);
    this.glCanvas = canvas2d;
    this.renderer = new Canvas2DRenderer(this.glCanvas);
    this.useWebGL = false;
    this.resize(); // re-apply sizing
  }

  _setupInteraction() {
    // Click to place marker (skip if trigger was just dragged)
    let _justDraggedTrigger = false;
    this.overlayCanvas.addEventListener('click', (e) => {
      if (_justDraggedTrigger) { _justDraggedTrigger = false; return; }
      const rect = this.overlayCanvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const area = getPlotArea(this.overlayCanvas, this.config.type);
      if (mx < area.x || mx > area.x + area.w || my < area.y || my > area.y + area.h) return;

      const { xMin, xMax, yMin, yMax } = this.viewport;
      const dataX = xMin + ((mx - area.x) / area.w) * (xMax - xMin);
      const dataY = yMax - ((my - area.y) / area.h) * (yMax - yMin);

      // Snap to nearest trace point
      let closest = { x: dataX, y: dataY, dist: Infinity, traceLabel: '' };
      for (const t of this.traces) {
        if (!t.visible || !t.data) continue;
        for (let i = 0; i < t.data.length; i++) {
          const tx = t.xData ? t.xData[i] : i;
          const ty = t.data[i];
          const dx = (tx - dataX) / (xMax - xMin);
          const dy = (ty - dataY) / (yMax - yMin);
          const d = dx * dx + dy * dy;
          if (d < closest.dist) {
            closest = { x: tx, y: ty, dist: d, traceLabel: t.label };
          }
        }
      }

      if (e.shiftKey) {
        // Add harmonic marker
        this.markers.push({
          type: 'harmonic',
          fundamental: closest.x,
          harmonics: 5,
        });
      } else {
        // Standard marker (replace existing)
        this.markers = this.markers.filter(m => m.type !== 'standard');
        this.markers.push({
          type: 'standard',
          x: closest.x,
          y: closest.y,
          traceLabel: closest.traceLabel,
        });
      }
    });

    // Right-click to clear markers
    this.overlayCanvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.markers = [];
    });

    // Drag trigger level line
    let draggingTrigger = false;
    this.overlayCanvas.addEventListener('mousedown', (e) => {
      if (!this.config.trigger || this.config.trigger.mode === 'off') return;
      if (['spectrum', 'spectrogram'].includes(this.config.displayMode)) return;
      const rect = this.overlayCanvas.getBoundingClientRect();
      const my = e.clientY - rect.top;
      const area = getPlotArea(this.overlayCanvas, this.config.type);
      const { yMin, yMax } = this.viewport;
      const triggerY = area.y + area.h - ((this.config.trigger.level - yMin) / (yMax - yMin)) * area.h;
      if (Math.abs(my - triggerY) < 8) {
        draggingTrigger = true;
        e.preventDefault();
        e.stopPropagation();
        this.overlayCanvas.style.cursor = 'ns-resize';
      }
    });
    this.overlayCanvas.addEventListener('mousemove', (e) => {
      if (!draggingTrigger) {
        // Show resize cursor when near trigger line
        if (this.config.trigger && this.config.trigger.mode !== 'off'
            && !['spectrum', 'spectrogram'].includes(this.config.displayMode)) {
          const rect = this.overlayCanvas.getBoundingClientRect();
          const my = e.clientY - rect.top;
          const area = getPlotArea(this.overlayCanvas, this.config.type);
          const { yMin, yMax } = this.viewport;
          const triggerY = area.y + area.h - ((this.config.trigger.level - yMin) / (yMax - yMin)) * area.h;
          this.overlayCanvas.style.cursor = Math.abs(my - triggerY) < 8 ? 'ns-resize' : '';
        }
        return;
      }
      const rect = this.overlayCanvas.getBoundingClientRect();
      const my = e.clientY - rect.top;
      const area = getPlotArea(this.overlayCanvas, this.config.type);
      const { yMin, yMax } = this.viewport;
      const newLevel = yMax - ((my - area.y) / area.h) * (yMax - yMin);
      this.config.trigger.level = Math.max(-10, Math.min(10, newLevel));
    });
    const stopDrag = () => {
      if (draggingTrigger) {
        draggingTrigger = false;
        _justDraggedTrigger = true;
        this.overlayCanvas.style.cursor = '';
      }
    };
    this.overlayCanvas.addEventListener('mouseup', stopDrag);
    this.overlayCanvas.addEventListener('mouseleave', stopDrag);
  }

  resize() {
    const rect = this.panel.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    this.overlayCanvas.width = Math.round(rect.width * dpr);
    this.overlayCanvas.height = Math.round(rect.height * dpr);
    this.overlayCanvas.style.width = rect.width + 'px';
    this.overlayCanvas.style.height = rect.height + 'px';

    this.glCanvas.style.width = rect.width + 'px';
    this.glCanvas.style.height = rect.height + 'px';
    this.renderer.resize(rect.width, rect.height);
  }

  updateTraces(rawTraces) {
    const config = this.config;

    // Build trace objects with colors
    this.traces = rawTraces.map((rt, i) => {
      const existing = this.traces.find(t => t.label === rt.label);
      return {
        id: rt.label,
        label: rt.label,
        color: existing?.color || TRACE_COLORS[i % TRACE_COLORS.length],
        visible: existing?.visible ?? true,
        data: rt.data,
        xData: rt.xData || null,
        isDerived: false,
      };
    });

    // Continuous mode: maintain rolling buffer (not for scatter - breaks X/Y pairing)
    if (config.updateMode === 'continuous' && config.type !== 'scatter') {
      const maxPoints = 2048;
      for (const trace of this.traces) {
        let buf = this.stripBuffer.get(trace.id);
        if (!buf) {
          buf = {
            data: new Float32Array(maxPoints),
            xData: new Float32Array(maxPoints),
            len: 0,
            writePos: 0,
          };
          this.stripBuffer.set(trace.id, buf);
        }
        // Append new data + time
        const hasX = trace.xData && trace.xData.length === trace.data.length;
        for (let i = 0; i < trace.data.length; i++) {
          buf.data[buf.writePos] = trace.data[i];
          buf.xData[buf.writePos] = hasX ? trace.xData[i] : buf.writePos;
          buf.writePos = (buf.writePos + 1) % maxPoints;
          if (buf.len < maxPoints) buf.len++;
        }
        // Linearize for rendering
        const linearized = new Float32Array(buf.len);
        const linearizedX = new Float32Array(buf.len);
        const start = buf.len < maxPoints ? 0 : buf.writePos;
        for (let i = 0; i < buf.len; i++) {
          linearized[i] = buf.data[(start + i) % maxPoints];
          linearizedX[i] = buf.xData[(start + i) % maxPoints];
        }
        trace.data = linearized;
        trace.xData = linearizedX;
      }
    }

    // Compute derived traces
    const derived = computeDerivedTraces(config, this.traces);
    this.traces = [...this.traces, ...derived];

    // Apply trigger + scope windowing for scope/persistence/gradient (cartesian only)
    const isScopeish = config.type === 'cartesian'
      && !['spectrum', 'spectrogram'].includes(config.displayMode);
    if (isScopeish && config.trigger.mode !== 'off') {
      this._applyTrigger(config);
    }
  }

  _applyTrigger(config) {
    const trigger = config.trigger;
    const scope = config.scope;
    const firstTrace = this.traces.find(t => t.visible && !t.isDerived && t.data);
    if (!firstTrace || firstTrace.data.length < 4) return;

    const data = firstTrace.data;
    const xData = firstTrace.xData;
    const level = trigger.level;
    const rising = trigger.edge === 'rising';
    const sampleRate = config._sampleRate || 1000;

    // How many samples fit in the scope window
    const windowTime = scope.timeDiv * scope.divisions;
    const windowSamples = Math.min(Math.floor(windowTime * sampleRate), data.length);
    if (windowSamples < 2) return;

    // Search backwards from end of buffer for the last trigger crossing
    // This way we always show the most recent triggered view
    let triggerIdx = -1;
    const searchStart = Math.max(1, data.length - windowSamples * 3);
    // Search from searchStart forward, find the LAST crossing that leaves enough post-trigger data
    for (let i = data.length - windowSamples; i >= searchStart; i--) {
      if (rising) {
        if (data[i - 1] <= level && data[i] > level) { triggerIdx = i; break; }
      } else {
        if (data[i - 1] >= level && data[i] < level) { triggerIdx = i; break; }
      }
    }

    if (triggerIdx === -1) {
      if (trigger.mode === 'normal' && this._lastTriggeredTraces) {
        this.traces = this._lastTriggeredTraces;
        return;
      }
      // Auto: show last windowSamples of data
      triggerIdx = data.length - windowSamples;
    }

    // Window: trigger point at 10% from left
    const prePoints = Math.floor(windowSamples * 0.1);
    const start = Math.max(0, triggerIdx - prePoints);
    const end = Math.min(data.length, start + windowSamples);

    for (const trace of this.traces) {
      if (!trace.data || trace.data.length === 0) continue;
      trace.data = trace.data.slice(start, end);
      if (trace.xData) trace.xData = trace.xData.slice(start, end);
    }

    this._lastTriggeredTraces = this.traces.map(t => ({
      ...t,
      data: t.data ? new Float32Array(t.data) : null,
      xData: t.xData ? new Float32Array(t.xData) : null,
    }));
  }

  render() {
    const config = this.config;
    const visibleTraces = this.traces.filter(t => t.visible);

    // Compute viewport
    this.viewport = computeViewport(config, visibleTraces);

    // Override viewport for scope mode with volts/div
    const isScopeish = config.type === 'cartesian'
      && !['spectrum', 'spectrogram'].includes(config.displayMode);
    if (isScopeish && config.scope) {
      const vd = config.scope.voltsDiv;
      const divs = config.scope.divisions;
      const halfRange = (vd * divs) / 2;
      this.viewport.yMin = -halfRange;
      this.viewport.yMax = halfRange;
    }

    // Determine effective display mode.
    // Spectrum and spectrogram require cartesian (FFT on time-domain data).
    // Gradient and persistence work with all plot types.
    let displayMode = config.displayMode;
    if ((displayMode === 'spectrogram' || displayMode === 'spectrum') && config.type !== 'cartesian') {
      displayMode = 'scope';
    }

    // WebGL rendering based on display mode
    switch (displayMode) {
      case 'spectrum': {
        // Live FFT: compute spectrum, render as line chart with freq on X, dB on Y
        const firstTrace = visibleTraces[0];
        if (firstTrace) {
          const sampleRate = config._sampleRate || 1000;
          const n = nextPow2(firstTrace.data.length);
          const windowed = applyWindow(firstTrace.data.slice(0, n));
          const real = new Float32Array(n);
          const imag = new Float32Array(n);
          real.set(windowed);
          fft(real, imag);
          const spectrum = magnitudeSpectrum(real, imag, true);
          // Build frequency axis (Hz)
          const freqData = new Float32Array(spectrum.length);
          const binWidth = sampleRate / n;
          for (let i = 0; i < spectrum.length; i++) freqData[i] = i * binWidth;

          const spectrumTraces = [{
            id: 'spectrum',
            label: `${firstTrace.label} (FFT)`,
            color: firstTrace.color || '#58a6ff',
            visible: true,
            data: spectrum,
            xData: freqData,
            isDerived: false,
          }];
          // Add derived traces on the spectrum (e.g., max hold on FFT)
          const derivedSpec = computeDerivedTraces(config, spectrumTraces);
          const allSpec = [...spectrumTraces, ...derivedSpec];

          const specViewport = computeViewport(
            {
              ...config,
              xAxis: { ...config.xAxis, label: 'Frequency', unit: 'Hz' },
              yAxis: { ...config.yAxis, label: 'Magnitude', unit: 'dB', scaling: 'expand-only' },
            },
            allSpec
          );
          this.viewport = specViewport;
          this.renderer.renderStandard(allSpec, specViewport, 'cartesian');
          // Store spectrum traces for overlay stats/legend
          this._spectrumTraces = allSpec;
        }
        break;
      }
      case 'persistence':
        this.renderer.renderPersistence(
          visibleTraces, this.viewport, config.type, config.persistence.decay
        );
        break;
      case 'spectrogram': {
        // Compute FFT for spectrogram (cartesian only)
        const firstTrace = visibleTraces[0];
        if (firstTrace) {
          const n = nextPow2(firstTrace.data.length);
          const windowed = applyWindow(firstTrace.data.slice(0, n));
          const real = new Float32Array(n);
          const imag = new Float32Array(n);
          real.set(windowed);
          fft(real, imag);
          const spectrum = magnitudeSpectrum(real, imag, true);
          this.renderer.renderSpectrogram(spectrum, this.viewport, config.spectrogram);
        }
        break;
      }
      case 'gradient':
        this.renderer.renderGradient(
          visibleTraces, this.viewport, config.type, config.gradient
        );
        break;
      default:
        this.renderer.renderStandard(visibleTraces, this.viewport, config.type);
    }

    // 2D overlay - for spectrum mode, use spectrum traces and override axis labels
    if (displayMode === 'spectrum' && this._spectrumTraces) {
      const specConfig = {
        ...config,
        xAxis: { ...config.xAxis, label: 'Frequency', unit: 'Hz' },
        yAxis: { ...config.yAxis, label: 'Magnitude', unit: 'dB' },
      };
      renderOverlay(
        this.overlayCtx, this.overlayCanvas,
        specConfig, this._spectrumTraces, this.viewport, this.markers
      );
    } else {
      renderOverlay(
        this.overlayCtx, this.overlayCanvas,
        config, this.traces, this.viewport, this.markers
      );
    }
  }

  clearAccumulation() {
    this.renderer.clearPersistence();
    this.stripBuffer.clear();
  }

  getActiveMarker() {
    const std = this.markers.find(m => m.type === 'standard');
    if (std) return `${std.traceLabel}: (${std.x.toFixed(2)}, ${std.y.toFixed(4)})`;
    return '--';
  }

  getTraceStats() {
    const visible = this.traces.filter(t => t.visible && !t.isDerived);
    if (visible.length === 0) return null;
    return computeStats(visible[0].data);
  }

  destroy() {
    this.panel.remove();
  }
}
