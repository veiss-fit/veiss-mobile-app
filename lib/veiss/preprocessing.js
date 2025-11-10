// lib/veiss/preprocessing.js
import { mean } from 'lodash';
import { variance } from 'mathjs';
import savitzkyGolay from 'ml-savitzky-golay';

const PREPROCESSING_CONFIG = {
  MEDIAN_FILTER_KERNEL_SIZE: 13,
  NUM_ACTIVE_ZONES_TO_USE: 8,
  SAVGOL_WINDOW_LENGTH: 15,
  SAVGOL_POLYORDER: 3,
};

function medianFilter(data, kernelSize) {
  if (kernelSize % 2 === 0) throw new Error('Kernel size must be odd.');
  const half = Math.floor(kernelSize / 2);
  const result = new Array(data.length).fill(0);

  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(data.length, i + half + 1);
    const window = data.slice(start, end).sort((a, b) => a - b);
    result[i] = window[Math.floor(window.length / 2)];
  }
  return result;
}

export function preprocessSignal(rowData) {
  if (!rowData || rowData.length === 0) {
    throw new Error('Input data cannot be empty.');
  }

  const {
    MEDIAN_FILTER_KERNEL_SIZE,
    NUM_ACTIVE_ZONES_TO_USE,
    SAVGOL_WINDOW_LENGTH,
    SAVGOL_POLYORDER,
  } = PREPROCESSING_CONFIG;

  const firstRow = rowData[0];
  const zoneNames = Object.keys(firstRow).filter((k) => k.startsWith('z'));

  const columnData = zoneNames.map((zoneName) =>
    rowData
      .map((row) => row[zoneName])
      .filter((v) => typeof v === 'number' && isFinite(v))
  );

  const cleanedData = columnData.map((col) =>
    medianFilter(col, MEDIAN_FILTER_KERNEL_SIZE)
  );

  if (!cleanedData.length || !cleanedData[0] || cleanedData[0].length < 2) {
    return { smoothedMeanSignal: [], cleanedData: [], activeZoneIndices: [] };
  }

  const zoneVariances = cleanedData.map((zoneColumn) => Number(variance(zoneColumn)));
  const indexed = zoneVariances.map((v, i) => ({ index: i, variance: v }));
  indexed.sort((a, b) => a.variance - b.variance);
  const activeZoneIndices = indexed.slice(-NUM_ACTIVE_ZONES_TO_USE).map((x) => x.index);

  const numFrames = cleanedData[0].length;
  const rawMeans = [];
  for (let i = 0; i < numFrames; i++) {
    const frameValues = activeZoneIndices.map((idx) => cleanedData[idx]?.[i]);
    const valid = frameValues.filter((v) => typeof v === 'number' && isFinite(v));
    if (valid.length > 0) rawMeans.push(mean(valid));
    else rawMeans.push(rawMeans.length ? rawMeans[rawMeans.length - 1] : 0);
  }

  if (rawMeans.length < SAVGOL_WINDOW_LENGTH) {
    return { smoothedMeanSignal: rawMeans, cleanedData, activeZoneIndices };
  }

  let smoothedMeanSignal = savitzkyGolay(rawMeans, 1, {
    windowSize: SAVGOL_WINDOW_LENGTH,
    polynomial: SAVGOL_POLYORDER,
    derivative: 0,
  });

  const signal = Array.from(smoothedMeanSignal);
  const firstValid = signal.findIndex(isFinite);
  if (firstValid > 0) {
    const fill = signal[firstValid];
    for (let i = 0; i < firstValid; i++) signal[i] = fill;
  }
  const lastValid = [...signal].reverse().findIndex(isFinite);
  if (lastValid > -1) {
    const lastIdx = signal.length - 1 - lastValid;
    const fill = signal[lastIdx];
    for (let i = lastIdx + 1; i < signal.length; i++) signal[i] = fill;
  }

  return { smoothedMeanSignal: signal, cleanedData, activeZoneIndices };
}
