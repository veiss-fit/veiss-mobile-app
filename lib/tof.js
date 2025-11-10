// lib/tof.js
import { Buffer } from 'buffer';

export const RAW_TOF_UUID = '0000FEED-0000-1000-8000-00805F9B34FB';
export const TOF_MAX_SAMPLES = 120;

export const parseTofPacket = (b64) => {
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
