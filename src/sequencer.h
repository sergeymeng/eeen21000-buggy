#ifndef EEEN21000_SEQUENCER_H
#define EEEN21000_SEQUENCER_H

#include "types.h"

//   IDLE -> CALIBRATE -> RUN -> FINISH
//                         |  \-> LINE_LOST -> RUN
//                         \----> FAULT
class Sequencer {
public:
    void begin();
    Mode update(const LineSample &line, const WheelState &wheel,
                const BleCmd &cmd, const BattStatus &batt);
    Mode  mode() const;
    float v_cmd_mm_s() const;
    bool  drive_enabled() const;
private:
    Mode  mode_    = Mode::IDLE;
    float v_cmd_   = 0.0f;
    float lost_mm_ = 0.0f;
};

#endif
