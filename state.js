// SPDX-License-Identifier: GPL-3.0
// state.js --- Default state, presets, constants, pub/sub
// Copyright (c) 2026 Jakob Kastelic
// ===== Blitscope Application State =====

const TRACE_COLORS = [
  '#58a6ff', '#f0883e', '#3fb950', '#f85149',
  '#bc8cff', '#39d2c0', '#d29922', '#ff7b72',
  '#79c0ff', '#ffa657', '#56d364', '#ff9bce',
  '#b392f0', '#56d4dd', '#e3b341', '#db61a2',
];

function createDefaultPlot(id, title, tab = 'default') {
  return {
    id,
    title,
    tab,                        // which tab this plot belongs to
    type: 'cartesian',        // cartesian | scatter | polar
    updateMode: 'continuous',  // continuous | frames
    displayMode: 'scope',       // none | persistence | spectrogram | gradient

    xAxis: {
      label: 'Time',
      unit: 's',
      min: null,
      max: null,
      log: false,
      scaling: 'windowed',     // fixed | windowed | expand-only | peak-decay | symmetric-zero | baseline-zero
      gridColor: null,
      referenceLines: [],
    },
    yAxis: {
      label: 'Amplitude',
      unit: '',
      min: null,
      max: null,
      log: false,
      scaling: 'windowed',
      gridColor: null,
      referenceLines: [],
    },

    traces: [],
    derivedTraces: [],
    markers: [],

    scope: { timeDiv: 0.02, voltsDiv: 0.5, divisions: 10 },  // seconds/div, amplitude/div
    trigger: { mode: 'auto', edge: 'rising', level: 0 },  // mode: off | auto | normal
    persistence: { decay: 0.96 },
    spectrogram: { colorMap: 'inferno', decimation: 1, rows: 256 },
    gradient: { decay: 0.985, colorMap: 'inferno' },

    showStats: true,
    showGrid: true,
    showLegend: true,
  };
}

export function createDefaultState() {
  return {
    theme: null,  // set from browser preference
    activeTab: 'tab-1',    // id of the active tab
    tabs: [{ id: 'tab-1', title: 'Tab 1' }],
    running: true,

    plots: [
      { ...createDefaultPlot('plot-1', 'Pane 1', 'tab-1'), displayMode: 'spectrum' },
      { ...createDefaultPlot('plot-2', 'Pane 2', 'tab-1'), displayMode: 'spectrogram' },
    ],

    preset: 'am-signal',
    signalParams: {
      carrierFreq: 20,
      modFreq: 4,
      noiseLevel: 0.08,
      pointsPerFrame: 512,
      sampleRate: 1000,
      numTones: 3,
      sweepRate: 0.5,
      customFormula: 'sin(2*PI*20*t) + 0.3*sin(2*PI*55*t)',
      customError: '',
    },

    perf: {
      fps: 0,
      pointsPerFrame: 0,
      drawTime: 0,
      dropped: false,
    },
  };
}

export const PRESETS = [
  { id: 'sine-noise', name: 'Sine + Noise' },
  { id: 'am-signal', name: 'AM Modulated' },
  { id: 'multi-tone', name: 'Multi-Tone' },
  { id: 'sweep', name: 'Frequency Sweep' },
  { id: 'lissajous', name: 'Lissajous (XY)' },
  { id: 'sensor', name: 'Noisy Sensor' },
  { id: 'pulse', name: 'Pulse Train' },
  { id: 'chirp', name: 'Chirp Signal' },
  { id: 'custom', name: 'Custom Formula' },
];

export const PLOT_TYPES = ['cartesian', 'scatter', 'polar'];
export const UPDATE_MODES = ['continuous', 'frames'];
export const DISPLAY_MODES = ['scope', 'spectrum', 'persistence', 'spectrogram', 'gradient'];
export const SCALING_MODES = ['fixed', 'windowed', 'expand-only', 'peak-decay', 'symmetric-zero', 'baseline-zero'];
export const COLOR_MAPS = ['inferno', 'viridis', 'plasma', 'magma', 'turbo', 'grayscale'];

export { TRACE_COLORS, createDefaultPlot };

// Simple pub/sub for state changes
const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function notify(state) { for (const fn of listeners) fn(state); }
