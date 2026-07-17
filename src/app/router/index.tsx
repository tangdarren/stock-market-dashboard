import { createBrowserRouter } from 'react-router-dom'
import { MainLayout } from '@/app/layouts/MainLayout'
import { LandingPage } from '@/pages/landing/LandingPage'
import { DailyDashboardPage } from '@/pages/daily/DailyDashboardPage'
import { LearnPage } from '@/pages/learn/LearnPage'
import { AboutPage } from '@/pages/about/AboutPage'
import { NotFoundPage } from '@/pages/not-found/NotFoundPage'
import { ROUTES } from '@/lib/constants/routes'

export const router = createBrowserRouter([
  {
    path: ROUTES.HOME,
    element: <MainLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: ROUTES.DAILY, element: <DailyDashboardPage /> },
      { path: ROUTES.LEARN, element: <LearnPage /> },
      { path: ROUTES.ABOUT, element: <AboutPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
