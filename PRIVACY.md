# Frontier Token Tracker Privacy Policy

Effective date: October 11, 2026

Frontier Token Tracker processes activity on supported AI chat websites to display input and output token usage. Processing and storage take place locally in your browser. The extension does not send your chat content or usage records to the developer or an extension-operated server.

## Information processed

When tracking is enabled, the extension observes matching generation requests and responses on supported websites. It temporarily processes submitted prompt text, recognized response text, model information, and available token usage metadata to calculate counts. For consumer Gemini and Grok, it reads submitted prompts and rendered response text from the page. This content can include personal or sensitive information you enter into those websites.

The extension uses request URLs to identify generation endpoints and response content types to select a parser. It does not persist full request URLs, prompt text, response text, request headers, API keys, or authentication credentials.

Supported websites are ChatGPT, Claude, Gemini, Google AI Studio, Grok, Perplexity, DeepSeek, Mistral Chat, and OpenRouter, as specified by the extension's content script matching rules. It does not collect general browsing history across other websites.

## Information stored locally

Usage records contain input and output token counts, count quality labels, model and provider names, timestamps, request status, local record identifiers, update sequences, capture transport, adapter version, and available cache or reasoning token categories. Observed records also include the supported website hostname and browser tab/frame identifiers.

Tracking and overlay preferences, optional pricing settings, and migration status are stored in Chrome's local extension storage. Usage records are stored in local IndexedDB. Manually entered or imported usage records are also retained locally.

## Purpose and sharing

This information is used to display token summaries, charts, model comparisons, request diagnostics, and optional hypothetical API cost estimates. It also supports export and import of usage history.

The extension does not sell user data, use it for advertising, or send it to analytics services. It does not share stored records with the developer or third parties. If you export records, the extension creates a JSON file that you control; any subsequent sharing of that file is your choice.

The AI websites continue to process requests you send through their own services under their respective privacy policies. The extension observes those existing interactions and does not send additional chat requests to those services for tracking.

## Permissions

- Website access allows the extension to observe supported chat interactions and display an optional usage badge.
- Storage saves local settings and supports legacy record migration.
- Unlimited storage supports retention of local usage history and imported records.
- Side panel displays usage summaries alongside your browser tab.
- Alarms refresh the toolbar badge as records move out of its rolling 24-hour window.

## Retention and controls

Records remain locally stored until you delete them; the extension does not automatically expire usage history. You can pause tracking in Settings or the dashboard. The updated tracking setting reaches open provider tabs within approximately five seconds. Pausing does not delete records already saved.

Use Delete local history in the dashboard to remove stored usage records. Settings remain until separately changed or the extension is removed. You can export records before deleting them. Removing the extension removes its browser-managed local data; exported files remain wherever you saved them and must be deleted separately.

## Security and limitations

The extension validates record formats and message senders and limits capture update rates. Its records are browser observations and may be incomplete or approximate. Local storage is not a separate encrypted vault; protect access to your device and browser profile. Supported websites can affect page-level capture, so the extension cannot guarantee the authenticity or completeness of observed counts.

## Changes and questions

This policy will be updated when the extension's data practices change. The effective date identifies the current policy. For privacy questions, use the developer contact information provided in the extension's Chrome Web Store listing.
