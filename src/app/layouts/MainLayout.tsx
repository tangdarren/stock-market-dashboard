import { Outlet } from 'react-router-dom'
import { Navbar } from '@/components/navigation/Navbar'
import { Footer } from '@/components/navigation/Footer'
import { useScrollToTop } from '@/hooks/useScrollToTop'

export function MainLayout() {
  useScrollToTop()

  return (
    <div className="relative min-h-screen bg-[#0d0c14] text-white antialiased">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-[-8%] top-[-8%] h-[600px] w-[600px] rounded-full bg-[#00FFB2]/[0.02] blur-[160px]" />
        <div className="absolute bottom-[-5%] right-[-5%] h-[500px] w-[500px] rounded-full bg-[#202026]/30 blur-[150px]" />
      </div>
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
