// SPDX-License-Identifier: GPL-3.0
// capture.js --- PNG screenshot and CSV data export
// Copyright (c) 2026 Jakob Kastelic
// ===== Capture: Screenshot & CSV Export =====

export function captureScreenshot(panels) {
  if (panels.length === 0) return;

  // Composite all visible plot panels into one image
  const panel = panels[0];
  const glCanvas = panel.glCanvas;
  const overlayCanvas = panel.overlayCanvas;

  const w = overlayCanvas.width;
  const h = overlayCanvas.height;
  const composite = document.createElement('canvas');
  composite.width = w;
  composite.height = h;
  const ctx = composite.getContext('2d');

  // Draw WebGL canvas
  ctx.drawImage(glCanvas, 0, 0, w, h);
  // Draw overlay on top
  ctx.drawImage(overlayCanvas, 0, 0, w, h);

  // Export as PNG
  composite.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blitscope-${timestamp()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

export function captureCSV(panels) {
  if (panels.length === 0) return;

  const panel = panels[0];
  const traces = panel.traces.filter(t => t.visible);
  if (traces.length === 0) return;

  // Build CSV
  const maxLen = Math.max(...traces.map(t => t.data.length));
  const headers = ['Index', ...traces.map(t => t.label)];
  const rows = [headers.join(',')];

  for (let i = 0; i < maxLen; i++) {
    const values = [i];
    for (const t of traces) {
      values.push(i < t.data.length ? t.data[i].toFixed(6) : '');
    }
    rows.push(values.join(','));
  }

  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `blitscope-${timestamp()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function timestamp() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
