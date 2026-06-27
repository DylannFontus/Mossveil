// generated from data/tutorial.json - do not edit by hand (use the editor)
window.G = window.G || {};
G.TUTORIAL_DATA = {
 "enabled": true,
 "hints": [
  {
   "id": "move",
   "trigger": {
    "type": "roomEnter"
   },
   "text": "Arrows or WASD to move · Space to jump",
   "place": "bottom",
   "secs": 4.5
  },
  {
   "id": "attack",
   "trigger": {
    "type": "enemyNear",
    "dist": 9
   },
   "text": "Press Z or J to strike with your nail",
   "place": "bottom",
   "secs": 4
  },
  {
   "id": "lever",
   "trigger": {
    "type": "propNear",
    "prop": "lever",
    "dist": 2.5
   },
   "text": "Press E or ↑ to pull a lever",
   "place": "bottom",
   "secs": 4
  },
  {
   "id": "bench",
   "trigger": {
    "type": "propNear",
    "prop": "bench",
    "dist": 2.5
   },
   "text": "Rest at a bench to save and refill",
   "place": "bottom",
   "secs": 4
  },
  {
   "id": "spellwell",
   "trigger": {
    "type": "propNear",
    "prop": "spellwell",
    "dist": 2.5
   },
   "text": "Commune at a soul well to learn spells",
   "place": "bottom",
   "secs": 4
  },
  {
   "id": "lowHp",
   "trigger": {
    "type": "hpBelow",
    "n": 2
   },
   "text": "Hold the focus key to mend with soul",
   "place": "bottom",
   "secs": 4
  },
  {
   "id": "wings",
   "trigger": {
    "type": "abilityGained",
    "ability": "wings"
   },
   "text": "Wings gained — press jump again to flutter",
   "place": "center",
   "secs": 4
  }
 ]
};
