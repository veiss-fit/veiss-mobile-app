// lib/veiss/index.js
import Papa from 'papaparse';
import { preprocessSignal } from './preprocessing';
import { runPostSetCorrection } from './correction';
import { calculateRepMetrics } from './repmetrics';

/**
 * Schema expectation per row:
 * {
 *   session_id: number,
 *   timestamp_ms: number,
 *   z0: number, z1: number, ... zN: number
 * }
 */

/** Public: main entry when you already have parsed rows in memory */
export async function runVeissFromRows({ rows, dataRateHz }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { validatedReps: [], repMetrics: [] };
  }

  // Preprocess
  const processed = preprocessSignal(rows);
  const smoothed = processed.smoothedMeanSignal || [];
  if (!smoothed.length) return { validatedReps: [], repMetrics: [] };

  // Build timestamps from first row; assume constant dataRateHz
  const startTs = rows[0]?.timestamp_ms ?? 0;
  const stepMs = 1000 / dataRateHz;
  const timestamps = smoothed.map((_, i) => startTs + i * stepMs);

  // Correct & validate reps
  const validatedReps = runPostSetCorrection(timestamps, smoothed, dataRateHz);

  // Metrics
  const repMetrics = calculateRepMetrics(validatedReps);

  return { validatedReps, repMetrics };
}

/** Public: run from CSV text (useful for debug / file import) */
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
