// components/DateScroll.js
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { formatDateLocal } from '../utils/date';

/** Helpers **/
function startOfWeek(date, weekStartsOn = 0) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}
function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}
function addWeeks(date, n) {
  return addDays(date, n * 7);
}
function isAfter(a, b) {
  return a.getTime() > b.getTime();
}

const DateScroll = ({ selectedDate, setSelectedDate, weekStartsOn = 0 }) => {
  // "Today" in local time (midnight)
  const today = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  // Anchor follows the selected date; default is today (parent sets selectedDate to today)
  const [anchorDate, setAnchorDate] = useState(() => today);

  useEffect(() => {
    if (!selectedDate) return;
    const [y, m, d] = selectedDate.split('-').map(Number);
    setAnchorDate(new Date(y, m - 1, d));
  }, [selectedDate]);

  // Start of the anchor week
  const start = useMemo(() => startOfWeek(anchorDate, weekStartsOn), [anchorDate, weekStartsOn]);
  const end = useMemo(() => addDays(start, 6), [start]);

  // Build EXACTLY 7 days in this week (Sun..Sat or per weekStartsOn)
  const days = useMemo(() => {
    const list = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      list.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
    }
    return list;
  }, [start]);

  // Disable "next" if advancing would go into a week entirely after today
  const atCurrentWeek = useMemo(() => {
    const nextWeekStart = addWeeks(start, 1);
    // If the next week's start is after today, we’re on or beyond the last allowed week
    return isAfter(nextWeekStart, today);
  }, [start, today]);

  return (
    <View style={styles.container}>
      {/* Week header with navigation; next is disabled when on current (last) week */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => setAnchorDate(prev => addWeeks(prev, -1))}
          style={styles.navBtn}
          activeOpacity={0.85}
        >
          <Text style={styles.navText}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </Text>

        <TouchableOpacity
          onPress={() => !atCurrentWeek && setAnchorDate(prev => addWeeks(prev, 1))}
          style={[styles.navBtn, atCurrentWeek && styles.navBtnDisabled]}
          activeOpacity={atCurrentWeek ? 1 : 0.85}
        >
          <Text style={[styles.navText, atCurrentWeek && styles.navTextDisabled]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Week strip (full 7 days); future dates are grayed & unselectable */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {days.map((d) => {
          const ds = formatDateLocal(d);
          const isSelected = ds === selectedDate;
          const isFuture = isAfter(d, today);

          const weekday = d.toLocaleDateString(undefined, { weekday: 'short' }); // Sun, Mon...
          const dayNum = d.getDate();
          const monthShort = d.toLocaleDateString(undefined, { month: 'short' });

          return (
            <TouchableOpacity
              key={ds}
              style={[
                styles.dateItem,
                isSelected && !isFuture && styles.selectedDateItem,
                isFuture && styles.disabledDateItem,
              ]}
              onPress={() => {
                if (isFuture) return; // disable selecting future dates
                setSelectedDate(ds);
              }}
              activeOpacity={isFuture ? 1 : 0.85}
            >
              <Text
                style={[
                  styles.weekText,
                  isSelected && !isFuture && styles.selectedText,
                  isFuture && styles.disabledText,
                ]}
              >
                {weekday}
              </Text>
              <Text
                style={[
                  styles.dayText,
                  isSelected && !isFuture && styles.selectedText,
                  isFuture && styles.disabledText,
                ]}
              >
                {dayNum}
              </Text>
              <Text
                style={[
                  styles.monthText,
                  isSelected && !isFuture && styles.selectedText,
                  isFuture && styles.disabledText,
                ]}
              >
                {monthShort}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  navBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f2f2f2',
  },
  navBtnDisabled: {
    opacity: 0.5,
  },
  navText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  navTextDisabled: {
    color: '#666',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '700',
  },
  row: {
    paddingVertical: 4,
  },
  dateItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginRight: 8,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    minWidth: 64,
  },
  selectedDateItem: {
    backgroundColor: '#FFC300',
  },
  disabledDateItem: {
    backgroundColor: '#ececec',
  },
  weekText: {
    fontSize: 11,
    color: '#666',
  },
  dayText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
    lineHeight: 22,
  },
  monthText: {
    fontSize: 12,
    color: '#666',
  },
  selectedText: {
    color: '#000',
    fontWeight: '700',
  },
  disabledText: {
    color: '#aaa',
  },
});

export default DateScroll;
