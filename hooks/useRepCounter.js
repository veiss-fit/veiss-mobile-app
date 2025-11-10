// hooks/useRepCounter.js
import { useCallback, useEffect, useRef, useState } from 'react';
import { Buffer } from 'buffer';
import { DeviceEventEmitter } from 'react-native';

/** Canonical UUIDs (uppercased) */
const SERVICE_CAN = 'D1AD140F-BB29-4499-BC2B-3BC765CDA45D';
const REPS_CAN    = '72657073-40D6-91C1-46F3-BE4B-39A18C097815';
const SETS_CAN    = '73657473-DF83-4A36-BA2B-A01E85B53A03';

/** Your device uses SIG-base UUIDs with 16-bit aliases */
const REPS_FRAG = '0000AAAA'; // reps
const SETS_FRAG = '0000AAAB'; // sets

/** Command characteristic (provided) */
const CMD_CAN  = '0000CAAA-0000-1000-8000-00805F9B34FB';
const CMD_FRAG = '0000CAAA';

/** Raw ToF characteristic (binary) */
const RAW_TOF_CAN  = '0000FEED-0000-1000-8000-00805F9B34FB';
const RAW_TOF_FRAG = '0000FEED';

/** === METRICS (BLEStringCharacteristic) — from your firmware === */
const UUIDS_METRICS = {
  CONCENTRIC: '0000AAAD-0000-1000-8000-00805F9B34FB',
  ECCENTRIC:  '0000AAAE-0000-1000-8000-00805F9B34FB',
  ROM:        '0000AAAF-0000-1000-8000-00805F9B34FB',
  VELOCITY:   '0000BAAA-0000-1000-8000-00805F9B34FB',
};

/** Event name that Tracking.js and workout.js listen for */
const BLE_EVT = 'bleCharacteristicValueChanged';

/** Descriptors */
const CCCD = '00002902-0000-1000-8000-00805F9B34FB';
const CUD  = '00002901-0000-1000-8000-00805F9B34FB';
const ENABLE_NOTIFY_B64  = 'AQA='; // 0x0001
const DISABLE_NOTIFY_B64 = 'AA=='; // 0x0000

const toUC = (s) => (s ? String(s).toUpperCase() : s);
const strip = (s) => (s ? String(s).replace(/-/g, '').toUpperCase() : s);

/** Base64 helpers */
function b64ToUtf8(b64) { try { return Buffer.from(b64, 'base64').toString('utf8'); } catch { return null; } }
function parseText(txt) { if (txt == null) return null; return txt.replace(/\0/g, '').trim(); }

/** Coerce FLOAT or INT from payload (supports "92.3", "0.65", optional units like "0.65 m/s") */
function parseMaybeFloatFromValue(valueB64) {
  const asText = b64ToUtf8(valueB64);
  if (asText) {
    const t = parseText(asText);
    if (t) {
      const m = t.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
      if (m) {
        const n = parseFloat(m[0]);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  // fallback: try small integers via bytes
  const bytes = Uint8Array.from(Buffer.from(valueB64, 'base64'));
  if (!bytes || bytes.length === 0) return null;
  const u8  = bytes[0];
  const u16 = bytes.length >= 2 ? (bytes[0] | (bytes[1] << 8)) : null;
  const u32 = bytes.length >= 4 ? (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0 : null;
  if (Number.isInteger(u8) && u8 <= 255) return u8;
  if (u16 != null && u16 <= 65535) return u16;
  if (u32 != null && u32 <= 1000000) return u32;
  return null;
}

export default function useRepCounter(device) {
  // Public state
  const [values, setValues] = useState({ reps: null, set: null });
  const [isReady, setIsReady] = useState(false);
  const [isRepCounter, setIsRepCounter] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [movementLive, setMovementLive] = useState(false); // true after first valid post-start reps

  // Discovered UUIDs
  const resolved = useRef({
    service: SERVICE_CAN,
    reps: null,
    sets: null,
    cmd: null,
    metrics: { ...UUIDS_METRICS }, // will be validated against discovered chars
    rawTof: null,                  // 0000FEED… (binary)
    rawTofService: null,           // NEW: service that owns FEED
  });
  const subsRef = useRef([]);
  const pollRef = useRef(null);

  // Movement gating
  const awaitingMovement = useRef(false);   // ignore reps until we see a true post-start value
  const prevRepsBeforeStart = useRef(null); // last known reps when starting the new exercise
  const pollingPaused    = useRef(false);   // pause polling until movement goes live

  /** ---------- cleanup ---------- */
  const clearPoll = useCallback(() => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }, []);
  const stopMonitoring = useCallback(() => {
    subsRef.current.forEach((s) => { try { s?.remove?.(); } catch {} });
    subsRef.current = [];
    clearPoll();
  }, [clearPoll]);

  /** ---------- helpers ---------- */
  const findExactInService = (chars, wantedUC) =>
    chars.find(c => toUC(c.uuid) === wantedUC)?.uuid || null;

  const findFragmentInService = (chars, fragHex) => {
    if (!fragHex) return null;
    const f = strip(fragHex);
    const hit = chars.find(c => strip(c.uuid)?.includes(f));
    return hit?.uuid || null;
  };

  const readCud = useCallback(async (srv, char) => {
    try {
      if (!device?.readDescriptorForService) return null;
      const d = await device.readDescriptorForService(srv, char, CUD);
      const txt = d?.value ? b64ToUtf8(d.value) : null;
      const parsed = parseText(txt || '');
      return parsed || null;
    } catch {
      return null;
    }
  }, [device]);

  const getCharsForService = useCallback(async (serviceId) => {
    try {
      const chars = await device.characteristicsForService(serviceId);
      return chars.map(c => ({
        uuid: c.uuid,
        isReadable: !!c.isReadable,
        isWritableWithResponse: !!c.isWritableWithResponse,
        isWritableWithoutResponse: !!c.isWritableWithoutResponse,
        isNotifiable: !!c.isNotifiable,
        isIndicatable: !!c.isIndicatable,
      }));
    } catch {
      return [];
    }
  }, [device]);

  /** ---------- resolve UUIDs (now also validates metrics + FEED) ---------- */
  const resolveUuids = useCallback(async () => {
    try {
      if (device?.discoverAllServicesAndCharacteristics) {
        await device.discoverAllServicesAndCharacteristics();
      }

      const services = (await device.services?.()) || [];
      const ucServices = services.map(s => ({ ...s, uuidUC: toUC(s.uuid) }));

      const service =
        ucServices.find(s => s.uuidUC === SERVICE_CAN) ||
        ucServices.find(s => strip(s.uuidUC).endsWith(strip(SERVICE_CAN)));

      const serviceId = service ? service.uuid : SERVICE_CAN;
      const chars = await getCharsForService(serviceId);

      // Reps
      let repsId =
        findExactInService(chars, REPS_CAN) ||
        findFragmentInService(chars, REPS_FRAG) ||
        null;

      if (!repsId) {
        for (const c of chars) {
          const desc = await readCud(serviceId, c.uuid);
          if (desc && /rep(s)?/i.test(desc)) { repsId = c.uuid; break; }
        }
      }

      // Sets
      let setsId =
        findExactInService(chars, SETS_CAN) ||
        findFragmentInService(chars, SETS_FRAG) ||
        null;

      if (!setsId) {
        for (const c of chars) {
          const desc = await readCud(serviceId, c.uuid);
          if (desc && /^set(s)?$/i.test(desc)) { setsId = c.uuid; break; }
        }
      }

      // Command
      let cmdId =
        (CMD_CAN && findExactInService(chars, CMD_CAN)) ||
        (CMD_FRAG && findFragmentInService(chars, CMD_FRAG)) ||
        null;

      if (!cmdId) {
        for (const c of chars) {
          if (!(c.isWritableWithResponse || c.isWritableWithoutResponse)) continue;
          const desc = await readCud(serviceId, c.uuid);
          if (desc && /(cmd|command|reset)/i.test(desc)) { cmdId = c.uuid; break; }
        }
      }
      if (!cmdId) {
        const anyWritable = chars.find(c => c.isWritableWithResponse || c.isWritableWithoutResponse);
        if (anyWritable) cmdId = anyWritable.uuid;
      }

      // Raw ToF (FEED) — first try within the canonical service
      let rawTofId =
        (RAW_TOF_CAN && findExactInService(chars, RAW_TOF_CAN)) ||
        (RAW_TOF_FRAG && findFragmentInService(chars, RAW_TOF_FRAG)) ||
        null;
      if (!rawTofId) {
        // last-ditch by descriptor within the canonical service
        for (const c of chars) {
          const desc = await readCud(serviceId, c.uuid);
          if (desc && /(tof|distance|raw)/i.test(desc)) { rawTofId = c.uuid; break; }
        }
      }

      // NEW: Search *all* services for FEED if still not found
      let rawTofService = null; // remember which service owns FEED
      if (!rawTofId) {
        for (const s of ucServices) {
          if (!s?.uuid) continue;
          const otherChars = await getCharsForService(s.uuid);
          let found =
            (RAW_TOF_CAN && findExactInService(otherChars, RAW_TOF_CAN)) ||
            (RAW_TOF_FRAG && findFragmentInService(otherChars, RAW_TOF_FRAG)) ||
            null;

          if (!found) {
            for (const c of otherChars) {
              const desc = await readCud(s.uuid, c.uuid);
              if (desc && /(tof|distance|raw)/i.test(desc)) { found = c.uuid; break; }
            }
          }

          if (found) {
            rawTofId = found;
            rawTofService = s.uuid;
            break;
          }
        }
      }
      if (rawTofId && !rawTofService) rawTofService = serviceId;

      // Metrics (verify they exist; fall back to CUD name if needed)
      const metrics = { ...UUIDS_METRICS };
      for (const key of Object.keys(metrics)) {
        const wanted = metrics[key];
        const exact = findExactInService(chars, toUC(wanted));
        if (exact) {
          metrics[key] = exact;
          continue;
        }
        // try by descriptor name
        for (const c of chars) {
          const desc = await readCud(serviceId, c.uuid);
          if (!desc) continue;
          if (key === 'CONCENTRIC' && /concentric/i.test(desc)) { metrics[key] = c.uuid; break; }
          if (key === 'ECCENTRIC'  && /eccentric/i.test(desc))  { metrics[key] = c.uuid; break; }
          if (key === 'ROM'        && /^rom$/i.test(desc))      { metrics[key] = c.uuid; break; }
          if (key === 'VELOCITY'   && /velocity/i.test(desc))   { metrics[key] = c.uuid; break; }
        }
      }

      resolved.current = {
        service: serviceId,
        reps: repsId,
        sets: setsId,
        cmd: cmdId,
        metrics,
        rawTof: rawTofId,
        rawTofService, // NEW
      };

      const ok = !!serviceId && (!!repsId || !!setsId);
      setIsRepCounter(ok);
      return ok;
    } catch (e) {
      setIsRepCounter(false);
      setLastError(e?.message || String(e));
      return false;
    }
  }, [device, readCud, getCharsForService]);

  /** ---------- CCCD ---------- */
  const writeCCCD = useCallback(async (srv, char, b64) => {
    if (!char) return;
    try {
      if (device?.writeDescriptorForService) {
        await device.writeDescriptorForService(srv, char, CCCD, b64);
      }
    } catch {}
  }, [device]);

  const enableNotify  = useCallback((srv, char) => writeCCCD(srv, char, ENABLE_NOTIFY_B64), [writeCCCD]);
  const disableNotify = useCallback((srv, char) => writeCCCD(srv, char, DISABLE_NOTIFY_B64), [writeCCCD]);

  /** ---------- read/monitor ---------- */
  const safeRead = useCallback(async (srv, char, label) => {
    if (!char) return null;
    try {
      const c = await device.readCharacteristicForService(srv, char);
      const valB64 = c?.value || null;
      if (!valB64) return null;

      if (label === 'reps' || label === 'set') {
        const n = parseMaybeFloatFromValue(valB64);
        if (n != null) return n;
        const txt = parseText(b64ToUtf8(valB64) || '');
        return txt || null;
      }

      // for metrics
      const f = parseMaybeFloatFromValue(valB64);
      return f != null ? f : null;
    } catch (e) {
      setLastError(e?.message || String(e));
      return null;
    }
  }, [device]);

  // Emit to Tracking.js
  const emitMetric = useCallback((uuid, valueFloat) => {
    if (!Number.isFinite(valueFloat)) return;
    try {
      DeviceEventEmitter.emit(BLE_EVT, {
        characteristicUUID: toUC(uuid),
        value: valueFloat, // Tracking.js will parse if needed
      });
    } catch (e) {
      // swallow
    }
  }, []);

  const monitorGeneric = useCallback((srv, char, onValue) => {
    if (!char) return null;
    try {
      const sub = device.monitorCharacteristicForService(srv, char, (error, characteristic) => {
        if (error) {
          setLastError(error?.message || String(error));
          return;
        }
        const valB64 = characteristic?.value || null;
        if (!valB64) return;
        onValue(valB64);
      });
      return sub;
    } catch (e) {
      setLastError(e?.message || String(e));
      return null;
    }
  }, [device]);

  // Specific monitor for reps/sets (stateful gating)
  const monitorRepSet = useCallback((srv, char, label) => {
    return monitorGeneric(srv, char, (valB64) => {
      let finalVal = parseMaybeFloatFromValue(valB64);
      if (finalVal == null) {
        const txt = parseText(b64ToUtf8(valB64) || '');
        finalVal = txt || null;
      }
      if (finalVal == null) return;

      // ——— HARD GATE for reps on exercise start ———
      if (label === 'reps' && awaitingMovement.current) {
        const prev = prevRepsBeforeStart.current;
        const n = typeof finalVal === 'number' ? finalVal : parseFloat(finalVal);
        if (!Number.isFinite(n)) return;

        // Accept only true post-start values:
        const accept =
          (prev != null && (n === 0 || n === 1 || n < prev)) ||
          (prev == null && (n === 0 || n === 1));

        if (!accept) return;

        // First valid post-start -> unlock stream
        awaitingMovement.current = false;
        setMovementLive(true);
        if (pollingPaused.current) pollingPaused.current = false;
      }

      setValues((prevVals) => ({ ...prevVals, [label]: finalVal }));
      setIsReady(true);
    });
  }, [monitorGeneric]);

  // Monitor for metrics → emit to Tracking.js
  const monitorMetric = useCallback((srv, uuid) => {
    return monitorGeneric(srv, uuid, (valB64) => {
      const f = parseMaybeFloatFromValue(valB64);
      if (f == null) return;
      emitMetric(uuid, f);
    });
  }, [emitMetric, monitorGeneric]);

  // Pass-through monitor for Raw ToF: emit base64 directly on the BLE bus
  const monitorRawTof = useCallback((srv, uuid) => {
    return monitorGeneric(srv, uuid, (valB64) => {
      try {
        DeviceEventEmitter.emit(BLE_EVT, {
          characteristicUUID: toUC(uuid),
          value: valB64, // base64 (binary)
        });
      } catch {}
    });
  }, [monitorGeneric]);

  /** ---------- monitoring orchestration ---------- */
  const startMonitoring = useCallback(async ({ seedInitial = true } = {}) => {
    if (!device?.id) return;

    stopMonitoring();

    await resolveUuids();
    const { service, reps, sets, metrics, rawTof, rawTofService } = resolved.current;

    if (!reps && !sets && !metrics && !rawTof) return;

    await new Promise((r) => setTimeout(r, 80));

    // enable notify on everything we care about
    if (reps) await enableNotify(service, reps);
    if (sets) await enableNotify(service, sets);
    for (const k of Object.keys(metrics)) {
      const mUuid = metrics[k];
      if (mUuid) await enableNotify(service, mUuid);
    }
    if (rawTof) await enableNotify(rawTofService || service, rawTof); // NEW: FEED may be on different service

    // Optional seed reads — SKIP when starting a new exercise to avoid stale values
    if (seedInitial) {
      const [initialReps, initialSet] = await Promise.all([
        reps ? safeRead(service, reps, 'reps') : Promise.resolve(null),
        sets ? safeRead(service, sets, 'set')  : Promise.resolve(null),
      ]);
      setValues({ reps: initialReps, set: initialSet });
      if (initialReps != null || initialSet != null) setIsReady(true);

      // Seed reads for metrics (emit once so UI can flash immediately)
      await Promise.all(
        Object.values(metrics).map(async (uuid) => {
          if (!uuid) return;
          const f = await safeRead(service, uuid, 'metric');
          if (f != null) emitMetric(uuid, f);
        })
      );
    }

    // Start monitors
    const sR = reps ? monitorRepSet(service, reps, 'reps') : null;
    const sS = sets ? monitorRepSet(service, sets, 'set') : null;

    const metricSubs = Object.values(metrics).map((uuid) =>
      uuid ? monitorMetric(service, uuid) : null
    );
    const sTOF = rawTof ? monitorRawTof(rawTofService || service, rawTof) : null; // NEW

    subsRef.current = [sR, sS, sTOF, ...metricSubs].filter(Boolean);

    // Light polling for robustness (reps/set only)
    clearPoll();
    pollRef.current = setInterval(async () => {
      if (pollingPaused.current) return; // pause until movement confirmed
      const { service: srv, reps: rChar, sets: sChar } = resolved.current;
      const [r, s] = await Promise.all([
        rChar ? safeRead(srv, rChar, 'reps') : Promise.resolve(null),
        sChar ? safeRead(srv, sChar, 'set')  : Promise.resolve(null),
      ]);
      setValues((prevVals) => ({
        reps: r ?? prevVals.reps,
        set:  s ?? prevVals.set,
      }));
      if (r != null || s != null) setIsReady(true);
    }, 1500);
  }, [device, resolveUuids, enableNotify, monitorRepSet, monitorMetric, monitorRawTof, safeRead, stopMonitoring, clearPoll, emitMetric]);

  useEffect(() => stopMonitoring, [stopMonitoring]);

  /** ---------- WRITE: ASCII text to command characteristic ---------- */
  const writeText = useCallback(async (text) => {
    const { service, cmd } = resolved.current;
    if (!device?.id) return;
    if (!cmd || !service) {
      await resolveUuids();
    }
    const { service: srv, cmd: c } = resolved.current;
    if (!srv || !c) return;

    try {
      const b64 = Buffer.from(String(text), 'utf8').toString('base64');
      try {
        await device.writeCharacteristicWithResponseForService(srv, c, b64);
      } catch {
        await device.writeCharacteristicWithoutResponseForService(srv, c, b64);
      }
    } catch (e) {
      setLastError(e?.message || String(e));
    }
  }, [device, resolveUuids]);

  /** ---------- Atomic, movement-gated exercise start ---------- */
  // disable CCCD → stop local monitors → send "start_workout" → resubscribe (no seed) → gate reps until true post-start
  const exerciseStartFlow = useCallback(async () => {
    await resolveUuids();
    const { service, reps, sets, rawTof, rawTofService } = resolved.current;

    // capture previous reps as numeric (if available)
    const prevNum = typeof values.reps === 'number' ? values.reps : parseFloat(values.reps);
    prevRepsBeforeStart.current = Number.isFinite(prevNum) ? prevNum : null;

    // stop listeners & clear UI
    stopMonitoring();
    setValues({ reps: null, set: null });
    setMovementLive(false);

    // disable notifies to avoid cached notify bursts
    if (service) {
      if (reps) await disableNotify(service, reps);
      if (sets) await disableNotify(service, sets);
      if (rawTof) await disableNotify(rawTofService || service, rawTof); // NEW
      // metrics notify will be re-enabled on startMonitoring()
      const { metrics } = resolved.current;
      for (const k of Object.keys(metrics)) {
        const mUuid = metrics[k];
        if (mUuid) await disableNotify(service, mUuid);
      }
    }

    // tell device to START (firmware should begin new set/rep session)
    await writeText('start_workout');

    // prepare strict gating
    awaitingMovement.current = true;
    pollingPaused.current  = true;

    // resubscribe WITHOUT initial reads; we won't accept reps until start condition is satisfied
    await startMonitoring({ seedInitial: false });
  }, [resolveUuids, stopMonitoring, disableNotify, writeText, startMonitoring, values.reps]); // NOTE: resolveUids is a typo fix below

  /** ---------- Exercise end: send "end_workout" ---------- */
  const exerciseEndFlow = useCallback(async () => {
    await resolveUuids();
    await writeText('end_workout');
    // optional: keep monitors running or let callers stopMonitoring()
  }, [resolveUuids, writeText]);

  // Bridge: UI start event (existing)
  useEffect(() => {
    const subExerciseStart = DeviceEventEmitter.addListener('ble:exercise:start', () => {
      exerciseStartFlow();
    });
    return () => {
      try { subExerciseStart.remove(); } catch {}
    };
  }, [exerciseStartFlow]);

  // NEW: Bridge workout:* events used by workout.js
  useEffect(() => {
    const subStart = DeviceEventEmitter.addListener('workout:start_stream', () => {
      exerciseStartFlow();
    });
    const subStop  = DeviceEventEmitter.addListener('workout:stop_stream', () => {
      exerciseEndFlow();
    });
    return () => {
      try { subStart.remove(); } catch {}
      try { subStop.remove(); } catch {}
    };
  }, [exerciseStartFlow, exerciseEndFlow]);

  return {
    values, isReady, isRepCounter, lastError, movementLive,
    beginExercise: exerciseStartFlow,
    finishExercise: exerciseEndFlow,     // call this on "Finish Exercise"
    startMonitoring, stopMonitoring,
    writeText,
  };
}
