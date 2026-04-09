// SPDX-License-Identifier: GPL-3.0
// renderer.js --- WebGL shaders and GPU-accelerated rendering
// Copyright (c) 2026 Jakob Kastelic
// ===== WebGL Renderer =====
// Handles all GPU-accelerated rendering: lines, scatter, polar, persistence, spectrogram, gradient

import { getThemeColors } from './theme.js';
import { COLOR_MAPS } from './state.js';
import { PADDING, POLAR_PADDING } from './overlay.js';

// ===== Shader Sources =====
const LINE_VS = `
  attribute vec2 a_position;
  uniform vec2 u_scale;
  uniform vec2 u_offset;
  void main() {
    vec2 p = (a_position - u_offset) * u_scale * 2.0 - 1.0;
    gl_Position = vec4(p.x, p.y, 0.0, 1.0);
  }
`;

const LINE_FS = `
  precision mediump float;
  uniform vec4 u_color;
  void main() {
    gl_FragColor = u_color;
  }
`;

const POINT_VS = `
  attribute vec2 a_position;
  uniform vec2 u_scale;
  uniform vec2 u_offset;
  uniform float u_pointSize;
  void main() {
    vec2 p = (a_position - u_offset) * u_scale * 2.0 - 1.0;
    gl_Position = vec4(p.x, p.y, 0.0, 1.0);
    gl_PointSize = u_pointSize;
  }
`;

const POINT_FS = `
  precision mediump float;
  uniform vec4 u_color;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.4, d);
    gl_FragColor = vec4(u_color.rgb, u_color.a * alpha);
  }
`;

const QUAD_VS = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const PERSISTENCE_FS = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform float u_decay;
  varying vec2 v_uv;
  void main() {
    vec4 prev = texture2D(u_texture, v_uv);
    gl_FragColor = prev * u_decay;
  }
`;

const BLIT_FS = `
  precision mediump float;
  uniform sampler2D u_texture;
  varying vec2 v_uv;
  void main() {
    gl_FragColor = texture2D(u_texture, v_uv);
  }
`;

const SPECTROGRAM_FS = `
  precision mediump float;
  uniform sampler2D u_data;
  uniform float u_scrollOffset;
  uniform float u_rows;
  uniform int u_colorMap;
  varying vec2 v_uv;

  vec3 inferno(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.0002, 0.0016, 0.0139);
    vec3 c1 = vec3(0.8502, 0.3153, 0.0258);
    vec3 c2 = vec3(0.9873, 0.9922, 0.7490);
    if (t < 0.5) return mix(c0, c1, t * 2.0);
    return mix(c1, c2, (t - 0.5) * 2.0);
  }

  vec3 viridis(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.267, 0.005, 0.329);
    vec3 c1 = vec3(0.128, 0.567, 0.551);
    vec3 c2 = vec3(0.993, 0.906, 0.144);
    if (t < 0.5) return mix(c0, c1, t * 2.0);
    return mix(c1, c2, (t - 0.5) * 2.0);
  }

  vec3 plasma(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.050, 0.030, 0.528);
    vec3 c1 = vec3(0.798, 0.280, 0.470);
    vec3 c2 = vec3(0.940, 0.975, 0.131);
    if (t < 0.5) return mix(c0, c1, t * 2.0);
    return mix(c1, c2, (t - 0.5) * 2.0);
  }

  vec3 magma(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.001, 0.000, 0.014);
    vec3 c1 = vec3(0.716, 0.215, 0.475);
    vec3 c2 = vec3(0.987, 0.991, 0.749);
    if (t < 0.5) return mix(c0, c1, t * 2.0);
    return mix(c1, c2, (t - 0.5) * 2.0);
  }

  vec3 turbo(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.190, 0.072, 0.232);
    vec3 c1 = vec3(0.130, 0.565, 0.870);
    vec3 c2 = vec3(0.565, 0.870, 0.130);
    vec3 c3 = vec3(0.950, 0.430, 0.100);
    vec3 c4 = vec3(0.480, 0.015, 0.010);
    if (t < 0.25) return mix(c0, c1, t * 4.0);
    if (t < 0.5) return mix(c1, c2, (t - 0.25) * 4.0);
    if (t < 0.75) return mix(c2, c3, (t - 0.5) * 4.0);
    return mix(c3, c4, (t - 0.75) * 4.0);
  }

  vec3 grayscale(float t) {
    return vec3(clamp(t, 0.0, 1.0));
  }

  vec3 applyColorMap(float t) {
    if (u_colorMap == 0) return inferno(t);
    if (u_colorMap == 1) return viridis(t);
    if (u_colorMap == 2) return plasma(t);
    if (u_colorMap == 3) return magma(t);
    if (u_colorMap == 4) return turbo(t);
    return grayscale(t);
  }

  void main() {
    vec2 uv = v_uv;
    uv.y = fract(uv.y + u_scrollOffset);
    float intensity = texture2D(u_data, uv).r;
    vec3 color = applyColorMap(intensity);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const GRADIENT_FS = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform int u_colorMap;
  varying vec2 v_uv;

  vec3 inferno(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.0002, 0.0016, 0.0139);
    vec3 c1 = vec3(0.8502, 0.3153, 0.0258);
    vec3 c2 = vec3(0.9873, 0.9922, 0.7490);
    if (t < 0.5) return mix(c0, c1, t * 2.0);
    return mix(c1, c2, (t - 0.5) * 2.0);
  }

  vec3 viridis(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.267, 0.005, 0.329);
    vec3 c1 = vec3(0.128, 0.567, 0.551);
    vec3 c2 = vec3(0.993, 0.906, 0.144);
    if (t < 0.5) return mix(c0, c1, t * 2.0);
    return mix(c1, c2, (t - 0.5) * 2.0);
  }

  vec3 plasma(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.050, 0.030, 0.528);
    vec3 c1 = vec3(0.798, 0.280, 0.470);
    vec3 c2 = vec3(0.940, 0.975, 0.131);
    if (t < 0.5) return mix(c0, c1, t * 2.0);
    return mix(c1, c2, (t - 0.5) * 2.0);
  }

  vec3 magma(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.001, 0.000, 0.014);
    vec3 c1 = vec3(0.716, 0.215, 0.475);
    vec3 c2 = vec3(0.987, 0.991, 0.749);
    if (t < 0.5) return mix(c0, c1, t * 2.0);
    return mix(c1, c2, (t - 0.5) * 2.0);
  }

  vec3 turbo(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.190, 0.072, 0.232);
    vec3 c1 = vec3(0.130, 0.565, 0.870);
    vec3 c2 = vec3(0.565, 0.870, 0.130);
    vec3 c3 = vec3(0.950, 0.430, 0.100);
    vec3 c4 = vec3(0.480, 0.015, 0.010);
    if (t < 0.25) return mix(c0, c1, t * 4.0);
    if (t < 0.5) return mix(c1, c2, (t - 0.25) * 4.0);
    if (t < 0.75) return mix(c2, c3, (t - 0.5) * 4.0);
    return mix(c3, c4, (t - 0.75) * 4.0);
  }

  vec3 grayscale(float t) { return vec3(clamp(t, 0.0, 1.0)); }

  vec3 applyColorMap(float t) {
    if (u_colorMap == 0) return inferno(t);
    if (u_colorMap == 1) return viridis(t);
    if (u_colorMap == 2) return plasma(t);
    if (u_colorMap == 3) return magma(t);
    if (u_colorMap == 4) return turbo(t);
    return grayscale(t);
  }

  void main() {
    float intensity = texture2D(u_texture, v_uv).r;
    vec3 color = applyColorMap(intensity);
    gl_FragColor = vec4(color, 1.0);
  }
`;

// ===== WebGL Utilities =====
function compileShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link:', gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

function getUniforms(gl, prog, names) {
  const u = {};
  for (const n of names) u[n] = gl.getUniformLocation(prog, n);
  return u;
}

function createFBO(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, width: w, height: h };
}

function hexToGL(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b, 1.0];
}

function parseRGBA(str) {
  if (str.startsWith('#')) return hexToGL(str);
  const m = str.match(/[\d.]+/g);
  if (!m) return [0.5, 0.5, 0.5, 0.5];
  return [
    parseFloat(m[0]) / 255,
    parseFloat(m[1]) / 255,
    parseFloat(m[2]) / 255,
    parseFloat(m[3] || 1),
  ];
}

// ===== Renderer Class =====
export class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
      preserveDrawingBuffer: true,  // needed for screenshots
    });
    if (!this.gl) throw new Error('WebGL not supported');
    this.gl.getExtension('OES_standard_derivatives');

    this._initPrograms();
    this._initBuffers();
    this._initPersistence();
    this._initSpectrogram();
    this._initGradient();
  }

  _initPrograms() {
    const gl = this.gl;
    this.lineProgram = createProgram(gl, LINE_VS, LINE_FS);
    this.lineUniforms = getUniforms(gl, this.lineProgram, ['u_scale', 'u_offset', 'u_color']);
    this.lineAttr = gl.getAttribLocation(this.lineProgram, 'a_position');

    this.pointProgram = createProgram(gl, POINT_VS, POINT_FS);
    this.pointUniforms = getUniforms(gl, this.pointProgram, ['u_scale', 'u_offset', 'u_color', 'u_pointSize']);
    this.pointAttr = gl.getAttribLocation(this.pointProgram, 'a_position');

    this.quadProgram = createProgram(gl, QUAD_VS, PERSISTENCE_FS);
    this.quadUniforms = getUniforms(gl, this.quadProgram, ['u_texture', 'u_decay']);
    this.quadAttr = gl.getAttribLocation(this.quadProgram, 'a_position');

    this.blitProgram = createProgram(gl, QUAD_VS, BLIT_FS);
    this.blitUniforms = getUniforms(gl, this.blitProgram, ['u_texture']);
    this.blitAttr = gl.getAttribLocation(this.blitProgram, 'a_position');

    this.spectrogramProgram = createProgram(gl, QUAD_VS, SPECTROGRAM_FS);
    this.spectrogramUniforms = getUniforms(gl, this.spectrogramProgram,
      ['u_data', 'u_scrollOffset', 'u_rows', 'u_colorMap']);
    this.spectrogramAttr = gl.getAttribLocation(this.spectrogramProgram, 'a_position');

    this.gradientProgram = createProgram(gl, QUAD_VS, GRADIENT_FS);
    this.gradientUniforms = getUniforms(gl, this.gradientProgram, ['u_texture', 'u_colorMap']);
    this.gradientAttr = gl.getAttribLocation(this.gradientProgram, 'a_position');
  }

  _initBuffers() {
    const gl = this.gl;
    this.vertexBuffer = gl.createBuffer();
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  }

  _initPersistence() {
    this.persistFBOs = [null, null];
    this.persistCurrent = 0;
  }

  _initSpectrogram() {
    this.spectrogramTex = null;
    this.spectrogramRow = 0;
    this.spectrogramRows = 256;
    this.spectrogramWidth = 512;
    this.spectrogramData = null;
  }

  _initGradient() {
    this.gradientFBOs = [null, null];
    this.gradientCurrent = 0;
  }

  // Plot area in GL pixel coords (origin bottom-left)
  _plotAreaGL(plotType) {
    const dpr = window.devicePixelRatio || 1;
    const pad = plotType === 'polar' ? POLAR_PADDING : PADDING;
    const x = Math.round(pad.left * dpr);
    const y = Math.round(pad.bottom * dpr); // GL origin is bottom-left
    const w = this.width - Math.round((pad.left + pad.right) * dpr);
    const h = this.height - Math.round((pad.top + pad.bottom) * dpr);
    return { x, y, w, h };
  }

  _setPlotViewport(plotType) {
    const gl = this.gl;
    const a = this._plotAreaGL(plotType);
    gl.viewport(a.x, a.y, a.w, a.h);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(a.x, a.y, a.w, a.h);
  }

  _resetViewport() {
    const gl = this.gl;
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.SCISSOR_TEST);
  }

  resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.gl.viewport(0, 0, this.width, this.height);
    this._resizeFBOs();
  }

  _resizeFBOs() {
    const gl = this.gl;
    // Persistence FBOs
    for (let i = 0; i < 2; i++) {
      if (this.persistFBOs[i]) {
        gl.deleteTexture(this.persistFBOs[i].tex);
        gl.deleteFramebuffer(this.persistFBOs[i].fbo);
      }
      this.persistFBOs[i] = createFBO(gl, this.width, this.height);
    }
    // Clear both
    for (const fbo of this.persistFBOs) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // Gradient FBOs
    for (let i = 0; i < 2; i++) {
      if (this.gradientFBOs[i]) {
        gl.deleteTexture(this.gradientFBOs[i].tex);
        gl.deleteFramebuffer(this.gradientFBOs[i].fbo);
      }
      this.gradientFBOs[i] = createFBO(gl, this.width, this.height);
    }
    for (const fbo of this.gradientFBOs) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Reset spectrogram
    this._resetSpectrogramTexture();
  }

  _resetSpectrogramTexture() {
    const gl = this.gl;
    if (this.spectrogramTex) gl.deleteTexture(this.spectrogramTex);
    this.spectrogramTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.spectrogramTex);
    this.spectrogramData = new Uint8Array(this.spectrogramWidth * this.spectrogramRows);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE,
      this.spectrogramWidth, this.spectrogramRows, 0,
      gl.LUMINANCE, gl.UNSIGNED_BYTE, this.spectrogramData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this.spectrogramRow = 0;
  }

  clear() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  clearPersistence() {
    const gl = this.gl;
    for (const fbo of this.persistFBOs) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    for (const fbo of this.gradientFBOs) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this._resetSpectrogramTexture();
  }

  // ===== Render Modes =====

  renderStandard(traces, viewport, plotType) {
    this.clear();
    if (plotType === 'scatter') {
      this._renderScatter(traces, viewport);
    } else if (plotType === 'polar') {
      this._renderPolar(traces, viewport);
    } else {
      this._renderLines(traces, viewport, null, plotType);
    }
  }

  renderPersistence(traces, viewport, plotType, decay) {
    const gl = this.gl;
    const src = this.persistFBOs[this.persistCurrent];
    const dst = this.persistFBOs[1 - this.persistCurrent];

    // Render decayed previous into dst
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.quadProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(this.quadUniforms.u_texture, 0);
    gl.uniform1f(this.quadUniforms.u_decay, decay);
    this._drawQuad(this.quadAttr);

    // Draw current traces on top of dst
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    if (plotType === 'scatter') {
      this._renderScatter(traces, viewport, dst.fbo);
    } else if (plotType === 'polar') {
      this._renderPolar(traces, viewport, dst.fbo);
    } else {
      this._renderLines(traces, viewport, dst.fbo, plotType);
    }
    gl.disable(gl.BLEND);

    // Blit dst to screen (clipped to plot area)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const pa = this._plotAreaGL(plotType || 'cartesian');
    gl.viewport(pa.x, pa.y, pa.w, pa.h);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(pa.x, pa.y, pa.w, pa.h);
    gl.useProgram(this.blitProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dst.tex);
    gl.uniform1i(this.blitUniforms.u_texture, 0);
    this._drawQuad(this.blitAttr);
    gl.disable(gl.SCISSOR_TEST);

    this.persistCurrent = 1 - this.persistCurrent;
  }

  renderSpectrogram(spectralData, viewport, config) {
    const gl = this.gl;
    if (!spectralData || spectralData.length === 0) return;

    // Reinitialize if row count changed
    if (config.rows && config.rows !== this.spectrogramRows) {
      this.spectrogramRows = config.rows;
      this._resetSpectrogramTexture();
    }

    // Update spectrogram texture with new row
    const rowData = new Uint8Array(this.spectrogramWidth);
    const n = Math.min(spectralData.length, this.spectrogramWidth);
    // Normalize: map dB range to 0-255
    const dbMin = -90, dbMax = 0;
    for (let i = 0; i < n; i++) {
      const normalized = (spectralData[i] - dbMin) / (dbMax - dbMin);
      rowData[i] = Math.max(0, Math.min(255, Math.round(normalized * 255)));
    }
    // Fill remaining with 0
    for (let i = n; i < this.spectrogramWidth; i++) rowData[i] = 0;

    gl.bindTexture(gl.TEXTURE_2D, this.spectrogramTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, this.spectrogramRow,
      this.spectrogramWidth, 1, gl.LUMINANCE, gl.UNSIGNED_BYTE, rowData);
    this.spectrogramRow = (this.spectrogramRow + 1) % this.spectrogramRows;

    // Render spectrogram into plot area
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const pa = this._plotAreaGL('cartesian');
    gl.viewport(pa.x, pa.y, pa.w, pa.h);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(pa.x, pa.y, pa.w, pa.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.spectrogramProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.spectrogramTex);
    gl.uniform1i(this.spectrogramUniforms.u_data, 0);
    gl.uniform1f(this.spectrogramUniforms.u_scrollOffset, this.spectrogramRow / this.spectrogramRows);
    gl.uniform1f(this.spectrogramUniforms.u_rows, this.spectrogramRows);
    gl.uniform1i(this.spectrogramUniforms.u_colorMap, COLOR_MAPS.indexOf(config.colorMap));
    this._drawQuad(this.spectrogramAttr);
    gl.disable(gl.SCISSOR_TEST);
  }

  renderGradient(traces, viewport, plotType, config) {
    const gl = this.gl;
    const src = this.gradientFBOs[this.gradientCurrent];
    const dst = this.gradientFBOs[1 - this.gradientCurrent];

    // Decay previous frame into dst (using persistence shader for decay)
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.quadProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(this.quadUniforms.u_texture, 0);
    gl.uniform1f(this.quadUniforms.u_decay, config.decay);
    this._drawQuad(this.quadAttr);

    // Accumulate current traces (additive blend, white lines to accumulate intensity)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const whiteTraces = traces.map(t => ({ ...t, color: '#ffffff' }));
    if (plotType === 'scatter') {
      this._renderScatter(whiteTraces, viewport, dst.fbo);
    } else if (plotType === 'polar') {
      this._renderPolar(whiteTraces, viewport, dst.fbo);
    } else {
      this._renderLines(whiteTraces, viewport, dst.fbo, plotType);
    }
    gl.disable(gl.BLEND);

    // Render dst with color mapping to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const pa2 = this._plotAreaGL(plotType || 'cartesian');
    gl.viewport(pa2.x, pa2.y, pa2.w, pa2.h);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(pa2.x, pa2.y, pa2.w, pa2.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.gradientProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dst.tex);
    gl.uniform1i(this.gradientUniforms.u_texture, 0);
    gl.uniform1i(this.gradientUniforms.u_colorMap,
      COLOR_MAPS.indexOf(config.colorMap || 'inferno'));
    this._drawQuad(this.gradientAttr);
    gl.disable(gl.SCISSOR_TEST);

    this.gradientCurrent = 1 - this.gradientCurrent;
  }

  // ===== Internal Rendering =====

  _renderLines(traces, viewport, targetFBO, plotType) {
    const gl = this.gl;
    if (targetFBO !== undefined && targetFBO !== null) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // Set viewport and scissor to plot area
    const pa = this._plotAreaGL(plotType || 'cartesian');
    gl.viewport(pa.x, pa.y, pa.w, pa.h);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(pa.x, pa.y, pa.w, pa.h);

    gl.useProgram(this.lineProgram);

    const { xMin, xMax, yMin, yMax } = viewport;
    const sx = 1 / (xMax - xMin);
    const sy = 1 / (yMax - yMin);
    gl.uniform2f(this.lineUniforms.u_scale, sx, sy);
    gl.uniform2f(this.lineUniforms.u_offset, xMin, yMin);

    for (const trace of traces) {
      if (!trace.visible || !trace.data || trace.data.length === 0) continue;
      const n = trace.data.length;
      const verts = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        verts[i * 2] = trace.xData ? trace.xData[i] : i;
        verts[i * 2 + 1] = trace.data[i];
      }
      const color = hexToGL(trace.color || '#58a6ff');
      gl.uniform4fv(this.lineUniforms.u_color, color);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.lineAttr);
      gl.vertexAttribPointer(this.lineAttr, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINE_STRIP, 0, n);
    }
    gl.disable(gl.SCISSOR_TEST);
  }

  _renderScatter(traces, viewport, targetFBO) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO || null);
    const pa = this._plotAreaGL('scatter');
    gl.viewport(pa.x, pa.y, pa.w, pa.h);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(pa.x, pa.y, pa.w, pa.h);

    gl.useProgram(this.pointProgram);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const { xMin, xMax, yMin, yMax } = viewport;
    gl.uniform2f(this.pointUniforms.u_scale, 1 / (xMax - xMin), 1 / (yMax - yMin));
    gl.uniform2f(this.pointUniforms.u_offset, xMin, yMin);
    gl.uniform1f(this.pointUniforms.u_pointSize, 3.0);

    // Scatter uses pairs of traces as X,Y
    for (let t = 0; t + 1 < traces.length; t += 2) {
      const xTrace = traces[t];
      const yTrace = traces[t + 1];
      if (!xTrace.visible || !yTrace.visible) continue;
      const n = Math.min(xTrace.data.length, yTrace.data.length);
      const verts = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        verts[i * 2] = xTrace.data[i];
        verts[i * 2 + 1] = yTrace.data[i];
      }
      const color = hexToGL(yTrace.color || '#58a6ff');
      gl.uniform4fv(this.pointUniforms.u_color, color);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.pointAttr);
      gl.vertexAttribPointer(this.pointAttr, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, n);
    }
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
  }

  _renderPolar(traces, viewport, targetFBO) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO || null);
    const pa = this._plotAreaGL('polar');
    gl.viewport(pa.x, pa.y, pa.w, pa.h);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(pa.x, pa.y, pa.w, pa.h);

    gl.useProgram(this.lineProgram);

    // Polar: map to a unit circle centered at origin
    // viewport should be symmetric around 0
    const range = Math.max(
      Math.abs(viewport.xMin), Math.abs(viewport.xMax),
      Math.abs(viewport.yMin), Math.abs(viewport.yMax)
    );
    gl.uniform2f(this.lineUniforms.u_scale, 1 / (2 * range), 1 / (2 * range));
    gl.uniform2f(this.lineUniforms.u_offset, -range, -range);

    for (const trace of traces) {
      if (!trace.visible || !trace.data || trace.data.length === 0) continue;
      const n = trace.data.length;
      const verts = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const theta = (2 * Math.PI * i) / n;
        const r = trace.data[i];
        verts[i * 2] = r * Math.cos(theta);
        verts[i * 2 + 1] = r * Math.sin(theta);
      }
      const color = hexToGL(trace.color || '#58a6ff');
      gl.uniform4fv(this.lineUniforms.u_color, color);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.lineAttr);
      gl.vertexAttribPointer(this.lineAttr, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINE_STRIP, 0, n);
    }
    gl.disable(gl.SCISSOR_TEST);
  }

  _drawQuad(attr) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(attr);
    gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
