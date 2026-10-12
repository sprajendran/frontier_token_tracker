# Frontier Token Tracker usage and troubleshooting

The extension tracks requests observed in supported browser tabs. It provides local token totals and text estimates, rather than provider account-wide billing or subscription usage.

## Install and read the counts

Run `python build.py`. At `chrome://extensions`, enable Developer mode and load `dist/frontier-token-tracker/` as an unpacked extension. To upgrade, rebuild, reload the existing extension, and refresh AI chat tabs. Keeping the same installation preserves its local history.

The popup and side panel sum all providers over the rolling last 24 hours. Model rows show input and output separately. The floating page badge shows the latest observed request on that page, so it can differ from popup totals. The dashboard supports longer rolling ranges and model/source filters.

| Quality | Meaning |
| --- | --- |
| Reported | The response supplied a recognized usage field |
| Estimated | Captured text was measured using rounded-up UTF-8 byte length divided by four |
| Manual | A count was entered manually |
| Unavailable | The direction has no known count |

Estimated input covers extracted request text and can omit conversation context, hidden system prompts, and attachments. Estimated output covers recognized text and can include captured reasoning. It is not a tokenizer-accurate measurement. Totals combine known reported, estimated, and manual counts; missing directions are excluded. A reported zero is different from an unavailable count.

## DeepSeek behavior

Consumer DeepSeek capture matches POST requests to `/api/v0/chat/completion` and `/api/v0/chat/continue`. Settings, session creation, and proof-of-work responses are not generation responses.

The adapter reads fragment snapshots and compact `p`/`o`/`v` patches. Recognized THINK, RESPONSE, and TEMPLATE_RESPONSE text contributes to estimates; status strings and tool metadata do not. Blank model names retain `DeepSeek (unspecified)` so that record validation can accept output updates.

When a response supplies recognized explicit usage, `usage.prompt_tokens` becomes reported input and `usage.completion_tokens` becomes reported output. These values override text estimates. For example, a usage object with prompt tokens 11 and completion tokens 886 produces reported counts of 11 and 886. The supplied consumer stream had no such object. Its `accumulated_token_usage` field is not interpreted as output usage because its input/output scope is not established by that payload.

The extension observes existing requests and does not add `stream_options` to their bodies. Usage options for an OpenAI-compatible API should not be assumed to apply to the website's private consumer endpoint.

## Diagnose missing or zero output

1. Confirm the installed version at `chrome://extensions`, reload it, and refresh the provider tab.
2. Confirm tracking is enabled in Settings and send a new prompt after the page loads.
3. Read the floating badge's count, quality, and status. Unavailable means a count was not captured; estimated means recognized text was captured.
4. In DevTools Network, filter for `completion`, select the generation request, and inspect Response or EventStream. DeepSeek settings responses containing `model_configs` are not the completion stream.
5. Save a sanitized sample of the initial snapshot, text deltas, and final usage/status frames. Include the request pathname, response content type, badge text, and extension version when reporting a failure. Omit cookies, authorization headers, and private message text.

In version 2.0.9, a blank DeepSeek stream model no longer causes output snapshots to fail validation. Earlier rejected updates cannot be recovered automatically from stored history. Send a new prompt after upgrading to verify the current capture path.

## Data and pricing

Export history from the dashboard before clearing data or removing the extension. Import accepts exported records, and manual entry covers usage outside browser observation. Test profiles under `test-artifacts/` contain test browser state; they are not the installed extension's production usage database.

Pricing requires exact provider/model names, an effective date, and USD rates per million tokens. Displayed costs are hypothetical API equivalents. Missing counts, unmatched rates, or nonzero specialized cache/reasoning categories can leave costs unavailable.
