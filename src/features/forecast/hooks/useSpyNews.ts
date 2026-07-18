import { useQuery } from '@tanstack/react-query'
import { forecastApi } from '../api/forecastApi'
import { demoNews } from '../demo/demoResponses'
import { ENV } from '@/lib/api/env'
import type { NewsResponse } from '../api/types'

const TWENTY_MINUTES = 20 * 60 * 1000

export function useSpyNews() {
  return useQuery<NewsResponse>({
    queryKey: ['forecast-news', ENV.DEMO_MODE],
    queryFn: async () => {
      if (ENV.DEMO_MODE) return demoNews
      return forecastApi.news()
    },
    staleTime: TWENTY_MINUTES,
    refetchInterval: false,
    retry: 0,
  })
}
