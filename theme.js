// SPDX-License-Identifier: GPL-3.0
// theme.js --- Dark/light theme management
// Copyright (c) 2026 Jakob Kastelic
// ===== Theme Management =====

export function initTheme(state) {
  if (!state.theme) {
    state.theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  applyTheme(state.theme);

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
    if (!state._themeManual) {
      state.theme = e.matches ? 'light' : 'dark';
      applyTheme(state.theme);
    }
  });
}

export function toggleTheme(state) {
  state._themeManual = true;
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(state.theme);
}

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
}

export function getThemeColors() {
  const style = getComputedStyle(document.body);
  return {
    bgPlot: style.getPropertyValue('--bg-plot').trim(),
    gridMajor: style.getPropertyValue('--grid-major').trim(),
    gridMinor: style.getPropertyValue('--grid-minor').trim(),
    axisText: style.getPropertyValue('--axis-text').trim(),
    textPrimary: style.getPropertyValue('--text-primary').trim(),
    textSecondary: style.getPropertyValue('--text-secondary').trim(),
    accent: style.getPropertyValue('--accent').trim(),
    border: style.getPropertyValue('--border').trim(),
  };
}
