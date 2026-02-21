# MarketMaker

A web application for creating prediction markets and trading with friends on arbitrary outcomes.

## Project Overview

MarketMaker lets users create "markets" (sessions) where participants can define assets (e.g., "Bill's Math Test Score") and trade on them via a central order book. When outcomes are known, an admin settles the assets and the app calculates who owes whom.

## Tech Stack

- **Frontend**: SvelteKit + TypeScript
- **Backend/Database**: Supabase (PostgreSQL + real-time subscriptions)
- **Hosting**: Netlify (frontend) + Supabase (backend)
- **Styling**: Plain CSS with dark theme (easy to change later)

## Current Progress

### Completed
- [x] Project scaffolding (SvelteKit + TypeScript)
- [x] Supabase project created and connected
- [x] Database schema deployed (`supabase/schema.sql`)
- [x] Landing page UI (create/join market forms)
- [x] Market creation and joining wired to Supabase
- [x] Market page layout (orderbook, sidebar with positions/orders/trades)
- [x] Type definitions for all database entities
- [x] Market code generator ("quick-tiger-moon" style)
- [x] Save-link modal component (shown on first visit)
- [x] Asset creation (name + optional description)
- [x] Two-way order entry (bid/offer simultaneously)
- [x] Instant trading (click top-of-book prices to execute 1 contract)
- [x] Order matching with price-time priority (FIFO), partial fills
- [x] Order cancellation (individual + bulk "Cancel All")
- [x] Real-time subscriptions (orders, trades, assets, participants)
- [x] Position blotter with unrealized P&L (mark-to-market, database-driven)
- [x] Trade blotter with full market history
- [x] Active orders panel
- [x] Order book depth view (expandable per asset)
- [x] Asset settlement by admin
- [x] Settlement calculation / "Settle Up" modal (minimized transfers)
- [x] Admin panel (view participants, copy personal links)
- [x] Help panel (user guide)
- [x] Sound effects (order placed, trade executed)
- [x] Mobile-responsive design (3 breakpoints)

### Potential Future Work
- Improved error handling and edge cases
- Historical charts / price graphs
- Market templates or presets
- Spectator mode

## Key Concepts

- **Market**: A session identified by a memorable code (e.g., "quick-tiger-moon")
- **Participant**: A user in a market, identified by a token stored in their personal link
- **Asset**: Something to trade on (e.g., a test score, sports outcome)
- **Order**: A bid (buy) or offer (sell) at a specific price and size
- **Trade**: Executed when someone hits an existing order
- **Position**: Net long/short holding in an asset, derived from trades

## Architecture Decisions

- **Auth**: Token-based personal links (no email/password). Token stored in URL param `?p=xxx` and localStorage. Show "save your link" modal on first join.
- **Order Matching**: Price-time priority (FIFO) with partial fills allowed. Human-speed trading, not high-frequency.
- **Positions**: Database-driven via the `positions` view (aggregates all trades). Position data is fetched from the database and refreshed after trades, ensuring 100% accuracy even when trade history exceeds display limits
- **P&L**: Mark-to-market against `last_price` on assets table (unitless, not currency-specific)
- **Real-time**: Supabase subscriptions for order book and trade updates
- **Cancelled orders**: Hard delete, no history kept

## Project Structure

```
src/
├── lib/
│   ├── components/          # Svelte components
│   │   ├── OrderBook.svelte       # Order book with asset table, order entry, depth view, settlement
│   │   ├── TradeBlotter.svelte    # Live feed of all market trades
│   │   ├── PositionBlotter.svelte # User's positions and P&L (database-driven)
│   │   ├── ActiveOrders.svelte    # User's open orders with cancel
│   │   ├── SaveLinkModal.svelte   # "Save your link" prompt on first visit
│   │   ├── AdminPanel.svelte      # Participant list + copy links (admin)
│   │   ├── HelpPanel.svelte       # How-to-play guide
│   │   └── SettleUpModal.svelte   # Settlement calculation (who owes whom)
│   ├── types/               # TypeScript interfaces
│   │   └── database.ts
│   ├── utils/               # Utilities
│   │   ├── market-code.ts         # 3-word code generator + validator
│   │   └── order-matching.ts      # FIFO price-time priority matching engine
│   ├── supabase.ts          # Supabase client
│   └── index.ts             # Re-exports
├── routes/
│   ├── +layout.svelte       # Root layout
│   ├── +page.svelte         # Landing page (create/join market)
│   └── m/[code]/            # Market page
│       ├── +page.svelte          # Main trading interface
│       └── +page.ts              # Load function (validate token, fetch data)
├── app.css                  # Global styles (dark theme)
├── app.html                 # HTML shell
└── app.d.ts                 # Type declarations
static/
└── sounds/
    ├── order.mp3            # Sound on order placement
    └── trade.mp3            # Sound on trade execution
```

## Database Schema

Tables: `markets`, `participants`, `assets`, `orders`, `trades`, `messages`
View: `positions` (computed from ALL trades, including both open and closed positions)

The `positions` view aggregates net_position and cash_flow from all trades. It includes positions where either net_position != 0 OR cash_flow != 0, ensuring closed positions with realized P&L are visible.

Full schema in `supabase/schema.sql` - already deployed to Supabase.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (localhost:5173)
npm run build        # Build for production
npm run preview      # Preview production build
npm run check        # Run svelte-check
```

## Environment Variables

Already configured in `.env`:
```
PUBLIC_SUPABASE_URL=https://yhtbwthhyfuldsyfksxh.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<configured>
```

## Conventions

- Components use PascalCase: `OrderBook.svelte`
- Utilities use kebab-case: `market-code.ts`
- Types are in `src/lib/types/`
- All database types are defined in `database.ts`
- Use `$lib/` alias for imports from lib folder
- Styling is plain CSS, easy to swap for Tailwind later if desired