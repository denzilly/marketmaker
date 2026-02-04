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
- [x] Market page layout (orderbook, trade blotter, position blotter)
- [x] Placeholder components created
- [x] Type definitions for all database entities
- [x] Market code generator ("quick-tiger-moon" style)
- [x] Save-link modal component

### Next Steps (in order)
1. **Wire up market creation/joining** - connect landing page to Supabase, create markets and participants
2. **Build order entry flow** - let users post bids/offers
3. **Implement order matching** - execute trades when someone hits a price (FIFO price-time priority)
4. **Set up real-time subscriptions** - live updates for all participants
5. **Add asset creation** - let users define new things to trade
6. **Implement settlement** - admin can settle assets, calculate who owes whom

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
- **Positions**: Computed view from trades table, not stored separately
- **P&L**: Mark-to-market against `last_price` on assets table (unitless, not currency-specific)
- **Real-time**: Supabase subscriptions for order book and trade updates
- **Cancelled orders**: Hard delete, no history kept

## Project Structure

```
src/
├── lib/
│   ├── components/     # Svelte components
│   │   ├── OrderBook.svelte
│   │   ├── TradeBlotter.svelte
│   │   ├── PositionBlotter.svelte
│   │   └── SaveLinkModal.svelte
│   ├── types/          # TypeScript interfaces
│   │   └── database.ts
│   ├── utils/          # Utilities
│   │   └── market-code.ts
│   ├── stores/         # Svelte stores (TODO)
│   ├── supabase.ts     # Supabase client
│   └── index.ts        # Re-exports
├── routes/
│   ├── +layout.svelte  # Root layout
│   ├── +page.svelte    # Landing page (create/join)
│   └── m/[code]/       # Market page
│       ├── +page.svelte
│       └── +page.ts
├── app.css             # Global styles
├── app.html            # HTML shell
└── app.d.ts            # Type declarations
```

## Database Schema

Tables: `markets`, `participants`, `assets`, `orders`, `trades`
View: `positions` (computed from trades)

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



we left off here I need to refactor the subscription logic to handle the case where there are initially no assets. Let me rewrite the onMount to use a cleaner subscription helper.

you were working on +page.svelte