// components/ExerciseHistoryCard.js
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';

const makeSetKey = (exerciseName, s, i) => {
  const id = s?.id ?? i;
  const setNo = s?.set ?? i;
  const reps = s?.reps ?? '';
  const weight = s?.weight ?? '';
  const vReps = s?.validatedReps ?? '';
  return `set-${exerciseName || 'exercise'}-${id}-${setNo}-${reps}-${weight}-${vReps}`;
};

const THEME = {
  primary: '#FFC300', // gold
  secondary: '#000814', // navy/black
  white: '#FFFFFF',
  faint: 'rgba(0,8,20,0.05)',
  border: 'rgba(0,8,20,0.1)',
};

const SET_BADGE_MIN_WIDTH = 56; // keep header "SET" aligned with this

const StatPill = ({ label, value }) => (
  <View style={styles.pill}>
    <Text style={styles.pillValue}>{value}</Text>
    <Text style={styles.pillLabel}>{label}</Text>
  </View>
);

const ExerciseHistoryCard = ({ exercise, setsCount }) => {
  if (!exercise) return null;

  const count =
    typeof setsCount === 'number'
      ? setsCount
      : Array.isArray(exercise.sets)
      ? exercise.sets.length
      : 0;

  const [expanded, setExpanded] = useState(false);
  const animation = useRef(new Animated.Value(0)).current;

  const toggleExpand = () => {
    const toValue = expanded ? 0 : 1;
    Animated.timing(animation, {
      toValue,
      duration: 250,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
    setExpanded(!expanded);
  };

  const rotate = animation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View style={styles.card}>
      {/* Header */}
      <TouchableOpacity onPress={toggleExpand} activeOpacity={0.8}>
        <View style={styles.headerRow}>
          <View style={styles.iconTile}>
            <Feather name="activity" size={18} color={THEME.secondary} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {exercise.name}
            </Text>
            <Text style={styles.subtitle}>
              {count > 0 ? `${count} ${count === 1 ? 'set' : 'sets'}` : 'No sets yet'}
            </Text>
          </View>

          <Animated.View style={{ transform: [{ rotate }] }}>
            <Feather name="chevron-down" size={20} color={THEME.secondary} />
          </Animated.View>
        </View>
      </TouchableOpacity>

      {/* Expandable Content */}
      <Animated.View
        style={[
          styles.expandableArea,
          { height: expanded ? null : 0, opacity: expanded ? 1 : 0 },
        ]}
      >
        {/* Column labels — aligned to the same grid as rows */}
        <View style={styles.columns}>
          <View style={styles.colSet}>
            <Text style={styles.colLabelSet}>SET</Text>
          </View>

          <View style={styles.colPills}>
            <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>LBS</Text>
            <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>REPS</Text>
          </View>
        </View>

        {/* Sets */}
        <View style={styles.rowsWrap}>
          {Array.isArray(exercise.sets) && exercise.sets.length > 0 ? (
            exercise.sets.map((s, i) => {
              const setNumber = s?.set ?? s?.id ?? (i + 1);
              const weight = (s?.weight ?? s?.lbs ?? '').toString().trim() || '-';
              const reps = (s?.reps ?? '').toString().trim() || '-';
              const vReps =
                s?.validatedReps != null && Number.isFinite(Number(s.validatedReps))
                  ? String(s.validatedReps)
                  : '';

              return (
                <View
                  key={makeSetKey(exercise.name, s, i)}
                  style={[styles.row, i % 2 === 1 && styles.rowAlt]}
                >
                  <View style={styles.setBadge}>
                    <Text style={styles.setBadgeText}>#{setNumber}</Text>
                  </View>
                  <View style={styles.pillsRow}>
                    <StatPill label="LBS" value={weight} />
                    {/* REPS pill shows validatedReps inline as a tiny subline */}
                    <StatPill label="REPS" value={reps} />
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyRow}>
              <Feather name="inbox" size={16} color={THEME.secondary} />
              <Text style={styles.emptyText}>No sets recorded</Text>
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: THEME.primary,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    shadowColor: THEME.secondary,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: Platform.OS === 'android' ? 3 : 0,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.white,
    marginRight: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    color: THEME.secondary,
  },
  subtitle: {
    fontSize: 12,
    color: THEME.secondary,
    opacity: 0.8,
    fontWeight: '600',
  },

  expandableArea: {
    overflow: 'hidden',
    marginTop: 10,
  },

  /* --- Aligned column headers --- */
  columns: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 10, // matches row horizontal padding for perfect alignment
  },
  colSet: {
    width: SET_BADGE_MIN_WIDTH, // exactly the same width as the set badge
    alignItems: 'center',
    justifyContent: 'center',
  },
  colPills: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,          // matches pillsRow gap
    marginLeft: 10,   // matches pillsRow marginLeft
  },
  colLabelSet: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.secondary,
    opacity: 0.8,
    letterSpacing: 0.4,
  },
  colLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.secondary,
    opacity: 0.8,
    letterSpacing: 0.4,
  },

  rowsWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: THEME.white,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10, // keep in sync with columns paddingHorizontal
    borderBottomWidth: 1,
    borderBottomColor: THEME.faint,
  },
  rowAlt: {
    backgroundColor: THEME.faint,
  },

  setBadge: {
    backgroundColor: THEME.secondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: SET_BADGE_MIN_WIDTH,
    alignItems: 'center',
  },
  setBadgeText: {
    color: THEME.primary,
    fontWeight: '800',
    fontSize: 12,
  },

  pillsRow: {
    flexDirection: 'row',
    flex: 1,
    gap: 10,
    marginLeft: 10,
  },
  pill: {
    flex: 1,
    backgroundColor: THEME.primary,
    borderWidth: 1,
    borderColor: THEME.secondary,
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  pillValue: {
    fontSize: 18,
    fontWeight: '900',
    color: THEME.secondary,
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.secondary,
    opacity: 0.85,
  },
  pillSubValue: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '800',
    color: THEME.secondary,
    opacity: 0.8,
  },

  emptyRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    flexDirection: 'row',
    gap: 8,
  },
  emptyText: {
    color: THEME.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
});

export default ExerciseHistoryCard;
