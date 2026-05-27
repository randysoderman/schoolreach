# Discovery: Urban Institute Education Data API

We discover schools by hitting the Urban Institute's free, unauthenticated
Education Data API. It wraps NCES data (CCD for K-12, IPEDS for colleges) in
a uniform paginated JSON shape.

- **Docs index**: https://educationdata.urban.org/documentation/index.html
- **Base URL**: `https://educationdata.urban.org/api/v1`

## Endpoints we use

### K-12 (CCD directory)

```
GET /schools/ccd/directory/{year}/?fips={fips}&school_level={1|2|3|4}&per_page=500
```

- `fips` — numeric state FIPS code (see `lib/states.ts`).
- `school_level` — comma-separated list of:
  - `1` = primary (we map to `elementary`)
  - `2` = middle
  - `3` = high
  - `4` = other / not classified (we map to `k12_combined`)
- Pagination via the `next` URL in the response. We follow it until null.
- Response fields we read: `ncessch`, `school_name`, `school_level`,
  `state_location`, `city_location`, `street_location`, `zip_location`,
  `lea_name` (district), `enrollment`. CCD does **not** include website URLs
  — Step 7's `find_website` step fills those in via Brave Search.

### Higher ed (IPEDS directory)

```
GET /college-university/ipeds/directory/{year}/?fips={fips}&per_page=500
```

- Response fields we read: `unitid`, `inst_name`, `state_abbr`, `city`,
  `address`, `zip`, `url_school` (website), `currently_active_ipeds`.
- We skip rows where `currently_active_ipeds == 0` (closed institutions).
- IPEDS has no clean college-vs-university split (Carnegie classifications
  are a mess), so the discover form lets the user tag rows as either
  `college` or `university`. They can be re-tagged on the school detail page.

## Year selection

We pin to **2022** by default (the most recent year that's reliably populated
across both CCD and IPEDS as of 2026). When more recent data lands, bump
`DEFAULT_YEAR` in `lib/discovery/urban.ts`.

## ID fields

- CCD rows are keyed on `ncessch` — a 12-digit string. Stored as `schools.nces_id` with `source = 'nces'`.
- IPEDS rows are keyed on `unitid` — a 6-digit number. Stored as `schools.nces_id` (as a string) with `source = 'ipeds'`. The numeric ranges don't collide with CCD strings, so `schools.nces_id` stays a single unique column.

## Rate limits

The API is generous and we paginate with `per_page=500` to keep request count
low. No keys, no auth. If we hit a 429 or 5xx, the discovery Inngest function
retries with backoff (see `inngest/discovery.ts`).
