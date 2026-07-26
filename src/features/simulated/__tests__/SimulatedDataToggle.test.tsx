import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { SimulatedDataToggle } from '../SimulatedDataToggle'
import {
  SIMULATED_DATA_STORAGE_KEY,
  simulatedQueryParam,
  useSimulatedDataMode,
} from '../useSimulatedDataMode'
import { forecastApi } from '@/features/forecast/api/forecastApi'
import { useSpyMarketData } from '@/features/forecast/hooks/useSpyMarketData'
import { replayApi } from '@/features/replay/api/replayApi'
import { modelMonitorApi } from '@/features/model-monitor/api/modelMonitorApi'
import { ENV } from '@/lib/api/env'
import { server } from '@/test/msw/server'

function renderToggle() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <SimulatedDataToggle />
      </QueryClientProvider>,
    ),
  }
}

describe('useSimulatedDataMode', () => {
  it('defaults to live (off) and persists explicit selection', async () => {
    function Probe() {
      const { enabled, enable, disable } = useSimulatedDataMode()
      return (
        <div>
          <span data-testid="state">{enabled ? 'on' : 'off'}</span>
          <button type="button" onClick={enable}>
            enable
          </button>
          <button type="button" onClick={disable}>
            disable
          </button>
        </div>
      )
    }

    const user = userEvent.setup()
    const { unmount } = render(<Probe />)
    expect(screen.getByTestId('state')).toHaveTextContent('off')
    expect(simulatedQueryParam(false)).toEqual({})
    expect(simulatedQueryParam(true)).toEqual({ simulated: true })

    await user.click(screen.getByRole('button', { name: 'enable' }))
    expect(screen.getByTestId('state')).toHaveTextContent('on')
    expect(window.localStorage.getItem(SIMULATED_DATA_STORAGE_KEY)).toBe('1')

    unmount()
    render(<Probe />)
    expect(screen.getByTestId('state')).toHaveTextContent('on')

    await user.click(screen.getByRole('button', { name: 'disable' }))
    expect(screen.getByTestId('state')).toHaveTextContent('off')
    expect(window.localStorage.getItem(SIMULATED_DATA_STORAGE_KEY)).toBeNull()
  })
})

describe('SimulatedDataToggle', () => {
  it('communicates state in accessible text and aria attributes (not color alone)', async () => {
    const user = userEvent.setup()
    renderToggle()

    const off = screen.getByRole('switch', { name: 'Simulated data: OFF' })
    expect(off).toHaveAttribute('aria-checked', 'false')
    expect(off).toHaveTextContent('Simulated data: OFF')

    await user.click(off)
    const on = screen.getByRole('switch', { name: 'Simulated data: ON' })
    expect(on).toHaveAttribute('aria-checked', 'true')
    expect(on).toHaveTextContent('Simulated data: ON')

    await user.click(on)
    expect(screen.getByRole('switch', { name: 'Simulated data: OFF' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })
})

describe('simulated API request behavior', () => {
  it('omits simulated by default and includes simulated=true when enabled', async () => {
    const marketParams: string[] = []
    const metricsParams: string[] = []
    const monitoringParams: string[] = []
    const replayParams: string[] = []

    server.use(
      http.get(`${ENV.API_BASE_URL}${ENV.API_PREFIX}/market/spy`, ({ request }) => {
        marketParams.push(new URL(request.url).searchParams.get('simulated') ?? 'absent')
        return HttpResponse.json({
          symbol: 'SPY',
          mode: 'live',
          source: 'alpha_vantage',
          series: [],
          latest: null,
          features_as_of: '2024-01-01',
          data_as_of: '2024-01-01',
          disclaimer: 'test',
        })
      }),
      http.get(`${ENV.API_BASE_URL}${ENV.API_PREFIX}/model/metrics`, ({ request }) => {
        metricsParams.push(new URL(request.url).searchParams.get('simulated') ?? 'absent')
        return HttpResponse.json({ horizons: {}, generated_at: '2024-01-01T00:00:00Z' })
      }),
      http.get(`${ENV.API_BASE_URL}${ENV.API_PREFIX}/model/monitoring`, ({ request }) => {
        monitoringParams.push(new URL(request.url).searchParams.get('simulated') ?? 'absent')
        return HttpResponse.json({ available: false, reason: 'test', detail: 'test' })
      }),
      http.get(`${ENV.API_BASE_URL}${ENV.API_PREFIX}/replay/spy/random`, ({ request }) => {
        replayParams.push(new URL(request.url).searchParams.get('simulated') ?? 'absent')
        return HttpResponse.json({ available: false, mode: 'unavailable' })
      }),
    )

    await forecastApi.spyMarket()
    await forecastApi.metrics()
    await modelMonitorApi.monitoring({ horizon: '1d', window: 30 })
    await replayApi.randomSession()
    expect(marketParams[marketParams.length - 1]).toBe('absent')
    expect(metricsParams[metricsParams.length - 1]).toBe('absent')
    expect(monitoringParams[monitoringParams.length - 1]).toBe('absent')
    expect(replayParams[replayParams.length - 1]).toBe('absent')

    await forecastApi.spyMarket({ simulated: true })
    await forecastApi.metrics({ simulated: true })
    await modelMonitorApi.monitoring({ horizon: '1d', window: 30, simulated: true })
    await replayApi.randomSession({ simulated: true })
    expect(marketParams[marketParams.length - 1]).toBe('true')
    expect(metricsParams[metricsParams.length - 1]).toBe('true')
    expect(monitoringParams[monitoringParams.length - 1]).toBe('true')
    expect(replayParams[replayParams.length - 1]).toBe('true')
  })

  it('refetches market data with the new mode after toggling', async () => {
    const user = userEvent.setup()
    const params: string[] = []
    server.use(
      http.get(`${ENV.API_BASE_URL}${ENV.API_PREFIX}/market/spy`, ({ request }) => {
        const simulated = new URL(request.url).searchParams.get('simulated')
        params.push(simulated ?? 'absent')
        return HttpResponse.json({
          symbol: 'SPY',
          mode: simulated === 'true' ? 'simulated' : 'live',
          source: simulated === 'true' ? 'simulated_workbook' : 'alpha_vantage',
          series: [],
          latest: null,
          features_as_of: '2024-01-01',
          data_as_of: '2024-01-01',
          disclaimer: 'test',
          data_classification: simulated === 'true' ? 'SIMULATED / FICTIONAL' : undefined,
        })
      }),
    )

    function Probe() {
      const market = useSpyMarketData()
      return (
        <div>
          <SimulatedDataToggle />
          <span data-testid="mode">{market.data?.mode ?? 'loading'}</span>
        </div>
      )
    }

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('live'))
    expect(params[params.length - 1]).toBe('absent')

    await user.click(screen.getByRole('switch', { name: /simulated data: off/i }))
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('simulated'))
    expect(params[params.length - 1]).toBe('true')

    await user.click(screen.getByRole('switch', { name: /simulated data: on/i }))
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('live'))
    expect(params[params.length - 1]).toBe('absent')
  })
})
