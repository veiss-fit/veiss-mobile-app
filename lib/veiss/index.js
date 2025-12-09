// lib/veiss/index.js
import Papa from 'papaparse';
import { preprocessSignal } from './preprocessing';
import { runPostSetCorrection, estimateSamplingRateHz } from './correction';
import { calculateRepMetrics } from './repmetrics';

/**
 * Expected schema per row:
 * {
 *   session_id: number,
 *   timestamp_ms: number,   // host or device ms timestamp
 *   z0: number, z1: number, ... zN: number
 * }
 */

/**
 * Public: main entry when you already have parsed rows in memory.
 *
 * - rows:       array of { timestamp_ms, z0..zN }
 * - dataRateHz: OPTIONAL fallback if timestamp-based estimation fails
 */
export async function runVeissFromRows({ rows, dataRateHz }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { validatedReps: [], repMetrics: [], sampleRateHz: null };
  }

  // 1) Preprocess to get a single smoothed distance signal
  //    (e.g., mean across zones, denoised).
  const processed = preprocessSignal(rows);
  const smoothed = processed.smoothedMeanSignal || [];
  if (!smoothed.length) {
    return { validatedReps: [], repMetrics: [], sampleRateHz: null };
  }

  // 2) Build timestamps array from rows
  //    We assume rows[i].timestamp_ms corresponds to smoothed[i].
  const timestamps = rows.map((r, idx) => {
    const ts = Number(r?.timestamp_ms);
    // If a row somehow has no timestamp, approximate using previous + fallback Hz
    if (Number.isFinite(ts)) return ts;

    if (idx === 0) return 0;
    const prev = Number(rows[idx - 1]?.timestamp_ms);
    const fallbackStepMs =
      dataRateHz && dataRateHz > 0 ? 1000 / dataRateHz : 1000 / 30;
    return Number.isFinite(prev) ? prev + fallbackStepMs : idx * fallbackStepMs;
  });

  // 3) Estimate sampling rate from timestamps; fallback to provided dataRateHz if needed
  let sampleRateHz = estimateSamplingRateHz(timestamps);
  if (!sampleRateHz && dataRateHz && dataRateHz > 0) {
    sampleRateHz = dataRateHz;
  }

  // 4) Run post-set correction using real timestamps + dynamic thresholds
  const validatedReps = runPostSetCorrection(
    timestamps,
    smoothed,
    sampleRateHz
  );

  if (!validatedReps || !validatedReps.length) {
    return { validatedReps: [], repMetrics: [], sampleRateHz };
  }

  // 5) Compute per-rep metrics (ROM mm + true ms durations + velocity in m/s)
  const repMetrics = calculateRepMetrics(validatedReps);

  return { validatedReps, repMetrics, sampleRateHz };
}

/**
 * Public: run from CSV text (useful for debug / file import).
 *
 * CSV is expected to have a "timestamp_ms" column plus z0..zN columns.
 */
export async function runVeissFromCsvText({ csvText, dataRateHz }) {
  const parsed = Papa.parse(csvText, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  // Filter to rows that are well-formed
  const rows = (parsed.data || []).filter(
    (r) => typeof r?.timestamp_ms === 'number'
  );

  return runVeissFromRows({ rows, dataRateHz });
}
