// components/viewPastWorkoutCard.js
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import DateScroll from './DateScroll';
import ExerciseHistoryCard from './ExerciseHistoryCard';
import {
  seedMockDataIfEmpty,
  ensureMockDatesPresent,
  getWorkoutByDate,
} from '../storage/workoutStore';
import { formatDateLocal } from '../utils/date';

const countSets = (ex) => (Array.isArray(ex?.sets) ? ex.sets.length : 0);

// Stable, content-based key so React doesn’t get confused between days/exercises
const makeExerciseKey = (dateISO, ex) => {
  const name = ex?.name ?? 'unnamed';
  const sig =
    Array.isArray(ex?.sets) && ex.sets.length
      ? ex.sets
          .map((s, i) => {
            const id = s?.id ?? i;
            const setNo = s?.set ?? i;
            const reps = s?.reps ?? '';
            const weight = s?.weight ?? '';
            return `${id}-${setNo}-${reps}-${weight}`;
          })
          .join('|')
      : 'no-sets';
  return `${dateISO}::${name}::${sig}`;
};

const ViewPastWorkoutCard = () => {
  // Always start on *today* (local)
  const [selectedDate, setSelectedDate] = useState(() => formatDateLocal(new Date()));
  const [loading, setLoading] = useState(true);
  const [workout, setWorkout] = useState(null);

  const prettySelected = useMemo(() => {
    try {
      // selectedDate is yyyy-mm-dd (local)
      const [y, m, d] = selectedDate.split('-').map((n) => parseInt(n, 10));
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Seed/ensure mock data on mount, then fetch for today
  useEffect(() => {
    let isActive = true;
    (async () => {
      setLoading(true);
      await seedMockDataIfEmpty();
      await ensureMockDatesPresent();
      const w = await getWorkoutByDate(selectedDate);
      if (!isActive) return;
      setWorkout(w);
      setLoading(false);
    })();
    return () => { isActive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch whenever the user changes the date
  useEffect(() => {
    let isActive = true;
    (async () => {
      setLoading(true);
      const w = await getWorkoutByDate(selectedDate);
      if (!isActive) return;
      setWorkout(w);
      setLoading(false);
    })();
    return () => { isActive = false; };
  }, [selectedDate]);

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBubble}>
            <Feather name="calendar" size={16} color="#111" />
          </View>
          <Text style={styles.title}>View Past Workout</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>History</Text>
        </View>
      </View>
      <Text style={styles.subtitle}>{prettySelected}</Text>

      {/* Date scroller in a soft container */}
      <View style={styles.dateShell}>
        <DateScroll
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          // weekStartsOn={1}
        />
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator /></View>
      ) : !workout ? (
        <View style={styles.emptyWrap}>
          <Feather name="clock" size={16} color="#999" style={{ marginRight: 6 }} />
          <Text style={styles.emptyText}>No workouts on this day</Text>
        </View>
      ) : Array.isArray(workout.exercises) && workout.exercises.length > 0 ? (
        workout.exercises
          .filter(Boolean)
          .map((exercise) => {
            const key = makeExerciseKey(selectedDate, exercise);
            const setsCount = countSets(exercise);
            return (
              <ExerciseHistoryCard
                key={key}
                exercise={exercise}
                setsCount={setsCount}
              />
            );
          })
      ) : (
        <View style={styles.emptyWrap}>
          <Feather name="clock" size={16} color="#999" style={{ marginRight: 6 }} />
          <Text style={styles.emptyText}>No workouts on this day</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,

    // drop the heavy border, use a feather-light stroke + soft shadow (iOS feel)
    borderWidth: 1,
    borderColor: '#EFEFF1',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 2,
  },

  /* Header */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  iconBubble: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#FFF4CC',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1, borderColor: '#FFE08A',
  },
  title: {
    fontWeight: '800',
    fontSize: 16,
    color: '#111',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F6F7F9',
    borderWidth: 1,
    borderColor: '#ECEDEF',
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#333' },
  subtitle: {
    marginTop: 6,
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
  },

  /* Date scroller shell */
  dateShell: {
    marginTop: 10,
    marginBottom: 6,
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#F7F8FA',
    borderWidth: 1,
    borderColor: '#EEEFF2',
  },

  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },

  emptyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: '#FAFAFB',
    borderWidth: 1,
    borderColor: '#F0F1F3',
  },
  emptyText: {
    color: '#777',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default ViewPastWorkoutCard;
