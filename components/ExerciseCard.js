// components/ExerciseCard.js
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, TextInput, DeviceEventEmitter,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { useBLE } from '../contexts/BLEContext';
import useRepCounter from '../hooks/useRepCounter';

// 💾 still used for your table UI only (weight/reps count history display)
import { getWorkoutByDate, saveWorkout } from '../storage/workoutStore';

// ---- BLE metric UUIDs (must match your firmware + useRepCounter emitter) ----
const UUIDS = {
  CONCENTRIC: '0000AAAD-0000-1000-8000-00805F9B34FB',
  ECCENTRIC:  '0000AAAE-0000-1000-8000-00805F9B34FB',
  ROM:        '0000AAAF-0000-1000-8000-00805F9B34FB',
  VELOCITY:   '0000BAAA-0000-1000-8000-00805F9B34FB',
};
const BLE_EVT = 'bleCharacteristicValueChanged';

const ExerciseCard = ({
  exercise,
  isActive = false,
  isAnyActive = false,
  onBecameActive = () => {},
  onFinished = () => {},

  // optional: parent can pass the latest validated count (for the most recently completed set)
  validatedRepsLastSet = null,
}) => {
  const { connectedDevice } = useBLE();

  const [live, setLive] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [rows, setRows] = useState([]); // UI table rows (set#, weight, reps count)
  const rowsRef = useRef(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // ✅ map of setNumber -> validated count
  const [validatedCounts, setValidatedCounts] = useState({}); // { [setNum]: number }
  // ✅ map of setNumber -> full validatedReps array
  const [validatedRepsBySet, setValidatedRepsBySet] = useState({}); // { [setNum]: ValidatedRep[] }

  // --- Existing set/change tracking refs ---
  const lastDeviceSetKeyRef = useRef(null);
  const baselineKeyRef = useRef(null);
  const baselineCapturedRef = useRef(false);
  const startTimeRef = useRef(0);
  const nextSetRef = useRef(1);

  // --- per-rep metric aggregation (in-memory; NOT saved) ---
  // repsForSetRef = [ [ {Velocity, ROM, Concentric, Eccentric}, ... ], [ ... ] ]
  const repsForSetRef = useRef([[]]);
  const currentRepRef  = useRef(null);  // {Velocity?, ROM?, Concentric?, Eccentric?}
  const currentSetIdxRef = useRef(0);   // 0-based
  const lastEmittedSetIdxRef = useRef(-1);

  const {
    startMonitoring,
    stopMonitoring,
    beginExercise,
    writeText,
    values,        // { reps, set } numeric-ish (we will NOT display reps)
    movementLive,
  } = useRepCounter(connectedDevice, { enabled: live });

  const asNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const normalizeSetKey = (v) => {
    if (v == null) return null;
    let s = String(v).replace(/\0/g, '').trim();
    const m = s.match(/^[+-]?\d+/);
    return m ? m[0] : s;
  };

  // Apply latest validated count from parent to the most recently completed set
  useEffect(() => {
    if (validatedRepsLastSet == null) return;
    if (!rows.length) return;
    const lastIdx = rows.length - 1;
    const targetSet = rows[lastIdx]?.loading ? rows[lastIdx - 1]?.set : rows[lastIdx]?.set;
    if (targetSet != null) {
      setValidatedCounts((prev) => ({ ...prev, [targetSet]: validatedRepsLastSet }));
    }
  }, [validatedRepsLastSet, rows]);

  // ---------- REP AGGREGATION HELPERS ----------
  const finalizeCurrentRep = () => {
    const cur = currentRepRef.current;
    if (!cur) return;
    const hasAny =
      cur.Velocity != null || cur.ROM != null || cur.Concentric != null || cur.Eccentric != null;
    if (hasAny) {
      const rep = {
        Velocity: cur.Velocity != null ? Number(cur.Velocity) : undefined,
        ROM: cur.ROM != null ? Number(cur.ROM) : undefined,
        Concentric: cur.Concentric != null ? Number(cur.Concentric) : undefined,
        Eccentric: cur.Eccentric != null ? Number(cur.Eccentric) : undefined,
      };
      (repsForSetRef.current[currentSetIdxRef.current] ||= []).push(rep);
    }
    currentRepRef.current = null;
  };

  const startNewRepWith = (metricKey, value) => {
    currentRepRef.current = { [metricKey]: Number(value) };
  };

  const addMetricToCurrentRep = (metricKey, value) => {
    if (!currentRepRef.current) {
      startNewRepWith(metricKey, value);
      return;
    }
    if (metricKey === 'Velocity' && currentRepRef.current.Velocity != null) {
      finalizeCurrentRep();
      startNewRepWith(metricKey, value);
      return;
    }
    currentRepRef.current[metricKey] = Number(value);
  };

  const handleMetricEvent = (payload) => {
    if (!payload?.characteristicUUID) return;
    const uuid = String(payload.characteristicUUID).toUpperCase();
    const val = Number(payload.value);
    if (!Number.isFinite(val)) return;

    if (uuid === UUIDS.VELOCITY) addMetricToCurrentRep('Velocity', val);
    else if (uuid === UUIDS.ROM) addMetricToCurrentRep('ROM', val);
    else if (uuid === UUIDS.CONCENTRIC) addMetricToCurrentRep('Concentric', val);
    else if (uuid === UUIDS.ECCENTRIC) addMetricToCurrentRep('Eccentric', val);
  };

  useEffect(() => {
    if (!live) return;
    const sub = DeviceEventEmitter.addListener(BLE_EVT, handleMetricEvent);
    return () => { try { sub.remove(); } catch {} };
  }, [live]);

  // ✅ Listen for validated reps events from Workout (per exercise + set)
  //    When a validated count arrives, patch it into rows (set reps text, stop spinner)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('exercise:validated_reps', (msg) => {
      try {
        if (!msg || msg.exercise !== exercise.name) return;
        if (!Number.isFinite(msg.set)) return;

        const setNo = Number(msg.set);
        const count = Number(msg.count ?? 0);
        const repsArr = Array.isArray(msg.reps) ? msg.reps : [];

        setValidatedCounts((prev) => ({ ...prev, [setNo]: count }));
        setValidatedRepsBySet((prev) => ({ ...prev, [setNo]: repsArr }));

        // Apply into visible table
        setRows((prev) =>
          prev.map((r) =>
            r.set === setNo ? { ...r, reps: String(count), loading: false } : r
          )
        );
      } catch {}
    });
    return () => { try { sub.remove(); } catch {} };
  }, [exercise.name]);

  // ---------- values (reps/set) listener WITH SET BOUNDARY EMIT ----------
  useEffect(() => {
    if (!live) return;

    // IMPORTANT: We IGNORE values.reps for display. We only show validated counts later.
    // (Keep this block empty on purpose to avoid raw-rep UI updates.)

    // Handle device set counter changes (detect set boundary)
    if (values.set != null) {
      const key = normalizeSetKey(values.set);

      if (!baselineCapturedRef.current) {
        const elapsed = Date.now() - startTimeRef.current;

        if (baselineKeyRef.current == null) {
          baselineKeyRef.current = key;
          return;
        }

        if (key === baselineKeyRef.current && elapsed >= 200) {
          baselineCapturedRef.current = true;
          lastDeviceSetKeyRef.current = key;
          return;
        } else {
          baselineKeyRef.current = key;
          return;
        }
      }

      if (key !== lastDeviceSetKeyRef.current) {
        // ------ SET BOUNDARY REACHED ------
        lastDeviceSetKeyRef.current = key;

        finalizeCurrentRep();

        const finishedIdx = currentSetIdxRef.current; // 0-based index
        const finishedSet = (repsForSetRef.current[finishedIdx] || []).slice();

        // Weight for the finished set comes from the current row at the same index
        const weightForFinished =
          rowsRef.current?.[finishedIdx]?.weight ?? '';

        if (finishedSet.length && lastEmittedSetIdxRef.current !== finishedIdx) {
          DeviceEventEmitter.emit('workout:set:completed', {
            exercise: exercise.name,
            reps: finishedSet,
            weight: weightForFinished,
          });
          lastEmittedSetIdxRef.current = finishedIdx;
        }

        // prepare next set
        currentSetIdxRef.current += 1;
        (repsForSetRef.current[currentSetIdxRef.current] ||= []);

        nextSetRef.current += 1;
        const newSetNum = nextSetRef.current;

        setRows(prev => {
          const next = [...prev];

          if (next.length > 0) {
            const i = next.length - 1;
            const prevRow = next[i];
            next[i] = {
              ...prevRow,
              // keep reps as-is (will be set by validated event)
              loading: false,
            };
          }

          if (!next.some(r => r.set === newSetNum)) {
            next.push({ set: newSetNum, weight: '', reps: null, loading: true });
          }

          return next;
        });
      }
    }
  }, [values, live, exercise.name]);

  const confirmGateIfOtherActive = () => {
    if (isAnyActive && !isActive) {
      Alert.alert(
        'Finish Current Exercise',
        'Please finish your current exercise before starting a new one.'
      );
      return true;
    }
    return false;
  };

  const handleStart = () => {
    if (confirmGateIfOtherActive()) return;

    if (!connectedDevice) {
      Alert.alert('No Device', 'Connect to your RepCounter device first.');
      return;
    }

    Alert.alert(
      'Start Exercise',
      `Begin tracking ${exercise.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            // Reset all aggregators
            repsForSetRef.current = [[]];
            currentRepRef.current = null;
            currentSetIdxRef.current = 0;
            lastEmittedSetIdxRef.current = -1;

            nextSetRef.current = 1;
            lastDeviceSetKeyRef.current = null;
            baselineKeyRef.current = null;
            baselineCapturedRef.current = false;
            startTimeRef.current = Date.now();

            setRows([{ set: 1, weight: '', reps: null, loading: true }]);
            setCompleted(false);
            setLive(true);

            // clear validated info when starting a new run
            setValidatedCounts({});
            setValidatedRepsBySet({});

            onBecameActive();

            setTimeout(() => { beginExercise(); }, 0);
          },
        },
      ]
    );
  };

  const buildFinalSnapshot = () => {
    const snapshot = rows.map(r => ({ ...r }));
    if (snapshot.length) {
      const i = snapshot.length - 1;
      snapshot[i].loading = false;
    }
    return snapshot;
  };

  // Save the small table shown on the card (for your UI only).
  // Uses VALIDATED reps if available.
  const finalizeAndStore = async () => {
    const snapshot = buildFinalSnapshot();
    setRows(snapshot);

    const cleanRows = snapshot.map(r => {
      const validated = validatedCounts?.[r.set];
      const repsToSave = Number.isFinite(validated) ? String(validated) : (r.reps ?? '-');
      return {
        set: r.set,
        weight: r.weight?.trim?.() || '-',
        reps: repsToSave == null ? '-' : repsToSave,
      };
    });

    const exercisePayload = {
      name: exercise.name,
      sets: cleanRows,
    };

    const dateISO = new Date().toISOString().slice(0, 10);
    const existing = await getWorkoutByDate(dateISO);

    let merged;
    if (existing && Array.isArray(existing.exercises)) {
      const others = existing.exercises.filter(ex => ex.name !== exercise.name);
      merged = { ...existing, date: dateISO, exercises: [...others, exercisePayload] };
    } else {
      merged = { date: dateISO, exercises: [exercisePayload] };
    }

    await saveWorkout(dateISO, merged);
  };

  const handleFinish = () => {
    Alert.alert(
      'Finish Exercise',
      'Save this exercise and stop live tracking?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finish Exercise',
          style: 'destructive',
          onPress: async () => {
            try { stopMonitoring(); } catch {}

            // finalize UI rows so spinner never remains
            setRows(prev => {
              if (!prev.length) return prev;
              const next = [...prev];
              const i = next.length - 1;
              const last = next[i];
              next[i] = {
                ...last,
                loading: false, // reps will be set by validated event if it comes after
              };
              return next;
            });

            // --- EMIT FINAL SET (if not already emitted) ---
            finalizeCurrentRep(); // commit any partial rep
            const idx = currentSetIdxRef.current;
            const finalSet = (repsForSetRef.current[idx] || []).slice();
            const weightForFinished = rowsRef.current?.[idx]?.weight ?? '';

            if (finalSet.length && lastEmittedSetIdxRef.current !== idx) {
              DeviceEventEmitter.emit('workout:set:completed', {
                exercise: exercise.name,
                reps: finalSet,
                weight: weightForFinished,
              });
              lastEmittedSetIdxRef.current = idx;
            }

            // (Optional) keep your history save for the card UI
            try { await finalizeAndStore(); } catch {}

            // IMPORTANT: tell device we've ended the workout
            try { await writeText('end_workout'); } catch {}

            setLive(false);
            setCompleted(true);
            onFinished();
          },
        },
      ]
    );
  };

  useEffect(() => {
    return () => { try { stopMonitoring(); } catch {} };
  }, [stopMonitoring]);

  // Render helpers
  const renderValidatedOnly = (setNumber, loading) => {
    const n = validatedCounts?.[setNumber];
    if (loading) return <ActivityIndicator />;
    return (
      <Text style={styles.repsText}>
        {Number.isFinite(n) ? String(n) : '-'}
      </Text>
    );
  };

  // (Optional) You can read the stored arrays anywhere in this component:
  // const set2Validated = validatedRepsBySet[2] || [];

  if (!live && !completed && rows.length === 0) {
    return (
      <TouchableOpacity
        style={[
          styles.card,
          isAnyActive && !isActive ? styles.dimCard : null,
          isActive ? styles.activeCard : null,
        ]}
        onPress={handleStart}
        activeOpacity={0.9}
      >
        <Text style={styles.title}>{exercise.name}</Text>
        <Text style={styles.tapHint}>Tap to start</Text>
      </TouchableOpacity>
    );
  }

  if (completed) {
    return (
      <View
        style={[
          styles.card,
          isAnyActive && !isActive ? styles.dimCard : null,
          isActive ? styles.activeCard : null,
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>{exercise.name}</Text>
          <View style={styles.completedPill}>
            <Feather name="check" size={12} color="#000" />
            <Text style={styles.completedText}>Saved</Text>
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.cellHeader, { flex: 1 }]}>SET</Text>
          <Text style={[styles.cellHeader, { flex: 2 }]}>WEIGHT</Text>
          <Text style={[styles.cellHeader, { flex: 2 }]}>REPS</Text>
        </View>

        {rows.map((row) => (
          <View key={`set-${row.set}`} style={styles.tableRow}>
            <Text style={[styles.cell, { flex: 1 }]}>{row.set}</Text>
            <Text style={[styles.cell, { flex: 2 }]}>{row.weight?.trim?.() ? row.weight : '-'}</Text>
            <View style={[styles.cell, { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}>
              {/* Validated-only */}
              {renderValidatedOnly(row.set, row.loading)}
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        styles.liveCard,
        isAnyActive && !isActive ? styles.dimCard : null,
        isActive ? styles.activeCard : null,
      ]}
    >
      <View style={styles.liveHeader}>
        <Text style={styles.title}>{exercise.name}</Text>
        <TouchableOpacity onPress={handleFinish} style={styles.finishBtn}>
          <Text style={styles.finishBtnText}>Finish Exercise</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tableHeader}>
        <Text style={[styles.cellHeader, { flex: 1 }]}>SET</Text>
        <Text style={[styles.cellHeader, { flex: 2 }]}>WEIGHT</Text>
        <Text style={[styles.cellHeader, { flex: 2 }]}>REPS</Text>
      </View>

      {rows.map((row, idx) => (
        <View key={`set-${row.set}`} style={styles.tableRow}>
          <Text style={[styles.cell, { flex: 1 }]}>{row.set}</Text>

          <View style={[styles.cell, { flex: 2 }]}>
            <TextInput
              style={styles.weightInput}
              value={row.weight}
              onChangeText={(t) => {
                setRows(prev => {
                  const next = [...prev];
                  next[idx] = { ...next[idx], weight: t };
                  return next;
                });
              }}
              keyboardType="numeric"
              placeholder="e.g., 155"
              returnKeyType="done"
            />
          </View>

          <View style={[styles.cell, { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}>
            {/* Validated-only during live: show spinner until validated arrives */}
            {renderValidatedOnly(row.set, row.loading)}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 0,
    borderColor: '#e0e0e0',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCard: {
    borderColor: '#FFC300',
    borderWidth: 2,
  },
  dimCard: {
    opacity: 0.5,
  },
  liveCard: { paddingTop: 14, paddingBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  tapHint: { fontSize: 12, color: '#888', marginTop: 4 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  completedPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E6FFCF', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999 },
  completedText: { marginLeft: 6, fontSize: 11, fontWeight: '700', color: '#1A7F00' },

  liveHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 10 },
  finishBtn: { backgroundColor: '#FFC300', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999 },
  finishBtnText: { color: '#000', fontSize: 12, fontWeight: '700' },

  tableHeader: { flexDirection: 'row', marginTop: 6, marginBottom: 6, paddingHorizontal: 6, alignSelf: 'stretch' },
  tableRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: '#eee', alignSelf: 'stretch' },
  cellHeader: { fontWeight: '700', textAlign: 'center', fontSize: 12, color: '#333' },
  cell: { textAlign: 'center', fontSize: 14, color: '#111', justifyContent: 'center', alignItems: 'center' },
  repsText: { fontSize: 16, fontWeight: '700' },
  weightInput: {
    width: 72,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 13,
    color: '#111',
    textAlign: 'center',
    backgroundColor: '#fafafa',
  },
});

export default ExerciseCard;
