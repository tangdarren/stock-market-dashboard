import { Outlet } from 'react-router-dom'
import { Navbar } from '@/components/navigation/Navbar'
import { Footer } from '@/components/navigation/Footer'
import { useScrollToTop } from '@/hooks/useScrollToTop'

export function MainLayout() {
  useScrollToTop()

  return (
    <div className="relative min-h-screen bg-[#0d0c14] text-white antialiased">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-[#00FFB2] focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-black focus:outline-none focus:ring-2 focus:ring-black/20 focus:ring-offset-2 focus:ring-offset-[#0d0c14]"
      >
        Skip to main content
      </a>
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-[-8%] top-[-8%] h-[600px] w-[600px] rounded-full bg-[#00FFB2]/[0.02] blur-[160px]" />
        <div className="absolute bottom-[-5%] right-[-5%] h-[500px] w-[500px] rounded-full bg-[#202026]/30 blur-[150px]" />
      </div>
      <Navbar />
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
