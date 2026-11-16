# Pin map

Nucleo F401RE（STM32F401RET6）。

| 信号 | 引脚 | 外设 |
| --- | --- | --- |
| Bipolar 1 | PC_6 | GPIO 输出，固定 0 |
| Direction 1 | PC_4 | GPIO 输出 |
| PWM 1 | PA_8 | TIM1_CH1，20 kHz |
| Bipolar 2 | PC_7 | GPIO 输出，固定 0 |
| Direction 2 | PC_5 | GPIO 输出 |
| PWM 2 | PA_9 | TIM1_CH2，20 kHz |
| Enable | PC_8 | GPIO 输出，固定 1 |
| MicroLan | PC_12 | 1-Wire |
| Analog A+ | PA_5 | ADC1_IN5，经差分放大 |
| Analog B+ | PB_1 | ADC1_IN9，经差分放大 |
| 编码器左 A/B | PA_0 / PA_1 | TIM2，编码器模式 X4，32 位 |
| 编码器右 A/B | PA_6 / PA_7 | TIM3，编码器模式 X4，16 位 |
| S1 | PA_4 | ADC1_IN4 |
| S2 | PB_0 | ADC1_IN8 |
| S3 | PC_0 | ADC1_IN10 |
| S4 | PC_1 | ADC1_IN11 |
| S5 | PC_2 | ADC1_IN12 |
| S6 | PC_3 | ADC1_IN13 |
| HM-10 RXD | PB_6 | USART1_TX，9600 8N1 |
| HM-10 TXD | PB_7 | USART1_RX |
| 调试 TX | PA_2 | USART2_TX |
| 调试 RX | PA_3 | USART2_RX |

PWM 20 kHz，ARR 4199，4200 级占空比。占空比越低转速越高，取反在 `Motor` 内部完成。

PA_0、PA_1 同时是 ADC1_IN0、IN1，PA_6、PA_7 同时是 ADC1_IN6、IN7，都被编码器定时器占用。PC_6、PC_7、PC_8 是 TIM3_CH1、CH2、CH3，PB_0、PB_1 是 TIM3_CH3、CH4。PB_6、PB_7 是 I2C1 和 TIM4_CH1、CH2。PA_9 是 USART1_TX。

定时器分配：TIM1 做 PWM，TIM2 和 TIM3 做编码器，TIM5 给 mbed 的 tick，TIM4 备用。TIM5 分配尚待 mbed 目标配置确认。

电流检测的差分放大器尚未确认，PA_5 和 PB_1 是经差分放大后的 ADC 输入分配，实际可能只有六路循迹 ADC。
