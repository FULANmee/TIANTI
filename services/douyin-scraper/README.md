# TIANTI Douyin Scraper

Internal TIANTI 5.0 Vercel Service for public Douyin profile metadata. It is deployed from the same Git-connected Vercel project as the Next.js application; do not create a second Vercel project for it.

It wraps the Apache-2.0 project [Johnserf-Seed/f2](https://github.com/Johnserf-Seed/f2) at commit `7dab3e2ffffaa2535834d28fca99dbc2e89fa9d3` and exposes only the profile fields required by TIANTI.

Required environment:

```env
SCRAPER_SHARED_SECRET=
```

Optional environment:

```env
DOUYIN_COOKIE=
DOUYIN_ENABLE_BROWSER_LINKS=false
DOUYIN_REQUEST_TIMEOUT_SECONDS=12
DOUYIN_BROWSER_TIMEOUT_SECONDS=20
```

Run locally:

```bash
uv sync
uv run uvicorn app.main:app --reload
uv run pytest
```

The only Vercel configuration is the repository-root `vercel.json`. Its `douyin_scraper` service points to `main.py`, and Vercel discovers this directory's `pyproject.toml` before importing the exported FastAPI `app`. Vercel automatically mounts the service at `/_internal/douyin-scraper`, so the FastAPI route declarations intentionally omit that deployment prefix.

The service requires Python 3.12. The f2 probe evidence remains valid from Python 3.11 because upstream supports Python 3.10+, but Vercel's current Services runtime helper requires 3.12.

For a combined local run, use a current Vercel CLI with `vercel dev -L`. Alternatively, run Uvicorn as above and set the website's `DOUYIN_SCRAPER_URL_OVERRIDE=http://127.0.0.1:8000`. Plain HTTP overrides are accepted only for loopback development; external adapters and every deployed request must use HTTPS.

Cookie values, bearer secrets, signed upstream URLs and raw upstream responses must not be logged or returned.

Before enabling `DOUYIN_ENABLE_BROWSER_LINKS` in Preview or Production, validate both Chromium availability in the Vercel Python runtime and the rendered-link adapter against a public main profile whose signature actually contains a clickable `@account`. The Python Playwright package does not itself prove that a compatible Chromium binary and system libraries are present. This is a deployment acceptance gate, not a completed live validation. If a browser cannot launch or an authoritative Douyin target URL cannot be recovered, the service returns `linkSource=unavailable`; it never constructs a target from the nickname.
