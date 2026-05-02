# Vintage Tee Price Checker Bot

Discord bot for vintage tee price checks. It accepts shirt images and notes, builds a shirt fingerprint, generates eBay sold-comp searches, filters matches, runs a weighted pricing engine, posts a review card, and stores yes/no feedback.

## What is included

- `/pricecheck` with front image, optional back/tag images, optional note, and optional item-name guess
- `/identify`, `/explain`, `/review`, `/addcomp`, and `/refreshcomps`
- eBay Marketplace Insights `item_sales/search` integration for sold comps
- Optional active-listing fallback that is clearly marked as not sold-comp data
- Postgres schema for Railway
- Local JSON storage fallback for development and smoke tests
- Pluggable vision providers: `heuristic`, `openai`, or `webhook`
- Text matching, visual-comparison hook, match decision layer, weighted median pricing, and Discord review buttons

## Quick start

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy env settings:

   ```sh
   cp .env.example .env
   ```

3. Fill in Discord and eBay values in `.env`.

4. Register Discord slash commands:

   ```sh
   npm run register-commands
   ```

   By default, the Railway app also registers commands automatically at startup when `AUTO_REGISTER_COMMANDS=true`.

5. Start the app:

   ```sh
   npm start
   ```

## Railway setup

Create a Railway service from this repository, attach Railway Postgres, then add the environment variables from `.env.example`. Railway should provide `DATABASE_URL`; keep `STORE_DRIVER=postgres`.

The deploy command runs migrations before starting the bot.

If `DISCORD_GUILD_ID` is set, slash commands are registered to that Discord server on startup. Guild commands appear quickly and are best while testing.

## eBay notes

True sold comps use eBay Buy Marketplace Insights. That API is restricted by eBay and needs the `buy.marketplace.insights` OAuth scope. If your account only has Browse API access, set `EBAY_ENABLE_ACTIVE_FALLBACK=true` for research context, but the pricing engine will mark the result as partial instead of treating active listings as sold sales.

## Vision providers

`VISION_PROVIDER=heuristic` works without an AI key and extracts from notes, filenames, and listing text. It is useful for local testing.

`VISION_PROVIDER=openai` uses the OpenAI Responses API with image URLs and asks for strict JSON extraction/comparison.

`VISION_PROVIDER=webhook` posts the same payloads to your own service. Return JSON matching the internal schema shown in `src/integrations/vision.js`.

## Useful commands

```sh
npm run migrate
npm run register-commands
npm run smoke
npm test
```
