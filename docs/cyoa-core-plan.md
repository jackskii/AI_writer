# CYOA Core Plan — AI Roleplay with Predetermined Background

Minimal first step. Full game-y system is in `game-y-cyoa-plan.md` for later.

---

## Decisions

1. **Separate models (not lore)**  
   Do not change `LoreEntry` for other novel types. Characters and events are **separate models** under the work, so we can extend them (e.g. keys, conditions) without touching lore.

2. **Naming**  
   Don’t treat the whole thing as “characters” only — we have both **characters** and **events** as first-class game entities, with room for more customization (keys, conditions) later.

3. **Chapter = one play session**  
   Each **chapter** is one play session: when you create a chapter you pick an event + character states; opening that chapter starts CYOA with that background. The chapter stores the conversation/log for that session.

---

## Data (backend)

- **Event** (new model, scoped to Work)  
  - Name, setting description, goal (for LLM).  
  - Later: keys, conditions (not in v1).

- **Character** (new model, scoped to Work)  
  - Basic: name, age, appearance, backstory (or similar).  
  - **State definitions**: each state has a name (e.g. “Affection level”) and a list of **stages** (e.g. “0/5 – she just knows the user”). One default stage, editable; can add more stages.  
  - Later: more customization (keys, conditions) if needed.

- **Chapter**  
  - Add a field (e.g. `cyoa_session` or `game_session`, JSON) only used when the work is interactive_novel:  
    - `event_id`  
    - `character_states`: list of `{ character_id, states: { "<state_name>": "<stage_label or id>" } }`  
  - When this is set, opening the chapter = CYOA with that event + those character states as predetermined background.

Models can be named e.g. `GameEvent` and `GameCharacter` (or `InteractiveEvent` / `InteractiveCharacter`) to keep the “game” layer clear and leave room for event keys/conditions and character extensions later.

---

## UI (frontend)

1. **Events**  
   For interactive_novel works, somewhere in the work UI (e.g. lore tab or a “Game” / “Events” section): list events, create/edit event (name, setting, goal). No keys/conditions in v1.

2. **Characters**  
   Same area: list “game characters”, create/edit character. In the character form: basic info + **character states** — add state (name), one default stage (editable), “Add new stage” for more. No keys/conditions in v1.

3. **Chapter creation**  
   When creating a chapter for an interactive_novel work: after picking act/title (or in a dedicated step), **select one event** and **add characters** with **stage chosen per state** (e.g. Tia, Affection = “2/5”). Save as `cyoa_session` on the chapter.

4. **Editor (CYOA)**  
   When opening a chapter that has `cyoa_session`: load event + character states, show CYOA UI (conversation with predetermined background: event setting/goal + character info and current stages). Conversation/log is the chapter content (or stored for that chapter).

---

## Out of scope for core (v1)

- Conditions, event keys, time, board, approval JSON, state updates after play.  
- Linking game characters/events to lore entries (optional later).

---

## Implementation order (suggested)

1. Backend: `GameEvent` and `GameCharacter` models (+ migrations, serializers, CRUD API).  
2. Backend: add `cyoa_session` (or equivalent) to Chapter; API to get/update it when creating or editing a chapter.  
3. Frontend: Events list + create/edit (only for interactive_novel).  
4. Frontend: Characters list + create/edit with state/stages (only for interactive_novel).  
5. Frontend: chapter creation flow — for interactive_novel, add event + character-state selection and save to `cyoa_session`.  
6. Frontend + AI: when opening a chapter with `cyoa_session`, run CYOA mode with event + character states as context (intro + conversation); persist conversation in chapter.

This gives you the core: predetermined background (event + character states) per chapter, no lore changes, and room to add keys/conditions later.
