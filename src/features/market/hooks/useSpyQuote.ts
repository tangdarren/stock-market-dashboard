import { useQuery } from '@tanstack/react-query'
import { fetchSpyQuote } from '../api/marketApi'
import { mockSpyQuote } from '@/mocks/market.mock'
import { ENV } from '@/lib/api/env'

const USE_MOCK = !ENV.WEBULL_APP_KEY

export function useSpyQuote() {
  return useQuery({
    queryKey: ['spy-quote'],
    queryFn: USE_MOCK ? () => Promise.resolve(mockSpyQuote) : fetchSpyQuote,
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}
