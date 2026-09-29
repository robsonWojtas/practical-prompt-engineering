# Practical Prompt Engineering Course Repository

Repo for learning prompt coding, focused on the quality of prompting, not the code. The main objective is to build a simple app (prompt library). The repo follows Practical Prompt Engineering Course from Frontend Masters.

[Course's docs](https://sgoldfarb2.github.io/practical-prompt-engineering)

Open `index.html` in a browser to use the library. Enter a model name when saving
a prompt and select the code checkbox to apply the 1.3 token multiplier.
Cards show metadata in local time, with the exact ISO timestamp available on hover,
and sort by creation date, newest first. Ratings and note changes update `updatedAt`.

`metadata.js` exposes `trackModel(modelName, content)`,
`updateTimestamps(metadata)`, and `estimateTokens(text, isCode = false)`.
These functions throw descriptive errors for invalid inputs; UI operations catch
errors and display them without committing unsuccessful saves.

Token estimates use whitespace-separated words and JavaScript string length for
characters. Calculations retain fractional values. Confidence uses the larger of
the two estimates: below 1000 is high, 1000–5000 inclusive is medium, and above
5000 is low. The requested formulas can produce `min > max` for short words, so
the card labels each value separately instead of presenting an ordered range.

Existing prompts without metadata receive “Unknown model” and the time metadata
was first added for both timestamps; their original creation time is unavailable.
Migration is persisted so timestamps remain stable on reload.

Run the dependency-free validation and UI logic tests with:

```sh
node --test tests/metadata.test.cjs
```
