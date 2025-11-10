// screens/home.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  FlatList,
  Modal,
  Pressable,
  PermissionsAndroid,
  Platform,
  Alert,
  DeviceEventEmitter,
  ActivityIndicator,
  Animated,
  Easing,
  StatusBar,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// Storage
import {
  seedMockDataIfEmpty,
  ensureMockDatesPresent,
  getAvailableDates,
} from '../storage/workoutStore';

// BLE context
import { useBLE } from '../contexts/BLEContext';

// If ScanMode enum isn't available, LowLatency is typically 2
const ScanMode = { LowLatency: 2 };

/** ---------------- BLE constants ---------------- **/
const TARGET_SERVICE = 'd1ad140f-bb29-4499-bc2b-3bc765cda45d'; // RepCounter service

// TODO: Replace these two with your actual characteristic UUIDs:
const METRICS_CHAR = 'd1ad140f-bb29-4499-bc2b-3bc765cda45d'; // <--- NOTIFY (placeholder; use your metrics char)
const CONTROL_CHAR = ''; // <--- optional: write to start/stop ('' keeps writes disabled)

/** ---------------- Helpers for local dates ---------------- **/
const todayLocalMidnight = () => {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
};
const dateFromISOLocal = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const startOfWeekLocal = (date, weekStartsOn = 0) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
};
const startOfMonthLocal = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const isOnOrAfter = (a, b) => a.getTime() >= b.getTime();
const isOnOrBefore = (a, b) => a.getTime() <= b.getTime();

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const safeAtob = (b64) => {
  try {
    return global.atob ? global.atob(b64) : Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return '';
  }
};

// ---- Small UI helpers ----
const Chip = ({ color = '#111', bg = '#F2F3F5', icon, text }) => (
  <View style={[styles.chip, { backgroundColor: bg }]}>
    {icon ? <Feather name={icon} size={14} color={color} style={{ marginRight: 6 }} /> : null}
    <Text style={[styles.chipText, { color }]}>{text}</Text>
  </View>
);

export default function Home() {
  const { manager, connectedDevice, setConnectedDevice } = useBLE();
  const insets = useSafeAreaInsets();

  // BLE scanning state
  const [devices, setDevices] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [pendingDeviceName, setPendingDeviceName] = useState(null);
  const scanStopTimer = useRef(null);

  // STREAM: refs & state
  const metricsSubRef = useRef(null);
  const wantStreamingRef = useRef(false);
  const activeExerciseRef = useRef(null);
  const currentSetRef = useRef([]); // accumulating reps for the current set
  const idleFlushTimerRef = useRef(null);

  // Workout stats (from storage)
  const [workoutsThisWeek, setWorkoutsThisWeek] = useState(0);
  const [workoutsThisMonth, setWorkoutsThisMonth] = useState(0);
  const [recentDateISO, setRecentDateISO] = useState(null);

  const formatDate = (dateString) => {
    const d = dateFromISOLocal(dateString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  /** ---------------- Stats loader ---------------- **/
  const refreshStats = async () => {
    await seedMockDataIfEmpty();
    await ensureMockDatesPresent();
    const dates = await getAvailableDates();

    const today = todayLocalMidnight();
    const pastOrToday = dates.filter((iso) => isOnOrBefore(dateFromISOLocal(iso), today));

    const startOfWeek = startOfWeekLocal(today, 0);
    const startOfMonth = startOfMonthLocal(today);

    const weekCount = pastOrToday.reduce((acc, iso) => {
      const d = dateFromISOLocal(iso);
      return acc + (isOnOrAfter(d, startOfWeek) ? 1 : 0);
    }, 0);

    const monthCount = pastOrToday.reduce((acc, iso) => {
      const d = dateFromISOLocal(iso);
      return acc + (isOnOrAfter(d, startOfMonth) ? 1 : 0);
    }, 0);

    const recent = pastOrToday.length ? pastOrToday[pastOrToday.length - 1] : null;

    setWorkoutsThisWeek(weekCount);
    setWorkoutsThisMonth(monthCount);
    setRecentDateISO(recent);
  };

  // Seed + compute stats on mount, then listen for workout events to refresh
  useEffect(() => {
    (async () => {
      try {
        await refreshStats();
      } catch (e) {
        console.warn('Home init error:', e);
      }
    })();

    const sub1 = DeviceEventEmitter.addListener('workout:saved_or_updated', refreshStats);
    const sub2 = DeviceEventEmitter.addListener('workout:cleared', refreshStats);

    return () => {
      if (scanStopTimer.current) {
        clearTimeout(scanStopTimer.current);
        scanStopTimer.current = null;
      }
      stopScan();
      try { sub1.remove(); } catch {}
      try { sub2.remove(); } catch {}

      // teardown stream listeners and monitors
      teardownStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ---------------- Idle flush for sets ---------------- **/
  const scheduleIdleFlush = () => {
    if (idleFlushTimerRef.current) clearTimeout(idleFlushTimerRef.current);
    idleFlushTimerRef.current = setTimeout(() => {
      flushCurrentSet('idle-timeout');
    }, 3000);
  };

  const flushCurrentSet = (reason = 'manual') => {
    if (!currentSetRef.current.length || !activeExerciseRef.current) return;
    const repsArray = currentSetRef.current.slice();
    currentSetRef.current = [];
    DeviceEventEmitter.emit('workout:set:completed', {
      exercise: activeExerciseRef.current,
      reps: repsArray,
      reason,
    });
  };

  /** ---------------- BLE permission helpers ---------------- **/
  const requestPermissions = async () => {
    if (Platform.OS !== 'android') return true;
    const perms =
      Platform.Version >= 31
        ? [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ]
        : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

    const granted = await PermissionsAndroid.requestMultiple(perms);
    return Object.values(granted).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
  };

  const ensureBluetoothPoweredOn = async () => {
    try {
      if (!manager?.state) return true;
      const state = await manager.state();
      if (state === 'PoweredOn') return true;

      return await new Promise((resolve) => {
        const sub = manager.onStateChange((s) => {
          if (s === 'PoweredOn') {
            try { sub.remove(); } catch {}
            resolve(true);
          }
        }, true);
        Alert.alert('Turn on Bluetooth', 'Please enable Bluetooth to scan for devices.');
        setTimeout(() => {
          try { sub.remove(); } catch {}
          resolve(false);
        }, 10000);
      });
    } catch {
      return false;
    }
  };

  /** ---------------- Scan controls ---------------- **/
  const stopScan = () => {
    try { manager?.stopDeviceScan?.(); } catch {}
    if (scanStopTimer.current) {
      clearTimeout(scanStopTimer.current);
      scanStopTimer.current = null;
    }
    setIsScanning(false);
  };

  const startScan = async () => {
    if (!manager || typeof manager.startDeviceScan !== 'function') {
      Alert.alert(
        'Unavailable',
        'BLE module is not available. Install a dev build (expo-dev-client) or an EAS dev build.'
      );
      return;
    }

    const permissionGranted = await requestPermissions();
    if (!permissionGranted) {
      Alert.alert('Permission Required', 'Please enable Bluetooth/Location permissions.');
      return;
    }

    const btOn = await ensureBluetoothPoweredOn();
    if (!btOn) return;

    setDevices([]);
    setIsScanning(true);
    setShowModal(true);

    manager.startDeviceScan(
      [TARGET_SERVICE],
      { allowDuplicates: false, scanMode: ScanMode.LowLatency },
      (error, device) => {
        if (error) {
          console.log('Scan Error:', error);
          stopScan();
          Alert.alert('Scan error', String(error?.message || error));
          return;
        }
        if (!device) return;

        const serviceList =
          device.serviceUUIDs && Array.isArray(device.serviceUUIDs)
            ? device.serviceUUIDs.map((u) => String(u).toLowerCase())
            : [];
        if (serviceList.length && !serviceList.includes(TARGET_SERVICE)) {
          return;
        }

        setDevices((prev) => {
          if (prev.some((d) => d.id === device.id)) return prev;
          const name = device.name || 'Unknown';
          return [...prev, { ...device, name }];
        });
      }
    );

    scanStopTimer.current = setTimeout(stopScan, 8000);
  };

  /** ---------------- Connect / Disconnect ---------------- **/
  const connectToDevice = async (device) => {
    if (!manager || isConnecting) return;
    setIsConnecting(true);
    setPendingDeviceName(device?.name || 'Device');
    stopScan();
    await delay(150);

    try {
      try { await manager.cancelDeviceConnection(device.id); } catch {}

      const connected = await manager.connectToDevice(device.id, {
        autoConnect: false,
        timeout: 8000,
      });

      await connected.discoverAllServicesAndCharacteristics();

      try {
        connected.onDisconnected((err, dev) => {
          console.log('Disconnected:', dev?.id, err?.message || err);
          teardownStream();
          setConnectedDevice(null);
          DeviceEventEmitter.emit('ble:disconnected');
        });
      } catch {}

      setConnectedDevice(connected);
      setupStream(connected);
      DeviceEventEmitter.emit('ble:connected');
      setShowModal(false);
      Alert.alert('Connected', `Connected to ${connected.name || 'Device'}`);
    } catch (err) {
      console.warn('Connection error:', err?.message || err);
      Alert.alert('Connection Failed', String(err?.message || err));
    } finally {
      setIsConnecting(false);
      setPendingDeviceName(null);
    }
  };

  const disconnectDevice = async () => {
    if (!connectedDevice || !manager) return;
    Alert.alert('Disconnect', 'Are you sure you want to disconnect?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes',
        style: 'destructive',
        onPress: async () => {
          try { await manager.cancelDeviceConnection(connectedDevice.id); } catch {}
          teardownStream();
          setConnectedDevice(null);
          DeviceEventEmitter.emit('ble:disconnected');
          Alert.alert('Device Disconnect', 'The device has been disconnected.');
        },
      },
    ]);
  };

  /** ---------------- Stream wiring ---------------- **/
  const setupStream = (dev) => {
    try {
      if (metricsSubRef.current) { try { metricsSubRef.current.remove(); } catch {} }
      metricsSubRef.current = dev.monitorCharacteristicForService(
        TARGET_SERVICE,
        METRICS_CHAR,
        (error, characteristic) => {
          if (error) {
            console.warn('Metrics notify error:', error?.message || error);
            return;
          }
          const b64 = characteristic?.value;
          if (!b64) return;
          const raw = safeAtob(b64);
          handleMetricsPacket(raw);
        }
      );
    } catch (e) {
      console.warn('monitorCharacteristicForService failed:', e?.message || e);
    }

    DeviceEventEmitter.addListener('workout:start_stream', onStartStream);
    DeviceEventEmitter.addListener('workout:stop_stream', onStopStream);
  };

  const teardownStream = () => {
    try { DeviceEventEmitter.removeListener('workout:start_stream', onStartStream); } catch {}
    try { DeviceEventEmitter.removeListener('workout:stop_stream', onStopStream); } catch {}
    if (metricsSubRef.current) {
      try { metricsSubRef.current.remove(); } catch {}
      metricsSubRef.current = null;
    }
    wantStreamingRef.current = false;
    activeExerciseRef.current = null;
    if (idleFlushTimerRef.current) {
      clearTimeout(idleFlushTimerRef.current);
      idleFlushTimerRef.current = null;
    }
    currentSetRef.current = [];
  };

  const textToB64 = (s) => (global.btoa ? global.btoa(s) : Buffer.from(s, 'utf8').toString('base64'));
  const writeControl = async (payload) => {
    if (!CONTROL_CHAR || !connectedDevice) return;
    try {
      await connectedDevice.writeCharacteristicWithResponseForService(
        TARGET_SERVICE,
        CONTROL_CHAR,
        textToB64(payload)
      );
    } catch (e) {
      console.warn('CONTROL write failed:', e?.message || e);
    }
  };

  const onStartStream = async ({ exercise }) => {
    activeExerciseRef.current = exercise || 'Unknown';
    wantStreamingRef.current = true;
    currentSetRef.current = [];
    await writeControl(`START:${activeExerciseRef.current}`);
    scheduleIdleFlush();
  };

  const onStopStream = async () => {
    wantStreamingRef.current = false;
    await writeControl('STOP');
    flushCurrentSet('stop-stream');
    activeExerciseRef.current = null;
    if (idleFlushTimerRef.current) {
      clearTimeout(idleFlushTimerRef.current);
      idleFlushTimerRef.current = null;
    }
  };

  /** ---------------- Notification parser ---------------- **/
  const handleMetricsPacket = (raw) => {
    if (!wantStreamingRef.current) return;

    let obj = null;
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try { obj = JSON.parse(trimmed); } catch {}
    }

    if (obj && obj.endSet) {
      flushCurrentSet('fw-end');
      return;
    }

    let rep = null;
    if (obj && (obj.Velocity !== undefined || obj.ROM !== undefined)) {
      rep = {
        Velocity: Number(obj.Velocity ?? 0),
        ROM: Number(obj.ROM ?? 0),
        Concentric: Number(obj.Concentric ?? 0),
        Eccentric: Number(obj.Eccentric ?? 0),
      };
    } else {
      const parts = trimmed.split(',').map((s) => s.trim());
      if (parts.length >= 4 && parts.every((p) => !isNaN(parseFloat(p)))) {
        rep = {
          Velocity: Number(parts[0]),
          ROM: Number(parts[1]),
          Concentric: Number(parts[2]),
          Eccentric: Number(parts[3]),
        };
      }
    }

    if (rep) {
      currentSetRef.current.push(rep);
      scheduleIdleFlush();
    }
  };

  /** ---------------- UI bits ---------------- **/
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.98, duration: 80, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  };

  const renderDevice = ({ item }) => (
    <Pressable
      style={[styles.deviceItem, isConnecting && { opacity: 0.5 }]}
      onPress={() => {
        if (isConnecting) return;
        setPendingDeviceName(item?.name || 'Device');
        connectToDevice(item);
      }}
      disabled={isConnecting}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={styles.deviceAvatar}>
          <Feather name="cpu" size={16} color={THEME.navy} />
        </View>
        <Text style={styles.deviceName}>{item.name || 'Unknown'}</Text>
      </View>
      <Feather name="chevron-right" size={18} color="#B0B4BA" />
    </Pressable>
  );

  const ConnectedChip = useMemo(() => {
    if (connectedDevice) {
      return (
        <Chip
          bg={THEME.mint}
          color={THEME.navy}
          icon="check-circle"
          text={`Connected · ${connectedDevice.name}`}
        />
      );
    }
    return <Chip bg="#000814" color="#FFC300" icon="bluetooth" text="Not connected" />;
  }, [connectedDevice]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={THEME.bg} />

      <View style={[styles.screen, { paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8) }]}>
        {/* Header / Greeting */}
        <View style={styles.header}>
          <Image source={require('../assets/profile-image.jpg')} style={styles.avatar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.hiText}>
              Hi <Text style={styles.hiBold}>Gokul!</Text>
            </Text>
            <Text style={styles.subText}>Ready to workout?</Text>
          </View>
          {ConnectedChip}
        </View>

        {/* Connect CTA */}
        <Animated.View style={[styles.connectWrap, { transform: [{ scale }] }]}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              pulse();
              connectedDevice ? disconnectDevice() : startScan();
            }}
            disabled={isConnecting}
            style={[
              styles.connectButton,
              connectedDevice && { backgroundColor: THEME.navy },
            ]}
          >
            <Feather
              name={connectedDevice ? 'x' : 'bluetooth'}
              size={20}
              color={connectedDevice ? '#FFF' : '#111'}
              style={{ marginRight: 10 }}
            />
            <Text style={[styles.connectText, connectedDevice && { color: '#FFF' }]}>
              {connectedDevice ? 'Disconnect' : 'Connect'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.connectHint}>
            {connectedDevice ? 'Tap to end current session' : 'Connect to your device to start a session'}
          </Text>
        </Animated.View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>This Week</Text>
            <Text style={styles.statValue}>{workoutsThisWeek}</Text>
            <View style={styles.statIcon}>
              <Feather name="calendar" size={14} color="#001D3D" />
            </View>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>This Month</Text>
            <Text style={styles.statValue}>{workoutsThisMonth}</Text>
            <View style={styles.statIcon}>
              <Feather name="bar-chart-2" size={14} color="#001D3D" />
            </View>
          </View>
        </View>

        {/* Recent workout */}
        {recentDateISO && (
          <View style={styles.recentCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.recentBadge}>
                <Feather name="activity" size={18} color="#001D3D"/>
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.recentLabel}>Recent Workout</Text>
                <Text style={styles.recentTitle}>Workout Day</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Feather name="clock" size={12} color="#001D3D" />
                  <Text style={styles.recentDate}>{formatDate(recentDateISO)}</Text>
                </View>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color="#001D3D" />
          </View>
        )}
      </View>

      {/* Devices Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        onRequestClose={() => !isConnecting && setShowModal(false)}
      >
        <SafeAreaView style={styles.modalSafe} edges={['top', 'left', 'right']}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Nearby Veiss Devices</Text>
              <Text style={styles.scanStatusText}>
                {isScanning ? 'Scanning…' : devices.length ? 'Tap a device to connect' : 'No devices found'}
              </Text>
            </View>

            <FlatList
              data={devices}
              renderItem={renderDevice}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 24 }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', marginTop: 24 }}>
                  <Feather name="rss" size={28} color="#C9CDD3" />
                  <Text style={{ color: '#8C919A', marginTop: 8 }}>No devices yet</Text>
                </View>
              }
            />

            <View style={[styles.bottomButtons, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              {isScanning ? (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: THEME.navy }, isConnecting && { opacity: 0.6 }]}
                  onPress={stopScan}
                  disabled={isConnecting}
                >
                  <Text style={[styles.actionButtonText, { color: '#FFF' }]}>Stop Scan</Text>
                </TouchableOpacity>
              ) : null}
              {isScanning && <View style={{ width: 12 }} />}
              <TouchableOpacity
                style={[styles.actionButton, isConnecting && { opacity: 0.6 }]}
                onPress={() => setShowModal(false)}
                disabled={isConnecting}
              >
                <Text style={styles.actionButtonText}>Close</Text>
              </TouchableOpacity>
            </View>

            {isConnecting && (
              <View style={styles.connectingOverlay} pointerEvents="none">
                <View style={styles.connectingCard}>
                  <ActivityIndicator size="large" />
                  <Text style={styles.connectingText}>
                    Connecting{pendingDeviceName ? ` to ${pendingDeviceName}` : ''}…
                  </Text>
                  <Text style={styles.connectingSubtext}>Keep your device nearby</Text>
                </View>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

/** ---------------- Styles ---------------- **/
const THEME = {
  bg: '#F6F7F9',
  card: '#FFFFFF',
  ink: '#111111',
  subtle: '#6B7280',
  accent: '#FFC300',
  navy: '#001D3D',
  mint: '#E1EFE6',
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: THEME.bg },
  modalSafe: { flex: 1, backgroundColor: '#FFFFFF' },

  screen: {
    flex: 1,
    backgroundColor: THEME.bg,
    paddingHorizontal: 18,
  },

  /* HEADER */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 999,
    marginRight: 14,
  },
  hiText: { fontSize: 22, color: THEME.navy },
  hiBold: { fontWeight: '800', color: THEME.navy },
  subText: { fontSize: 14, color: THEME.subtle, marginTop: 2 },

  /* Chip */
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: { fontSize: 12, fontWeight: '600' },

  /* Connect CTA */
  connectWrap: { alignItems: 'center', marginTop: 2, marginBottom: 18 },
  connectButton: {
    flexDirection: 'row',
    backgroundColor: THEME.accent,
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 999,
    alignItems: 'center',
    shadowColor: THEME.accent,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  connectText: { color: '#111', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  connectHint: { marginTop: 8, fontSize: 12, color: THEME.subtle },

    /* Stats */
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF', // back to OG light
    padding: 16,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E6E8EB',
  },
  statIcon: {
    position: 'absolute',
    right: 12,
    top: 12,
    borderRadius: 10,
    padding: 6,
  },
  statLabel: { color: '#6B7280', fontSize: 12, marginBottom: 6, opacity: 0.88 },
  statValue: { color: '#111', fontSize: 28, fontWeight: '800' },

  /* Recent */
  recentCard: {
    backgroundColor: '#FFFFFF', // back to OG light
    padding: 16,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E6E8EB',
  },
  recentBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  recentLabel: { fontSize: 12, color: '#6B7280', opacity: 0.84 },
  recentTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginTop: 2 },
  recentDate: { fontSize: 12, color: '#6B7280', marginLeft: 6, opacity: 0.84 },


  /* Modal */
  modalContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: {
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ECEDEF',
  },
  modalHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    marginBottom: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: THEME.navy },
  scanStatusText: { color: THEME.subtle, marginTop: 4, marginBottom: 12, fontSize: 12 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#EEE', marginLeft: 18 },
  deviceItem: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deviceAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: THEME.mint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  deviceName: { fontSize: 15, fontWeight: '600', color: THEME.navy },

  bottomButtons: { flexDirection: 'row', paddingHorizontal: 18, paddingTop: 4 },
  actionButton: {
    backgroundColor: THEME.accent,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    flex: 1,
  },
  actionButtonText: { color: THEME.navy, fontSize: 15, fontWeight: '700' },

  /* Connecting overlay */
  connectingOverlay: {
    position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectingCard: {
    width: '80%',
    maxWidth: 360,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#EEE',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  connectingText: { marginTop: 12, fontSize: 16, fontWeight: '700', color: THEME.navy },
  connectingSubtext: { marginTop: 4, fontSize: 12, color: THEME.subtle },
});
