// lib/metrics.js
export const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

export const cvPct = (arr) => {
  if (arr.length < 2) return 0;
  const m = mean(arr); if (!m) return 0;
  const sd = Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
  return (sd / m) * 100;
};

export function makeCoachNotes({ vels = [], eccs = [], roms = [] }) {
  const notes = [];
  if (vels.length >= 2) {
    const first = vels[0];
    const last = vels[vels.length - 1];
    const vl = first > 0 ? (1 - last / first) * 100 : 0;

    let label = 'Strength zone';
    let action = 'Keep the weight.';
    let color = 'ok';

    if (vl < 15) { label = 'Easy'; action = 'Add ~2.5–5% or 1–2 reps next set.'; color = 'good'; }
    else if (vl >= 30 && vl < 40) { label = 'Fatigue building'; action = 'Rest longer or drop ~2.5–5%.'; color = 'warn'; }
    else if (vl >= 40) { label = 'High fatigue'; action = 'End the set sooner or drop 5–10%.'; color = 'bad'; }

    notes.push({ key: 'load', title: 'Load', label, action, color });
  }

  if (eccs.length) {
    const avg = mean(eccs);
    let label = 'On target';
    let action = 'Stay controlled ~2–4 s down.';
    let color = 'ok';

    if (avg < 1.8) { label = 'Too fast'; action = 'Slow the down phase a bit (~2–4 s).'; color = 'warn'; }
    else if (avg > 4.2) { label = 'Very slow'; action = 'Speed up slightly toward ~2–4 s.'; color = 'info'; }

    notes.push({ key: 'tempo', title: 'Tempo', label, action, color });
  }

  if (roms.length) {
    const cv = cvPct(roms);
    const max = Math.max(...roms);
    const endDrop = max > 0 ? ((max - roms[roms.length - 1]) / max) * 100 : 0;

    let label = 'Consistent';
    let action = 'Keep using the same depth each rep.';
    let color = 'ok';

    if (cv >= 10 && cv < 20) { label = 'Varied'; action = 'Aim for the same depth each time.'; color = 'info'; }
    if (endDrop >= 10) { label = 'Breaking down'; action = 'Consider ending the set sooner or resting more.'; color = 'warn'; }

    notes.push({ key: 'rom', title: 'ROM', label, action, color });
  }

  return notes;
}

export const toNumOrNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Prefer correction.js output, fallback to raw reps.
 *
 * IMPORTANT: This now fully supports the new correction.js shape:
 *   {
 *     repNum,
 *     romMm,
 *     concentricStartTime,
 *     eccentricStartTime,
 *     repEndTime,
 *     // (optionally) concentricMs, eccentricMs, durationMs, velocity...
 *   }
 *
 * It derives durations from timestamps when needed, so we’re no longer
 * dependent on frame-count × assumed Hz anywhere in this pipeline.
 */
export function buildValidatedMetricsFromCorrection(validatedReps = [], fallbackRepsArray = []) {
  if (!Array.isArray(validatedReps)) validatedReps = [];
  if (!Array.isArray(fallbackRepsArray)) fallbackRepsArray = [];

  const pickFallback = (idx0) => {
    const r = fallbackRepsArray[idx0] || {};
    return {
      Velocity:   toNumOrNull(r?.Velocity),
      ROM:        toNumOrNull(r?.ROM),
      Concentric: toNumOrNull(r?.Concentric),
      Eccentric:  toNumOrNull(r?.Eccentric),
    };
  };

  return validatedReps.map((vr, i) => {
    const idx0 =
      (Number.isFinite(vr?.index)     && vr.index)     ??
      (Number.isFinite(vr?.i)         && vr.i)         ??
      (Number.isFinite(vr?.repIndex)  && vr.repIndex)  ??
      i;

    // --- ROM (mm) ---
    const rom =
      toNumOrNull(vr?.romMm) ??
      toNumOrNull(vr?.rom_mm) ??
      toNumOrNull(vr?.ROM) ?? null;

    // --- durations (ms) — first try explicit fields, THEN derive from timestamps ---
    let concMs =
      toNumOrNull(vr?.concentricMs) ??
      toNumOrNull(vr?.concentric_ms) ??
      toNumOrNull(vr?.ConcentricMs) ?? null;

    let eccMs =
      toNumOrNull(vr?.eccentricMs) ??
      toNumOrNull(vr?.eccentric_ms) ??
      toNumOrNull(vr?.EccentricMs) ?? null;

    let durationMsRaw =
      toNumOrNull(vr?.durationMs) ??
      ((concMs != null && eccMs != null) ? concMs + eccMs : null);

    // NEW: derive from timestamps when ms fields are missing
    const cStart = toNumOrNull(vr?.concentricStartTime);
    const eStart = toNumOrNull(vr?.eccentricStartTime);
    const rEnd   = toNumOrNull(vr?.repEndTime);

    if (concMs == null && cStart != null && eStart != null && eStart > cStart) {
      concMs = eStart - cStart;
    }

    if (eccMs == null && eStart != null && rEnd != null && rEnd > eStart) {
      eccMs = rEnd - eStart;
    }

    if (durationMsRaw == null && cStart != null && rEnd != null && rEnd > cStart) {
      durationMsRaw = rEnd - cStart;
    } else if (durationMsRaw == null && concMs != null && eccMs != null) {
      durationMsRaw = concMs + eccMs;
    }

    // --- velocity (mm/s) ---
    let vel =
      toNumOrNull(vr?.velocity) ??
      toNumOrNull(vr?.Velocity) ?? null;

    // If velocity missing but we have ROM + real duration, compute it
    if ((vel == null || Number.isNaN(vel)) && rom != null && durationMsRaw) {
      const durationSec = durationMsRaw / 1000;
      if (durationSec > 0) vr.Velocity = (rom / 1000) / durationSec;  // mm/s
      vel = vr.Velocity;
    }

    // Exported values use:
    //   - ROM in mm
    //   - Concentric/Eccentric in seconds
    //   - Velocity in mm/s
    let out = {
      Velocity:   vel,
      ROM:        rom,
      Concentric: concMs != null ? concMs / 1000 : null,
      Eccentric:  eccMs  != null ? eccMs  / 1000 : null,
    };

    // Secondary velocity fix if still missing
    if ((out.Velocity == null || Number.isNaN(out.Velocity)) && out.ROM != null) {
      const durationSec =
        durationMsRaw != null ? durationMsRaw / 1000
        : (out.Concentric != null && out.Eccentric != null) ? (out.Concentric + out.Eccentric)
        : null;
      if (durationSec && durationSec > 0) out.Velocity = (out.ROM / 1000) / durationSec;
    }

    const fb = pickFallback(idx0);
    return {
      Velocity:   (out.Velocity   ?? fb.Velocity),
      ROM:        (out.ROM        ?? fb.ROM),
      Concentric: (out.Concentric ?? fb.Concentric),
      Eccentric:  (out.Eccentric  ?? fb.Eccentric),
    };
  });
}

export const summarizeSet = (setEntryOrReps = [], weight = 0) => {
  const toSafe = (r) => {
    const ROM = Number(r?.ROM);
    const C = Number(r?.Concentric);
    const E = Number(r?.Eccentric);
    let V = Number(r?.Velocity);
    if ((!Number.isFinite(V) || V === 0) && Number.isFinite(ROM)) {
      const dur = (Number.isFinite(C) ? C : 0) + (Number.isFinite(E) ? E : 0);
      if (dur > 0) V = ROM / dur;
    }
    return {
      Velocity: Number.isFinite(V) ? V : null,
      ROM: Number.isFinite(ROM) ? ROM : null,
      Concentric: Number.isFinite(C) ? C : null,
      Eccentric: Number.isFinite(E) ? E : null,
    };
  };

  const repsArray = Array.isArray(setEntryOrReps)
    ? setEntryOrReps
    : (Array.isArray(setEntryOrReps?.validatedRepMetrics) && setEntryOrReps.validatedRepMetrics.length
        ? setEntryOrReps.validatedRepMetrics
        : (Array.isArray(setEntryOrReps?.reps) ? setEntryOrReps.reps : []));

  const normalized = (repsArray || []).map(toSafe);

  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
  const vels = normalized.map(r => num(r?.Velocity)).filter((x) => x != null);
  const eccs = normalized.map(r => num(r?.Eccentric)).filter((x) => x != null);
  const roms = normalized.map(r => num(r?.ROM)).filter((x) => x != null);

  const reps = normalized.length;
  const avgVelocity = Number(mean(vels).toFixed(3)) || 0;
  const avgEccentric = Number(mean(eccs).toFixed(3)) || 0;
  const avgROM = Number(mean(roms).toFixed(3)) || 0;

  let velocityLossPct = 0;
  if (vels.length >= 2 && vels[0] > 0) {
    velocityLossPct = Number(((1 - vels[vels.length - 1] / vels[0]) * 100).toFixed(2));
  }

  return {
    reps,
    weight: Number(weight) || 0,
    avgVelocity,
    avgEccentric,
    avgROM,
    velocityLossPct,
    repsMetrics: normalized,
  };
};
