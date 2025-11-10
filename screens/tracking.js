// screens/Tracking.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Animatable from 'react-native-animatable';
import { LineChart } from 'react-native-chart-kit';
import { useRoute } from '@react-navigation/native';
import { Buffer } from 'buffer';

const THEME = {
  primary: '#FFC300',
  accent: '#1E90FF',
  text: '#111',
  subtext: '#666',
  bg: '#F8F9FA',
  card: '#fff',
  border: '#EEE',
  disabled: '#E5E7EB',
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 48 - 32;

const UUIDS = {
  CONC: '0000AAAD-0000-1000-8000-00805F9B34FB',
  ECC:  '0000AAAE-0000-1000-8000-00805F9B34FB',
  ROM:  '0000AAAF-0000-1000-8000-00805F9B34FB',
  VEL:  '0000BAAA-0000-1000-8000-00805F9B34FB',
};
const toUC = (s) => (s ? String(s).toUpperCase() : s);

const labelsFor = (len) => (len ? Array.from({ length: len }, (_, i) => String(i + 1)) : ['']);
const toFixedMaybe = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '--');
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const numOrNull = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null; };

function getRepRowsFromSet(setEntry) {
  if (Array.isArray(setEntry)) return setEntry;
  if (!isObj(setEntry)) return [];
  if (Array.isArray(setEntry.validatedRepMetrics) && setEntry.validatedRepMetrics.length) {
    return setEntry.validatedRepMetrics;
  }
  if (Array.isArray(setEntry.reps)) return setEntry.reps;
  return [];
}

function normalizeSession(input, overlayValidatedByExercise = null) {
  if (!isObj(input)) return null;
  const dateISO = input.dateISO || input.date || new Date().toISOString();
  let exercises = input.exercises;

  if (Array.isArray(exercises)) {
    const map = {};
    for (const ex of exercises) {
      const name = ex?.name || ex?.exercise || ex?.title;
      const sets = ex?.sets || ex?.data;
      if (!name || !Array.isArray(sets)) continue;
      map[name] = sets;
    }
    exercises = map;
  }
  if (!isObj(exercises)) return null;

  const norm = {};
  for (const [name, sets] of Object.entries(exercises)) {
    if (!Array.isArray(sets)) continue;
    const overlayForName = overlayValidatedByExercise?.[name] || {};
    norm[name] = sets.map((setEntry, idx) => {
      const overlayRows = overlayForName?.[idx + 1];
      if (Array.isArray(overlayRows) && overlayRows.length) return overlayRows;
      return getRepRowsFromSet(setEntry);
    });
  }
  if (!Object.keys(norm).length) return null;
  return { dateISO, exercises: norm };
}

function buildPaddedData(series, color, labelsLen, padRatio = 0.06) {
  const finiteVals = series.filter((v) => Number.isFinite(v));
  const max = finiteVals.length ? Math.max(...finiteVals) : 0;
  const paddedMax = max > 0 ? max * (1 + padRatio) : 1;
  const ghost = new Array(Math.max(labelsLen, 2)).fill(null);
  ghost[0] = 0;
  ghost[ghost.length - 1] = paddedMax;
  return {
    labels: labelsFor(labelsLen),
    datasets: [
      { data: series, color: () => color, strokeWidth: 2, withDots: true },
      { data: ghost, color: () => 'transparent', strokeWidth: 0, withDots: false },
    ],
  };
}

function buildDualPaddedData(a, b, colorA, colorB, labelsLen, padRatio = 0.06) {
  const finiteA = a.filter((v) => Number.isFinite(v));
  const finiteB = b.filter((v) => Number.isFinite(v));
  const max = Math.max(
    finiteA.length ? Math.max(...finiteA) : 0,
    finiteB.length ? Math.max(...finiteB) : 0
  );
  const paddedMax = max > 0 ? max * (1 + padRatio) : 1;
  const ghost = new Array(Math.max(labelsLen, 2)).fill(null);
  ghost[0] = 0;
  ghost[ghost.length - 1] = paddedMax;
  return {
    labels: labelsFor(labelsLen),
    datasets: [
      { data: a, color: () => colorA, strokeWidth: 2, withDots: true },
      { data: b, color: () => colorB, strokeWidth: 2, withDots: true },
      { data: ghost, color: () => 'transparent', strokeWidth: 0, withDots: false },
    ],
    legend: ['Concentric', 'Eccentric'],
  };
}

function rowsFromSet(repObjs) {
  return (repObjs || []).map((r, j) => ({
    repNo:
      Number.isFinite(r?.repIndex) ? r.repIndex + 1 :
      Number.isFinite(r?.rep)      ? r.rep       :
      j + 1,
    velocity:   numOrNull(r?.Velocity ?? r?.velocity),
    rom:        numOrNull(r?.ROM ?? r?.rom),
    concentric: numOrNull(r?.Concentric ?? r?.concentric),
    eccentric:  numOrNull(r?.Eccentric ?? r?.eccentric),
    raw: r || {},
  }));
}

function parseBLEStringValue(maybeBase64OrText) {
  if (typeof maybeBase64OrText !== 'string' || !maybeBase64OrText.length) return null;
  let text = '';
  try {
    text = Buffer.from(maybeBase64OrText, 'base64').toString('utf8');
    if (!text || /[\u0000-\u001F]/.test(text)) text = maybeBase64OrText;
  } catch {
    text = maybeBase64OrText;
  }
  text = String(text).trim();

  const numDirect = Number(text);
  if (Number.isFinite(numDirect)) return numDirect;

  const firstNum = Number((text.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [])[0]);
  return Number.isFinite(firstNum) ? firstNum : null;
}

export default function Tracking() {
  const insets = useSafeAreaInsets();
  const route = useRoute();

  const overlayValidatedByExercise = route?.params?.validatedRepMetricsByExercise || null;
  const lastSelection = route?.params?.lastSelection || null;

  const normalized = useMemo(
    () => normalizeSession(route?.params?.session, overlayValidatedByExercise),
    [route?.params?.session, overlayValidatedByExercise]
  );

  const [exercise, setExercise] = useState(null);
  const [setIndex, setSetIndex] = useState(null);
  const [pointTip, setPointTip] = useState(null);

  // seed default exercise/set (latest) when session arrives
  useEffect(() => {
    if (!normalized) return;
    const names = Object.keys(normalized.exercises || {});
    if (!names.length) return;

    const safeExercise =
      lastSelection?.exercise && names.includes(lastSelection.exercise)
        ? lastSelection.exercise
        : (exercise ?? names[0]);

    const sets = normalized.exercises[safeExercise] || [];
    const lastIdx =
      Number.isInteger(lastSelection?.setIndex) && lastSelection.setIndex >= 0 && lastSelection.setIndex < sets.length
        ? lastSelection.setIndex
        : Math.max(0, sets.length - 1);

    if (exercise == null) setExercise(safeExercise);
    if (setIndex == null && sets.length) setSetIndex(lastIdx);
  }, [normalized, exercise, setIndex, lastSelection]);

  const [live, setLive] = useState({
    velocity: [],
    rom: [],
    concentric: [],
    eccentric: [],
  });

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('bleCharacteristicValueChanged', (payload) => {
      try {
        const uuid = toUC(payload?.characteristicUUID);
        const val = parseBLEStringValue(payload?.value);
        if (!Number.isFinite(val)) return;

        setLive((prev) => {
          const next = { ...prev };
          if (uuid === UUIDS.VEL)        next.velocity   = [...prev.velocity, val];
          else if (uuid === UUIDS.ROM)   next.rom        = [...prev.rom, val];
          else if (uuid === UUIDS.CONC)  next.concentric = [...prev.concentric, val];
          else if (uuid === UUIDS.ECC)   next.eccentric  = [...prev.eccentric, val];
          return next;
        });
      } catch {
        /* ignore bad packets */
      }
    });

    return () => { try { sub.remove(); } catch {} };
  }, []);

  // stored/validated fallback rows for the selected set
  const exerciseNames = useMemo(
    () => (normalized ? Object.keys(normalized.exercises || {}) : []),
    [normalized]
  );

  const setOptions = useMemo(() => {
    if (!exercise || !normalized) return [];
    const sets = normalized.exercises?.[exercise];
    if (!Array.isArray(sets)) return [];
    return sets.map((_, i) => ({ label: `Set ${i + 1}`, value: i }));
  }, [exercise, normalized]);

  const currentSetReps = useMemo(() => {
    if (!exercise) return [];
    if (setIndex == null) return [];
    const sets = normalized?.exercises?.[exercise];
    if (!Array.isArray(sets)) return [];
    const reps = sets[setIndex];
    return Array.isArray(reps) ? reps : [];
  }, [exercise, setIndex, normalized]);

  const rows = useMemo(() => rowsFromSet(currentSetReps), [currentSetReps]);

  const fallbackVelocity   = rows.map((x) => x.velocity);
  const fallbackROM        = rows.map((x) => x.rom);
  const fallbackConcentric = rows.map((x) => x.concentric);
  const fallbackEccentric  = rows.map((x) => x.eccentric);

  // 🔑 per-metric live gating (instead of one global gate)
  const hasLiveVel  = live.velocity.length > 0;
  const hasLiveROM  = live.rom.length > 0;
  const hasLiveConc = live.concentric.length > 0;
  const hasLiveEcc  = live.eccentric.length > 0;

  const velocity   = hasLiveVel  ? live.velocity   : fallbackVelocity;
  const rom        = hasLiveROM  ? live.rom        : fallbackROM;
  const concentric = hasLiveConc ? live.concentric : fallbackConcentric;
  const eccentric  = hasLiveEcc  ? live.eccentric  : fallbackEccentric;

  // “any live” still controls the pickers’ visibility (unchanged UX)
  const useAnyLive = hasLiveVel || hasLiveROM || hasLiveConc || hasLiveEcc;

  const nothing = !useAnyLive && (!normalized || exerciseNames.length === 0);

  const handlePoint = (metric) => ({ index, value }) => {
    const repNo = (index ?? 0) + 1;
    setPointTip({ metric, repIdx: repNo, value });
    setTimeout(() => setPointTip(null), 1800);
  };

  const chartCfg = {
    backgroundGradientFrom: '#fff',
    backgroundGradientTo: '#fff',
    color: () => '#000',
    labelColor: () => THEME.subtext,
    propsForDots: { r: '4', strokeWidth: '2', stroke: '#fff' },
    decimalPlaces: 2,
  };

  const bottomPad = Math.max(insets.bottom, 16) + 32;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomPad }]}>
        <Animatable.View animation="fadeInUp" delay={60} style={styles.header}>
          <Text style={styles.title}>Tracking</Text>
          <Text style={styles.subtitle}>
            {useAnyLive
              ? 'Live (BLE notifications)'
              : normalized
                ? new Date(normalized.dateISO).toLocaleString()
                : 'No session loaded'}
          </Text>
        </Animatable.View>

        {nothing && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              Start streaming metrics or complete a workout to see charts.
            </Text>
          </View>
        )}

        {!useAnyLive && normalized && (
          <>
            <Animatable.View animation="fadeInUp" delay={100}>
              <PillPicker
                label="Exercise"
                value={exercise}
                onChange={(v) => { setExercise(v); setSetIndex(null); }}
                options={exerciseNames.map((name) => ({ label: name, value: name }))}
              />
            </Animatable.View>

            <Animatable.View animation="fadeInUp" delay={140}>
              <PillPicker
                label="Set"
                value={setIndex}
                onChange={setSetIndex}
                options={setOptions}
                disabled={!exercise}
              />
            </Animatable.View>
          </>
        )}

        {pointTip && (
          <View style={styles.tipPill}>
            <Text style={styles.tipText}>
              {pointTip.metric} • Rep {pointTip.repIdx}: {toFixedMaybe(pointTip.value)}
            </Text>
          </View>
        )}

        {!useAnyLive && exercise && setIndex == null && (
          <Text style={styles.hint}>Choose a Set to view charts.</Text>
        )}

        {(useAnyLive || (exercise && setIndex != null)) && (
          <>
            <Animatable.View animation="fadeInUp" delay={180} style={styles.card}>
              <Text style={styles.cardTitle}>
                Velocity per Rep <Text style={styles.unit}>units/s</Text>
              </Text>
              <View style={styles.chartWrap}>
                <LineChart
                  data={buildPaddedData(velocity, THEME.primary, velocity.length)}
                  width={CHART_WIDTH}
                  height={240}
                  chartConfig={chartCfg}
                  bezier
                  fromZero
                  style={styles.chart}
                  onDataPointClick={handlePoint('Velocity')}
                />
              </View>
            </Animatable.View>

            <Animatable.View animation="fadeInUp" delay={200} style={styles.card}>
              <Text style={styles.cardTitle}>
                ROM per Rep <Text style={styles.unit}>device units</Text>
              </Text>
              <View style={styles.chartWrap}>
                <LineChart
                  data={buildPaddedData(rom, THEME.primary, rom.length)}
                  width={CHART_WIDTH}
                  height={240}
                  chartConfig={chartCfg}
                  bezier
                  fromZero
                  style={styles.chart}
                  onDataPointClick={handlePoint('ROM')}
                />
              </View>
            </Animatable.View>

            <Animatable.View animation="fadeInUp" delay={220} style={[styles.card, styles.lastCard]}>
              <Text style={styles.cardTitle}>
                Concentric & Eccentric Duration <Text style={styles.unit}>seconds</Text>
              </Text>
              <View style={styles.chartWrap}>
                <LineChart
                  data={buildDualPaddedData(
                    concentric,
                    eccentric,
                    THEME.primary,
                    THEME.accent,
                    Math.max(concentric.length, eccentric.length)
                  )}
                  width={CHART_WIDTH}
                  height={260}
                  chartConfig={chartCfg}
                  bezier
                  fromZero
                  style={styles.chart}
                  onDataPointClick={({ index, value }) => {
                    const metric =
                      Number.isFinite(concentric[index]) && value === concentric[index]
                        ? 'Concentric'
                        : 'Eccentric';
                    handlePoint(metric)({ index, value });
                  }}
                />
              </View>
            </Animatable.View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PillPicker({ label, value, options, onChange, disabled }) {
  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <TouchableOpacity
              key={`${label}-${opt.value}`}
              disabled={disabled}
              onPress={() => onChange?.(opt.value)}
              style={[
                styles.pill,
                disabled && { backgroundColor: THEME.disabled, borderColor: THEME.disabled },
                active && { backgroundColor: THEME.primary, borderColor: THEME.primary },
              ]}
            >
              <Text style={[styles.pillText, active && { color: '#000' }]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: THEME.bg },
  container: { paddingVertical: 24, paddingHorizontal: 24 },
  header: { marginBottom: 12, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: THEME.text },
  subtitle: { fontSize: 13, color: THEME.subtext, marginTop: 4 },

  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 20,
    alignItems: 'center',
    marginTop: 8,
  },
  emptyText: { color: THEME.subtext, fontSize: 14 },

  pickerWrap: { marginBottom: 8 },
  pickerLabel: { fontSize: 13, color: THEME.subtext, marginBottom: 6 },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: THEME.border,
    marginRight: 8,
  },
  pillText: { fontSize: 13, color: THEME.text },

  tipPill: {
    alignSelf: 'center',
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginVertical: 8,
  },
  tipText: { color: '#fff', fontWeight: '600' },

  hint: { color: THEME.subtext, marginVertical: 8, textAlign: 'center' },

  card: {
    backgroundColor: THEME.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  lastCard: { marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, color: THEME.text },
  unit: { color: THEME.subtext, fontSize: 12 },

  chartWrap: { borderRadius: 12, overflow: 'hidden' },
  chart: {},
});
