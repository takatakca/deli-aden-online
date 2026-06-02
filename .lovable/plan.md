This is a large build (Priorities A–G). Before I burn through edits, here's the plan I'd execute in one continuous pass. Approve and I'll ship it; or trim sections you don't want and I'll execute the reduced scope.

## Backend (`server.cjs`)

New tables (MySQL + SQLite parallel DDL):
- `drivers` — id, name, phone, active, created_at
- `driver_assignments` — id, order_id, driver_id, assigned_at, delivered_at, notes
- Extend `settings` keys: restaurant_name, address, email, google_maps_url, opening_hours (JSON), order_pause_message (already partial)
- Extend `orders` columns: `accepted_at` (status workflow timestamp)

New status workflow enforced server-side: `new → accepted → preparing → ready → dispatched → completed` plus `cancelled` from any state. Status PATCH writes `order_events` row each time.

New API routes:
- `GET /api/admin/metrics` → counts by status + revenue today/week/month + orders/revenue per day (last 14 days)
- `GET /api/admin/drivers` / `POST` / `PATCH /:id` / `DELETE /:id`
- `POST /api/admin/orders/:id/assign` { driver_id, notes } → creates driver_assignment + sets status=dispatched
- `POST /api/admin/orders/:id/delivered` → sets delivered_at + status=completed
- `GET /api/admin/menu` → list of all overrides (already exists for public)
- `PUT /api/admin/menu/:itemId` already exists — extend to also accept `category_hidden` flag stored in settings
- `POST /api/admin/menu/category/:cat` { available } → bulk toggle (writes one override per item in category)

## Frontend routes (new files)

- `src/routes/admin.kitchen.tsx` — fullscreen kitchen display, 5s poll, large cards grouped by status (New/Preparing/Ready), one-click advance, sound on new
- `src/routes/admin.board.tsx` — live order board (kanban-style columns for all statuses), 5s poll, drag-free click-to-advance
- `src/routes/admin.settings.tsx` — full settings form (all Priority F fields + opening hours editor)
- `src/routes/admin.menu.tsx` — menu manager: per-item availability/price/desc/image override, category bulk toggle
- `src/routes/admin.drivers.tsx` — drivers CRUD + active deliveries list with "Mark delivered"
- `src/routes/admin.metrics.tsx` — dashboard cards + orders/revenue charts (recharts already in deps)
- `src/routes/track.$orderNumber.tsx` — public live tracking page: status timeline from `order_events`, ETA, phone/maps buttons, 10s poll

Modify existing:
- `src/routes/admin.tsx` — turn into hub with tabs/links to all sub-screens; keep current list as "Commandes"
- `src/routes/confirmation.$orderNumber.tsx` — add "Suivre ma commande" link → `/track/:orderNumber`, restaurant phone & maps buttons
- `src/routes/menu.tsx` + `MenuItemCard.tsx` — respect `available=false` overrides ("Indisponible" badge, disable add-to-cart)
- `src/lib/api.ts` — add all new endpoints + types (Driver, Assignment, Metrics, OrderEvent already exists)

## Out of scope (calling out)

- Real-time SSE/WebSocket — staying on 5s polling as requested.
- Driver mobile app — admin-only dispatch from the same admin panel.
- Payments / Stripe — not requested.
- Multi-tenant / multi-location — single restaurant only.

## QA

After writing files I'll run `npm run build` via the harness, fix any TS errors, and report back with: files changed, new tables, new routes, new admin screens, and any remaining warnings. I will NOT run `npm install` / `npm start` (those happen on MochaHost) — the local check is build only, matching prior turns.

## Risk

This is ~10 new files + heavy server.cjs additions in one turn. If you'd rather split (e.g. ship A+B+F first, then C+D+E next turn), say so and I'll do it in two passes.

Approve to proceed, or tell me what to cut.