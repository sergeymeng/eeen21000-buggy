#ifndef EEEN21000_TYPES_H
#define EEEN21000_TYPES_H

#include <cstdint>

enum class Side : uint8_t { LEFT, RIGHT };

struct LineSample {
    float   pos_mm;     // + is right
    float   strength;   // 0 to 6
    uint8_t mask;       // bit 0 = S1
    bool    valid;
};

struct WheelState {
    int32_t count;
    int32_t delta;
    float   v_mm_s;
};

struct MotorCmd {
    float duty;         // -1 to +1
    bool  coast;
};

struct BleCmd {
    enum class Type : uint8_t { NONE, GO, STOP, UTURN, RESET };
    Type type;
};

struct BattStatus {
    float voltage_v;
    bool  low;
};

enum class Mode : uint8_t {
    IDLE, CALIBRATE, RUN, LINE_LOST, FINISH, FAULT
};

struct Telemetry {
    float    pos_mm;
    float    v_l;
    float    v_r;
    float    v_ref_l;
    float    v_ref_r;
    uint8_t  mode;
    uint16_t faults;
};

#endif
