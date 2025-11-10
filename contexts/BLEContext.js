// contexts/BLEContext.js
import React, { createContext, useContext, useState, useRef } from 'react';
import { BleManager } from 'react-native-ble-plx';

const BLEContext = createContext();

export function BLEProvider({ children }) {
  const managerRef = useRef(new BleManager());
  const [connectedDevice, setConnectedDevice] = useState(null);

  const value = {
    manager: managerRef.current,
    connectedDevice,
    setConnectedDevice,
  };

  return <BLEContext.Provider value={value}>{children}</BLEContext.Provider>;
}

export function useBLE() {
  return useContext(BLEContext);
}
