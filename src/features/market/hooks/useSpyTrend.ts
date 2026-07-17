import { useSpyQuote } from './useSpyQuote'
import { computeTrend } from '../utils/trend'

export function useSpyTrend() {
  const { data: quote, isLoading, isError, error } = useSpyQuote()

  return {
    trend: quote ? computeTrend(quote) : null,
    isLoading,
    isError,
    error,
  }
}
