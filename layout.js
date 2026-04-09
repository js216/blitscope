// SPDX-License-Identifier: GPL-3.0
// layout.js --- Tab and pane layout manager
// Copyright (c) 2026 Jakob Kastelic
// ===== Layout Manager =====
// Tabs contain panes. Each tab shows its panes stacked vertically.
// Only the active tab's panes are rendered.

import { PlotPanel } from './plot.js';

export class LayoutManager {
  constructor(state, onAction) {
    this.state = state;
    this.onAction = onAction;
    this.container = document.getElementById('plot-container');
    this.tabBar = document.getElementById('tab-bar');
    this.tabsEl = document.getElementById('plot-tabs');
    this.panels = [];
    this.plotIdToPanel = new Map();
  }

  rebuild() {
    for (const entry of this.panels) entry.panel.destroy();
    this.panels = [];
    this.plotIdToPanel.clear();
    this.container.innerHTML = '';

    const { tabs, plots, activeTab } = this.state;

    // Validate activeTab
    if (!tabs.find(t => t.id === activeTab)) {
      this.state.activeTab = tabs.length > 0 ? tabs[0].id : null;
    }

    // Build tab bar (hide if only 1 tab)
    if (tabs.length > 1) {
      this.tabsEl.classList.remove('hidden');
      this._buildTabBar();
    } else {
      this.tabsEl.classList.add('hidden');
      this.tabBar.innerHTML = '';
    }

    // Render panes for the active tab
    const activePanes = plots.filter(p => p.tab === this.state.activeTab);
    for (let i = 0; i < activePanes.length; i++) {
      if (i > 0) {
        const handle = document.createElement('div');
        handle.className = 'split-handle';
        this._makeDraggable(handle);
        this.container.appendChild(handle);
      }
      const wrapper = this._createPaneWrapper(activePanes[i], activePanes.length);
      this.container.appendChild(wrapper);
      const panel = new PlotPanel(activePanes[i], wrapper);
      this.panels.push({ plotId: activePanes[i].id, panel });
      this.plotIdToPanel.set(activePanes[i].id, panel);
    }

    requestAnimationFrame(() => this.resize());
  }

  _createPaneWrapper(plot, paneCount) {
    const wrapper = document.createElement('div');
    wrapper.className = 'plot-panel-wrapper pane-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.flex = '1';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.minHeight = '120px';

    // Close button (only if more than 1 pane in this tab, or more than 1 tab)
    const canClose = paneCount > 1 || this.state.tabs.length > 1;
    if (canClose) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'pane-close-btn';
      closeBtn.textContent = '\u00d7';
      closeBtn.title = 'Close this pane';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._removePlot(plot.id);
      });
      wrapper.appendChild(closeBtn);
    }

    return wrapper;
  }

  _buildTabBar() {
    this.tabBar.innerHTML = '';
    const { tabs, plots } = this.state;

    for (const tab of tabs) {
      const paneCount = plots.filter(p => p.tab === tab.id).length;
      const tabEl = document.createElement('div');
      tabEl.className = 'tab' + (tab.id === this.state.activeTab ? ' active' : '');

      const label = document.createElement('span');
      label.className = 'tab-label';
      label.textContent = tab.title + (paneCount > 1 ? ` (${paneCount})` : '');
      label.addEventListener('click', () => {
        this.state.activeTab = tab.id;
        this.rebuild();
        if (this.onAction) this.onAction('rebuildSidebar');
      });
      tabEl.appendChild(label);

      // Close tab button (only if more than 1 tab)
      if (tabs.length > 1) {
        const closeBtn = document.createElement('span');
        closeBtn.className = 'tab-close';
        closeBtn.textContent = '\u00d7';
        closeBtn.title = 'Close this tab and all its panes';
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._removeTab(tab.id);
        });
        tabEl.appendChild(closeBtn);
      }

      this.tabBar.appendChild(tabEl);
    }
  }

  _removeTab(tabId) {
    const idx = this.state.tabs.findIndex(t => t.id === tabId);
    if (idx === -1 || this.state.tabs.length <= 1) return;

    // Remove the tab and all its plots
    this.state.tabs.splice(idx, 1);
    this.state.plots = this.state.plots.filter(p => p.tab !== tabId);

    // Switch to a remaining tab
    if (this.state.activeTab === tabId) {
      this.state.activeTab = this.state.tabs[0].id;
    }

    if (this.onAction) this.onAction('rebuild');
  }

  _removePlot(plotId) {
    const plot = this.state.plots.find(p => p.id === plotId);
    if (!plot) return;

    const tabPanes = this.state.plots.filter(p => p.tab === plot.tab);
    if (tabPanes.length <= 1) {
      // Last pane in this tab: remove the tab entirely (if not the only tab)
      if (this.state.tabs.length > 1) {
        this._removeTab(plot.tab);
      }
      return;
    }

    // Remove just this pane
    const idx = this.state.plots.findIndex(p => p.id === plotId);
    this.state.plots.splice(idx, 1);
    if (this.onAction) this.onAction('rebuild');
  }

  _makeDraggable(handle) {
    let startY, prevEl, nextEl, prevStart, nextStart;

    const onMove = (e) => {
      const dy = e.clientY - startY;
      prevEl.style.flex = 'none';
      nextEl.style.flex = 'none';
      prevEl.style.height = Math.max(60, prevStart + dy) + 'px';
      nextEl.style.height = Math.max(60, nextStart - dy) + 'px';
      this.resize();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startY = e.clientY;
      prevEl = handle.previousElementSibling;
      nextEl = handle.nextElementSibling;
      if (!prevEl || !nextEl) return;
      prevStart = prevEl.getBoundingClientRect().height;
      nextStart = nextEl.getBoundingClientRect().height;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  resize() {
    for (const entry of this.panels) entry.panel.resize();
  }

  updateData(traceDataSets) {
    for (const entry of this.panels) {
      const plotIdx = this.state.plots.findIndex(p => p.id === entry.plotId);
      if (plotIdx >= 0 && plotIdx < traceDataSets.length && traceDataSets[plotIdx]) {
        entry.panel.updateTraces(traceDataSets[plotIdx]);
      }
    }
  }

  render() {
    for (const entry of this.panels) entry.panel.render();
  }

  clearAccumulation(plotId) {
    const panel = this.plotIdToPanel.get(plotId);
    if (panel) panel.clearAccumulation();
  }

  getActiveMarker() {
    for (const entry of this.panels) {
      const m = entry.panel.getActiveMarker();
      if (m !== '--') return m;
    }
    return '--';
  }

  getFirstPanelStats() {
    if (this.panels.length > 0) return this.panels[0].panel.getTraceStats();
    return null;
  }

  getVisiblePlotIds() {
    return new Set(this.panels.map(e => e.plotId));
  }

  getPanels() { return this.panels.map(e => e.panel); }
}
