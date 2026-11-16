#ifndef EEEN21000_ENCODER_H
#define EEEN21000_ENCODER_H

#include "types.h"

class Encoder {
public:
    void begin(Side side, int8_t sign);   // sign from the bench
    WheelState update();                  // once per Ts
    float distance_mm() const;
    void reset();
private:
    int32_t last_count_ = 0;
    int64_t total_      = 0;
    int8_t  sign_       = 1;
    float   v_mm_s_     = 0.0f;
};

#endif
