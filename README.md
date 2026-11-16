# EEEN21000 Buggy — Group 52

循迹小车固件，目标平台为 Nucleo F401RE、mbed OS 6、Keil Studio，控制周期为 5 ms（200 Hz）。接口与参数依据 2026-11-16 固件开发文档。

## 硬件

- Nucleo F401RE，STM32F401RET6，84 MHz，512 KB Flash，96 KB RAM
- ESP 电机驱动板，unipolar，负逻辑 PWM，20 kHz
- 两个减速电机，15:1，AEAT-601B 编码器，256 CPR，四倍频
- 六路 TCRT5000 模拟循迹传感器，8 pin 排线
- HM-10，USART1，9600 8N1
- DS2781，PC_12，1-Wire

## 模块与文件

| 编号 | 模块 | 文件 | 职责 |
| --- | --- | --- | --- |
| M1 | 循迹采样 | [src/sensors.cpp](src/sensors.cpp) | 采六路、归一化、算线位置 |
| M2 | 里程 | [src/encoder.cpp](src/encoder.cpp) | 有符号增量、转速 |
| M3 | 电机驱动 | [src/motor.cpp](src/motor.cpp) | 指令转比较值、方向、使能 |
| M4 | 轮速环 | [src/control.cpp](src/control.cpp) | 两路 PI |
| M5 | 循迹 | [src/control.cpp](src/control.cpp) | 横向偏差转弯曲率 |
| M6 | 运动学 | [src/control.cpp](src/control.cpp) | 中心速度和曲率转轮速 |
| M7 | 状态机 | [src/sequencer.cpp](src/sequencer.cpp) | 模式、限速、故障 |
| M8 | 无线 | [src/ble.cpp](src/ble.cpp) | 帧解析、发送缓冲 |
| M9 | 电池 | [src/battery.cpp](src/battery.cpp) | DS2781 读取、低压标志 |
| M10 | 调度 | [src/main.cpp](src/main.cpp) | 5 ms tick、调用顺序 |

公共数据类型在 [src/types.h](src/types.h)，常量在 [src/config.h](src/config.h) 的 `cfg` 命名空间。模块接口在对应的 `.h` 文件中；`control.h` 包含 `SpeedLoop`、`LineFollowing` 和 `Kinematics`。

## 设计文档

- [引脚与定时器分配](docs/pinmap.md)
- [模块架构、数据流与时序预算](docs/architecture.md)

## 当前状态

当前为接口与模块骨架，尚未上硬件。模块 `.cpp` 仅包含对应头文件，`main.cpp` 保留原有 Arduino `setup()` / `loop()` 占位，尚未接入 mbed 调度。仓库没有构建配置。

PI 参数待补充与调试，速度规划值为占位值；电流检测差分放大器及 mbed tick 的 TIM5 分配仍待确认。
