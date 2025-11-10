// lib/veiss/correction.js
import { mean, std } from 'mathjs';
import { findPeaks } from './peakfinding';

const REP_MAX_DURATION_MS = 10000;
const REP_MIN_DURATION_MS = 1000;

// helper
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function runPostSetCorrection(timestamps, distances, dataRateHz) {
  console.log('--- STARTING CORRECTION DEBUG ---');

  if (!distances || distances.length === 0) {
    console.error('DEBUG: distances array is empty or null. Aborting.');
    return [];
  }

  console.log(`DEBUG: Received ${distances.length} distance points.`);
  console.log('DEBUG: First 10 distance points:', distances.slice(0, 10));

  const hasNaN = distances.some((d) => Number.isNaN(d));
  console.log(`DEBUG: Does distances array contain NaN? ${hasNaN}`);
  if (hasNaN) {
    console.error('🚨 DEBUG: FATAL - distances array contains NaN values upon entering the function!');
    return [];
  }

  const minSamplesBetweenReps = Math.floor(dataRateHz * 0.8);

  const signalSd = std(distances) || 0;
  const dynamicProminence = Math.max(40.0, signalSd * 0.75);
  const dynamicRom = Math.max(40.0, signalSd * 0.75);
  console.log(`DEBUG: Calculated signalSd: ${signalSd.toFixed(3)}`);
  console.log(`--> Dynamic thresholds set: Prominence=${dynamicProminence.toFixed(1)}mm, ROM=${dynamicRom.toFixed(1)}mm`);

  const baselineEndIdx = Math.min(Math.floor(1.5 * dataRateHz), Math.floor(distances.length / 4));
  const baselineData = distances.slice(0, baselineEndIdx);

  let minPeakHeight = undefined;
  if (baselineData.length > 10) {
    const bMean = mean(baselineData);
    const bStd = std(baselineData);
    const proposed = bMean + Math.max(15.0, 5 * bStd);
    const hardCapAboveBaseline = 180;
    minPeakHeight = Math.min(proposed, bMean + hardCapAboveBaseline);
    minPeakHeight = clamp(minPeakHeight, bMean + 15, bMean + hardCapAboveBaseline);

    console.log(`DEBUG: Baseline mean=${bMean.toFixed(1)}, std=${bStd.toFixed(1)}`);
    console.log(`DEBUG: Proposed minPeakHeight=${proposed.toFixed(1)}mm`);
    console.log(`--> Final clamped minPeakHeight=${minPeakHeight.toFixed(1)}mm (cap=${hardCapAboveBaseline}mm)`);
  } else {
    console.log('DEBUG: Insufficient baseline data for height threshold.');
  }

  // --- first attempt ---
  console.log('\nDEBUG: Attempting primary peak detection...');
  let [peaks] = findPeaks(distances, {
    distance: minSamplesBetweenReps,
    prominence: dynamicProminence,
    height: minPeakHeight,
  });
  console.log(`DEBUG: Primary detection found ${peaks.length} peaks.`);

  // --- fallback passes ---
  if (!peaks.length && baselineData.length > 10) {
    const bMean = mean(baselineData);
    const softHeight = bMean + 80;
    console.log(`DEBUG: Retrying with soft height gate (${softHeight.toFixed(1)}mm)...`);
    [peaks] = findPeaks(distances, {
      distance: minSamplesBetweenReps,
      prominence: dynamicProminence,
      height: softHeight,
    });
    console.log(`DEBUG: Soft height gate found ${peaks.length} peaks.`);
  }
  if (!peaks.length) {
    console.log('DEBUG: Retrying with NO height gate...');
    [peaks] = findPeaks(distances, {
      distance: minSamplesBetweenReps,
      prominence: dynamicProminence,
    });
    console.log(`DEBUG: No-height pass found ${peaks.length} peaks.`);
  }

  // --- troughs ---
  const inverted = distances.map((d) => -d);
  const [troughs] = findPeaks(inverted, {
    distance: minSamplesBetweenReps,
    prominence: dynamicProminence / 2,
  });
  console.log(`DEBUG: Found ${troughs.length} troughs.`);

  if (!peaks.length) {
    console.log('--> No valid peaks found after all passes.');
    return [];
  }

  const validatedReps = [];
  const usedTroughs = new Set();

  // --- first rep via baseline departure ---
  const firstPeakIdx = peaks[0];
  console.log(`\n[ATTEMPT 1] First Peak index=${firstPeakIdx}`);

  const baselineWindowEnd = Math.max(10, firstPeakIdx - Math.floor(dataRateHz * 0.5));
  const firstRepBaseline = distances.slice(0, baselineWindowEnd);

  if (firstRepBaseline.length > 10) {
    const bMean = mean(firstRepBaseline);
    const bStd = std(firstRepBaseline);
    const liftoff = Math.min(bMean + Math.max(15.0, 4 * bStd), bMean + 160);
    const liftoffIndex = distances.slice(0, firstPeakIdx).findIndex((d) => d > liftoff);

    console.log(`DEBUG (Rep 1): baselineMean=${bMean.toFixed(1)}, std=${bStd.toFixed(1)}, liftoff=${liftoff.toFixed(1)} @idx=${liftoffIndex}`);

    if (liftoffIndex !== -1) {
      const startIdx = liftoffIndex;
      const rom = distances[firstPeakIdx] - distances[startIdx];
      const followingTroughs = troughs.filter((t) => t > firstPeakIdx);
      const repEndIdx = followingTroughs.length > 0 ? followingTroughs[0] : findMinIndex(distances, firstPeakIdx);
      const duration = timestamps[repEndIdx] - timestamps[startIdx];

      console.log(`DEBUG (Rep 1): ROM=${rom.toFixed(1)}mm, Duration=${duration}ms`);

      if (rom >= dynamicRom && duration >= REP_MIN_DURATION_MS && duration <= REP_MAX_DURATION_MS) {
        console.log('  └─ [SUCCESS] First rep valid ✅');
        validatedReps.push({
          repNum: 1,
          concentricStartTime: timestamps[startIdx],
          eccentricStartTime: timestamps[firstPeakIdx],
          repEndTime: timestamps[repEndIdx],
          romMm: rom,
          peakIndex: firstPeakIdx,
        });
      } else {
        console.log('  └─ [REJECTED] First rep failed ROM/duration criteria.');
      }
    } else {
      console.log('  └─ [REJECTED] No liftoff found above baseline.');
    }
  } else {
    console.log('  └─ [REJECTED] Not enough baseline samples for rep 1.');
  }

  // --- remaining reps ---
  const startPeakLoopIndex = validatedReps.length > 0 ? 1 : 0;
  for (let i = startPeakLoopIndex; i < peaks.length; i++) {
    const pIdx = peaks[i];
    const currentRepNum = validatedReps.length + 1;
    console.log(`\n[ATTEMPT ${currentRepNum}] Peak idx=${pIdx}, value=${distances[pIdx].toFixed(1)}mm`);

    const precedingTroughs = troughs.filter((t) => t < pIdx);
    if (precedingTroughs.length === 0) {
      console.log('  └─ [REJECTED] No preceding trough found.');
      continue;
    }

    const tIdx = precedingTroughs[precedingTroughs.length - 1];
    if (usedTroughs.has(tIdx)) {
      console.log('  └─ [REJECTED] Trough already used.');
      continue;
    }

    const rom = distances[pIdx] - distances[tIdx];
    const followingTroughs = troughs.filter((t) => t > pIdx);
    const repEndIdx = followingTroughs.length > 0 ? followingTroughs[0] : findMinIndex(distances, pIdx);
    const duration = timestamps[repEndIdx] - timestamps[tIdx];

    console.log(`  ROM=${rom.toFixed(1)}mm, Duration=${duration}ms`);

    if (rom >= dynamicRom && duration >= REP_MIN_DURATION_MS && duration <= REP_MAX_DURATION_MS) {
      console.log('  └─ [SUCCESS] Rep valid ✅');
      validatedReps.push({
        repNum: currentRepNum,
        concentricStartTime: timestamps[tIdx],
        eccentricStartTime: timestamps[pIdx],
        repEndTime: timestamps[repEndIdx],
        romMm: rom,
        peakIndex: pIdx,
      });
      usedTroughs.add(tIdx);
    } else {
      console.log(`  └─ [REJECTED] ROM (${rom.toFixed(1)}mm) or duration (${duration}ms) out of bounds.`);
    }
  }

  console.log(`\n--> Found ${validatedReps.length} validated reps after all checks.`);
  return validatedReps;
}

function findMinIndex(arr, startIndex) {
  if (startIndex >= arr.length) return startIndex;
  let minVal = arr[startIndex];
  let minIdx = startIndex;
  for (let i = startIndex + 1; i < arr.length; i++) {
    if (arr[i] < minVal) {
      minVal = arr[i];
      minIdx = i;
    }
  }
  return minIdx;
}
