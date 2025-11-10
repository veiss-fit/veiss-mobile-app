// lib/veiss/peakfinding.js

export function findPeaks(x, options = {}) {
  let peaks = _findLocalMaxima(x);
  const properties = {};

  if (options.height !== undefined) {
    peaks = peaks.filter((p) => x[p] >= options.height);
  }

  if (options.distance !== undefined && options.distance > 1) {
    peaks = _filterByDistance(peaks, x, options.distance);
  }

  if (options.prominence !== undefined && options.prominence > 0) {
    const { prominences, leftBases, rightBases } = _calculateProminences(x, peaks, options.wlen);
    properties.prominences = prominences;
    properties.leftBases = leftBases;
    properties.rightBases = rightBases;

    const filtered = peaks
      .map((peak, i) => ({ peak, prominence: prominences[i] }))
      .filter((p) => p.prominence >= options.prominence);

    peaks = filtered.map((p) => p.peak);

    const keepSet = new Set(peaks);
    const finalProm = [];
    const finalLeft = [];
    const finalRight = [];
    for (let i = 0; i < (properties.prominences || []).length; i++) {
      const pk = filtered[i]?.peak;
      if (keepSet.has(pk)) {
        finalProm.push(properties.prominences[i]);
        finalLeft.push(properties.leftBases[i]);
        finalRight.push(properties.rightBases[i]);
      }
    }
    properties.prominences = finalProm;
    properties.leftBases = finalLeft;
    properties.rightBases = finalRight;
  }

  return [peaks, properties];
}

function _findLocalMaxima(x) {
  const peaks = [];
  if (x.length < 3) return peaks;

  for (let i = 1; i < x.length - 1; i++) {
    if (x[i - 1] < x[i]) {
      let ahead = i + 1;
      while (ahead < x.length - 1 && x[ahead] === x[i]) ahead++;
      if (x[ahead] < x[i]) {
        peaks.push(Math.floor((i + ahead - 1) / 2));
        i = ahead;
      }
    }
  }
  return peaks;
}

function _filterByDistance(peaks, x, distance) {
  const peakData = peaks.map((p) => ({ index: p, height: x[p] }))
    .sort((a, b) => b.height - a.height);

  const keep = new Array(x.length).fill(true);

  for (const peak of peakData) {
    if (!keep[peak.index]) continue;
    let j = peak.index - distance;
    while (j <= peak.index + distance) {
      if (j >= 0 && j < x.length && j !== peak.index) keep[j] = false;
      j++;
    }
  }
  return peaks.filter((p) => keep[p]);
}

function _calculateProminences(x, peaks, wlen) {
  const prominences = [];
  const leftBases = [];
  const rightBases = [];

  for (const peak of peaks) {
    const peakHeight = x[peak];

    const wlen_ = wlen ?? x.length;
    const searchStart = Math.max(0, peak - wlen_);
    const searchEnd = Math.min(x.length - 1, peak + wlen_);

    let iLeft = peak;
    let leftMin = peakHeight;
    while (iLeft > searchStart && x[iLeft] <= peakHeight) {
      leftMin = Math.min(leftMin, x[iLeft]);
      iLeft--;
    }

    let iRight = peak;
    let rightMin = peakHeight;
    while (iRight < searchEnd && x[iRight] <= peakHeight) {
      rightMin = Math.min(rightMin, x[iRight]);
      iRight++;
    }

    const baseHeight = Math.max(leftMin, rightMin);
    prominences.push(peakHeight - baseHeight);

    let leftBaseIdx = peak;
    let minVal = peakHeight;
    for (let i = peak; i >= iLeft; i--) {
      if (x[i] < minVal) {
        minVal = x[i];
        leftBaseIdx = i;
      }
    }

    let rightBaseIdx = peak;
    minVal = peakHeight;
    for (let i = peak; i <= iRight; i++) {
      if (x[i] < minVal) {
        minVal = x[i];
        rightBaseIdx = i;
      }
    }

    leftBases.push(leftBaseIdx);
    rightBases.push(rightBaseIdx);
  }

  return { prominences, leftBases, rightBases };
}
