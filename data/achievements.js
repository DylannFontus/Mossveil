// generated from data/achievements.json - do not edit by hand (use the editor)
window.G = window.G || {};
G.ACHIEVEMENTS_DATA = {
 "list": [
  {
   "id": "firstBoss",
   "name": "First Felled",
   "desc": "Defeat your first boss.",
   "cond": {
    "type": "bossCount",
    "n": 1
   }
  },
  {
   "id": "charmHunter",
   "name": "Charm Hunter",
   "desc": "Own three charms.",
   "cond": {
    "type": "charmCount",
    "n": 3
   }
  },
  {
   "id": "attuned",
   "name": "Attuned",
   "desc": "Learn a bolt element.",
   "cond": {
    "type": "anySpell",
    "ids": [
     "ember",
     "frost",
     "gale"
    ]
   }
  },
  {
   "id": "glittering",
   "name": "Glittering",
   "desc": "Hold 500 Glimmer at once.",
   "cond": {
    "type": "glimmer",
    "n": 500
   }
  },
  {
   "id": "allCharms",
   "name": "Charmed Life",
   "desc": "Collect every charm.",
   "cond": {
    "type": "allCharms"
   }
  }
 ]
};
