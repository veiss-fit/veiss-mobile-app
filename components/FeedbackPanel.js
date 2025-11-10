// components/FeedbackPanel.js
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';

export default function FeedbackPanel({ exerciseName, notes, onClose }) {
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>Live Feedback — {exerciseName}</Text>
        <TouchableOpacity style={styles.close} onPress={onClose}>
          <Feather name="x" size={16} color="#666" />
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      {notes && notes.length > 0 ? (
        notes.map((n) => {
          const pillStyle =
            n.color === 'good' ? styles.pillGood :
            n.color === 'info' ? styles.pillInfo :
            n.color === 'warn' ? styles.pillWarn :
            styles.pillOk;

          return (
            <View key={n.key} style={styles.row}>
              <View style={[styles.pill, pillStyle]}>
                <Text style={styles.pillText}>{n.title}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{n.label}</Text>
                <Text style={styles.action}>{n.action}</Text>
              </View>
            </View>
          );
        })
      ) : (
        <Text style={styles.empty}>No feedback yet.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eaeaea',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '700', color: '#111' },
  empty: { color: '#666' },

  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  pill: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, marginRight: 10, alignSelf: 'flex-start' },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  pillGood: { backgroundColor: '#10B981' },
  pillOk: { backgroundColor: '#6B7280' },
  pillInfo: { backgroundColor: '#3B82F6' },
  pillWarn: { backgroundColor: '#DC2626' },
  label: { fontSize: 13, fontWeight: '700', color: '#111', marginBottom: 2 },
  action: { fontSize: 13, color: '#111' },

  close: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 6, marginLeft: 'auto' },
  closeText: { marginLeft: 6, color: '#666', fontSize: 12 },
});
