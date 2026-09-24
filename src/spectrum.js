/** Welch power spectral density of one uniformly sampled physical history. */
const MIN_SAMPLES = 32;
const MAX_SEGMENT = 256;

function fft(real, imaginary) {
  const length = real.length;
  for (let i = 1, j = 0; i < length; i++) {
    let bit = length >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]];
    }
  }
  for (let span = 2; span <= length; span <<= 1) {
    const angle = -2 * Math.PI / span;
    for (let start = 0; start < length; start += span) {
      for (let offset = 0; offset < span / 2; offset++) {
        const theta = angle * offset;
        const cos = Math.cos(theta), sin = Math.sin(theta);
        const even = start + offset, odd = even + span / 2;
        const turnReal = cos * real[odd] - sin * imaginary[odd];
        const turnImaginary = sin * real[odd] + cos * imaginary[odd];
        real[odd] = real[even] - turnReal;
        imaginary[odd] = imaginary[even] - turnImaginary;
        real[even] += turnReal;
        imaginary[even] += turnImaginary;
      }
    }
  }
}

export function computeWelchPsd(samples) {
  if (!Array.isArray(samples) || samples.length < MIN_SAMPLES) {
    throw new Error(`E_SPECTRUM_SAMPLES: at least ${MIN_SAMPLES} samples are required`);
  }
  const count = samples.length;
  const dt = (samples.at(-1).time - samples[0].time) / (count - 1);
  if (!Number.isFinite(dt) || dt <= 0 || samples.some((point, index) =>
    !Number.isFinite(point.time) || !Number.isFinite(point.value)
      || (index > 0 && Math.abs((point.time - samples[index - 1].time) / dt - 1) > 1e-6))) {
    throw new Error('E_SPECTRUM_SPACING: finite, uniformly spaced samples are required');
  }
  const sampleRateHz = 1 / dt;
  if (!Number.isFinite(sampleRateHz)) throw new Error('E_SPECTRUM_SPACING: sample rate is not finite');
  const segmentLength = 2 ** Math.floor(Math.log2(Math.min(count, MAX_SEGMENT)));
  const overlap = segmentLength / 2;
  const window = Float64Array.from({ length: segmentLength }, (_, index) =>
    0.5 - 0.5 * Math.cos(2 * Math.PI * index / segmentLength));
  const windowEnergy = window.reduce((sum, value) => sum + value * value, 0);
  const power = new Float64Array(segmentLength / 2 + 1);
  let segments = 0;
  for (let start = 0; start + segmentLength <= count; start += segmentLength - overlap) {
    let mean = 0;
    for (let index = 0; index < segmentLength; index++) mean += samples[start + index].value / segmentLength;
    const real = new Float64Array(segmentLength), imaginary = new Float64Array(segmentLength);
    for (let index = 0; index < segmentLength; index++) real[index] = (samples[start + index].value - mean) * window[index];
    fft(real, imaginary);
    for (let bin = 0; bin < power.length; bin++) {
      const multiplier = bin === 0 || bin === segmentLength / 2 ? 1 : 2;
      power[bin] += multiplier * (real[bin] ** 2 + imaginary[bin] ** 2) / (sampleRateHz * windowEnergy);
    }
    segments++;
  }
  const bins = Array.from(power, (value, bin) => ({ frequencyHz: bin * sampleRateHz / segmentLength, psd: value / segments }));
  if (bins.some(bin => !Number.isFinite(bin.psd))) {
    throw new Error('E_SPECTRUM_RANGE: spectrum exceeds finite numeric range');
  }
  let dominant = null;
  for (const bin of bins.slice(1)) if (bin.psd > 0 && (!dominant || bin.psd > dominant.psd)) dominant = bin;
  return { bins, sampleRateHz, nyquistHz: sampleRateHz / 2,
    resolutionHz: sampleRateHz / segmentLength, segmentLength, overlap, segments,
    dominantHz: dominant?.frequencyHz ?? null, window: 'periodic Hann', detrend: 'segment mean' };
}
