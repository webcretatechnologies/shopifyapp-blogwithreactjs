# Billing Coupons — Complete Functional Specification

Discount codes applied to **this app's own Shopify subscription plans** (Free/Starter/Pro),
charged through Shopify's real Billing API — not a storefront/customer discount system. This
document describes every rule, every scenario, and every UI behavior as actually implemented.

---

## 1. Data Model

### `Coupon`
| Field | Type | Notes |
|---|---|---|
| `code` | String, unique | Always stored uppercase; letters/numbers/`_`/`-` only |
| `discountType` | `PERCENTAGE` \| `FIXED_AMOUNT` | Default `PERCENTAGE` |
| `percentOff` | Decimal(5,2), nullable | Required if type is PERCENTAGE; must be `0 < x <= 99` |
| `amountOff` | Decimal(10,2), nullable | Required if type is FIXED_AMOUNT; must be `> 0` |
| `durationMonths` | Int | How many billing cycles the discount lasts |
| `description` | Text, nullable | Internal note, also shown to the merchant |
| `active` | Boolean, default `true` | Off = no new claims; existing discounts unaffected |
| `startsAt` / `endsAt` | DateTime, nullable | Claim window; blank = no bound on that side |
| `totalUses` | Int, nullable | Global cap across all stores; `null` = unlimited |
| `usesPerStore` | Int, default `1` | Per-store cap |
| `appliesTo` | `ALL_PAID_PLANS` \| `SPECIFIC_PLANS` \| `SPECIFIC_STORES` | Default `ALL_PAID_PLANS` |

**Key rule**: a discount can only ever be attached at `appSubscriptionCreate` time. Shopify's
billing engine owns the discount's clock after that — there is no "edit a live subscription's
discount" concept anywhere in this system.

### `CouponPlan` / `CouponShop` (join tables)
Scoping tables for `SPECIFIC_PLANS`/`SPECIFIC_STORES`. Both `onDelete: Cascade` from `Coupon` —
deleted automatically when the coupon is deleted. Unique on `(couponId, planId)` /
`(couponId, shopDomain)`.

### `CouponClaim` (audit/usage history — one row per successful subscription created with a coupon)
| Field | Notes |
|---|---|
| `couponId` | Nullable FK, `onDelete: SetNull` |
| `couponCode` | **Snapshot** of the code at claim time — survives coupon deletion |
| `couponDurationMonths` | **Snapshot** — survives coupon deletion, used for revenue/end-date math |
| `shopDomain`, `planTier` | Which store, which plan |
| `priceBeforeDiscount`, `discountedPrice`, `currencyCode` | The actual charged numbers |
| `status` | `PENDING \| APPROVED \| DECLINED \| CANCELLED \| EXPIRED` |
| `shopifyChargeId` | The real Shopify `AppSubscription` GID, unique |

**Deletion semantics**: deleting a `Coupon` never destroys claim history. The FK nulls out, but
`couponCode`/`couponDurationMonths` snapshots keep every claim fully self-contained and
displayable in the usage table forever, exactly as the delete-confirmation dialog promises the
merchant-facing admin.

**Status lifecycle**: every `PENDING` claim for the shop gets reconciled against Shopify's real,
live status on every `GET /api/billing/check` (billing/plans page load) —
`reconcilePendingCouponClaims()` batches all of them into one `nodes(ids:)` GraphQL query and
maps `ACTIVE → APPROVED`, `CANCELLED/DECLINED/EXPIRED → that same status`. This resolves an
*explicit* decline/cancel to a real terminal status without waiting on a webhook. It cannot help
with a silent walk-away, though (closed tab, hit back, no explicit Decline click) — queried
directly, Shopify itself keeps reporting that exact case as `PENDING` indefinitely, with no
webhook ever fired for it. A claim like that just stays `PENDING` forever, and — as of the fix
below — that's fine, because `PENDING` no longer gates anything.

---

## 2. Business Rules (`CouponService.js`)

### "Counted" claim definition (`countedClaimsWhere`)
A claim counts toward usage limits **only if `status === "APPROVED"`**. `PENDING` — no matter how
recently created — never counts, and neither do `DECLINED`/`CANCELLED`/`EXPIRED`. This exact
predicate is shared verbatim between real enforcement (`validateCouponForShop`) and the admin
list's usage badge, deliberately, to prevent the two ever disagreeing.

**This used to also count a `PENDING` claim within a 1-hour grace window of creation**, on the
theory that it deterred rapid-fire retries of the same code. That was removed: querying Shopify
directly for a subscription the merchant simply navigated away from (as opposed to an explicit
Decline) shows it staying `PENDING` indefinitely, with no webhook fired for it — there's no way to
distinguish "still deciding" from "already walked away" for that case. Any window built on
`PENDING` status was therefore guessing, and blocked real, legitimate cancellations for however
long the window lasted.

**Accepted trade-off**: a merchant can now retry an abandoned/cancelled checkout with the same
code immediately, as many times as they want — an abandoned checkout costs nothing on Shopify's
side either way, and that was judged strictly better than blocking real cancellations. If abuse
resistance is wanted later, it needs a different signal entirely (e.g. IP/session rate-limiting at
the API layer) — not a revived status-based grace window.

### Validation sequence (`validateCouponForShop(code, shopDomain, planTier)`)
Runs in this exact order, stopping at the first failure:

1. Empty code → *"Enter a coupon code."*
2. Code not found (case-insensitive via uppercase normalization) → *"This coupon code doesn't exist."*
3. `!active` → *"This coupon is no longer active."*
4. `startsAt` in the future → *"This coupon isn't active yet."*
5. `endsAt` in the past → *"This coupon has expired."*
6. `totalUses` set and global counted claims `>= totalUses` → *"This coupon has reached its usage limit."*
7. Counted claims for this store `>= usesPerStore` → *"You've already used this coupon."*
8. Scoping mismatch:
   - `SPECIFIC_PLANS` and the target plan isn't in the coupon's plan list → *"This coupon doesn't apply to the selected plan."*
   - `SPECIFIC_STORES` and this shop isn't in the coupon's store list → *"This coupon isn't available for your store."*
9. **Fixed-amount too large for the plan** (only when a `planTier` was passed in, and only for
   `FIXED_AMOUNT` coupons — percentage coupons can never trigger this, already capped at 99%):
   if `amountOff (cents) >= plan.price (cents)` for the plan being purchased →
   *"This coupon's discount amount is too large for the selected plan."* Placed last, after
   scoping, since it needs a resolved, already-eligible plan to price-check against — a coupon
   that's already out of scope for this plan fails with the scoping error above, not this one.
   Exists because Shopify's own `appSubscriptionCreate` rejects
   `discount.value.amount >= price` outright (`"Discount amount must be less than or equal to
   X"`), which would otherwise surface as a raw Shopify API error to the merchant instead of a
   clean, handled one.

On success, returns everything the frontend needs: code, discount type/values, duration,
description, applicability, plan tiers.

This exact function runs **twice** for every real subscription: once for the merchant-facing
preview (`POST /api/billing/coupon/validate`), and again, authoritatively, inside the real charge
path (`POST /api/billing/request`) — the preview result is never trusted for the actual charge.

### Discount math (`applyCouponDiscount`)
- Percentage: `price * (1 - percentOff / 100)`
- Fixed: `price - amountOff`
- Always rounded to 2 decimals, floored at `0`.

---

## 3. Subscribing With a Coupon (`billing.js`)

### `POST /api/billing/request` — the real charge path
1. Body: `{ plan, host, couponCode }`.
2. If `plan === "free"`: coupon logic doesn't apply at all — any active subscription is cancelled
   via `appSubscriptionCancel`, `planKey` set to `"free"`.
3. For a paid plan: look up the plan row; 400 if missing/inactive.
4. If `couponCode` provided, re-validate via `validateCouponForShop`. **If invalid, expired,
   already used, wrong scope, or a fixed amount too large for this plan — it is silently
   ignored.** The subscription proceeds at full price with no error surfaced to the merchant.
   (This is a real, current behavior — worth knowing if a merchant reports "my code didn't work
   but it didn't tell me why.")
5. Build the `appSubscriptionCreate` GraphQL mutation. The `discount` object is nested **inside**
   `lineItems[0].plan.appRecurringPricingDetails`, alongside `price`/`interval` — not a top-level
   mutation argument:
   ```graphql
   discount: {
     durationLimitInIntervals: <coupon.durationMonths>,
     value: { percentage: <percentOff / 100> }   # 0–1 fraction, e.g. 0.2 for 20%
     # or
     value: { amount: <amountOff> }
   }
   ```
6. `userErrors` from Shopify → 400 with Shopify's own error message.
7. **Only after Shopify accepts the subscription** and returns a real `appSubscription.id`, a
   `CouponClaim` row is created with `status: "PENDING"`. If this insert fails, it's caught and
   logged — never blocks the response, since the real charge already succeeded on Shopify's side
   regardless.
8. Response: `{ confirmationUrl }` — merchant is redirected to Shopify's own approval screen.

### `GET /api/billing/check` — reconciliation
On every call, `reconcilePendingCouponClaims(shopDomain, session)` runs unconditionally (not just
when there's a currently-active subscription — a shop back on Free after declining still has
`PENDING` claims worth resolving). It fetches every `PENDING` claim for the shop, batches their
`shopifyChargeId`s into one `nodes(ids:)` GraphQL query, and maps Shopify's real status:
`ACTIVE → APPROVED`, `CANCELLED/DECLINED/EXPIRED → that same status` (`FROZEN`/still-`PENDING` on
Shopify's side is left unmapped — the claim just stays `PENDING`, correctly). Best-effort,
per-claim `.catch()`; never blocks the billing-status response.

### `POST /api/billing/coupon/validate` — preview only
Body `{ code, planTier }`. Runs the same `validateCouponForShop` and returns the result verbatim
(always 200, even on `ok: false` — the frontend reads the `ok` field itself).

---

## 4. Admin Routes (`superAdmin.js`, all behind `validateSuperAdmin`)

### Shared validator (`validateCouponPayload`)
- Code: uppercased, must match `^[A-Z0-9_-]+$` → *"Code must be uppercase letters, numbers, underscores, or hyphens only."*
- Percent (if PERCENTAGE): `0 < x <= 99` → *"Percent off must be a number between 0 and 99 (100% would produce a $0 charge, which Shopify rejects)."*
- Amount (if FIXED_AMOUNT): `> 0` → *"Amount off must be a positive number."*
- Duration: positive integer → *"Duration (months) must be a positive integer."*
- `appliesTo`: whitelisted, defaults to `ALL_PAID_PLANS` if not one of the two restricted values.

### `validateCouponAmountAgainstPlans(data, planIds)` — save-time price guard
Runs (async, DB-backed) immediately after `validateCouponPayload` passes, in both `POST
/admin-api/coupons` and `PUT /admin-api/coupons/:id`, before any write to the database. Only
applies to `FIXED_AMOUNT` coupons — percentage coupons always pass through untouched.

Resolves the exact set of plans the coupon could ever actually be used against:
- `SPECIFIC_PLANS` → exactly the submitted `planIds`
- `ALL_PAID_PLANS` or `SPECIFIC_STORES` → every active plan with `price > 0` (a store-scoped
  coupon can still be applied against any paid plan the merchant happens to pick)

Rejects the save if `amountOff (cents) >= price (cents)` for **any** plan in that set, naming
every offending plan and its price:
*"Discount amount ($20.00) must be less than the plan price — too large for: Starter ($19.99)."*

This prevents ever creating (or editing into) a coupon that's broken from the moment it's saved —
a merchant who tried to claim it would hit the checkout-time rejection in §2 rule 9 regardless,
but this catches it at authoring time instead, with the offending plan(s) named explicitly.

### `syncCouponRelations(couponId, planIds, shopDomains)`
Inside a transaction: deletes ALL existing `CouponPlan`/`CouponShop` rows for the coupon, then
recreates from the submitted arrays. Simple "replace all" — no diffing.

### Routes
| Method & Path | Behavior |
|---|---|
| `GET /admin-api/coupons` | List all, `createdAt desc`, includes plans/shops/`_count.claims` (counted predicate) |
| `POST /admin-api/coupons` | Create; 400 if code exists; syncs relations only if scoped; logs activity |
| `PUT /admin-api/coupons/:id` | Update; 400 if code taken by a *different* coupon; **always** syncs relations; logs activity |
| `POST /admin-api/coupons/:id/toggle` | Flips `active`; logs "Activated"/"Deactivated" |
| `GET /admin-api/coupons/usage` | `{ rows, kpis }` — see §5 |
| `GET /admin-api/coupons/usage/export` | Same data as CSV (`coupon-usage-{timestamp}.csv`) |
| `DELETE /admin-api/coupons/:id` | Deletes coupon; claims survive via snapshot fields (§1); logs activity |

Every mutating route writes an `AdminActivityLog` entry (`"Created/Updated/Deleted/Activated/
Deactivated coupon: {code}"`).

---

## 5. Usage/Analytics Calculations (`buildCouponUsageRows`, shared by JSON + CSV)

KPI totals here only count `status === "APPROVED"` — the same definition §2's `countedClaimsWhere`
now uses for enforcement, so these figures and the actual usage limits never disagree. Pending
(and declined/cancelled/expired) claims still appear in the row list for visibility, just excluded
from the money figures.

Per row:
- `isAnnual` — looked up from `SubscriptionPlan.interval`
- `saving = priceBeforeDiscount - discountedPrice`
- `cycles = isAnnual ? max(1, round(durationMonths/12)) : durationMonths`
- `total = discountedPrice * cycles`
- `fullPriceFrom = createdAt + durationMonths` (when the discount period ends)
- `stillActive = APPROVED && fullPriceFrom > now`

KPIs:
- **Claims** — count of APPROVED rows
- **Stores** — distinct `shopDomain` among APPROVED rows
- **Active discounts** — count where `stillActive`
- **Discount / month** — sum of `saving/12` (yearly) or `saving` (monthly), `stillActive` rows only — current run-rate
- **Committed discount** — sum of `saving * cycles` across all APPROVED rows, full term including unbilled cycles

Filters: date range (`from`/`to`), `couponId`, `status`, free-text `search` (matches store domain
or coupon code).

---

## 5.5. Merchant-Facing Price Preview (`plans.jsx`, client-side)

`applyCouponDiscount(price, coupon)` on the plans page computes the discounted price shown on
each plan card instantly, before any server round-trip. For a `FIXED_AMOUNT` coupon, if
`amountOff >= price` for that specific plan card, the function returns `null` — **not** a
clamped-to-near-zero value like `$0.01`. A `null` result is treated the same as "this coupon
doesn't apply to this plan" (via a `showDiscountHere` flag alongside the existing scoping check):
the card falls back to showing the plan's real full price, with no strikethrough/discount styling
at all, rather than displaying a discount that could never actually be applied to that plan. This
mirrors the checkout-time and admin-save-time guards above so all three layers agree.

Since admin-side save-time validation (§4) now blocks creating a broken fixed-amount coupon in
the first place, this path mainly matters for coupons created before that validation existed, or
if a coupon is edited to newly exceed a specific plan's price while already scoped to a *different*
plan it's still valid for (e.g. a coupon valid for Pro shown on a Starter card it doesn't fit).

---

## 6. Admin UI (`CouponsModule.jsx`) — Complete Behavior

Three views: **List**, **Form** (create/edit), **Usage**. Top nav: "Coupons" / "Coupon Usage" /
"Add New Coupon".

### List view
- Info banner: *"A merchant enters the code on the plans page. The discount is sent to Shopify
  with the subscription, so it appears on their real invoice and reverts to full price
  automatically once the duration ends. A coupon only applies at the moment a plan is purchased —
  it cannot be added to a subscription that already exists, and the claim window / usage limits
  stop new claims only, never a discount already running."*
- Columns: Code + description, Discount (e.g. "20% off"), Applies To (with count of restricted
  plans/stores), Duration, Claim Window (human-readable date range), Used/Limits
  (`{used}{" / "+totalUses if set}` + "N per store"), Status (custom green/grey pill toggle,
  click to activate/deactivate inline), Actions (Edit / Usage / Delete).
- **Delete confirmation**: *"Delete coupon "{code}"?"* + *"This action is irreversible."* — plus,
  if the coupon has claims: *" This coupon has been claimed {n} time(s) — those merchants keep
  their existing discount; this only stops new claims."* Destructive-styled confirm button.

### Form view (create/edit)
**Coupon Details card:**
- Code — auto-uppercased as you type; help: *"Letters, numbers, dash and underscore only. Always
  stored uppercase — merchants can type it in any case."*
- Discount Type — Percentage / Fixed amount, with explanatory help text for each
- Value — percent field capped at `max=99` with `%` suffix ("Capped at 99% — Shopify rejects a $0
  subscription") **or** amount field with `$` prefix, depending on type
- Duration (months) — help explains it converts per billing cycle (12 monthly vs 1 yearly charge)
- Description — internal note, also shown to the merchant
- Active checkbox — help: *"Turn off to stop merchants claiming this code. Stores already on a
  discounted subscription keep their discount."*

**Availability & Limits card:**
- Warning banner: *"A store that claimed in time keeps its discount for the full duration set
  above — Shopify owns that clock once the subscription exists, so an end date or a filled limit
  only stops new claims, never a discount already running."*
- Start/End date — blank = no bound
- Total uses — blank = unlimited, global
- Uses per store — help clarifies only *approved* charges count (an abandoned or cancelled
  checkout doesn't burn a use — and can be retried immediately, no cooldown)
- When editing: shows "Claimed N time(s)"

**Plan Availability card:**
- Applies To selector — All paid plans / Specific plans only / Specific stores only (never both)
- Static note: *"The Free plan never accepts a coupon."*
- If plan-scoped: clickable plan tiles with checkboxes, highlighted when selected
- If store-scoped: scrollable checklist of installed stores, footer shows "N of M stores selected"

**Client-side validation**: only checks the code isn't blank before submit — every other rule
(percent range, duration, code format, uniqueness) is enforced server-side and surfaced back as
an error banner if rejected.

### Usage view
- Header shows the coupon code if filtered to one (via a row's "Usage" button)
- Info banner explaining exactly what each KPI means (verbatim, matches §5's semantics) —
  emphasizes figures match the real Shopify invoice since they're the same calculation used to
  bill the store
- 5 KPI cards: Claims, Stores, Active discounts, Discount/month, Committed discount
- Filters: From/To date, Coupon dropdown, Status dropdown (All/Pending/Approved/Declined/
  Cancelled/Expired), free-text Search, "Export CSV" button
- Table: Claimed date, Coupon, Store, Plan, Cycle, Price, Saving, Cycles, Total, Full Price From,
  Status (color-coded badge — Approved=success, Pending=attention, Declined/Cancelled=critical)
- No server-side pagination — all matching rows load at once; footer shows total count

---

## 7. Every Edge Case, In One List

- 100%-off coupons: blocked both client-side (`max=99` input) and server-side (`<= 99`
  validation) — a $0 subscription is rejected by Shopify itself.
- Invalid/expired/exhausted coupon code at actual checkout: **silently ignored**, full price
  charged, no error shown to the merchant — the preview endpoint is the only place that surfaces
  validation errors.
- Deleting a coupon with existing claims: succeeds, claim history is fully preserved via
  snapshotted `couponCode`/`couponDurationMonths` fields, `couponId` nulls out.
- Deactivating (not deleting) a coupon: stops new claims only; already-discounted subscriptions
  are completely unaffected (Shopify owns that clock independently).
- Reaching `totalUses` or `usesPerStore`: same — stops new claims, never retroactive.
- An abandoned Shopify approval screen (closed tab, hit back — no explicit Decline click): the
  `CouponClaim` row (if one was even created — it's only created *after* Shopify accepts the
  subscription and hands off to the approval screen) stays `PENDING` forever; Shopify itself
  reports it as `PENDING` indefinitely too, with no webhook, so there's no way to resolve it to a
  terminal status. This is fine — `PENDING` never counts toward any limit, so the merchant can
  retry the same code immediately, with no cooldown.
- An *explicitly declined or cancelled* Shopify approval screen: resolves to `DECLINED`/
  `CANCELLED` (a real terminal status, not `PENDING`) the next time the merchant's billing/plans
  page loads, via `reconcilePendingCouponClaims` — no webhook needed for this case, since it's
  resolved by directly querying Shopify's own reported subscription status.
- Editing an already-claimed coupon's discount value/duration: has **no effect** on merchants who
  already claimed it — Shopify locked their discount in at subscription-creation time. Only
  future claims see the new values.
- Coupon scoped to `SPECIFIC_PLANS` or `SPECIFIC_STORES`: mutually exclusive — a coupon can
  restrict by plan or by store, never both simultaneously.
- Free plan: never accepts a coupon, by design (there's no charge to discount).
- Fixed-amount coupon larger than (or equal to) a plan's price: blocked at all three layers —
  admin can't save it in the first place (§4, names the offending plan(s) and their prices),
  a merchant who somehow has the code anyway has it silently ignored at real checkout (§2 rule
  9, §3 rule 4) with full price charged, and the plans page's instant client-side preview shows
  the real full price rather than a misleading near-$0 discounted price (§5.5). Percentage
  coupons can never hit any of these three — already capped at 99% everywhere they're validated.
- A fixed-amount coupon valid for one plan but too large for another it's *also* scoped to (e.g.
  `SPECIFIC_PLANS` covering both Starter and Pro, with an amount between the two prices): admin
  save is still rejected — the save-time check requires the amount to be smaller than **every**
  applicable plan's price, not just at least one.
