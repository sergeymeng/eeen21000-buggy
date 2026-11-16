#ifndef EEEN21000_SENSORS_H
#define EEEN21000_SENSORS_H

#include "config.h"
#include "types.h"

class Sensors {
public:
    void begin();
    bool calibrate(uint16_t n = cfg::cal_n);   // samples per channel per level
    LineSample read();                         // about 60 us
    float normalised(uint8_t i) const;         // 0 black, 1 white
private:
    float white_[cfg::n_sensors];
    float black_[cfg::n_sensors];
    float norm_[cfg::n_sensors];
};

#endif
