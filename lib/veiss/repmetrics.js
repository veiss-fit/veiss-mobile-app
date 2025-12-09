// lib/veiss/repmetrics.js

/**
 * Takes raw reps from correction.js:
 *   {
 *     repNum,
 *     romMm,
 *     concentricStartTime,
 *     eccentricStartTime,
 *     repEndTime,
 *     ...
 *   }
 *
 * and returns per-rep metrics using REAL timestamps (ms), not frame counts.
 */
export function calculateRepMetrics(reps) {
  if (!Array.isArray(reps) || reps.length === 0) return [];

  const out = [];
  for (const rep of reps) {
    const cStart = rep.concentricStartTime;
    const eStart = rep.eccentricStartTime;
    const rEnd   = rep.repEndTime;

    const concentricDurationMs =
      (typeof eStart === 'number' && typeof cStart === 'number' && eStart > cStart)
        ? (eStart - cStart)
        : 0;

    const eccentricDurationMs =
      (typeof rEnd === 'number' && typeof eStart === 'number' && rEnd > eStart)
        ? (rEnd - eStart)
        : 0;

    const totalDurationMs =
      (typeof rEnd === 'number' && typeof cStart === 'number' && rEnd > cStart)
        ? (rEnd - cStart)
        : (concentricDurationMs + eccentricDurationMs);

    let concentricVelocityMps = 0;
    if (concentricDurationMs > 0 && typeof rep.romMm === 'number') {
      const romMeters = rep.romMm / 1000;
      const concentricSeconds = concentricDurationMs / 1000;
      concentricVelocityMps = romMeters / concentricSeconds;
    }

    out.push({
      repNum: rep.repNum,
      romMm: rep.romMm,
      totalDurationMs,
      concentricDurationMs,
      eccentricDurationMs,
      concentricVelocityMps,
      // keep timestamps too in case callers want them
      concentricStartTime: cStart,
      eccentricStartTime: eStart,
      repEndTime: rEnd,
    });
  }
  return out;
}
