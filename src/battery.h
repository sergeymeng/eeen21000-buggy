#ifndef EEEN21000_BATTERY_H
#define EEEN21000_BATTERY_H

#include "types.h"

class Battery {
public:
    void begin();
    BattStatus read();
};

#endif
