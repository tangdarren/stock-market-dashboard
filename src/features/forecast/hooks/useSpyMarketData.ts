import { useQuery } from '@tanstack/react-query'
import { forecastApi } from '../api/forecastApi'
import { demoMarket } from '../demo/demoResponses'
import { useSimulatedDataMode } from '@/features/simulated/useSimulatedDataMode'
import { ENV } from '@/lib/api/env'
import type { MarketResponse } from '../api/types'

const FIVE_MINUTES = 5 * 60 * 1000

export function useSpyMarketData() {
  const { enabled: simulated } = useSimulatedDataMode()

  return useQuery<MarketResponse>({
    queryKey: ['forecast-market', 'spy', ENV.DEMO_MODE, simulated],
    queryFn: async () => {
      if (ENV.DEMO_MODE) return demoMarket
      return forecastApi.spyMarket({ simulated })
    },
    staleTime: FIVE_MINUTES,
    refetchInterval: false,
    retry: 0,
  })
}
