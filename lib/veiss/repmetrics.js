// lib/veiss/repmetrics.js

export function calculateRepMetrics(reps) {
  if (!Array.isArray(reps) || reps.length === 0) return [];

  const out = [];
  for (const rep of reps) {
    const concentricDurationMs = rep.eccentricStartTime - rep.concentricStartTime;
    const eccentricDurationMs = rep.repEndTime - rep.eccentricStartTime;
    const totalDurationMs = rep.repEndTime - rep.concentricStartTime;

    let concentricVelocityMps = 0;
    if (concentricDurationMs > 0) {
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
    });
  }
  return out;
}
