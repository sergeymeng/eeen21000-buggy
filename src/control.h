#ifndef EEEN21000_CONTROL_H
#define EEEN21000_CONTROL_H

#include "types.h"

class SpeedLoop {
public:
    void begin();
    void reset();
    float update(float v_ref, float v_meas);   // -1 to +1
private:
    float integ_ = 0.0f;
};

class LineFollowing {
public:
    void reset();
    float steer(const LineSample &line, float v_mm_s);   // 1/mm, + turns right
private:
    float prev_pos_ = 0.0f;
    bool  has_prev_ = false;
};

class Kinematics {
public:
    static void split(float v_mm_s, float kappa, float &v_l, float &v_r);
};

#endif
