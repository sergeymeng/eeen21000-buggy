# 固件架构

目标平台：Nucleo F401RE，mbed OS 6，Keil Studio。控制周期为 5 ms（200 Hz），主频为 84 MHz。

## 模块

| 编号 | 模块 | 文件 | 职责 | 输入 | 输出 |
| --- | --- | --- | --- | --- | --- |
| M1 | 循迹采样 | sensors.cpp | 采六路、归一化、算线位置 | ADC1 ×6 | LineSample |
| M2 | 里程 | encoder.cpp | 有符号增量、转速 | TIM2、TIM3 | WheelState ×2 |
| M3 | 电机驱动 | motor.cpp | 指令转比较值、方向、使能 | MotorCmd ×2 | TIM1、PC_4、PC_5、PC_8 |
| M4 | 轮速环 | control.cpp | 两路 PI | v_ref ×2、WheelState ×2 | MotorCmd ×2 |
| M5 | 循迹 | control.cpp | 横向偏差转弯曲率 | LineSample、v | 曲率 |
| M6 | 运动学 | control.cpp | 中心速度和曲率转轮速 | v、曲率 | v_ref ×2 |
| M7 | 状态机 | sequencer.cpp | 模式、限速、故障 | LineSample、WheelState、BleCmd、BattStatus | Mode、v_cmd、使能 |
| M8 | 无线 | ble.cpp | 帧解析、发送缓冲 | USART1 | BleCmd、遥测 |
| M9 | 电池 | battery.cpp | DS2781 读取、低压标志 | PC_12 | BattStatus |
| M10 | 调度 | main.cpp | 5 ms tick、调用顺序 | Ticker | 调用序列 |

## 数据流

每个 5 ms 周期先由 M1 采集六路循迹信号，得到 `LineSample`，再由 M2 读取两轮编码器，得到 `WheelState`。M7 结合线状态、轮状态、主循环缓存的 `BleCmd` 与 `BattStatus` 决定模式、中心速度和驱动使能；M5 将横向偏差转换为曲率，M6 将中心速度与曲率转换为左右目标轮速，M4 分别闭合两路轮速 PI 环，最后由 M3 输出方向和 PWM 比较值。切换模式时清除积分，目标轮速允许为负，负逻辑 PWM 转换只在 `Motor` 内完成。M8 和 M9 在主循环运行，控制路径内不执行阻塞通信。

## 时序预算

周期 5 ms，主频 84 MHz，M1 到 M3 一遍。

| 步骤 | 耗时（µs） | 占 Ts |
| --- | ---: | ---: |
| ADC，8 通道，采样 15 周期 | 10.3 | 0.2 % |
| 驱动调用开销，8 × 3 µs | 24.0 | 0.5 % |
| 归一化与阈值 | 6.0 | 0.1 % |
| 质心 | 4.0 | 0.1 % |
| 编码器读数与转速 | 4.0 | 0.1 % |
| 横向偏差与微分 | 5.0 | 0.1 % |
| 运动学 | 3.0 | 0.1 % |
| PI ×2 | 10.0 | 0.2 % |
| 比较值写入 | 2.0 | 0.0 % |
| 中断进出 | 4.0 | 0.1 % |
| 小计 | 72.3 | 1.4 % |
| 加 20 % | 14.5 | 0.3 % |
| 预算 | 87 | 1.7 % |

9600 波特下 24 字节遥测约需 25 ms，缓冲后按 5 Hz 发送；DS2781 一次读取约 3 ms，放在主循环；115200 波特下一行 `printf` 约 3.5 ms。这些操作均不在 5 ms 控制环内。

## 当前状态

上述模块和时序是设计规格，尚未上硬件验证。当前代码为接口与模块骨架，`main.cpp` 仍保留 Arduino `setup()` / `loop()` 占位。PI 参数待补充与调试，速度规划值为占位值。电流检测的差分放大器未确认，实际可能只有六路 ADC；表内保留八通道预算。mbed tick 使用 TIM5 是待确认的假设。
