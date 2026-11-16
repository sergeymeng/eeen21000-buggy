#ifndef EEEN21000_BLE_H
#define EEEN21000_BLE_H

#include "types.h"

class Ble {
public:
    void begin();
    bool poll(BleCmd &out);
    bool send(const Telemetry &t);      // false if the buffer is full
};

#endif
