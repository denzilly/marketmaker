# MarketMaker

## Introduction

MarketMaker is a web application that lets people make markets and trade with each other, on whatever underlying they see fit to trade.
Traders join a "market", and can define new assets to trade. Traders can then fill a central order book with prices for the asset that they're trying to trade with each other.
Users will be able to buy or sell lots of the assets that have been defined. When deemed necessary, the administrator of that selected market will be able to enter the settlement value of each particular asset, subsequent to which MarketMaker will suggest how much traders need to pay each other to settle up their final debts to each other.

## Game Logic

The traded assets are arbitrary, but they always have a price at which they can be bought or sold, and a size in which they are traded. An example might be--Bill's score on the upcoming math final. His friend Lenny might think that Bill will get approximately 85% score on his math test. He might make the market at 80 / 90, willing to buy 80 or sell 90. A size of 1 unit would imply settlement of 1 euro per difference in score.

Let's imagine that Anna hits Lenny's bid at 80, in size 1, because she thinks that Bill is going to do poorly on the math test.

Anna has now sold the contract Bill-math-test at 80, and has a short position of -1.
Lenny is now long the same contract at 80, with a long position of 1.

Against all odds--Bill does quite well on the test and scores a 90! The administrator would be able to settle all contracts of Bill-math-test at 90, which implies that Anna would have to pay Lenny 10 euros.

## Order Management System

The central functional element of MarketMaker is the orderbook. All traders in the market have access to the orderbook, and are able to both place new orders as well as trade on existing orders in the market.

The central order book shows each asset that has a price, buy and sell button, and the size at the top of book. There should also be a small text entry field next to the bid and offer sides for the user to decide how much to buy. If they enter a larger size than what's available, they only take out what is available at the top of book price.

The player should also be able to expand each asset with a small arrow button on the side to expand the entire orderbook for a specific asset, if there are more prices behind the top of book bid and offer.

**Order Matching Logic**: Price-time priority (FIFO). At the same price level, the order that arrived first gets filled first. Partial fills are allowed - if someone tries to buy more than is available, they get what's there.

## Trade Blotter

There is a trade blotter that keeps track of all trades done in the market (not just the user's trades).

## Position Blotter

There should be a small blotter that shows the user's current position in any of the assets that they might have traded. For example Anna would see Bill-math-test and -1.

**P&L Display**: Positions show mark-to-market P&L based on the last traded price of each asset. P&L is unitless (just a number, not tied to a specific currency).

## Infrastructure

### Tech Stack (Decided)
- **Frontend**: SvelteKit + TypeScript
- **Backend**: Supabase (PostgreSQL database with real-time subscriptions)
- **Hosting**: Netlify (frontend), Supabase (backend)

### Session/Market Management
- Markets are identified by memorable 3-word codes (e.g., "quick-tiger-moon")
- Landing page allows users to create a new market or join an existing one
- Sessions persist across multiple days (stored in Supabase)

### User Identity
- No email/password required - simple token-based system
- When joining a market, users enter their name and receive a personal link with a token
- The token is stored in the URL (`?p=xxx`) and in localStorage
- A modal reminds users to save their personal link when they first join
- Returning users can use their saved link to rejoin

### Database Schema
- **markets**: id, code, name, created_at, created_by
- **participants**: id, market_id, name, token, is_admin, joined_at
- **assets**: id, market_id, name, description, status, settlement_value, last_price
- **orders**: id, asset_id, participant_id, side, price, size, remaining_size, status
- **trades**: id, asset_id, buy_order_id, sell_order_id, buyer_id, seller_id, price, size
- **positions** (view): computed from trades - shows net_position and cash_flow per participant per asset

### Real-time Updates
Using Supabase real-time subscriptions for live updates on:
- Order book changes
- New trades
- Asset updates
- Participant joins




### UI Improvements
#### order book


- the order of items should be size bid ask size
- the green and red buttons on the top of book should be clickable buttons to trade immediately in size 1
- there should be a separate button to add a new order for an asset (small + button) instead of the down arrow 
- the down arrow should uncollapse all orders under the top of book order, so that the user can see the depth of the order book
- these lower bids and higher offers in the uncollapsed order book are not clickable, but the user can still trade on them by entering a bid or offer that is beyond TOB. (e.g. if there are offers at 5 6 an 7, the user can bid 8 in size 3 to lift all of the offers.)
- the asset info appears in a tooltip on hover over the asset name
