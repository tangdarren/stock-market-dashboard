import { useEffect } from 'react'
import { SITE } from '@/lib/constants/site'

export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} — ${SITE.name}` : SITE.name
    return () => {
      document.title = SITE.name
    }
  }, [title])
}
