// components/ToFCard.js
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

const SCREEN_W = Dimensions.get('window').width;
const GRAPH_W = Math.max(240, SCREEN_W - 40);
const GRAPH_H = 120;

export default function ToFCard({ series = [], meta }) {
  const data = useMemo(() => {
    const labels = Array.from({ length: Math.max(1, series.length) }, () => '');
    return { labels, datasets: [{ data: series.length ? series : [0] }], legend: [] };
  }, [series]);

  const config = useMemo(() => ({
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(0,0,0,${opacity})`,
    labelColor: () => '#666666',
    propsForDots: { r: '0' },
    propsForBackgroundLines: { strokeDasharray: '' },
  }), []);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Raw ToF (avg of zones)</Text>
        <Text style={styles.sub}>
          {meta?.zones ? `zones: ${meta.zones}` : 'zones: —'}{'  '}
          {meta?.frameId != null ? `frame: ${meta.frameId}` : ''}
        </Text>
      </View>
      {series.length === 0 ? (
        <Text style={styles.empty}>Waiting for sensor… Start an exercise to stream.</Text>
      ) : (
        <LineChart
          data={data}
          width={GRAPH_W}
          height={GRAPH_H}
          withDots={false}
          withInnerLines
          withOuterLines={false}
          withVerticalLabels={false}
          withHorizontalLabels={false}
          chartConfig={config}
          style={styles.chart}
          bezier
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eaeaea',
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: { width: '100%', marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '800', color: '#111' },
  sub: { fontSize: 12, color: '#666' },
  chart: { borderRadius: 12 },
  empty: { color: '#777', fontSize: 12, alignSelf: 'flex-start', paddingHorizontal: 4, paddingVertical: 6 },
});
