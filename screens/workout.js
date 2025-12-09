// screens/workout.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity, StyleSheet, Alert, DeviceEventEmitter,
  TextInput, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';
import Feather from 'react-native-vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart } from 'react-native-chart-kit';
import { Buffer } from 'buffer';

import ExerciseCard from '../components/ExerciseCard';
import ViewPastWorkoutCard from '../components/viewPastWorkoutCard';

import { getWorkoutByDate, saveWorkout, setWriteGate, applyValidatedCounts } from '../storage/workoutStore';
import useRepCounter from '../hooks/useRepCounter';
import { useBLE } from '../contexts/BLEContext';
import { runVeissFromRows } from '../lib/veiss';
import { RAW_TOF_UUID, TOF_MAX_SAMPLES, parseSycamoreFrame } from '../lib/tof';

/* ------------------ small in-file helpers ------------------ */
const toNumOrNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const makeCoachNotes = ({ vels = [], eccs = [], roms = [] }) => {
  const notes = [];
  if (vels.length >= 2) {
    const first = vels[0], last = vels[vels.length - 1];
    const loss = first > 0 ? (1 - last / first) * 100 : 0;
    let label = 'Strength zone', action = 'Keep the weight.', color = 'ok';
    if (loss < 15) { label = 'Easy'; action = 'Add ~2.5–5% or 1–2 reps.'; color = 'good'; }
    else if (loss >= 30 && loss < 40) { label = 'Fatigue building'; action = 'Rest longer or drop ~2.5–5%.'; color = 'warn'; }
    else if (loss >= 40) { label = 'High fatigue'; action = 'End sooner or drop 5–10%.'; color = 'bad'; }
    notes.push({ key: 'load', title: 'Load', label, action, color });
  }
  if (eccs.length) {
    const avg = mean(eccs);
    let label = 'On target', action = 'Stay controlled ~2–4 s down.', color = 'ok';
    if (avg < 1.8) { label = 'Too fast'; action = 'Slow the down phase (~2–4 s).'; color = 'warn'; }
    else if (avg > 4.2) { label = 'Very slow'; action = 'Speed slightly toward ~2–4 s.'; color = 'info'; }
    notes.push({ key: 'tempo', title: 'Tempo', label, action, color });
  }
  if (roms.length) {
    const cv = (() => {
      if (roms.length < 2) return 0;
      const m = mean(roms); if (!m) return 0;
      const sd = Math.sqrt(roms.reduce((s, x) => s + (x - m) ** 2, 0) / (roms.length - 1));
      return (sd / m) * 100;
    })();
    let label = 'Consistent', action = 'Keep using the same depth.', color = 'ok';
    if (cv >= 10 && cv < 20) { label = 'Varied'; action = 'Aim for the same depth each time.'; color = 'info'; }
    notes.push({ key: 'rom', title: 'ROM', label, action, color });
  }
  return notes;
};
/** prefer correction values; fallback to raw reps array (Velocity, ROM, Concentric, Eccentric) */
const buildValidatedMetricsFromCorrection = (validatedReps = [], fallback = []) =>
  (validatedReps || []).map((vr, i) => {
    const rom =
      toNumOrNull(vr?.romMm) ?? toNumOrNull(vr?.rom_mm) ?? toNumOrNull(vr?.ROM) ?? null;
    const cMs =
      toNumOrNull(vr?.concentricMs) ?? toNumOrNull(vr?.concentric_ms) ?? toNumOrNull(vr?.ConcentricMs);
    const eMs =
      toNumOrNull(vr?.eccentricMs) ?? toNumOrNull(vr?.eccentric_ms) ?? toNumOrNull(vr?.EccentricMs);
    let vel = toNumOrNull(vr?.velocity) ?? toNumOrNull(vr?.Velocity);

    const base = fallback[i] || {};
    let conc = cMs != null ? cMs / 1000 : toNumOrNull(base?.Concentric);
    let ecc = eMs != null ? eMs / 1000 : toNumOrNull(base?.Eccentric);
    let outROM = rom ?? toNumOrNull(base?.ROM);

    if ((vel == null || Number.isNaN(vel)) && outROM != null) {
      const dur = (conc || 0) + (ecc || 0);
      if (dur > 0) vel = outROM / dur;
    }
    return {
      Velocity: vel ?? toNumOrNull(base?.Velocity) ?? null,
      ROM: outROM ?? null,
      Concentric: conc ?? null,
      Eccentric: ecc ?? null,
    };
  });

/* ------------------- small persistence helpers ------------------- */
const persistTodayIfNeeded = async () => {
  const dateISO = new Date().toISOString().slice(0, 10);
  const existing = await getWorkoutByDate(dateISO);
  if (existing && Array.isArray(existing.exercises)) {
    await saveWorkout(dateISO, existing); // ensure shell retained
    return existing;
  }
  const payload = { date: dateISO, exercises: [] };
  await saveWorkout(dateISO, payload);
  return payload;
};
const summarizeSet = (setObjOrReps = [], weight = 0) => {
  const reps = Array.isArray(setObjOrReps)
    ? setObjOrReps
    : (Array.isArray(setObjOrReps?.validatedRepMetrics) && setObjOrReps.validatedRepMetrics.length
        ? setObjOrReps.validatedRepMetrics
        : (Array.isArray(setObjOrReps?.reps) ? setObjOrReps.reps : []));
  const asNums = (reps || []).map(r => {
    const ROM = Number(r?.ROM), C = Number(r?.Concentric), E = Number(r?.Eccentric);
    let V = Number(r?.Velocity);
    if ((!Number.isFinite(V) || V === 0) && Number.isFinite(ROM)) {
      const d = (Number.isFinite(C) ? C : 0) + (Number.isFinite(E) ? E : 0);
      if (d > 0) V = ROM / d;
    }
    return {
      Velocity: Number.isFinite(V) ? V : null,
      ROM: Number.isFinite(ROM) ? ROM : null,
      Concentric: Number.isFinite(C) ? C : null,
      Eccentric: Number.isFinite(E) ? E : null,
    };
  });
  const vels = asNums.map(r => r.Velocity).filter(v => v != null);
  const eccs = asNums.map(r => r.Eccentric).filter(v => v != null);
  const roms = asNums.map(r => r.ROM).filter(v => v != null);
  const avgVelocity = Number(mean(vels).toFixed(3)) || 0;
  const avgEccentric = Number(mean(eccs).toFixed(3)) || 0;
  const avgROM = Number(mean(roms).toFixed(3)) || 0;
  let velocityLossPct = 0;
  if (vels.length >= 2 && vels[0] > 0) { velocityLossPct = Number(((1 - vels[vels.length - 1] / vels[0]) * 100).toFixed(2)); }
  return { reps: reps.length, weight: Number(weight) || 0, avgVelocity, avgEccentric, avgROM, velocityLossPct, repsMetrics: reps };
};
const buildSavedExercisesFromSession = (sessionMap = {}, validatedCounts = {}) => {
  const names = Object.keys(sessionMap);
  return names.map((name) => {
    const setsArr = sessionMap[name] || [];
    const setSummaries = setsArr.map((one, idx) => {
      const baseReps = Array.isArray(one) ? one : (one?.reps || []);
      const weight = Array.isArray(one) ? 0 : Number(one?.weight) || 0;
      const summary = summarizeSet(one, weight);
      const setNum = idx + 1;
      const validated = validatedCounts?.[name]?.[setNum];
      const repsFinal = Number.isFinite(validated) ? validated : summary.reps;
      return { set: setNum, ...summary, reps: repsFinal };
    });
    return { name, sets: setSummaries };
  });
};
const persistFinishedSessionValidated = async (sessionMap, validatedCounts) => {
  const dateISO = new Date().toISOString().slice(0, 10);
  let day = await getWorkoutByDate(dateISO);
  if (!day || !Array.isArray(day.exercises)) day = { date: dateISO, exercises: [] };
  const toSave = buildSavedExercisesFromSession(sessionMap, validatedCounts);
  const byName = new Map();
  day.exercises.forEach((ex) => byName.set(ex.name, { ...ex }));
  toSave.forEach((ex) => {
    if (byName.has(ex.name)) {
      const prev = byName.get(ex.name);
      byName.set(ex.name, { ...prev, sets: [ ...(prev.sets || []), ...(ex.sets || []) ] });
    } else { byName.set(ex.name, ex); }
  });
  const merged = { ...day, exercises: Array.from(byName.values()) };
  await saveWorkout(dateISO, merged);
  return merged;
};

/* ------------------- constants / lite demo data ------------------- */
const workoutTypes = [{ name: 'Push', exercises: ['Bench Press', 'Shoulder Press', 'Tricep Dips'] }];
const DEFAULT_EXERCISES = workoutTypes.find(w => w.name === 'Push')?.exercises || [];
const CUSTOM_WORKOUTS_KEY = 'workout:templates:v1';
const HIDE_DEFAULT_PUSH_KEY = 'workout:hidePush:v1';
const THEME = { primary: '#FFC300', placeholder: '#9AA0A6' };
const SCREEN_W = Dimensions.get('window').width;
const GRAPH_W = Math.max(240, SCREEN_W - 40), GRAPH_H = 120;

/* ------------------------------ component ------------------------------ */
export default function Workout() {
  const navigation = useNavigation();
  const { connectedDevice: device } = useBLE() || {};
  const { writeText } = useRepCounter(device) || {};

  // high level UI
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [customWorkouts, setCustomWorkouts] = useState([]);
  const [hideDefaultPush, setHideDefaultPush] = useState(false);

  // session
  const [activeExercise, setActiveExercise] = useState(null);
  const isActiveAny = !!activeExercise;
  const [sessionExerciseNames, setSessionExerciseNames] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const sessionRef = useRef({ dateISO: new Date().toISOString(), exercises: {} });
  const [validatedCounts, setValidatedCounts] = useState({});
  const [feedbackExercise, setFeedbackExercise] = useState(null);
  const [feedbackNotes, setFeedbackNotes] = useState([]);

  // ToF stream (mini graph + rows for veiss)
  const [tofSeries, setTofSeries] = useState([]);
  const [tofMeta, setTofMeta] = useState({ frameId: null, zones: null });
  const graphActiveRef = useRef(false);
  const currentTofRowsRef = useRef([]);
  const currentExerciseRef = useRef(null);
  const sessionIdRef = useRef(Math.floor(Date.now() / 1000));

  // templates/flags
  useEffect(() => {
    (async () => {
      try {
        const [raw, hidden] = await Promise.all([
          AsyncStorage.getItem(CUSTOM_WORKOUTS_KEY),
          AsyncStorage.getItem(HIDE_DEFAULT_PUSH_KEY),
        ]);
        if (raw) setCustomWorkouts(JSON.parse(raw));
        if (hidden) setHideDefaultPush(JSON.parse(hidden) === true);
      } catch {}
    })();
  }, []);

  const saveCustomWorkouts = useCallback(async (list) => {
    try { await AsyncStorage.setItem(CUSTOM_WORKOUTS_KEY, JSON.stringify(list)); setCustomWorkouts(list); } catch {}
  }, []);
  const setPushHidden = useCallback(async (hidden) => {
    try { await AsyncStorage.setItem(HIDE_DEFAULT_PUSH_KEY, JSON.stringify(Boolean(hidden))); setHideDefaultPush(Boolean(hidden)); } catch {}
  }, []);

  // when a workout is selected → seed session
  useEffect(() => {
    if (!selectedWorkout) return;
    setWriteGate(false);
    const seed = selectedWorkout.exercises?.length ? selectedWorkout.exercises : DEFAULT_EXERCISES;
    setSessionExerciseNames([...seed]);
    sessionRef.current = { dateISO: new Date().toISOString(), exercises: {} };
    setActiveExercise(null);
    setAdding(false);
    setNewExerciseName('');
    setFeedbackExercise(null);
    setFeedbackNotes([]);
    graphActiveRef.current = false;
    setTofSeries([]); setTofMeta({ frameId: null, zones: null });
    currentTofRowsRef.current = []; currentExerciseRef.current = null;
    sessionIdRef.current = Math.floor(Date.now() / 1000);
    setValidatedCounts({});
  }, [selectedWorkout]);

  // computed exercises (light objects for ExerciseCard tiles)
  const exercises = useMemo(
    () => sessionExerciseNames.map((name) => ({ name, sets: [{ id: 1 }, { id: 2 }, { id: 3 }] })),
    [sessionExerciseNames]
  );

  // record a finished set from ExerciseCard
  const recordSet = useCallback((exerciseName, repsArray, weightMaybe) => {
    if (!exerciseName || !Array.isArray(repsArray)) return;
    const frozen = repsArray.map((r) => ({
      Velocity: toNumOrNull(r?.Velocity),
      ROM: toNumOrNull(r?.ROM),
      Concentric: toNumOrNull(r?.Concentric),
      Eccentric: toNumOrNull(r?.Eccentric),
    }));
    const weight = Number(weightMaybe?.weight ?? weightMaybe?.load ?? weightMaybe?.weightLbs ?? weightMaybe ?? 0) || 0;
    if (!sessionRef.current.exercises[exerciseName]) sessionRef.current.exercises[exerciseName] = [];
    sessionRef.current.exercises[exerciseName].push({ reps: frozen, weight });
  }, []);

  // per-set ToF reset
  const resetTofForNextSet = useCallback(async () => {
    try { await writeText?.('reset_tof'); } catch {}
    currentTofRowsRef.current = [];
    sessionIdRef.current = Math.floor(Date.now() / 1000);
    setTofSeries([]); setTofMeta({ frameId: null, zones: null });
  }, [writeText]);

  // set completed → run Veiss on buffered rows
  useEffect(() => {
    const sub1 = DeviceEventEmitter.addListener('workout:set:completed', async (payload) => {
      try { recordSet(payload?.exercise, payload?.reps, payload?.weight ?? payload); } catch {}

      try {
        const exName = payload?.exercise || currentExerciseRef.current;
        const rows = currentTofRowsRef.current;
        currentTofRowsRef.current = [];
        if (Array.isArray(rows) && rows.length > 5) {
          const { validatedReps } = await runVeissFromRows({ rows, dataRateHz: 30 });
          const count = (validatedReps || []).length;
          const setNum = (sessionRef.current.exercises?.[exName]?.length || 1);
          setValidatedCounts((prev) => ({ ...prev, [exName]: { ...(prev[exName] || {}), [setNum]: count } }));

          const setsForExercise = sessionRef.current.exercises?.[exName] || [];
          const justSaved = setsForExercise[setNum - 1];
          const base = Array.isArray(justSaved) ? justSaved : (justSaved?.reps || []);
          const metrics = buildValidatedMetricsFromCorrection(validatedReps, base);
          if (justSaved && !Array.isArray(justSaved)) justSaved.validatedRepMetrics = metrics;
          else if (Array.isArray(justSaved)) setsForExercise[setNum - 1] = { reps: justSaved, weight: 0, validatedRepMetrics: metrics };

          DeviceEventEmitter.emit('exercise:validated_rep_metrics', { exercise: exName, set: setNum, metrics });
        }
      } catch (e) { /* noop */ }
      finally { await resetTofForNextSet(); }
    });

    const sub2 = DeviceEventEmitter.addListener('ble:connected', () => {
      const name = activeExercise;
      if (name) DeviceEventEmitter.emit('workout:start_stream', { exercise: name });
    });
    const sub3 = DeviceEventEmitter.addListener('ble:disconnected', () => {
      DeviceEventEmitter.emit('workout:stop_stream');
    });

    return () => { try { sub1.remove(); } catch {} try { sub2.remove(); } catch {} try { sub3.remove(); } catch {} };
  }, [recordSet, activeExercise, resetTofForNextSet]);

  // subscribe to Raw ToF → chart + buffer rows
  // subscribe to Raw ToF → chart + buffer rows (Sycamore format)
  useEffect(() => {
    const onStart = DeviceEventEmitter.addListener('workout:start_stream', (evt) => {
      graphActiveRef.current = true;
      setTofSeries([]);
      setTofMeta({ frameId: null, zones: null });
      currentTofRowsRef.current = [];
      currentExerciseRef.current = evt?.exercise || null;
    });

    const onStop = DeviceEventEmitter.addListener('workout:stop_stream', () => {
      graphActiveRef.current = false;
      setTofSeries([]);
      setTofMeta({ frameId: null, zones: null });
    });

    const sub = DeviceEventEmitter.addListener(
      'bleCharacteristicValueChanged',
      (payload) => {
        try {
          const uuid = String(payload?.characteristicUUID || '').toUpperCase();
          if (uuid !== RAW_TOF_UUID || !graphActiveRef.current) return;

          // ✅ NEW: decode Sycamore packet (timestamp + frameId + numZones + distances)
          const pkt = parseSycamoreFrame(payload?.value);
          if (!pkt) return;

          const { timestamp_ms, frameId, numZones, distances } = pkt;
          if (!distances?.length || !Number.isFinite(numZones)) return;

          // mini-graph: average distance across zones
          const avg =
            distances.reduce((a, b) => a + b, 0) / distances.length;

          setTofMeta({ frameId, zones: numZones });
          setTofSeries((prev) =>
            prev.length >= TOF_MAX_SAMPLES
              ? [...prev.slice(1), avg]
              : [...prev, avg]
          );

          // buffer row for rep engine — use DEVICE timestamp_ms
          const row = {
            session_id: sessionIdRef.current,
            timestamp_ms, // ✅ real device time
          };
          for (let i = 0; i < numZones; i++) {
            row[`z${i}`] = distances[i];
          }
          currentTofRowsRef.current.push(row);
        } catch {
          // ignore
        }
      }
    );

    return () => {
      try { sub.remove(); } catch {}
      try { onStart.remove(); } catch {}
      try { onStop.remove(); } catch {}
    };
  }, []);

  useEffect(() => {
    return () => {
      console.log("[Workout] Screen unmounted → sending stop_stream failsafe");
      DeviceEventEmitter.emit("workout:stop_stream");
    };
  }, []);

  // add/delete exercise (session UI)
  const onCreateExercise = () => {
    const name = (newExerciseName || '').trim();
    if (!name) return Alert.alert('Name required', 'Please enter an exercise name.');
    const exists = sessionExerciseNames.some((n) => n.toLowerCase() === name.toLowerCase());
    if (exists) return Alert.alert('Already added', `"${name}" is already in this workout.`);
    setSessionExerciseNames((prev) => [...prev, name]);
    setNewExerciseName(''); setAdding(false);
  };
  const confirmDeleteExercise = (name) => {
    Alert.alert('Delete Exercise', 'Are you sure you want to delete?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        setSessionExerciseNames((prev) => prev.filter((n) => n !== name));
        const next = { ...sessionRef.current.exercises }; delete next[name]; sessionRef.current.exercises = next;
        if (activeExercise === name) setActiveExercise(null);
        if (feedbackExercise === name) { setFeedbackExercise(null); setFeedbackNotes([]); }
      }},
    ]);
  };
  const renderRightActions = (name) => (
    <View style={styles.rightRail}>
      <TouchableOpacity style={[styles.deleteBtn, isActiveAny && styles.disabledBtn]} onPress={() => confirmDeleteExercise(name)} disabled={isActiveAny}>
        <Feather name="trash-2" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  // swipe-to-delete workouts (on picker screen)
  const confirmDeleteWorkout = async (name) => {
    Alert.alert('Delete Workout', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        if (name === 'Push') return setPushHidden(true);
        const next = customWorkouts.filter((w) => w.name !== name);
        await saveCustomWorkouts(next);
      }},
    ]);
  };
  const renderRightActionsWorkout = (name) => (
    <View style={styles.rightRailCard}>
      <TouchableOpacity style={styles.deleteBtnCard} onPress={() => confirmDeleteWorkout(name)}>
        <Feather name="trash-2" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  // feedback open
  const openFeedbackFor = (name) => {
    const sets = sessionRef.current.exercises?.[name];
    if (!Array.isArray(sets) || sets.length === 0) return Alert.alert('No data', 'Finish a set first to see feedback.');
    const last = sets[sets.length - 1];
    const base = Array.isArray(last) ? last : (last?.reps || []);
    const reps = (!Array.isArray(last) && Array.isArray(last?.validatedRepMetrics) && last.validatedRepMetrics.length)
      ? last.validatedRepMetrics : base;

    const normalized = (reps || []).map(r => {
      const ROM = Number(r?.ROM), C = Number(r?.Concentric), E = Number(r?.Eccentric);
      let V = Number(r?.Velocity);
      if ((!Number.isFinite(V) || V === 0) && Number.isFinite(ROM)) {
        const d = (Number.isFinite(C) ? C : 0) + (Number.isFinite(E) ? E : 0);
        if (d > 0) V = ROM / d;
      }
      return { Velocity: Number.isFinite(V) ? V : null, ROM: Number.isFinite(ROM) ? ROM : null, Concentric: Number.isFinite(C) ? C : null, Eccentric: Number.isFinite(E) ? E : null };
    });
    const vels = normalized.map(r => r.Velocity).filter(v => v != null);
    const roms = normalized.map(r => r.ROM).filter(v => v != null);
    const eccs = normalized.map(r => r.Eccentric).filter(v => v != null);
    setFeedbackExercise(name);
    setFeedbackNotes(makeCoachNotes({ vels, eccs, roms }));
  };

  // cancel / finish
  const onCancelWorkout = () => {
    Alert.alert('Cancel Workout', 'Abandon this session? Nothing from this session will be saved.', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, abandon', style: 'destructive', onPress: () => {
        setWriteGate(true);
        setActiveExercise(null);
        setAdding(false);
        setNewExerciseName('');
        setFeedbackExercise(null);
        setFeedbackNotes([]);
        setSessionExerciseNames([]);
        sessionRef.current = { dateISO: new Date().toISOString(), exercises: {} };
        DeviceEventEmitter.emit('workout:stop_stream');
        setSelectedWorkout(null);
        currentTofRowsRef.current = [];
        setValidatedCounts({});
        DeviceEventEmitter.emit('workout:abandoned');
      }},
    ]);
  };

  const onFinishWorkout = async () => {
    if (activeExercise) return Alert.alert('Active Exercise', 'Finish your current exercise first.');
    try {
      setWriteGate(true);
      await persistTodayIfNeeded();
      const hasAny = Object.values(sessionRef.current.exercises || {}).some(arr => Array.isArray(arr) && arr.length);
      if (hasAny) {
        await persistFinishedSessionValidated(sessionRef.current.exercises, validatedCounts);
        const dateISO = new Date().toISOString().slice(0, 10);
        await applyValidatedCounts(dateISO, validatedCounts);
      }
    } catch (e) { /* noop */ }

    const session = { dateISO: sessionRef.current.dateISO, exercises: sessionRef.current.exercises };
    const hasAny = Object.values(session.exercises || {}).some(arr => Array.isArray(arr) && arr.length);

    setActiveExercise(null);
    DeviceEventEmitter.emit('workout:stop_stream');
    setSelectedWorkout(null);
    DeviceEventEmitter.emit('workout:saved_or_updated');

    if (hasAny) {
      const map = Object.fromEntries(
        Object.entries(session.exercises || {}).map(([exName, sets]) => ([
          exName,
          Object.fromEntries((sets || []).map((s, idx) => [idx + 1, (Array.isArray(s) ? [] : (s.validatedRepMetrics || []))]))
        ]))
      );
      navigation.navigate('Tracking', { session, validatedCounts, validatedRepMetricsByExercise: map });
    } else {
      navigation.navigate('Tracking');
    }
    sessionRef.current = { dateISO: new Date().toISOString(), exercises: {} };
    currentTofRowsRef.current = [];
    setValidatedCounts({});
  };

  /* ------------------------------- render ------------------------------- */
  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'bottom']}>
      {!selectedWorkout ? (
        <ScrollView contentContainerStyle={styles.scrollBody}>
          <Text style={styles.heading}>Select Workout</Text>
          <Text style={styles.subtext}>Choose your training focus</Text>

          {!hideDefaultPush && (
            <View style={styles.customItem}>
              <Swipeable renderRightActions={() => renderRightActionsWorkout('Push')} overshootRight={false}>
                <TouchableOpacity style={styles.workoutCard} onPress={() => setSelectedWorkout({ name: 'Push', exercises: DEFAULT_EXERCISES })} activeOpacity={0.9}>
                  <View style={styles.workoutCenter}>
                    <Text style={styles.workoutTitle}>Push</Text>
                    <Text style={styles.workoutSubtext}>{DEFAULT_EXERCISES.length} exercises</Text>
                  </View>
                </TouchableOpacity>
              </Swipeable>
            </View>
          )}

          {customWorkouts.length > 0 && (
            <View style={styles.customList}>
              {customWorkouts.map((w) => (
                <View key={w.name} style={styles.customItem}>
                  <Swipeable renderRightActions={() => renderRightActionsWorkout(w.name)} overshootRight={false}>
                    <TouchableOpacity style={styles.workoutCard} onPress={() => setSelectedWorkout({ name: w.name, exercises: w.exercises })} activeOpacity={0.9}>
                      <View style={styles.workoutCenter}>
                        <Text style={styles.workoutTitle}>{w.name}</Text>
                        <Text style={styles.workoutSubtext}>{w.exercises?.length || 0} exercises</Text>
                      </View>
                    </TouchableOpacity>
                  </Swipeable>
                </View>
              ))}
            </View>
          )}

          <View style={styles.addWorkoutSpacer} />
          <AddWorkoutCard
            onSave={async (name, exs) => {
              const lines = (exs || []).map(s => s.trim()).filter(Boolean);
              if (!name) return Alert.alert('Name required', 'Please enter a workout name.');
              if (!lines.length) return Alert.alert('Exercises required', 'Add at least one exercise.');
              const exists = customWorkouts.some(w => w.name.toLowerCase() === name.toLowerCase());
              if (exists) return Alert.alert('Already exists', `"${name}" already exists. Choose a different name.`);
              const next = [...customWorkouts, { name, exercises: lines }];
              await saveCustomWorkouts(next);
              Alert.alert('Saved', 'Your workout template has been saved.');
            }}
          />

          <View style={styles.pastWrap}><View style={styles.pastWrapInner}>
            <ViewPastWorkoutCard contentSpacing={16} gapBetweenDateAndList={16} innerGap={16} />
          </View></View>

          <View style={styles.footerSpacer} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollBodySession}>
          <Text style={styles.heading}>{selectedWorkout.name}</Text>
          <Text style={styles.subtext}>Track your progress</Text>

          {exercises.map((exercise) => {
            const isActive = activeExercise === exercise.name;
            const sets = sessionRef.current.exercises?.[exercise.name] || [];
            const hasData = Array.isArray(sets) && sets.length > 0;
            const lastSetNum = sets.length || 0;
            const lastValidated = validatedCounts?.[exercise.name]?.[lastSetNum];

            return (
              <View key={exercise.name} style={{ marginBottom: 10 }}>
                <Swipeable enabled={!isActiveAny} renderRightActions={() => renderRightActions(exercise.name)} overshootRight={false}>
                  <View style={[styles.tileRow, isActiveAny && !isActive ? styles.disabledTile : null]}>
                    <ExerciseCard
                      exercise={exercise}
                      isActive={isActive}
                      isAnyActive={isActiveAny}
                      onBecameActive={() => { setActiveExercise(exercise.name); DeviceEventEmitter.emit('workout:start_stream', { exercise: exercise.name }); }}
                      onFinished={() => { setActiveExercise(null); DeviceEventEmitter.emit('workout:stop_stream'); }}
                      validatedRepsLastSet={lastValidated}
                      validatedOnly
                    />
                  </View>
                </Swipeable>

                {hasData && (
                  <View style={styles.feedbackIconRow}>
                    <TouchableOpacity style={styles.feedbackIconBtn} onPress={() => openFeedbackFor(exercise.name)} activeOpacity={0.9}>
                      <Feather name="zap" size={16} color="#000" />
                      <Text style={styles.feedbackIconText}>Live Feedback</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          {!!feedbackExercise && (
            <View style={styles.feedbackPanel}>
              <View style={styles.feedbackHeader}>
                <Text style={styles.feedbackTitle}>Live Feedback — {feedbackExercise}</Text>
                <TouchableOpacity style={styles.closeFeedback} onPress={() => { setFeedbackExercise(null); setFeedbackNotes([]); }}>
                  <Feather name="x" size={16} color="#666" />
                  <Text style={styles.closeFeedbackText}>Close</Text>
                </TouchableOpacity>
              </View>
              {feedbackNotes?.length ? feedbackNotes.map((n) => {
                const pillStyle =
                  n.color === 'good' ? styles.pillGood :
                  n.color === 'info' ? styles.pillInfo :
                  n.color === 'warn' ? styles.pillWarn : styles.pillOk;
                return (
                  <View key={n.key} style={styles.coachRow}>
                    <View style={[styles.coachPill, pillStyle]}><Text style={styles.coachPillText}>{n.title}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.coachLabel}>{n.label}</Text>
                      <Text style={styles.coachAction}>{n.action}</Text>
                    </View>
                  </View>
                );
              }) : <Text style={styles.feedbackEmpty}>No feedback yet.</Text>}
            </View>
          )}

          {/* add exercise inline */}
          <View style={{ marginTop: 8, marginBottom: 8 }}>
            {!adding ? (
              <TouchableOpacity style={[styles.addBtnModern, isActiveAny && styles.addBtnDisabled]} onPress={() => setAdding(true)} disabled={isActiveAny} activeOpacity={0.9}>
                <Feather name="plus" size={16} color="#000" /><Text style={styles.addBtnModernText}>Add Exercise</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.addComposerCard}>
                <View style={styles.addComposerHeader}>
                  <Text style={styles.addComposerTitle}>Add exercise</Text>
                  <TouchableOpacity onPress={() => { setAdding(false); setNewExerciseName(''); }}>
                    <Feather name="x" size={18} color="#666" />
                  </TouchableOpacity>
                </View>
                <View style={styles.addComposerInputRow}>
                  <TextInput style={styles.addComposerInput} placeholder="Type an exercise" placeholderTextColor={THEME.placeholder}
                    value={newExerciseName} onChangeText={setNewExerciseName} editable={!isActiveAny} returnKeyType="done"
                    onSubmitEditing={onCreateExercise} />
                  {!!newExerciseName && <TouchableOpacity onPress={() => setNewExerciseName('')}><Feather name="x-circle" size={18} color="#bbb" /></TouchableOpacity>}
                  <TouchableOpacity style={[styles.addComposerPrimary, isActiveAny && styles.disabledBtn]} onPress={onCreateExercise} disabled={isActiveAny}>
                    <Text style={styles.addComposerPrimaryText}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* bottom actions */}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.cancelButton, isActiveAny && styles.disabledBtn]} disabled={isActiveAny} onPress={onCancelWorkout}>
              <Text style={styles.cancelText}>Cancel Workout</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.finishButton, isActiveAny && styles.disabledBtn]} disabled={isActiveAny} onPress={onFinishWorkout}>
              <Text style={styles.finishText}>Finish Workout</Text>
            </TouchableOpacity>
          </View>

          {/* ToF mini graph */}
          <View style={styles.tofCard}>
            <View style={styles.tofHeader}>
              <Text style={styles.tofTitle}>Raw ToF (avg zones)</Text>
              <Text style={styles.tofSub}>
                {tofMeta?.zones ? `zones: ${tofMeta.zones}` : 'zones: —'}{'  '}
                {tofMeta?.frameId != null ? `frame: ${tofMeta.frameId}` : ''}
              </Text>
            </View>
            {tofSeries.length === 0 ? (
              <Text style={styles.tofEmpty}>Waiting for sensor… Start an exercise to stream.</Text>
            ) : (
              <LineChart
                data={{ labels: Array.from({ length: Math.max(1, tofSeries.length) }, () => ''), datasets: [{ data: tofSeries }] }}
                width={GRAPH_W}
                height={GRAPH_H}
                withDots={false} withInnerLines withOuterLines={false} withVerticalLabels={false} withHorizontalLabels={false}
                chartConfig={{
                  backgroundGradientFrom: '#fff', backgroundGradientTo: '#fff', decimalPlaces: 0,
                  color: (o = 1) => `rgba(0,0,0,${o})`, labelColor: () => '#666', propsForDots: { r: '0' }, propsForBackgroundLines: { strokeDasharray: '' },
                }}
                style={{ borderRadius: 12 }}
                bezier
              />
            )}
          </View>

          <View style={styles.footerSpacer} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/* -------- tiny “Add Workout” card (kept inline to save imports) -------- */
function AddWorkoutCard({ onSave }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const [exs, setExs] = useState([]);
  return !open ? (
    <TouchableOpacity style={styles.addWorkoutBtn} onPress={() => setOpen(true)} activeOpacity={0.9}>
      <Feather name="plus" size={16} color="#000" /><Text style={styles.addWorkoutText}>Add Workout</Text>
    </TouchableOpacity>
  ) : (
    <View style={styles.addWorkoutCard}>
      <View style={styles.addHeaderRow}>
        <View><Text style={styles.addTitle}>New Workout</Text><Text style={styles.addHint}>Name it and add exercises as chips</Text></View>
        <TouchableOpacity onPress={() => { setOpen(false); setName(''); setExs([]); setDraft(''); }}>
          <Feather name="x" size={20} color="#666" />
        </TouchableOpacity>
      </View>
      <TextInput style={styles.nameInput} placeholder="Workout name" placeholderTextColor={THEME.placeholder} value={name} onChangeText={setName} />
      <View style={styles.chipInputRow}>
        <TextInput style={styles.chipTextInput} placeholder="Add an exercise and press +" placeholderTextColor={THEME.placeholder}
          value={draft} onChangeText={setDraft} onSubmitEditing={() => {
            const v = (draft || '').trim(); if (!v) return; if (exs.some(e => e.toLowerCase() === v.toLowerCase())) return setDraft('');
            setExs(p => [...p, v]); setDraft('');
          }} />
        <TouchableOpacity style={styles.plusBtn} onPress={() => {
          const v = (draft || '').trim(); if (!v) return; if (exs.some(e => e.toLowerCase() === v.toLowerCase())) return setDraft('');
          setExs(p => [...p, v]); setDraft('');
        }}>
          <Feather name="plus" size={18} color="#000" />
        </TouchableOpacity>
      </View>
      {exs.length ? (
        <View style={styles.chipsWrap}>
          {exs.map((e) => (
            <View key={e} style={styles.chip}>
              <Text style={styles.chipText}>{e}</Text>
              <TouchableOpacity onPress={() => setExs(p => p.filter(x => x !== e))} style={styles.chipClose}>
                <Feather name="x" size={12} color="#111" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : <Text style={styles.emptyChipsHint}>No exercises yet</Text>}
      <View style={styles.addActionsRow}>
        <TouchableOpacity style={styles.saveWorkoutBtn} onPress={() => onSave(name.trim(), exs)}><Text style={styles.saveWorkoutText}>Save Workout</Text></TouchableOpacity>
      </View>
    </View>
  );
}

/* --------------------------------- styles --------------------------------- */
const CARD_RADIUS = 16;
const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: '#fff' },
  scrollBody: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 72 },
  scrollBodySession: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 160 },
  heading: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 },
  subtext: { fontSize: 14, textAlign: 'center', color: '#666', marginBottom: 14 },

  workoutCard: { alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: '#f9f9f9', borderRadius: CARD_RADIUS, borderWidth: 1, borderColor: '#e0e0e0' },
  workoutCenter: { alignItems: 'center' },
  workoutTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  workoutSubtext: { fontSize: 13, color: '#555', marginTop: 2 },

  customList: { marginTop: 4 }, customItem: { marginTop: 6 }, addWorkoutSpacer: { height: 14 },
  rightRail: { width: 64, height: '100%', justifyContent: 'center' },
  deleteBtn: { flex: 1, backgroundColor: '#E53935', borderTopRightRadius: 12, borderBottomRightRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rightRailCard: { width: 64, height: '100%', justifyContent: 'center' },
  deleteBtnCard: { flex: 1, backgroundColor: '#E53935', borderTopRightRadius: CARD_RADIUS, borderBottomRightRadius: CARD_RADIUS, alignItems: 'center', justifyContent: 'center' },

  addWorkoutBtn: { backgroundColor: '#FFC300', paddingVertical: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 10, flexDirection: 'row' },
  addWorkoutText: { color: '#000', fontWeight: '800', marginLeft: 8 },
  addWorkoutCard: { marginTop: 10, backgroundColor: '#fff', borderRadius: CARD_RADIUS, borderWidth: 1, borderColor: '#eaeaea', padding: 14, elevation: 3 },
  addHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addTitle: { fontSize: 18, fontWeight: '800', color: '#111' }, addHint: { color: '#666', marginTop: 2 },
  nameInput: { marginTop: 8, borderWidth: 1, borderColor: '#e0e0e0', backgroundColor: '#fafafa', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14 },
  chipInputRow: { marginTop: 8, borderWidth: 1, borderColor: '#e0e0e0', backgroundColor: '#fafafa', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  chipTextInput: { flex: 1, fontSize: 14, color: '#111' },
  plusBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFC300', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#fff8d6', borderRadius: 999, borderWidth: 1, borderColor: '#f3d36c' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#111' }, chipClose: { marginLeft: 6 },
  emptyChipsHint: { marginTop: 6, color: '#666', fontSize: 12 },
  addActionsRow: { flexDirection: 'row', marginTop: 10, alignItems: 'center' },
  saveWorkoutBtn: { flex: 1, backgroundColor: '#FFC300', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  saveWorkoutText: { color: '#000', fontWeight: '800' },

  tileRow: { borderRadius: 12, overflow: 'hidden' },
  disabledTile: { opacity: 0.5 },
  feedbackIconRow: { alignItems: 'flex-end', marginTop: 6, marginRight: 2 },
  feedbackIconBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFE69A', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999 },
  feedbackIconText: { marginLeft: 6, color: '#000', fontWeight: '700', fontSize: 12 },

  addBtnModern: { backgroundColor: '#FFC300', paddingVertical: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  addBtnModernText: { color: '#000', fontWeight: '800', marginLeft: 8 },
  addBtnDisabled: { opacity: 0.4 },
  addComposerCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#eaeaea', padding: 12, elevation: 3, marginTop: 6 },
  addComposerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  addComposerTitle: { fontSize: 16, fontWeight: '800', color: '#111' },
  addComposerInputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: '#e0e0e0', backgroundColor: '#fafafa' },
  addComposerInput: { flex: 1, fontSize: 14, color: '#111', marginRight: 8 },
  addComposerPrimary: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#FFC300', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  addComposerPrimaryText: { fontWeight: '800', color: '#000' },

  buttonRow: { flexDirection: 'row', marginTop: 14, justifyContent: 'space-between' },
  cancelButton: { backgroundColor: '#FFE0E0', padding: 14, borderRadius: 8, flex: 1, marginRight: 8 },
  cancelText: { color: '#D00000', fontWeight: 'bold', textAlign: 'center' },
  finishButton: { backgroundColor: '#28A745', padding: 14, borderRadius: 8, flex: 1, marginLeft: 8 },
  finishText: { color: '#FFF', fontWeight: 'bold', textAlign: 'center' },
  disabledBtn: { opacity: 0.4 },

  tofCard: { marginTop: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#eaeaea', paddingVertical: 10, paddingHorizontal: 10, alignItems: 'center', alignSelf: 'center' },
  tofHeader: { width: '100%', marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between' },
  tofTitle: { fontSize: 14, fontWeight: '800', color: '#111' },
  tofSub: { fontSize: 12, color: '#666' },
  tofEmpty: { color: '#777', fontSize: 12, alignSelf: 'flex-start', paddingHorizontal: 4, paddingVertical: 6 },

  pastWrap: { marginTop: 20 }, pastWrapInner: { paddingVertical: 8 }, footerSpacer: { height: 48 },
});