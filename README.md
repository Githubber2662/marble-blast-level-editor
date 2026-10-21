# Marble Blast Platinum / PlatinumQuest Level Editor

A lightweight browser-based editor prototype for creating simple Marble Blast-style levels. It is intentionally focused on a clean editing workflow and JSON export/import so it can be extended into a deeper PlatinumQuest-inspired tool later.

## Features

- Grid-based level editing canvas
- Palette for placing terrain and gameplay objects
- Object selection and inspector controls
- JSON export/import for level data
- Simple in-browser preview mode with a rolling marble
- Structurally designed for future expansion toward MBP/PQ-specific objects and triggers

## Included objects

- Floor
- Wall
- Start pad
- Finish pad
- Hazard
- Boost pad
- Checkpoint

## Local development

From the project root:

```bash
python3 -m http.server 8080
```

Then open: http://localhost:8080

## Project layout

- `index.html` – main app shell
- `styles.css` – interface styling
- `app.js` – editor behavior, rendering, preview logic, and JSON support

## Notes

This is a prototype editor, not a full game-engine recreation. It provides a solid foundation for building a more complete Marble Blast Platinum / PlatinumQuest level editor in the browser.
