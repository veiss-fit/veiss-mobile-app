// services/persistence.js
import { getWorkoutByDate, saveWorkout, applyValidatedCounts } from '../storage/workoutStore';
import { summarizeSet } from '../lib/metrics';

export const buildSavedExercisesFromSession = (sessionExercisesMap = {}, validatedCounts = {}) => {
  const names = Object.keys(sessionExercisesMap || {});
  return names.map((name) => {
    const setsForName = sessionExercisesMap[name] || [];
    const setSummaries = setsForName.map((oneSetObj, idx) => {
      const repsArray = Array.isArray(oneSetObj)
        ? oneSetObj
        : (oneSetObj?.reps || []);
      const weight = Array.isArray(oneSetObj) ? 0 : Number(oneSetObj?.weight) || 0;

      const summary = summarizeSet(oneSetObj, weight);
      const setNum = idx + 1;
      const validated = validatedCounts?.[name]?.[setNum];
      const repsFinal = Number.isFinite(validated) ? validated : summary.reps;

      return { set: setNum, ...summary, reps: repsFinal };
    });
    return { name, sets: setSummaries };
  });
};

export const persistTodayIfNeeded = async () => {
  const dateISO = new Date().toISOString().slice(0, 10);
  const existing = await getWorkoutByDate(dateISO);
  if (existing && Array.isArray(existing.exercises)) {
    await saveWorkout(dateISO, existing);
    return existing;
  }
  const payload = { date: dateISO, exercises: [] };
  await saveWorkout(dateISO, payload);
  return payload;
};

export const persistFinishedSessionValidated = async (sessionMap, validatedCounts) => {
  const dateISO = new Date().toISOString().slice(0, 10);
  let day = await getWorkoutByDate(dateISO);
  if (!day || !Array.isArray(day.exercises)) {
    day = { date: dateISO, exercises: [] };
  }

  const newExercises = buildSavedExercisesFromSession(sessionMap, validatedCounts);
  const mergedByName = new Map();
  day.exercises.forEach((ex) => mergedByName.set(ex.name, { ...ex }));

  newExercises.forEach((ex) => {
    if (mergedByName.has(ex.name)) {
      const existing = mergedByName.get(ex.name);
      mergedByName.set(ex.name, { ...existing, sets: [...(existing.sets || []), ...(ex.sets || [])] });
    } else {
      mergedByName.set(ex.name, ex);
    }
  });

  const merged = { ...day, exercises: Array.from(mergedByName.values()) };
  await saveWorkout(dateISO, merged);

  // best-effort: re-apply validated counts
  await applyValidatedCounts(dateISO, validatedCounts).catch(() => {});

  return merged;
};
