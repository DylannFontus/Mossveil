// generated from data/cutscenes.json - do not edit by hand (use the editor)
window.G = window.G || {};
G.CUTSCENES = {
 "intro": {
  "id": "intro",
  "name": "Awakening",
  "level": "steps",
  "skippable": true,
  "events": [
   {
    "t": 0,
    "dur": 0.6,
    "type": "letterbox",
    "from": 0,
    "to": 1
   },
   {
    "t": 0,
    "dur": 1,
    "type": "fade",
    "from": 1,
    "to": 0
   },
   {
    "t": 0,
    "dur": 11,
    "type": "camera",
    "dx": 0,
    "dy": 1,
    "z": 18
   },
   {
    "t": 11.5,
    "dur": 4,
    "type": "camera",
    "dx": 0,
    "dy": 0.5,
    "z": 11
   },
   {
    "t": 1,
    "dur": 10,
    "type": "riseFromGround",
    "depth": 2.4
   },
   {
    "t": 11,
    "dur": 1,
    "type": "wake"
   },
   {
    "t": 12,
    "dur": 5,
    "type": "stand"
   },
   {
    "t": 17,
    "dur": 1,
    "type": "look",
    "dir": -1
   },
   {
    "t": 18,
    "dur": 1,
    "type": "look",
    "dir": 1
   },
   {
    "t": 19,
    "dur": 1,
    "type": "look",
    "dir": -1
   },
   {
    "t": 20,
    "dur": 1,
    "type": "look",
    "dir": 1
   },
   {
    "t": 21,
    "dur": 0.7,
    "type": "blur",
    "from": 0,
    "to": 6
   },
   {
    "t": 21,
    "dur": 6,
    "type": "text",
    "text": "Who am I?"
   },
   {
    "t": 26.3,
    "dur": 0.7,
    "type": "blur",
    "from": 6,
    "to": 0
   },
   {
    "t": 26.8,
    "dur": 2.6,
    "type": "cameraRestore"
   },
   {
    "t": 28.1,
    "dur": 1.3,
    "type": "letterbox",
    "from": 1,
    "to": 0
   }
  ]
 },
 "expressionsDemo": {
  "id": "expressionsDemo",
  "name": "Expressions (demo)",
  "level": "steps",
  "skippable": true,
  "events": [
   {
    "t": 0,
    "dur": 0.4,
    "type": "letterbox",
    "from": 0,
    "to": 1
   },
   {
    "t": 0,
    "dur": 0.5,
    "type": "fade",
    "from": 1,
    "to": 0
   },
   {
    "t": 0.6,
    "dur": 2.2,
    "type": "talk"
   },
   {
    "t": 0.8,
    "dur": 2,
    "type": "text",
    "text": "...where am I?"
   },
   {
    "t": 3,
    "dur": 2.2,
    "type": "confused"
   },
   {
    "t": 5.4,
    "dur": 1,
    "type": "surprised"
   },
   {
    "t": 6.6,
    "dur": 1.4,
    "type": "nod"
   },
   {
    "t": 8.2,
    "dur": 1.4,
    "type": "shakeHead"
   },
   {
    "t": 9.8,
    "dur": 2.2,
    "type": "laugh"
   },
   {
    "t": 12.2,
    "dur": 2.2,
    "type": "sad"
   },
   {
    "t": 14.6,
    "dur": 1.8,
    "type": "fear"
   },
   {
    "t": 16.6,
    "dur": 1.8,
    "type": "excited"
   },
   {
    "t": 18.6,
    "dur": 2.4,
    "type": "walk",
    "dx": 5
   },
   {
    "t": 21.2,
    "dur": 1.2,
    "type": "collapse"
   },
   {
    "t": 22.6,
    "dur": 0.3,
    "type": "flash"
   },
   {
    "t": 23,
    "dur": 1.2,
    "type": "letterbox",
    "from": 1,
    "to": 0
   }
  ]
 }
};
