// SPDX-License-Identifier: GPL-3.0
// main.js --- Entry point, render loop, state initialization
// Copyright (c) 2026 Jakob Kastelic
// ===== Blitscope - Main Entry Point =====

import { createDefaultState } from './state.js';
import { initTheme, toggleTheme } from './theme.js';
import { generateFrame, resetGenerators } from './signals.js';
import { LayoutManager } from './layout.js';
import { initSidebar, rebuildSidebar } from './sidebar.js';
import { captureScreenshot, captureCSV } from './capture.js';

// ===== State =====
const state = createDefaultState();
window._blitState = state; // debug access

// ===== Layout Manager =====
const layoutMgr = new LayoutManager(state, handleSidebarAction);

// ===== Init =====
function init() {
  initTheme(state);
  layoutMgr.rebuild();
  initSidebar(state, layoutMgr.getPanels(), handleSidebarAction);
  bindToolbar();
  window.addEventListener('resize', debounce(() => layoutMgr.resize(), 100));
  requestAnimationFrame(renderLoop);
}

// ===== Toolbar =====
function bindToolbar() {
  document.getElementById('btn-theme').addEventListener('click', () => toggleTheme(state));
  document.getElementById('btn-screenshot').addEventListener('click', () => captureScreenshot(layoutMgr.getPanels()));
  document.getElementById('btn-csv').addEventListener('click', () => captureCSV(layoutMgr.getPanels()));
}

// ===== Sidebar Actions =====
function handleSidebarAction(action, arg) {
  switch (action) {
    case 'rebuild':
      layoutMgr.rebuild();
      initSidebar(state, layoutMgr.getPanels(), handleSidebarAction);
      break;
    case 'rebuildSidebar':
      initSidebar(state, layoutMgr.getPanels(), handleSidebarAction);
      break;
    case 'clearAccumulation':
      layoutMgr.clearAccumulation(arg);
      break;
  }
}

// ===== Render Loop =====
let lastTime = 0;
let frameCount = 0;
let fpsAccum = 0;
let lastFpsUpdate = 0;

function renderLoop(now) {
  requestAnimationFrame(renderLoop);

  const dt = now - lastTime;
  lastTime = now;

  if (state.running) {
    const drawStart = performance.now();

    // Generate data once, share across all visible plots
    const visibleIds = layoutMgr.getVisiblePlotIds();
    const frameData = visibleIds.size > 0 ? generateFrame(state.preset, state.signalParams) : null;
    const traceDataSets = state.plots.map((plot) => {
      if (!visibleIds.has(plot.id)) return null;
      return frameData;
    });

    // Store sample rate on each plot config so overlay can compute Hz
    for (const plot of state.plots) {
      plot._sampleRate = state.signalParams.sampleRate;
      plot._pointsPerFrame = state.signalParams.pointsPerFrame;
    }

    // Feed data into layout manager
    layoutMgr.updateData(traceDataSets);

    // Render all plots
    layoutMgr.render();

    const drawTime = performance.now() - drawStart;
    state.perf.drawTime = drawTime;
    state.perf.pointsPerFrame = state.signalParams.pointsPerFrame;
  }

  // FPS counter
  frameCount++;
  fpsAccum += dt;
  if (now - lastFpsUpdate > 500) {
    state.perf.fps = Math.round(1000 * frameCount / fpsAccum);
    state.perf.dropped = state.perf.fps < 50;
    frameCount = 0;
    fpsAccum = 0;
    lastFpsUpdate = now;
    updatePerfDisplay();
    updateStatusBar();
  }
}

// ===== Performance Display =====
function updatePerfDisplay() {
  const p = state.perf;
  document.getElementById('perf-fps').textContent = `${p.fps} FPS`;
  document.getElementById('perf-points').textContent = `${p.pointsPerFrame} pts/f`;
  document.getElementById('perf-draw').textContent = `${p.drawTime.toFixed(1)} ms`;
  const dropped = document.getElementById('perf-dropped');
  if (p.dropped) dropped.classList.remove('hidden');
  else dropped.classList.add('hidden');
}

function updateStatusBar() {
  const plots = state.plots;
  const activePlot = plots[0];
  if (!activePlot) return;

  document.getElementById('status-signal').textContent = `Signal: ${state.preset}`;
  document.getElementById('status-mode').textContent =
    `${activePlot.type} / ${activePlot.displayMode}`;

  const panels = layoutMgr.getPanels();
  const traceCount = panels.reduce((sum, p) => sum + p.traces.filter(t => t.visible).length, 0);
  document.getElementById('status-traces').textContent = `Traces: ${traceCount}`;

  document.getElementById('status-marker').textContent = `Marker: ${layoutMgr.getActiveMarker()}`;
}

// ===== Utility =====
function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ===== Boot =====
document.addEventListener('DOMContentLoaded', init);
