import { useQuery } from '@tanstack/react-query'
import { fetchOvernightSummary } from '../api/marketApi'
import { mockOvernightSummary } from '@/mocks/market.mock'
import { ENV } from '@/lib/api/env'

const USE_MOCK = !ENV.WEBULL_APP_KEY

export function useOvernightSummary() {
  return useQuery({
    queryKey: ['spy-overnight'],
    queryFn: USE_MOCK ? () => Promise.resolve(mockOvernightSummary) : fetchOvernightSummary,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  })
}
