# SPY Market Dashboard

A real-time market intelligence dashboard for traders, built with React 19 and TypeScript. Pulls live SPY data from the Webull OpenAPI to deliver pre-market analysis, trend detection, and overnight gap summaries — all in a polished dark-themed UI.

![React](https://img.shields.io/badge/React-19-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-6-blue?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-8-purple?logo=vite)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-blue?logo=tailwindcss)

## Features

- **Live SPY Quotes** — Real-time price, change, and volume data with 30-second auto-refresh via React Query
- **Trend Analysis** — Algorithmic detection of uptrend, downtrend, or neutral market conditions
- **Overnight Gap Detection** — Pre-market gap-up/gap-down identification with contextual summaries
- **Market Status Awareness** — Adapts display based on market open/closed/pre-market state
- **Interactive Education** — Trading fundamentals covering candlesticks, support/resistance, risk management, and volume analysis
- **WebGL Animated Backgrounds** — GPU-accelerated gradient visuals using OGL
- **Responsive Glass-Morphism UI** — Dark theme with backdrop-blur cards and scroll-triggered animations

## Tech Stack

| Category | Technologies |
|----------|-------------|
| Framework | React 19, TypeScript 6 |
| Build | Vite 8 |
| Styling | Tailwind CSS 4 |
| Routing | React Router 7 |
| Data Fetching | TanStack React Query 5 |
| Animation | Framer Motion, GSAP, OGL (WebGL) |
| API | Webull OpenAPI |

## Architecture

```
src/
├── app/              # Layouts, providers, router config
├── components/       # Shared UI (Navbar, Footer, Badge, Container)
├── features/
│   ├── market/       # Core domain — API types, hooks, components, utils
│   ├── education/    # Trading education components
│   ├── profile/      # User profile components
│   └── ui/           # Reusable animated UI primitives
├── hooks/            # App-wide custom hooks
├── lib/              # API client, constants, utility functions
├── mocks/            # Mock data fallback (no API key required)
├── pages/            # Route-level page components
└── styles/           # Global CSS and animation styles
```

The project follows a **feature-based architecture** with clear separation between domain logic (`features/market/`), shared infrastructure (`lib/`), and presentation (`pages/`). Market data flows through custom hooks backed by React Query, with automatic polling and graceful fallback to mock data when API credentials are unavailable.

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Type check
npm run typecheck

# Build for production
npm run build
```

### Environment Variables

Copy `.env.example` to `.env` and add your Webull API credentials:

```
VITE_WEBULL_APP_KEY=your_app_key
VITE_WEBULL_APP_SECRET=your_app_secret
```

The app runs without credentials using mock market data — no API key is required for development.

## Key Technical Decisions

- **React Query for server state** — Handles caching, background refetching, and stale-while-revalidate patterns without manual state management
- **Feature-based folder structure** — Scales cleanly as features grow; each feature owns its API layer, hooks, components, and utilities
- **WebGL via OGL** — Lightweight alternative to Three.js for animated backgrounds without the bundle size overhead
- **Graceful degradation** — Full mock data layer enables development and demo without external API dependencies

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript compiler checks |
