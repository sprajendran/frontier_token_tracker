# Frontier Token Tracker development guide

Frontier Token Tracker is a Chrome Manifest V3 extension. Production files stay at the project root so Chrome can load the folder directly. Python scripts run browser validation and package the extension without third-party Python dependencies.

## Source layout

| Files | Responsibility |
| --- | --- |
| `manifest.json` | Permissions, supported websites, script injection, and extension version |
| `capture.js` | Observes fetch, XHR, and EventSource responses in the page world |
| `adapters.js` | Matches generation requests, parses provider payloads, and produces usage snapshots |
| `gemini-dom.js`, `grok-dom.js` | Estimate submitted prompts and visible responses for consumer Gemini and Grok |
| `bridge.js` | Validates page messages, forwards records to the worker, and renders the floating badge |
| `schema.js` | Normalizes and validates counts, identities, quality, and lifecycle fields |
| `background.js`, `database.js` | Validate senders, store records in IndexedDB, migrate legacy data, and notify views |
| `analytics.js`, `pricing.js` | Aggregate known counts and calculate configured hypothetical API costs |
| `client.js` | Wraps extension messaging for the UI |
| `popup.*`, `compact.css` | Popup and side panel |
| `dashboard.*`, `options.*` | Analytics dashboard and settings |
| `tests.js`, `tests.html`, `validate.py` | Browser fixtures, regression tests, and test runner |
| `build.py` | Packages an explicit allowlist into `frontier-token-tracker.zip` |
| `docs/` | Project guides |
| `test-artifacts/` | Generated reports and Chrome test profiles |

## Record flow

Network observers run in the MAIN world. DOM trackers and the bridge run in the isolated extension world. The capture layer sends snapshots using the `frontier-tokens-v2` window message channel. The bridge validates each snapshot and submits it through extension messaging. The service worker validates the sender, attaches trusted site and tab information, and writes the record to IndexedDB.

Each observed request has a stable ID and increasing sequence. A newer snapshot replaces the prior snapshot for that ID; it is not an additional request. IndexedDB ignores stale sequences and prevents a terminal record from regressing to an active status. UI views refresh when the worker sends a `changed` notification.

Records contain model, provider, timestamp, input/output counts, independent quality labels, lifecycle status, sequence, transport, adapter version, and optional cache/reasoning categories. Missing counts are `null`. Production storage retains counts and metadata rather than prompts or response text.

## Run validation

On Windows, install Python and Chrome at the standard `%PROGRAMFILES%\Google\Chrome\Application\chrome.exe` location, then run from the project folder:

```powershell
python validate.py
```

The runner starts a localhost fixture server and a dedicated headless Chrome process, compiles production JavaScript, runs the browser tests with real IndexedDB, and checks dashboard, popup, and options rendering. It closes that test browser after the run. It does not validate an authenticated live provider session.

The HTML regression report is `test-artifacts/test-results.html`. Each run creates a unique directory under `test-artifacts/chrome-profiles/`. Profiles are retained to aid debugging and can contain browser caches and test state. They are separate from your regular Chrome profile. Close any browser using a test profile before moving or manually removing it.

Legacy `test-profile*` directories have been moved from the project root into that same profiles folder. Source fixtures remain at the root so their relative script URLs and the validator's fixture endpoints continue to work.

## Build and install

```powershell
python build.py
```

The build checks referenced assets and ZIP integrity. The resulting `frontier-token-tracker.zip` contains the runtime files, README, and guides. Profiles, test reports, and test runner code are excluded by the explicit allowlist.

Load this project folder using Developer mode and Load unpacked at `chrome://extensions`. After editing runtime files, reload the extension and refresh provider tabs. Update `manifest.json` when preparing a new version and rebuild the ZIP.

## Add a provider fix

Use a sanitized generation response to reproduce the failure. Add a regression fixture in `tests.js` that checks both counts and `TokenSchema.validate(TokenSchema.normalize(snapshot))`; parsing text alone does not guarantee that the bridge can save the record. For transport failures, exercise the production wrapper as well.

Keep cumulative usage as replacement values. Exclude history, setup, status, and tool metadata from generation counts. Run validation and build after changing the adapter or manifest. Document whether a new count is reported or estimated and any live verification still needed.
