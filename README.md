# Practical Prompt Engineering Course Repository

Repo for learning prompt coding, focused on the quality of prompting, not the code. The main objective is to build a simple app (prompt library). The repo follows Practical Prompt Engineering Course from Frontend Masters.

[Course's docs](https://sgoldfarb2.github.io/practical-prompt-engineering)

Open `index.html` in a browser to use the library. Enter a model name when saving
a prompt and select the code checkbox to apply the 1.3 token multiplier.
Cards show metadata in local time, with the exact ISO timestamp available on hover,
and sort by creation date, newest first. Ratings and note changes update `updatedAt`.

`script.js` contains `trackModel(modelName, content)`,
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
node --test tests/*.test.cjs
```

## Export and import

Use **Export JSON** to download all prompts directly from localStorage, including
full content, IDs, ratings (0 means unrated), notes with their IDs, code flags,
model names, creation/update timestamps, and token estimates. Additional fields
are preserved. The timestamped file follows the [export JSON schema](#export-json-schema):

```json
{
  "version": 1,
  "exportedAt": "2026-09-29T10:00:00.000Z",
  "statistics": {
    "totalPrompts": 0,
    "averageRating": null,
    "mostUsedModel": null
  },
  "prompts": []
}
```

Average rating excludes unrated prompts and is rounded to two decimal places;
it is `null` when no prompts are rated. Most used model counts saved prompts,
uses alphabetical (case-sensitive code-unit) order to break ties, and is `null`
for an empty library. Older prompts may omit `isCode`. Validation also checks
unique prompt IDs, unique note IDs within each prompt, timestamp ordering, token
confidence, and recomputed statistics beyond the structural JSON schema checks.
Unsupported versions and invalid data are rejected without changing the library.

Use **Import JSON**, choose **Merge** or **Replace**, review the data, then confirm.
For each shared ID, expand the existing/imported versions and choose to keep the
existing prompt (default), use the imported prompt, or keep both with a new ID.
Duplicate IDs within the uploaded file are rejected as ambiguous. Merge preserves
existing prompts absent from the file. Replace replaces the whole library, even
with an empty file. Cancel and Escape leave the library unchanged.

Before import, the exact original localStorage value is backed up under
`prompt-library-import-backup` and verified. If backing up fails (for example,
quota exhaustion), import stops. Save or rendering failures restore the original
storage and UI; rollback failures explicitly direct you to download the backup.
Edits made while the import dialog is open cause the import to abort. localStorage
has no cross-tab transaction primitive, so avoid simultaneous writes in other tabs.

**Download last backup** downloads a valid previous library as an importable
export; import it with Replace to restore it. Each import backup replaces the
previous backup. If the original data was corrupt, it is downloaded as a raw
recovery envelope containing `backedUpAt` and the exact `raw` storage string;
repair that data before importing. Invalid existing data disables merge but can
be replaced after backing up. Backups share the browser's storage quota.

Run export/import validation and recovery tests with:

```sh
node --test tests/*.test.cjs
```

## Project layout

All application JavaScript lives in `script.js`, all styles in `styles.css`,
and the page markup in `index.html`. Tests and their browser mock live in `tests/`.
The app requires no build step or dependencies.

## Export JSON schema

This schema documents the export format; validation runs in `script.js`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Prompt Library Export v1",
  "type": "object",
  "required": [
    "version",
    "exportedAt",
    "statistics",
    "prompts"
  ],
  "properties": {
    "version": {
      "const": 1
    },
    "exportedAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$"
    },
    "statistics": {
      "type": "object",
      "required": [
        "totalPrompts",
        "averageRating",
        "mostUsedModel"
      ],
      "properties": {
        "totalPrompts": {
          "type": "integer",
          "minimum": 0
        },
        "averageRating": {
          "type": [
            "number",
            "null"
          ],
          "minimum": 1,
          "maximum": 5
        },
        "mostUsedModel": {
          "type": [
            "string",
            "null"
          ]
        }
      }
    },
    "prompts": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "title",
          "content",
          "rating",
          "notes",
          "metadata"
        ],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "\\S"
          },
          "title": {
            "type": "string",
            "pattern": "\\S"
          },
          "content": {
            "type": "string",
            "pattern": "\\S"
          },
          "rating": {
            "type": "integer",
            "minimum": 0,
            "maximum": 5
          },
          "notes": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "id",
                "content"
              ],
              "properties": {
                "id": {
                  "type": "string",
                  "pattern": "\\S"
                },
                "content": {
                  "type": "string",
                  "pattern": "\\S"
                }
              }
            }
          },
          "metadata": {
            "type": "object",
            "required": [
              "model",
              "createdAt",
              "updatedAt",
              "tokenEstimate"
            ],
            "properties": {
              "model": {
                "type": "string",
                "pattern": "\\S",
                "maxLength": 100
              },
              "createdAt": {
                "type": "string",
                "format": "date-time",
                "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$"
              },
              "updatedAt": {
                "type": "string",
                "format": "date-time",
                "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$"
              },
              "tokenEstimate": {
                "type": "object",
                "required": [
                  "min",
                  "max",
                  "confidence"
                ],
                "properties": {
                  "min": {
                    "type": "number",
                    "minimum": 0
                  },
                  "max": {
                    "type": "number",
                    "minimum": 0
                  },
                  "confidence": {
                    "enum": [
                      "high",
                      "medium",
                      "low"
                    ]
                  }
                }
              }
            }
          },
          "isCode": {
            "type": "boolean"
          }
        }
      }
    }
  }
}
```
