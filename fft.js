// SPDX-License-Identifier: GPL-3.0
// fft.js --- Radix-2 FFT, windowing, magnitude spectrum
// Copyright (c) 2026 Jakob Kastelic
// ===== Radix-2 FFT =====

export function fft(real, imag) {
  const n = real.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  // Cooley-Tukey butterflies
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = -2 * Math.PI / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let curReal = 1, curImag = 0;
      for (let j = 0; j < halfLen; j++) {
        const a = i + j;
        const b = a + halfLen;
        const tReal = curReal * real[b] - curImag * imag[b];
        const tImag = curReal * imag[b] + curImag * real[b];
        real[b] = real[a] - tReal;
        imag[b] = imag[a] - tImag;
        real[a] += tReal;
        imag[a] += tImag;
        const nextReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = nextReal;
      }
    }
  }
}

export function magnitudeSpectrum(real, imag, outputDb = true) {
  const n = real.length;
  const half = n >> 1;
  const out = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / n;
    out[i] = outputDb ? 20 * Math.log10(Math.max(mag, 1e-10)) : mag;
  }
  return out;
}

export function applyWindow(data, windowType = 'hann') {
  const n = data.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let w;
    switch (windowType) {
      case 'hann':
        w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
        break;
      case 'hamming':
        w = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (n - 1));
        break;
      case 'blackman':
        w = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (n - 1));
        break;
      default:
        w = 1;
    }
    out[i] = data[i] * w;
  }
  return out;
}

// Find next power of 2 >= n
export function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
