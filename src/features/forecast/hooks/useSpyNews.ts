import { useQuery } from '@tanstack/react-query'
import { forecastApi } from '../api/forecastApi'
import { demoNews } from '../demo/demoResponses'
import { useSimulatedDataMode } from '@/features/simulated/useSimulatedDataMode'
import { ENV } from '@/lib/api/env'
import type { NewsResponse } from '../api/types'

const TWENTY_MINUTES = 20 * 60 * 1000

export function useSpyNews() {
  const { enabled: simulated } = useSimulatedDataMode()

  return useQuery<NewsResponse>({
    queryKey: ['forecast-news', ENV.DEMO_MODE, simulated],
    queryFn: async () => {
      if (ENV.DEMO_MODE) return demoNews
      return forecastApi.news({ simulated })
    },
    staleTime: TWENTY_MINUTES,
    refetchInterval: false,
    retry: 0,
  })
}
