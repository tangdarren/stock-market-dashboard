export const modelMonitorQueryKeys = {
  all: ['model-monitor'] as const,
  monitoring: (horizon: string, window: number, demoMode: boolean) =>
    ['model-monitor', 'monitoring', horizon, window, demoMode] as const,
}
