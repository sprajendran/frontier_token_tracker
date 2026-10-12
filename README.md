# Frontier Token Tracker v2

Local Chrome extension for observed AI input/output tokens, model totals, rolling date ranges, hourly/daily/weekly/monthly charts, manual records, and JSON export/import.

## Project documentation

- [Privacy policy](PRIVACY.md): data processing, local storage, permissions, and deletion controls.
- [Development guide](docs/development.md): source layout, record flow, validation, build, and test artifacts.
- [Usage and troubleshooting](docs/usage.md): preview totals, token accuracy, DeepSeek capture, and diagnosing missing counts.

## Install or upgrade

1. Run `python build.py`. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked** for `dist/frontier-token-tracker/`. Chrome 116+ is required. This folder excludes Python caches and test artifacts.
2. For an existing installation, click **Reload** on the same extension. Do not remove/reinstall it if you want to retain history.
3. Refresh AI chat tabs. Click the extension icon for the popup, then open the dashboard, side panel, or settings.

Existing v1 `chrome.storage.local` records migrate transactionally to IndexedDB. The old key is removed only after successful import. Legacy records retain their old count/quality interpretation; missing values in those records cannot be recovered retrospectively.

## Architecture

```text
Supported website
  adapters.js + capture.js (MAIN)
    fetch / XMLHttpRequest / EventSource → provider parser
    started / streaming / completed / interrupted / failed snapshots
      ↓ window.postMessage (untrusted page boundary)
  schema.js + bridge.js (ISOLATED)
    validation, bounded retries, rate limits, Shadow DOM badge
      ↓ chrome.runtime.sendMessage
  background.js (MV3 service worker)
    sender checks, canonical schema, trusted site metadata, lifecycle upserts
    migration, dated pricing calculations on reads, toolbar badge, alarm
      ↓ database.js
  IndexedDB: records keyed by ID; timestamp/model/provider indexes
      ↑ service-worker commands only
  dashboard / popup / side panel / options
```

Native IndexedDB provides transactions and indexes without adding Dexie or a build dependency. The service worker owns all database writes. Settings alone use `chrome.storage.local`, restricted to trusted extension contexts. Badges refresh on writes and a five-minute alarm. Export is user-triggered; no scheduled remote export or analytics exists.

### Capture and provider adapters

Scripts run on ChatGPT, Claude, Gemini, Google AI Studio, Grok, Perplexity, DeepSeek, Mistral Chat, and OpenRouter. Domain injection is not verified website support: these sites may use undocumented protocols the adapters cannot interpret.

Version 2.0.1 adds compact ChatGPT `p`/`o`/`v` patches and model-slug metadata. Gemini **consumer chat** (`gemini.google.com`) now uses `gemini-dom.js` in the isolated world: a submitted prompt starts one record and visible `model-response` text updates its output estimate. Existing history is ignored until submission. Consumer Gemini network capture is disabled to prevent duplicate counts and avoid treating unrelated private RPCs as generation. Input/output are estimates of visible text only; selected UI modes such as Thinking are labels, not verified backend model IDs. If no label can be read, the model is explicitly unspecified. DOM selectors and English send-button labels may need updates for site changes or other languages. Idle completion is heuristic; late text updates the same record. Navigating to another conversation stops tracking that turn. Google AI Studio retains network capture, with model names also inferred from `models/...:generateContent` URLs.

Adapters recognize OpenAI-compatible usage, Anthropic usage, Gemini metadata, several text deltas, and ChatGPT-style assistant snapshots. Cumulative usage replaces earlier values in the same request. Cache input and thought output are handled according to the recognized fields, and specialized categories are retained separately. SSE events are assembled across chunk boundaries and multiline data fields.

Version 2.0.2 recognizes Grok new-conversation and follow-up requests, its `message` prompt and `modelName`, and JSON-line response tokens and final model-response snapshots. DeepSeek consumer output supports fragment and legacy content patches, inherited paths, and APPEND/SET/BATCH operations. Visible THINK and answer fragments contribute to the output estimate; status strings and tool metadata do not. These consumer counts remain text estimates unless explicit input/output usage is supplied. DeepSeek's ambiguous `accumulated_token_usage` is not treated as a reported output count. Fixture validation covers these formats; live website verification is still required.

Version 2.0.3 switches `grok.com` consumer tracking to `grok-dom.js` in the isolated world. Submitted editor text and changed assistant response text are estimated independently of the site's private transport. Enter, labeled send buttons, and new user messages following editor input can start a turn. Loaded history and typing alone are ignored. Grok network capture is disabled to prevent duplicate records. Model identity is explicitly unspecified, completion is an idle heuristic, and late response updates retain the same record. Counts exclude unobserved context and non-text content. DOM selectors may need updates when Grok changes; fixtures cover submission and response updates, but live authenticated verification is still required.

Version 2.0.4 fixes additional DeepSeek output cases: legacy thinking/answer fields are combined, whole-fragment replacements are recognized, batch children without operations use SET rather than inheriting APPEND/BATCH, and cleared text clears a previous estimate. Explicit usage inside response envelopes and usage patches overrides estimates. Unicode and whitespace are preserved. The default remains UTF-8 bytes divided by four, including captured thinking and answer text, rather than a tokenizer-accurate or account-wide usage measurement.

Version 2.0.5 keeps Grok turns active through query/hash updates and first chat-ID assignment under `/c/` or `/chat/`. It also recognizes plain assistant message bubbles while excluding user bubbles and right-aligned user wrappers. Switching between existing conversation paths still stops tracking. Regression fixtures cover these routes and selectors; live authenticated verification remains outstanding.

Version 2.0.6 restricts DeepSeek consumer network matching to POST `/api/v0/chat/completion` and `/api/v0/chat/continue`. Proof-of-work challenge and session setup calls cannot generate empty token records or overwrite the last chat badge. Existing empty records are preserved; this change applies to newly observed requests. Endpoint and fetch-wrapper regression fixtures cover the exclusion.

Version 2.0.7 handles DeepSeek text arriving before a fragment exists, including empty initial fragment lists and pathless text. String and object-shaped text deltas are counted; inherited BATCH updates retain their parent path. Tool metadata remains excluded. Regression tests include DeepSeek output through the production fetch wrapper. Counts remain estimates unless explicit usage is reported; authenticated live verification remains outstanding.

Version 2.0.8 clarifies that popup and side-panel totals cover all providers over the last 24 hours. Model rows show input and output separately with provider names. Each direction shows how many counts are estimated or unavailable; a direction with no known counts displays Unavailable, while a reported zero remains zero. Older query responses cannot overwrite a newer preview refresh.

Version 2.0.9 fixes a failure reproduced from a live DeepSeek completion stream: its response snapshot sends an empty model string, which previously replaced the fallback model name and caused validation to reject output updates. Blank stream model names now retain the fallback identity. Regression tests cover record validation during streaming and the production fetch wrapper.

Fetch observation reads a cloned response, never an additional network request. XHR observes the existing response. EventSource observes the existing connection and selected named events; reconnects after terminal events create a new record. Unknown event names may be missed. Fetch/XHR request matching prefers generation-like POST endpoints; GET history is ignored. Endpoint matching remains heuristic.

Every request has a stable local capture ID and increasing sequence. IndexedDB transactions reject duplicate/out-of-order updates and lifecycle regression from terminal to active. IDs do not deduplicate independent retries or multiple genuinely separate requests. Updates are throttled to roughly one per second per request. Snapshots already saved survive interrupted streams, though tab closure before the next snapshot can lose recent usage.

### Accuracy and pricing

Input and output independently carry `reported`, `estimated`, `manual`, or `unavailable` quality. Unknown counts are `null`, not zero. Records with mixed quality use the dashboard's **Estimated / mixed** filter. Totals sum known counts only and explicitly disclose requests with missing directions.

Estimates use extracted text UTF-8 bytes divided by four. They exclude hidden prompts/context, images, audio, files, tools, and unavailable reasoning. They are not tokenizer-accurate. Missing metadata and unrecognized payloads are not evidence of zero usage.

Pricing is optional: configure exact provider/model names, effective dates, and USD input/output rates per million tokens in settings. The worker chooses the latest rate effective at the request timestamp. Costs are hypothetical API equivalents, not subscription bills or verified invoices. Missing counts, unmatched rates, or nonzero specialized cache/reasoning categories produce unavailable cost rather than applying an inappropriate generic rate. Changing rates recalculates derived costs; raw measurements remain unchanged.

### Privacy, security, and limitations

Only token records and settings are stored locally. Prompts, response text, request headers, API keys, and full request URLs are not persisted. Stream parsing has a 16-million-character observer limit. The in-page overlay uses Shadow DOM for style isolation, not security.

The page can forge messages and tamper with patched APIs. Origin checks, schema checks, trusted sender metadata, and per-frame rate limits reduce damage but cannot authenticate page-world data. Website scripts cannot request import/deletion/settings changes. Pause stops new observation once the setting reaches a tab, within five seconds; fetch observer branches are cancelled without cancelling the page's original request.

Worker traffic, WebSockets, uninstrumented frames, native applications, CLI/backend API calls, and account-wide usage are outside coverage. Capture begins after the settings handshake, so very early requests can be missed. No historical conversations are scraped. The chart currently shows only buckets with activity, with at most 60 visible buckets. Manual/import paths cover outside usage. No automatic retention deletion occurs.

## Validation

Run `python validate.py` with local Chrome installed. No third-party Python packages are needed. The runner uses a temporary localhost server, a dedicated Chrome profile, JavaScript compilation, real IndexedDB, local XHR/EventSource fixtures, and mocked extension messaging. Results are saved to `test-artifacts/test-results.html`. Profiles are retained under `test-artifacts/chrome-profiles/` for inspection. Test artifacts are ignored by git and excluded from the distribution ZIP.

Automated tests cover aggregation, null/quality validation, streamed counts, SSE framing, pricing, sequence ordering, persistence, migration, transport capture, and command access checks. Live consumer websites, the installed extension service-worker lifecycle, and actual side-panel gestures still need end-to-end testing in Chrome.

## References

- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [MV3 worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Side panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
