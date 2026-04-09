// SPDX-License-Identifier: GPL-3.0
// signals.js --- Synthetic signal generators and custom formula engine
// Copyright (c) 2026 Jakob Kastelic
// ===== Synthetic Signal Generators =====

let phase = 0;
let globalTime = 0;  // absolute time in seconds
let sensorValues = [22.5, 1013.25, 55.0]; // temp, pressure, humidity
let sweepPhase = 0;
let pulsePhase = 0;
let chirpPhase = 0;
let frameCount = 0;

export function resetGenerators() {
  phase = 0;
  globalTime = 0;
  sweepPhase = 0;
  pulsePhase = 0;
  chirpPhase = 0;
  frameCount = 0;
  sensorValues = [22.5, 1013.25, 55.0];
}

// Build a time axis array for this frame (seconds)
function timeAxis(n, sampleRate) {
  const dt = 1 / sampleRate;
  const xData = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xData[i] = globalTime + i * dt;
  }
  return xData;
}

// Advance global clock after generating a frame
function advanceTime(n, sampleRate) {
  globalTime += n / sampleRate;
}

export function generateFrame(preset, params) {
  const n = params.pointsPerFrame;
  frameCount++;

  switch (preset) {
    case 'sine-noise': return genSineNoise(params, n);
    case 'am-signal': return genAM(params, n);
    case 'multi-tone': return genMultiTone(params, n);
    case 'sweep': return genSweep(params, n);
    case 'lissajous': return genLissajous(params, n);
    case 'sensor': return genSensor(params, n);
    case 'pulse': return genPulse(params, n);
    case 'chirp': return genChirp(params, n);
    case 'custom': return genCustom(params, n);
    default: return genSineNoise(params, n);
  }
}

function genSineNoise(p, n) {
  const data = new Float32Array(n);
  const xData = timeAxis(n, p.sampleRate);
  const dt = 1 / p.sampleRate;
  for (let i = 0; i < n; i++) {
    const t = phase + i * dt;
    data[i] = Math.sin(2 * Math.PI * p.carrierFreq * t)
            + p.noiseLevel * (Math.random() * 2 - 1);
  }
  phase += n * dt;
  advanceTime(n, p.sampleRate);
  return [{ label: 'Signal', data, xData }];
}

function genAM(p, n) {
  const data = new Float32Array(n);
  const xData = timeAxis(n, p.sampleRate);
  const dt = 1 / p.sampleRate;
  for (let i = 0; i < n; i++) {
    const t = phase + i * dt;
    const envelope = 1 + 0.8 * Math.sin(2 * Math.PI * p.modFreq * t);
    data[i] = envelope * Math.sin(2 * Math.PI * p.carrierFreq * t)
            + p.noiseLevel * (Math.random() * 2 - 1);
  }
  phase += n * dt;
  advanceTime(n, p.sampleRate);
  return [{ label: 'AM Signal', data, xData }];
}

function genMultiTone(p, n) {
  const data = new Float32Array(n);
  const xData = timeAxis(n, p.sampleRate);
  const dt = 1 / p.sampleRate;
  const numTones = p.numTones || 3;
  const freqs = [];
  for (let k = 0; k < numTones; k++) {
    freqs.push(p.carrierFreq * (k + 1) + k * 7.3);
  }
  for (let i = 0; i < n; i++) {
    const t = phase + i * dt;
    let val = 0;
    for (let k = 0; k < numTones; k++) {
      val += (1 / (k + 1)) * Math.sin(2 * Math.PI * freqs[k] * t);
    }
    data[i] = val + p.noiseLevel * (Math.random() * 2 - 1);
  }
  phase += n * dt;
  advanceTime(n, p.sampleRate);
  return [{ label: 'Multi-Tone', data, xData }];
}

function genSweep(p, n) {
  const data = new Float32Array(n);
  const xData = timeAxis(n, p.sampleRate);
  const dt = 1 / p.sampleRate;
  const fMin = 1;
  const fMax = p.sampleRate * 0.45;
  const sweepPeriod = 5.0;
  for (let i = 0; i < n; i++) {
    const t = sweepPhase + i * dt;
    const frac = (t % sweepPeriod) / sweepPeriod;
    const freq = fMin + (fMax - fMin) * frac;
    data[i] = 0.8 * Math.sin(2 * Math.PI * freq * t)
            + p.noiseLevel * 0.3 * (Math.random() * 2 - 1);
  }
  sweepPhase += n * dt;
  advanceTime(n, p.sampleRate);
  return [{ label: 'Sweep', data, xData }];
}

function genLissajous(p, n) {
  const dataX = new Float32Array(n);
  const dataY = new Float32Array(n);
  const dt = 1 / p.sampleRate;
  const freqA = p.carrierFreq;
  const freqB = p.carrierFreq * 1.5;
  const phaseOffset = frameCount * 0.01;
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    dataX[i] = Math.sin(2 * Math.PI * freqA * t + phaseOffset);
    dataY[i] = Math.sin(2 * Math.PI * freqB * t);
  }
  advanceTime(n, p.sampleRate);
  return [
    { label: 'X', data: dataX },
    { label: 'Y', data: dataY },
  ];
}

function genSensor(p, n) {
  const temp = new Float32Array(n);
  const pressure = new Float32Array(n);
  const humidity = new Float32Array(n);
  const xData = timeAxis(n, p.sampleRate);
  for (let i = 0; i < n; i++) {
    sensorValues[0] += (Math.random() - 0.5) * 0.1;
    sensorValues[1] += (Math.random() - 0.5) * 0.05;
    sensorValues[2] += (Math.random() - 0.5) * 0.2;
    sensorValues[0] = Math.max(15, Math.min(35, sensorValues[0]));
    sensorValues[1] = Math.max(990, Math.min(1030, sensorValues[1]));
    sensorValues[2] = Math.max(20, Math.min(90, sensorValues[2]));
    temp[i] = sensorValues[0];
    pressure[i] = sensorValues[1];
    humidity[i] = sensorValues[2];
  }
  advanceTime(n, p.sampleRate);
  return [
    { label: 'Temp (C)', data: temp, xData },
    { label: 'Pressure (hPa)', data: pressure, xData },
    { label: 'Humidity (%)', data: humidity, xData },
  ];
}

function genPulse(p, n) {
  const data = new Float32Array(n);
  const xData = timeAxis(n, p.sampleRate);
  const dt = 1 / p.sampleRate;
  const period = Math.floor(n / 4);
  const pulseWidth = Math.floor(period * 0.3);
  for (let i = 0; i < n; i++) {
    const pos = (pulsePhase + i) % period;
    data[i] = pos < pulseWidth ? 1.0 : 0.0;
    data[i] += p.noiseLevel * (Math.random() * 2 - 1);
    if (pos === pulseWidth) {
      data[i] += 0.3 * Math.exp(-0.5) * Math.sin(20 * Math.PI * 0.5);
    }
  }
  pulsePhase += n;
  advanceTime(n, p.sampleRate);
  return [{ label: 'Pulse', data, xData }];
}

function genChirp(p, n) {
  const data = new Float32Array(n);
  const xData = timeAxis(n, p.sampleRate);
  const dt = 1 / p.sampleRate;
  const f0 = 2;
  const f1 = p.sampleRate * 0.4;
  const T = n * dt;
  for (let i = 0; i < n; i++) {
    const t = chirpPhase + i * dt;
    const tMod = t % T;
    data[i] = 0.8 * Math.sin(2 * Math.PI * (f0 * tMod + (f1 - f0) * tMod * tMod / (2 * T)))
            + p.noiseLevel * (Math.random() * 2 - 1);
  }
  chirpPhase += n * dt;
  advanceTime(n, p.sampleRate);
  return [{ label: 'Chirp', data, xData }];
}

// ===== Custom Formula =====
// Compiles user formula into a function. Available in the formula:
//   t = time (s), i = sample index, n = total points, fs = sample rate,
//   f = carrier freq, PI, E, sin, cos, tan, abs, sqrt, exp, log, log2,
//   pow, min, max, floor, ceil, round, sign, random, noise (random -1..1)
let _compiledFormula = null;
let _lastFormulaStr = '';

function compileFormula(expr) {
  if (!expr || !expr.trim()) return null;
  // Expose math functions as local variables
  const header = `
    const {sin,cos,tan,asin,acos,atan,atan2,abs,sqrt,exp,log,log2,log10,
           pow,min,max,floor,ceil,round,sign,random,PI,E} = Math;
    const noise = () => Math.random() * 2 - 1;
    const square = (x) => Math.sign(Math.sin(x));
    const sawtooth = (x) => 2 * (x / (2*PI) - Math.floor(x / (2*PI) + 0.5));
    const triangle = (x) => 2 * Math.abs(sawtooth(x)) - 1;
    const sinc = (x) => x === 0 ? 1 : Math.sin(x) / x;
  `;
  try {
    const fn = new Function('t', 'i', 'n', 'fs', 'f', header + 'return (' + expr + ');');
    // Test it
    fn(0, 0, 1, 1000, 20);
    return fn;
  } catch (e) {
    return { error: e.message };
  }
}

function genCustom(p, n) {
  const xData = timeAxis(n, p.sampleRate);
  const dt = 1 / p.sampleRate;
  const data = new Float32Array(n);

  if (p.customFormula !== _lastFormulaStr) {
    _compiledFormula = compileFormula(p.customFormula);
    _lastFormulaStr = p.customFormula;
  }

  if (_compiledFormula && !_compiledFormula.error) {
    p.customError = '';
    try {
      for (let i = 0; i < n; i++) {
        const t = globalTime + i * dt;
        data[i] = _compiledFormula(t, i, n, p.sampleRate, p.carrierFreq);
        if (!isFinite(data[i])) data[i] = 0;
      }
    } catch (e) {
      p.customError = e.message;
    }
  } else if (_compiledFormula && _compiledFormula.error) {
    p.customError = _compiledFormula.error;
  }

  advanceTime(n, p.sampleRate);
  return [{ label: 'f(t)', data, xData }];
}
