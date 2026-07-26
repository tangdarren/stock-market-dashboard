export const modelMonitorQueryKeys = {
  all: ['model-monitor'] as const,
  monitoring: (
    horizon: string,
    window: number,
    demoMode: boolean,
    simulated: boolean,
  ) =>
    ['model-monitor', 'monitoring', horizon, window, demoMode, simulated] as const,
}
