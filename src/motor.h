#ifndef EEEN21000_MOTOR_H
#define EEEN21000_MOTOR_H

#include "types.h"

class Motor {
public:
    void begin(Side side);
    void set(float u);      // -1 to +1, clamped
    void coast();
    void enable(bool on);
};

#endif
