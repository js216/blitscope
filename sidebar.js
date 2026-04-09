// SPDX-License-Identifier: GPL-3.0
// sidebar.js --- Sidebar UI controls
// Copyright (c) 2026 Jakob Kastelic
// ===== Sidebar Controls =====

import {
  PRESETS, PLOT_TYPES, UPDATE_MODES, DISPLAY_MODES,
  SCALING_MODES, COLOR_MAPS, TRACE_COLORS, createDefaultPlot, notify,
} from './state.js';

let currentState = null;
let currentPlots = null;
let onUpdate = null;

export function initSidebar(state, plotPanels, updateCb) {
  currentState = state;
  currentPlots = plotPanels;
  onUpdate = updateCb;
  rebuildSidebar();
}

export function rebuildSidebar() {
  const container = document.getElementById('sidebar-content');
  container.innerHTML = '';

  buildSection(container, 'Signal Source', buildSignalControls);
  buildSection(container, 'Layout', buildLayoutControls);

  // Show controls only for plots in the active tab
  const plots = currentState.plots;
  for (let i = 0; i < plots.length; i++) {
    const plot = plots[i];
    if (plot.tab !== currentState.activeTab) continue;
    const label = plot.title || `Plot ${i + 1}`;
    buildSection(container, label, (body) => {
      buildPlotControls(body, i);
      buildAxisControls(body, i);
      buildTraceControls(body, i);
      buildDerivedControls(body, i);
    });
  }
}

function buildSection(container, title, buildFn, collapsed = false) {
  const section = document.createElement('div');
  section.className = 'sidebar-section' + (collapsed ? ' collapsed' : '');

  const header = document.createElement('div');
  header.className = 'sidebar-section-header';
  header.innerHTML = `<span>${title}</span><span class="chevron">▼</span>`;
  header.addEventListener('click', () => section.classList.toggle('collapsed'));

  const body = document.createElement('div');
  body.className = 'sidebar-section-body';
  buildFn(body);

  section.appendChild(header);
  section.appendChild(body);
  container.appendChild(section);
}

// ===== Signal Source =====
function buildSignalControls(body) {
  const p = currentState.signalParams;

  addSelect(body, 'Preset', PRESETS.map(p => p.id), currentState.preset,
    PRESETS.map(p => p.name), (v) => { currentState.preset = v; triggerUpdate(); });

  addRange(body, 'Points/Frame', p.pointsPerFrame, 64, 4096, 64,
    (v) => { p.pointsPerFrame = v; });

  addRange(body, 'Sample Rate', p.sampleRate, 100, 10000, 100,
    (v) => { p.sampleRate = v; });

  if (currentState.preset === 'custom') {
    // Formula inputs
    addFormulaInput(body, 'f(t)', p.customFormula, (v) => { p.customFormula = v; });
    if (p.customError) {
      const err = document.createElement('div');
      err.style.cssText = 'font-size:10px;color:var(--error);padding:2px 0;word-break:break-all';
      err.textContent = p.customError;
      body.appendChild(err);
    }
    // Help text
    const help = document.createElement('div');
    help.style.cssText = 'font-size:9px;color:var(--text-muted);padding:2px 0;line-height:1.4';
    help.textContent = 'Variables: t (sec), i (index), n (points), fs (rate), f (carrier freq). '
      + 'Functions: sin, cos, tan, abs, sqrt, exp, log, pow, min, max, random, noise(), '
      + 'square, sawtooth, triangle, sinc, PI, E';
    body.appendChild(help);

    addRange(body, 'Carrier Freq (f)', p.carrierFreq, 1, 200, 1,
      (v) => { p.carrierFreq = v; });
  } else {
    addRange(body, 'Carrier Freq', p.carrierFreq, 1, 200, 1,
      (v) => { p.carrierFreq = v; });

    addRange(body, 'Mod Freq', p.modFreq, 0.5, 50, 0.5,
      (v) => { p.modFreq = v; });

    addRange(body, 'Noise', p.noiseLevel, 0, 1, 0.01,
      (v) => { p.noiseLevel = v; });

    addRange(body, 'Tones', p.numTones, 1, 8, 1,
      (v) => { p.numTones = v; });
  }

  // Run/pause
  const row = document.createElement('div');
  row.className = 'control-row';
  const runBtn = document.createElement('button');
  runBtn.textContent = currentState.running ? 'Pause' : 'Run';
  runBtn.style.flex = '1';
  runBtn.addEventListener('click', () => {
    currentState.running = !currentState.running;
    runBtn.textContent = currentState.running ? 'Pause' : 'Run';
  });
  row.appendChild(runBtn);
  body.appendChild(row);
}

// ===== Layout =====
function buildLayoutControls(body) {
  // + New Pane / + New Tab buttons
  const addRow = document.createElement('div');
  addRow.className = 'control-row';

  const addPane = document.createElement('button');
  addPane.textContent = '+ New Pane';
  addPane.className = 'btn-sm';
  addPane.style.flex = '1';
  addPane.addEventListener('click', () => {
    const plotId = `plot-${Date.now()}`;
    const n = currentState.plots.length + 1;
    currentState.plots.push(createDefaultPlot(plotId, `Plot ${n}`, currentState.activeTab));
    triggerUpdate();
    rebuildSidebar();
  });

  const addTab = document.createElement('button');
  addTab.textContent = '+ New Tab';
  addTab.className = 'btn-sm';
  addTab.style.flex = '1';
  addTab.addEventListener('click', () => {
    const tabId = `tab-${Date.now()}`;
    const plotId = `plot-${Date.now()}`;
    const tabNum = currentState.tabs.length + 1;
    const plotNum = currentState.plots.length + 1;
    currentState.tabs.push({ id: tabId, title: `Tab ${tabNum}` });
    currentState.plots.push(createDefaultPlot(plotId, `Plot ${plotNum}`, tabId));
    currentState.activeTab = tabId;
    triggerUpdate();
    rebuildSidebar();
  });

  addRow.appendChild(addPane);
  addRow.appendChild(addTab);
  body.appendChild(addRow);

  // Summary
  const activePanes = currentState.plots.filter(p => p.tab === currentState.activeTab);
  const activeTabObj = currentState.tabs.find(t => t.id === currentState.activeTab);
  const summary = document.createElement('div');
  summary.className = 'control-label';
  summary.style.marginTop = '4px';
  summary.textContent = `${currentState.tabs.length} tab${currentState.tabs.length !== 1 ? 's' : ''}, ${activePanes.length} pane${activePanes.length !== 1 ? 's' : ''} in "${activeTabObj?.title || '?'}"`;

  body.appendChild(summary);
}

// ===== Plot Controls =====
function buildPlotControls(body, plotIdx) {
  const plot = currentState.plots[plotIdx];

  addInput(body, 'Title', plot.title, (v) => { plot.title = v; });

  addSelect(body, 'Plot Type', PLOT_TYPES, plot.type, null, (v) => {
    plot.type = v;
    if (v === 'polar') {
      plot.xAxis.label = 'Angle';
      plot.yAxis.label = 'Radius';
    } else if (v === 'scatter') {
      plot.xAxis.label = 'X';
      plot.yAxis.label = 'Y';
      plot.updateMode = 'frames'; // strip chart doesn't apply to XY
    } else {
      plot.xAxis.label = 'Sample';
      plot.yAxis.label = 'Amplitude';
    }
    triggerUpdate();
    rebuildSidebar();
  });

  addSelect(body, 'Update', UPDATE_MODES, plot.updateMode, null, (v) => {
    plot.updateMode = v;
    triggerUpdate();
  });

  // Filter display modes by plot type:
  // - spectrogram only makes sense for cartesian (needs time-domain data for FFT)
  // - persistence and gradient work with all plot types
  const availableDisplayModes = DISPLAY_MODES.filter(m => {
    if ((m === 'spectrogram' || m === 'spectrum') && plot.type !== 'cartesian') return false;
    return true;
  });
  // Reset to 'scope' if current mode isn't valid for this plot type
  if (!availableDisplayModes.includes(plot.displayMode)) {
    plot.displayMode = 'scope';
  }
  addSelect(body, 'Display', availableDisplayModes, plot.displayMode, null, (v) => {
    plot.displayMode = v;
    rebuildSidebar();  // only rebuild sidebar, not layout (avoids destroying all panes)
  });

  // Scope controls (time/div, volts/div, trigger)
  if (!['spectrum', 'spectrogram'].includes(plot.displayMode) && plot.type === 'cartesian') {
    const timeDivValues = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0];
    const voltsDivValues = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0];
    addSelect(body, 'Time/div',
      timeDivValues.map(String), String(plot.scope.timeDiv),
      timeDivValues.map(v => v >= 1 ? v + ' s' : v >= 0.001 ? (v * 1000) + ' ms' : (v * 1e6) + ' us'),
      (v) => { plot.scope.timeDiv = parseFloat(v); });
    addSelect(body, 'Volts/div',
      voltsDivValues.map(String), String(plot.scope.voltsDiv),
      voltsDivValues.map(v => v + '/div'),
      (v) => { plot.scope.voltsDiv = parseFloat(v); });
    addSelect(body, 'Trigger', ['off', 'auto', 'normal'], plot.trigger.mode, null,
      (v) => { plot.trigger.mode = v; rebuildSidebar(); });
    if (plot.trigger.mode !== 'off') {
      addSelect(body, 'Edge', ['rising', 'falling'], plot.trigger.edge, null,
        (v) => { plot.trigger.edge = v; });
      addRange(body, 'Level', plot.trigger.level, -5, 5, 0.01,
        (v) => { plot.trigger.level = v; });
    }
  }

  // Display-mode specific controls
  if (plot.displayMode === 'persistence') {
    addRange(body, 'Decay', plot.persistence.decay, 0.8, 0.999, 0.001,
      (v) => { plot.persistence.decay = v; });
  }

  if (plot.displayMode === 'spectrogram') {
    addSelect(body, 'Color Map', COLOR_MAPS, plot.spectrogram.colorMap, null,
      (v) => { plot.spectrogram.colorMap = v; });
  }

  if (plot.displayMode === 'gradient') {
    addRange(body, 'Decay', plot.gradient.decay, 0.9, 0.999, 0.001,
      (v) => { plot.gradient.decay = v; });
    addSelect(body, 'Color Map', COLOR_MAPS, plot.gradient.colorMap || 'inferno', null,
      (v) => { plot.gradient.colorMap = v; });
  }

  addCheckbox(body, 'Grid', plot.showGrid, (v) => { plot.showGrid = v; });
  addCheckbox(body, 'Legend', plot.showLegend, (v) => { plot.showLegend = v; });
  addCheckbox(body, 'Stats', plot.showStats, (v) => { plot.showStats = v; });

  // Clear accumulation button
  if (plot.displayMode !== 'scope') {
    const row = document.createElement('div');
    row.className = 'control-row';
    const btn = document.createElement('button');
    btn.textContent = 'Clear Accumulation';
    btn.className = 'btn-sm';
    btn.addEventListener('click', () => {
      if (onUpdate) onUpdate('clearAccumulation', plot.id);
    });
    row.appendChild(btn);
    body.appendChild(row);
  }
}

// ===== Axis Controls =====
function buildAxisControls(body, plotIdx) {
  addSeparator(body, 'Axes');
  const plot = currentState.plots[plotIdx];

  for (const axisKey of ['xAxis', 'yAxis']) {
    const axis = plot[axisKey];
    const label = axisKey === 'xAxis' ? 'X' : 'Y';

    const hdr = document.createElement('div');
    hdr.className = 'control-row';
    hdr.innerHTML = `<span class="control-label" style="font-weight:600">${label} Axis</span>`;
    body.appendChild(hdr);

    addInput(body, 'Label', axis.label, (v) => { axis.label = v; });
    addInput(body, 'Unit', axis.unit, (v) => { axis.unit = v; });
    addSelect(body, 'Scaling', SCALING_MODES, axis.scaling, null, (v) => {
      axis.scaling = v;
      if (v === 'fixed') {
        rebuildSidebar();
      }
    });

    if (axis.scaling === 'fixed') {
      addNumber(body, 'Min', axis.min ?? 0, (v) => { axis.min = v; });
      addNumber(body, 'Max', axis.max ?? 1, (v) => { axis.max = v; });
    }

    addCheckbox(body, 'Log', axis.log, (v) => { axis.log = v; });
  }
}

// ===== Trace Controls =====
function buildTraceControls(body, plotIdx) {
  const panel = currentPlots[plotIdx];
  if (!panel) return;

  const traces = panel.traces.filter(t => !t.isDerived);
  if (traces.length === 0) return;

  for (const trace of traces) {
    const item = document.createElement('div');
    item.className = 'trace-item';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = trace.color;
    colorInput.addEventListener('input', (e) => { trace.color = e.target.value; });

    const label = document.createElement('span');
    label.className = 'trace-label';
    label.textContent = trace.label;

    const vis = document.createElement('input');
    vis.type = 'checkbox';
    vis.checked = trace.visible;
    vis.addEventListener('change', () => { trace.visible = vis.checked; });

    item.appendChild(colorInput);
    item.appendChild(label);
    item.appendChild(vis);
    body.appendChild(item);
  }
}

// ===== Derived Trace Controls =====
function addSeparator(body, text) {
  const sep = document.createElement('div');
  sep.style.cssText = 'border-top:1px solid var(--border);margin:8px 0 4px;padding-top:4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted)';
  sep.textContent = text;
  body.appendChild(sep);
}

function buildDerivedControls(body, plotIdx) {
  const plot = currentState.plots[plotIdx];
  const panel = currentPlots[plotIdx];
  const sourceTraces = panel ? panel.traces.filter(t => !t.isDerived) : [];

  for (let i = 0; i < plot.derivedTraces.length; i++) {
    const dt = plot.derivedTraces[i];
    const row = document.createElement('div');
    row.className = 'control-row';
    row.innerHTML = `
      <span class="control-label">${dt.type} of ${dt.sourceTraceId || '?'}</span>
    `;
    const rmBtn = document.createElement('button');
    rmBtn.textContent = 'X';
    rmBtn.className = 'btn-sm';
    rmBtn.addEventListener('click', () => {
      plot.derivedTraces.splice(i, 1);
      rebuildSidebar();
    });
    row.appendChild(rmBtn);
    body.appendChild(row);

    if (dt.type === 'average') {
      addRange(body, 'Window', dt.window || 16, 2, 128, 1,
        (v) => { dt.window = v; });
    }
  }

  // Add derived trace buttons
  if (sourceTraces.length > 0) {
    const row = document.createElement('div');
    row.className = 'control-row';

    const addAvg = document.createElement('button');
    addAvg.textContent = '+ Avg';
    addAvg.className = 'btn-sm';
    addAvg.addEventListener('click', () => {
      plot.derivedTraces.push({
        type: 'average',
        sourceTraceId: sourceTraces[0].id,
        window: 16,
      });
      rebuildSidebar();
    });

    const addMax = document.createElement('button');
    addMax.textContent = '+ MaxHold';
    addMax.className = 'btn-sm';
    addMax.addEventListener('click', () => {
      plot.derivedTraces.push({
        type: 'maxhold',
        sourceTraceId: sourceTraces[0].id,
      });
      rebuildSidebar();
    });

    row.appendChild(addAvg);
    row.appendChild(addMax);
    body.appendChild(row);
  }
}

// ===== Control Helpers =====
function addSelect(parent, label, values, current, labels, onChange) {
  const row = document.createElement('div');
  row.className = 'control-row';
  const lbl = document.createElement('span');
  lbl.className = 'control-label';
  lbl.textContent = label;
  const sel = document.createElement('select');
  values.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = labels ? labels[i] : v;
    if (v === current) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => onChange(sel.value));
  row.appendChild(lbl);
  row.appendChild(sel);
  parent.appendChild(row);
}

function addRange(parent, label, current, min, max, step, onChange) {
  const row = document.createElement('div');
  row.className = 'control-row';
  const lbl = document.createElement('span');
  lbl.className = 'control-label';
  lbl.textContent = label;
  const val = document.createElement('span');
  val.className = 'control-value';
  val.textContent = typeof current === 'number' ? current.toFixed(step < 1 ? 3 : 0) : current;
  val.style.minWidth = '40px';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = min;
  range.max = max;
  range.step = step;
  range.value = current;
  range.addEventListener('input', () => {
    const v = parseFloat(range.value);
    val.textContent = v.toFixed(step < 1 ? 3 : 0);
    onChange(v);
  });
  row.appendChild(lbl);
  row.appendChild(range);
  row.appendChild(val);
  parent.appendChild(row);
}

function addCheckbox(parent, label, current, onChange) {
  const row = document.createElement('div');
  row.className = 'control-row';
  const lbl = document.createElement('span');
  lbl.className = 'control-label';
  lbl.textContent = label;
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = current;
  cb.addEventListener('change', () => onChange(cb.checked));
  row.appendChild(lbl);
  row.appendChild(cb);
  parent.appendChild(row);
}

function addNumber(parent, label, current, onChange) {
  const row = document.createElement('div');
  row.className = 'control-row';
  const lbl = document.createElement('span');
  lbl.className = 'control-label';
  lbl.textContent = label;
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.value = current;
  inp.addEventListener('change', () => onChange(parseFloat(inp.value)));
  row.appendChild(lbl);
  row.appendChild(inp);
  parent.appendChild(row);
}

function addFormulaInput(parent, label, current, onChange) {
  const row = document.createElement('div');
  row.className = 'flex-col';
  row.style.marginBottom = '6px';
  const lbl = document.createElement('span');
  lbl.className = 'control-label';
  lbl.textContent = label;
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = current || '';
  inp.style.width = '100%';
  inp.style.fontFamily = 'var(--font-mono)';
  inp.style.fontSize = '11px';
  inp.placeholder = 'e.g. sin(2*PI*20*t)';
  inp.addEventListener('change', () => onChange(inp.value));
  // Also update on Enter key
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { onChange(inp.value); inp.blur(); }
  });
  row.appendChild(lbl);
  row.appendChild(inp);
  parent.appendChild(row);
}

function addInput(parent, label, current, onChange) {
  const row = document.createElement('div');
  row.className = 'control-row';
  const lbl = document.createElement('span');
  lbl.className = 'control-label';
  lbl.textContent = label;
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = current || '';
  inp.style.width = '100px';
  inp.addEventListener('change', () => onChange(inp.value));
  row.appendChild(lbl);
  row.appendChild(inp);
  parent.appendChild(row);
}

function triggerUpdate() {
  if (onUpdate) onUpdate('rebuild');
}
