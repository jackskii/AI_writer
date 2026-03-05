# Game-y CYOA: Full Plan (for later)

*Saved for reference. Build the core first — AI roleplay with predetermined background.*

---

## Current state

- **CYOA today**: A modal in the editor where the user types an action and the AI returns narrative (second-person). No game state, events, or characters.
- **Works**: Already have `work_type: 'novel' | 'interactive_novel'`.

## Design decisions (confirmed)

| Area                    | Choice                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Scope                   | One game per **interactive_novel** Work (rules, characters, events, play state belong to that work).                             |
| Time                    | **Calendar with weekday** (e.g. Day 5 = Monday) so event conditions can use `day != Saturday, Sunday`.                               |
| Outcome & state updates | **AI returns structured JSON** (outcome key + state deltas); JSON prefills a **frontend approval box**; user edits and confirms. |
| Conversation freedom    | **Free** — user can derail; outcome can be fail/other.                                                                           |
| Play UI                 | **One dedicated "game" chapter**: opening it shows current board state + conversation; content updates as you play.              |

---

## Part 1: Rules (own page)

- **Characters**: Basic (age, appearance, backstory), relations (to user/other), history, stats (flexible key-value).
- **Time**: Calendar with weekday; conditions can use weekday.
- **Events**: Condition (event keys, character state, time), information (characters, setting), goal, outcome keys + optional payload.

**Storage**: GameCharacter, GameEvent, GameState (singleton per work), Chapter.is_game_chapter.

---

## Part 2: Setting up the board

- Load board → show time, character state, eligible events.
- If pending outcome/state: show approval form (JSON prefill) → user confirms → apply.
- User: "Next day" (random eligible or default event) or "Start chosen event" → Part 3.

---

## Part 3: Editor (game board)

- Game chapter: show time, event intro, characters + state.
- LLM: scene intro + multi-turn conversation (free).
- User clicks "Finished" → LLM returns JSON (summary, outcome_key, payload, state_updates) → prefill approval → user confirms → update state, advance time, back to board.

---

## Data flow

Rules → Board (load state, approve pending, choose next day or event) → Game chapter (intro, conversation, Finished → JSON → approve) → back to Board.

---

## Implementation outline

- **Backend**: GameCharacter, GameEvent, GameState models; CRUD; condition evaluation; AI endpoint for outcome JSON. Chapter.is_game_chapter.
- **Frontend**: Rules page; board step (in game chapter); game chapter editor with conversation + "Finished" + approval form.

---

## Open details

- Required vs optional characters in events.
- Default event when none eligible.
- Event key format: event_id + outcome_key.
- Where AI runs for JSON: backend recommended.
