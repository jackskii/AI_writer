I tested the cyoa mode for a bit and honestly not impressed. I intend something much greater, much more “game-y”. The main idea is that each conversation happen with a predetermined time, character, character state, and topic. After the conversation is done, update character state and topic state, then update time and start a next conversation.

we need to tackle this in three parts rules, setting up, editor

rules – creating events, character, time, character state
has it’s own page
character basic: age and appearance and backstory – can be updated as sotry goes on
character relation: a set of relationship to the user or other charcter. Can be either determined or ai gerneated.
Chracter history: a list, updated to reflect what happened in the story
other stats…

events:
open an event box
condition: character status, time, if antoher event is has certain result
information: which characters are in, describe the setting of event.
Goal: what are the possible outcomes for the event
e.g.:
event: learn about Tia’s secret
condifiton: 
the event key “field trip with Tia - scucess”, “good riddance - Tia”
character Tia “relationship” > 3, “alignment” > 0
day != Saturday, Sunday


background infromation: After class, Tia called you and lead you to a back ally with no one else. She’s worried and appear to want to say something 
Goal: Tia will tell user about her father’s desend into darkness and ask the user to help with it someway
possible outcome key:
1. success – with a line about how the user is going to help
2. fail
with success, the line how the user is going to help will be passed to the next event


setting up the board – decide current state and what to update
not really a page, but  want some sort of human intervenetion
then user can either go to the next day or begin an chosen event (only show events that are possible though)
if user go to next day, randomly choose an event that has satisfied ondition.if no event appear, choose a default event with certain decided random

when the user finish it should
generate a summary of the event. And figure out if character state is update and which outcome of a event occured
show all update on a sub page for the user to approve or edit

editor (game board) – the actual game
this is the only part that require LLM. It should be straight forward, it will give time, event introduction, character and their state, and generate an introduction, converse with the user, and when user say finished, generate a summary.

A few details I thought of:
How summary is generated so the system can decide how to update state?
When declaring 

How should different type of event work (like a event can have required character state and optional character). But right now let’s make sure the basic framework work.

How much freedom should be there?
Too little and it feel like a traditional game and not fun
Too much and I just feel like an AI roleplay
there has to be a balance.

think of this as a whole game. Ask me as many question and clarification as you possbliy can I need this to me thought out in detail