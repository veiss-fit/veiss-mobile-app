// storage/workoutStore.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MOCK_WORKOUTS_BY_DATE } from '../data/pastWorkouts';

const STORAGE_KEY = 'VEISS_WORKOUTS_BY_DATE';

/**
 * GLOBAL WRITE GATE
 * - When false, public mutators (saveWorkout, addOrMergeExercise, applyValidatedCounts) become NO-OPs.
 * - Toggle via setWriteGate(true|false) from UI flows.
 */
let WRITE_GATE = true; // default allow (home/past views still work)

/** Public: allow UI to control when persistence is permitted */
export function setWriteGate(enabled) {
  WRITE_GATE = !!enabled;
}

/**
 * IMPORTANT:
 * - We ONLY use the "allowed" filter when seeding/ensuring mock data,
 *   so your user-added exercises are NOT filtered out from real saves.
 */
const allowedExercises = new Set([
  'Bench Press',
  'Shoulder Press',
  'Tricep Dips',
  // ---- newly added so they persist in seeded history ----
  'Incline Bench Press',
  'Barbell Row',
  'Lat Pulldown',
  'Bicep Curl',
  'Lateral Raise',
]);

function filterAllowedExercises(workout) {
  if (!workout?.exercises) return workout;
  return {
    ...workout,
    exercises: workout.exercises.filter((ex) => allowedExercises.has(ex.name)),
  };
}

/** ---------- MOCK SEEDING / ENSURE ---------- */
export async function seedMockDataIfEmpty() {
  try {
    const existing = await AsyncStorage.getItem(STORAGE_KEY);
    if (!existing) {
      const filtered = {};
      Object.entries(MOCK_WORKOUTS_BY_DATE).forEach(([date, w]) => {
        filtered[date] = filterAllowedExercises(w);
      });
      delete filtered['2025-08-14']; // make sure this date never persists
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      return;
    }
    // Clean up any old 2025-08-14 if present
    const map = JSON.parse(existing);
    if (map['2025-08-14']) {
      delete map['2025-08-14'];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    }
  } catch (e) {
    console.warn('seedMockDataIfEmpty error:', e);
  }
}

export async function ensureMockDatesPresent() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const current = raw ? JSON.parse(raw) : {};

    // merge missing mock dates
    let changed = false;
    Object.entries(MOCK_WORKOUTS_BY_DATE).forEach(([date, w]) => {
      if (date === '2025-08-14') return; // skip
      if (!current[date]) {
        current[date] = filterAllowedExercises(w);
        changed = true;
      }
    });

    if (changed) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    }
  } catch (e) {
    console.warn('ensureMockDatesPresent error:', e);
  }
}

/** ---------- CORE HELPERS ---------- */
async function getMap() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    console.warn('getMap error:', e);
    return {};
  }
}

async function setMap(map) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map || {}));
  } catch (e) {
    console.warn('setMap error:', e);
  }
}

// Merge arrays of sets by set number; incoming wins per field (so validatedReps merges in naturally).
function mergeSets(existingSets = [], incomingSets = []) {
  const byNo = new Map();
  existingSets.forEach((s) => {
    const n = Number(s?.set);
    if (!Number.isFinite(n)) return;
    byNo.set(n, { ...s, set: n });
  });
  incomingSets.forEach((s) => {
    const n = Number(s?.set);
    if (!Number.isFinite(n)) return;
    const prev = byNo.get(n);
    byNo.set(n, { ...(prev || {}), ...s, set: n });
  });
  return Array.from(byNo.values()).sort((a, b) => a.set - b.set);
}

// Merge exercises by name (case-insensitive)
function mergeExercises(existing = [], incoming = []) {
  const out = [...existing];
  incoming.forEach((inc) => {
    const name = String(inc?.name || '').trim();
    if (!name) return;
    const idx = out.findIndex(
      (e) => String(e?.name).toLowerCase() === name.toLowerCase()
    );
    const incSets = Array.isArray(inc?.sets) ? inc.sets : [];
    if (idx === -1) {
      out.push({ name, sets: incSets });
    } else {
      out[idx] = { name, sets: mergeSets(out[idx].sets, incSets) };
    }
  });
  return out;
}

/** ---------- PUBLIC API ---------- */
export async function getAllWorkoutsMap() {
  return await getMap();
}

export async function getWorkoutByDate(dateISO) {
  const map = await getMap();
  const w = map?.[dateISO];
  // DO NOT filter here — keep user-added exercises in history
  return w ? { ...w, date: w.date || dateISO, exercises: w.exercises || [] } : null;
}

/**
 * Save (create or merge) a full-day payload.
 * payload shape: { date: YYYY-MM-DD, exercises: [{ name, sets: [{ set, weight, reps, validatedReps? }] }] }
 *
 * - We MERGE with existing entries so ExerciseCard saves and Finish-Workout saves never stomp each other.
 * - Unknown fields on sets (like validatedReps) are preserved/merged.
 * - ***WRITE GATED***: no-op when WRITE_GATE === false.
 */
export async function saveWorkout(dateISO, workout) {
  if (!WRITE_GATE) {
    // console.log('[workoutStore] saveWorkout blocked by gate');
    return;
  }
  try {
    const map = await getMap();
    const key = dateISO;
    const existing = map[key] || { date: key, exercises: [] };

    const incomingExercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
    const mergedExercises = mergeExercises(existing.exercises, incomingExercises);

    map[key] = { date: key, exercises: mergedExercises };
    await setMap(map);
  } catch (e) {
    console.warn('saveWorkout error:', e);
  }
}

export async function getAvailableDates() {
  const map = await getMap();
  return Object.keys(map).sort();
}

export async function removeWorkoutByDate(dateISO) {
  try {
    const map = await getMap();
    if (map[dateISO]) {
      delete map[dateISO];
      await setMap(map);
    }
  } catch (e) {
    console.warn('removeWorkoutByDate error:', e);
  }
}

// Optional dev helper to wipe and reseed cleanly
export async function resetToMock() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await seedMockDataIfEmpty();
  } catch (e) {
    console.warn('resetToMock error:', e);
  }
}

/**
 * Convenience: add or merge a single exercise with sets.
 * exercisePayload: { name, sets: [{ set, weight, reps, validatedReps? }] }
 *
 * - ***WRITE GATED***: no-op when WRITE_GATE === false.
 */
export async function addOrMergeExercise(dateISO, exercisePayload) {
  if (!WRITE_GATE) {
    // console.log('[workoutStore] addOrMergeExercise blocked by gate');
    return;
  }
  if (!dateISO || !exercisePayload?.name) return;
  const current = await getWorkoutByDate(dateISO);
  const merged = mergeExercises(current?.exercises || [], [exercisePayload]);
  await saveWorkout(dateISO, { date: dateISO, exercises: merged });
}

/**
 * NEW: Apply validated rep counts onto already-saved day.
 * countsMap shape: { [exerciseName]: { [setNumber]: validatedCount } }
 *
 * We update in-place: each matching set gets `validatedReps = count`.
 * No-op if gate is closed.
 */
export async function applyValidatedCounts(dateISO, countsMap = {}) {
  if (!WRITE_GATE) return;
  if (!dateISO || !countsMap || typeof countsMap !== 'object') return;

  try {
    const map = await getMap();
    const day = map?.[dateISO];
    if (!day || !Array.isArray(day.exercises)) return;

    const nameToCounts = countsMap;

    const updated = {
      ...day,
      exercises: day.exercises.map((ex) => {
        const exCounts = nameToCounts?.[ex.name];
        if (!exCounts || typeof exCounts !== 'object') return ex;
        const nextSets = Array.isArray(ex.sets)
          ? ex.sets.map((s) => {
              const n = Number(s?.set);
              if (!Number.isFinite(n)) return s;
              const v = exCounts[n];
              if (!Number.isFinite(v)) return s;
              return { ...s, validatedReps: v };
            })
          : ex.sets;
        return { ...ex, sets: nextSets };
      }),
    };

    map[dateISO] = updated;
    await setMap(map);
  } catch (e) {
    console.warn('applyValidatedCounts error:', e);
  }
}
