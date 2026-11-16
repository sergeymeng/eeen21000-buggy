#ifndef EEEN21000_CONFIG_H
#define EEEN21000_CONFIG_H

namespace cfg {

constexpr float Ts      = 0.005f;   // s, 200 Hz
constexpr int   tick_hz = 200;

constexpr int   cpr_motor      = 1024;      // 256 CPR x 4
constexpr float gear           = 15.0f;
constexpr int   cpr_wheel      = 15360;
constexpr float wheel_dia      = 76.0f;     // mm
constexpr float wheel_circ     = 238.76f;   // mm
constexpr float mm_per_count   = wheel_circ / cpr_wheel;   // 0.01554
constexpr float mm_s_per_count = mm_per_count / Ts;        // 3.109

constexpr int   n_sensors = 6;
constexpr float pitch     = 10.0f;    // mm
constexpr float lookahead = 62.0f;    // mm, array centre to drive axle
constexpr float track     = 130.0f;   // mm
constexpr float capture   = 35.0f;    // mm

constexpr int   pwm_arr   = 4199;
constexpr int   pwm_steps = 4200;
constexpr float supply    = 10.0f;    // V
constexpr float i_max     = 1.4f;     // A

constexpr int   adc_max   = 4095;
constexpr float vdda      = 3.3f;
constexpr float v_per_lsb = vdda / 4096.0f;     // 0.806 mV
constexpr float threshold = 0.5f;
constexpr int   cal_n     = 64;
constexpr float cal_spread_min = 0.5f;          // V

constexpr float v_straight = 800.0f;   // mm/s
constexpr float v_curve    = 400.0f;
constexpr float v_end      = 300.0f;
constexpr float v_search   = 200.0f;

}

#endif
