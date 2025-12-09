// lib/tof.js
import { Buffer } from 'buffer';

export const RAW_TOF_UUID = '0000FEED-0000-1000-8000-00805F9B34FB';
export const TOF_MAX_SAMPLES = 120;

// NEW — Sycamore ToF Parser (timestamp + frameId + numZones + distances)
export function parseSycamoreFrame(b64) {
  if (!b64 || typeof b64 !== 'string') return null;

  let bytes;
  try {
    bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
  } catch {
    return null;
  }
  if (!bytes || bytes.length < 12) return null;

  // ---- Device timestamp: uint64 little endian ----
  const lo = 
    bytes[0] |
    (bytes[1] << 8) |
    (bytes[2] << 16) |
    (bytes[3] << 24);

  const hi =
    bytes[4] |
    (bytes[5] << 8) |
    (bytes[6] << 16) |
    (bytes[7] << 24);

  const timestamp_ms = hi * 2 ** 32 + lo;

  // ---- Frame ID: uint16 little endian ----
  const frameId = (bytes[8] | (bytes[9] << 8)) >>> 0;

  // ---- Number of zones ----
  const numZones = bytes[10] >>> 0;

  const distances = [];
  let offset = 12;

  for (let i = 0; i < numZones; i++) {
    const lo2 = bytes[offset];
    const hi2 = bytes[offset + 1];
    distances.push((lo2 | (hi2 << 8)) >>> 0);
    offset += 2;
  }

  return {
    timestamp_ms,
    frameId,
    numZones,
    distances,
  };
}

// OLD — Original ToF Parser (frameId + numZones + distances)

export const parseLegacyTofPacket = (b64) => {
  if (typeof b64 !== 'string' || !b64.length) return null;
  let bytes;
  try {
    bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
  } catch { return null; }
  if (!bytes || bytes.length < 4) return null;

  const frameId = (bytes[0] | (bytes[1] << 8)) >>> 0;
  let numZones = bytes[2] >>> 0; // header hint
  // bytes[3] reserved

  let expectedLen = 4 + numZones * 2;
  if (bytes.length < expectedLen) {
    const inferred = Math.floor((bytes.length - 4) / 2);
    if (inferred > 0) {
      numZones = inferred;
      expectedLen = 4 + numZones * 2;
    }
    if (bytes.length < expectedLen) return null;
  }

  const distances = new Array(numZones);
  for (let i = 0; i < numZones; i++) {
    const lo = bytes[4 + i * 2];
    const hi = bytes[4 + i * 2 + 1];
    distances[i] = (lo | (hi << 8)) >>> 0; // uint16 LE
  }
  return { frameId, numZones, distances };
};
