// generated from data/levels.json - do not edit by hand (use the editor)
window.G = window.G || {};
G.LEVELS = {
 "steps": {
  "id": "steps",
  "title": "The Sunken Steps",
  "area": "M O S S V E I L",
  "biome": "verdant",
  "w": 56,
  "h": 22,
  "mapPos": {
   "mx": 0,
   "my": 0
  },
  "tiles": [
   "########################################################",
   "########################################################",
   "##                  ####              ####            ##",
   "##                  ####              ####            ##",
   "##                                    ####            ##",
   "##                                                    ##",
   "##                                                    ##",
   "##########                                            ##",
   "##########                                            ##",
   "################                                      ##",
   "################                                      ##",
   "#######################                               ##",
   "#######################                               ##",
   "#############################                           ",
   "#############################                           ",
   "#####################################                   ",
   "#####################################                   ",
   "########################################################",
   "########################################################",
   "########################################################",
   "########################################################",
   "########################################################"
  ],
  "spawns": {
   "2": {
    "x": 52.5,
    "y": 5.5
   },
   "P": {
    "x": 4.5,
    "y": 15.5
   }
  },
  "enemies": [
   {
    "type": "tumblebug",
    "x": 32.5,
    "y": 7.5
   },
   {
    "type": "tumblebug",
    "x": 44.5,
    "y": 5.5
   }
  ],
  "props": [
   {
    "type": "sign",
    "x": 7.5,
    "y": 15,
    "text": "← →  or  A D — walk"
   },
   {
    "type": "sign",
    "x": 18.5,
    "y": 11,
    "text": "Z or SPACE — jump\nhold to leap higher"
   },
   {
    "type": "sign",
    "x": 33.5,
    "y": 7,
    "text": "X — strike  ·  C — dash\ndown-strike in the air to bounce off foes"
   }
  ],
  "transitions": [
   {
    "side": "R",
    "to": "glade",
    "spawn": "1"
   },
   {
    "rect": {
     "x": 16,
     "y": 14.5,
     "w": 3,
     "h": 4
    },
    "to": "test",
    "spawn": "P",
    "x": -6.5,
    "y": -1
   }
  ],
  "intro": "intro"
 },
 "glade": {
  "id": "glade",
  "title": "Verdant Deep",
  "area": null,
  "biome": "verdant",
  "w": 80,
  "h": 26,
  "mapPos": {
   "mx": 58,
   "my": -2
  },
  "tiles": [
   "######  ################################################   #####################",
   "######  ################################################   #####################",
   "##          #####                   ####            ####   ####       #####   ##",
   "##          #####                   ####            ####   ####       #####   ##",
   "##          #####                   ####            ####   ####       #####   ##",
   "##                                  ####            ####   ####               ##",
   "##                                                  ####   ####               ##",
   "##                                                  ####   ####               ##",
   "##                                                  ####   ####               ##",
   "##                                                  ####   ####               ##",
   "##                                                  ####   ####               ##",
   "##                                                  ####   ####               ##",
   "##                                                  ####   ####               ##",
   "##                                          ####    ####   ####               ##",
   "##                      ====                ####    ####   ####                 ",
   "##                                                  ####   ####                 ",
   "                                                                                ",
   "                    ====                ====                                    ",
   "                                ====                          ##################",
   "                                                         ###  ##################",
   "###############################      ###################      ##################",
   "###############################      ###################      ##################",
   "###############################^^^^^^###################^^^^^^##################",
   "################################################################################",
   "################################################################################",
   "################################################################################"
  ],
  "spawns": {
   "1": {
    "x": 4.5,
    "y": 6.5
   },
   "2": {
    "x": 75.5,
    "y": 8.5
   },
   "3": {
    "x": 57.5,
    "y": 12.5
   },
   "4": {
    "x": 7,
    "y": 25
   }
  },
  "enemies": [
   {
    "type": "gnatling",
    "x": 25.5,
    "y": 13.5
   },
   {
    "type": "gnatling",
    "x": 43.5,
    "y": 12.5
   },
   {
    "type": "gnatling",
    "x": 68.5,
    "y": 11.5
   },
   {
    "type": "bulbil",
    "x": 70.5,
    "y": 8.5
   },
   {
    "type": "tumblebug",
    "x": 10.5,
    "y": 6.5
   },
   {
    "type": "tumblebug",
    "x": 48.5,
    "y": 6.5
   },
   {
    "type": "bulbil",
    "x": 52.5,
    "y": 6.5
   }
  ],
  "props": [
   {
    "type": "sign",
    "x": 54.5,
    "y": 6,
    "text": "The walls remember\nthose who climb."
   }
  ],
  "transitions": [
   {
    "side": "L",
    "to": "steps",
    "spawn": "2"
   },
   {
    "side": "R",
    "to": "rest",
    "spawn": "1"
   },
   {
    "side": "T",
    "x0": 55,
    "x1": 60,
    "to": "dusk",
    "spawn": "4"
   }
  ]
 },
 "rest": {
  "id": "rest",
  "title": "Wayfarer's Rest",
  "area": null,
  "biome": "warm",
  "w": 44,
  "h": 18,
  "mapPos": {
   "mx": 140,
   "my": 2
  },
  "tiles": [
   "############################################",
   "############################################",
   "##        ####                #####       ##",
   "##        ####                #####       ##",
   "##        ####                #####       ##",
   "##                            #####       ##",
   "##                                        ##",
   "##                                        ##",
   "##                                        ##",
   "##                                        ##",
   "##                                        ##",
   "##                                        ##",
   "                                            ",
   "                                            ",
   "                                            ",
   "                                            ",
   "############################################",
   "############################################"
  ],
  "spawns": {
   "1": {
    "x": 4.5,
    "y": 2.5
   },
   "2": {
    "x": 40.5,
    "y": 2.5
   }
  },
  "enemies": [],
  "props": [
   {
    "type": "sign",
    "x": 12.5,
    "y": 2,
    "text": "Rest, wanderer —\nyour path is remembered."
   },
   {
    "type": "lamp",
    "x": 16.5,
    "y": 2
   },
   {
    "type": "bench",
    "x": 20.5,
    "y": 2
   },
   {
    "type": "lamp",
    "x": 25.5,
    "y": 2
   },
   {
    "type": "sign",
    "x": 29.5,
    "y": 2,
    "text": "F (hold) — focus reaped soul, mend a mask\nF (tap) — loose a wisp of soul"
   }
  ],
  "transitions": [
   {
    "side": "L",
    "to": "glade",
    "spawn": "2"
   },
   {
    "side": "R",
    "to": "shaft",
    "spawn": "1"
   }
  ]
 },
 "shaft": {
  "id": "shaft",
  "title": "The Climbing Dark",
  "area": null,
  "biome": "verdant",
  "w": 40,
  "h": 34,
  "mapPos": {
   "mx": 186,
   "my": -12
  },
  "tiles": [
   "########################################",
   "########################################",
   "##                                    ##",
   "##                                    ##",
   "##                                      ",
   "##                                      ",
   "##                                      ",
   "##                                      ",
   "##                               #######",
   "##                               #######",
   "##                                    ##",
   "##                      ######        ##",
   "##                                    ##",
   "##                                    ##",
   "#####           ######                ##",
   "#####                                 ##",
   "#####                                 ##",
   "#####   ######                        ##",
   "#####                                 ##",
   "##                                    ##",
   "##              ######             #####",
   "##                                 #####",
   "##                          ^^     #####",
   "##                         ######  #####",
   "##                                 #####",
   "##                                    ##",
   "##                 ######             ##",
   "##                                    ##",
   "                                      ##",
   "          ######                      ##",
   "                                      ##",
   "                                      ##",
   "########################################",
   "########################################"
  ],
  "spawns": {
   "1": {
    "x": 4.5,
    "y": 2.5
   },
   "2": {
    "x": 36.5,
    "y": 26.5
   }
  },
  "enemies": [
   {
    "type": "gnatling",
    "x": 28.5,
    "y": 25.5
   },
   {
    "type": "gnatling",
    "x": 20.5,
    "y": 15.5
   },
   {
    "type": "gnatling",
    "x": 14.5,
    "y": 9.5
   }
  ],
  "props": [],
  "transitions": [
   {
    "side": "L",
    "to": "rest",
    "spawn": "2"
   },
   {
    "side": "R",
    "to": "gloom",
    "spawn": "1"
   }
  ]
 },
 "gloom": {
  "id": "gloom",
  "title": "Gloomroot Cavern",
  "area": null,
  "biome": "gloom",
  "w": 70,
  "h": 24,
  "mapPos": {
   "mx": 228,
   "my": -2
  },
  "tiles": [
   "######################################################################",
   "######################################################################",
   "##                              ####        #####       ####        ##",
   "##                              ####        #####       ####        ##",
   "                                ####        #####       ####        ##",
   "                                ####        #####       ####        ##",
   "                                ####        #####                   ##",
   "                                            #####                   ##",
   "###########                                 #####                   ##",
   "###########                                                         ##",
   "###########                                                         ##",
   "#################                                                   ##",
   "#################                                                   ##",
   "#################                                                   ##",
   "#########################                    ====                   ##",
   "#########################                                           ##",
   "#########################                                             ",
   "###############################     ====                              ",
   "###############################                                       ",
   "###############################           ^^^^^                       ",
   "######################################################################",
   "######################################################################",
   "######################################################################",
   "######################################################################"
  ],
  "spawns": {
   "1": {
    "x": 4.5,
    "y": 16.5
   },
   "2": {
    "x": 66.5,
    "y": 4.5
   }
  },
  "enemies": [
   {
    "type": "gnatling",
    "x": 52.5,
    "y": 12.5
   },
   {
    "type": "gnatling",
    "x": 40.5,
    "y": 11.5
   },
   {
    "type": "tumblebug",
    "x": 28.5,
    "y": 7.5
   },
   {
    "type": "bramblehog",
    "x": 38.5,
    "y": 4.5
   },
   {
    "type": "bulbil",
    "x": 50.5,
    "y": 4.5
   },
   {
    "type": "bramblehog",
    "x": 56.5,
    "y": 4.5
   }
  ],
  "props": [
   {
    "type": "crystal",
    "x": 20.5,
    "y": 10
   },
   {
    "type": "sign",
    "x": 33.5,
    "y": 4,
    "text": "The dark gnaws.\nFollow the crystal-glow."
   },
   {
    "type": "crystal",
    "x": 34.5,
    "y": 4
   },
   {
    "type": "crystal",
    "x": 47.5,
    "y": 4
   },
   {
    "type": "crystal",
    "x": 60.5,
    "y": 4
   }
  ],
  "transitions": [
   {
    "side": "L",
    "to": "shaft",
    "spawn": "2"
   },
   {
    "side": "R",
    "to": "approach",
    "spawn": "1"
   }
  ]
 },
 "approach": {
  "id": "approach",
  "title": "The Sovereign's Walk",
  "area": null,
  "biome": "pale",
  "w": 50,
  "h": 20,
  "mapPos": {
   "mx": 300,
   "my": 0
  },
  "tiles": [
   "##################################################",
   "##################################################",
   "##                    ####                      ##",
   "##                    ####                      ##",
   "##                    ####                      ##",
   "##                                              ##",
   "##                                              ##",
   "##                                              ##",
   "##                                              ##",
   "##                                              ##",
   "##                                              ##",
   "##                                              ##",
   "                                                  ",
   "                                                  ",
   "                                                  ",
   "                  ^^^     ^^^                     ",
   "##################################################",
   "##################################################",
   "##################################################",
   "##################################################"
  ],
  "spawns": {
   "1": {
    "x": 4.5,
    "y": 4.5
   },
   "2": {
    "x": 46.5,
    "y": 4.5
   }
  },
  "enemies": [],
  "props": [
   {
    "type": "sign",
    "x": 10.5,
    "y": 4,
    "text": "TURN BACK.\nThe glade's heart is claimed."
   },
   {
    "type": "lamp",
    "x": 14.5,
    "y": 4
   },
   {
    "type": "lamp",
    "x": 24.5,
    "y": 4
   },
   {
    "type": "lamp",
    "x": 38.5,
    "y": 4
   }
  ],
  "transitions": [
   {
    "side": "L",
    "to": "gloom",
    "spawn": "2"
   },
   {
    "side": "R",
    "to": "arena",
    "spawn": "1"
   }
  ]
 },
 "arena": {
  "id": "arena",
  "title": "Heart of the Glade",
  "area": null,
  "biome": "pale",
  "w": 54,
  "h": 22,
  "mapPos": {
   "mx": 352,
   "my": -1
  },
  "tiles": [
   "######################################################",
   "######################################################",
   "##                                                  ##",
   "##                                                  ##",
   "##                                                  ##",
   "##                                                  ##",
   "##                                                  ##",
   "##                                                  ##",
   "##                                                  ##",
   "##                                                  ##",
   "##                                                  ##",
   "##                                                  ##",
   "##                                                  ##",
   "##                                                  ##",
   "                                                      ",
   "       ====                                ====       ",
   "                                                      ",
   "                                                      ",
   "######################################################",
   "######################################################",
   "######################################################",
   "######################################################"
  ],
  "spawns": {
   "1": {
    "x": 4.5,
    "y": 4.5
   },
   "2": {
    "x": 50.5,
    "y": 4.5
   }
  },
  "enemies": [],
  "props": [
   {
    "type": "bossTrigger",
    "x": 27.5,
    "y": 6.5,
    "boss": "mossSovereign"
   },
   {
    "type": "gate",
    "x": 8.5,
    "y": 4,
    "id": 0
   },
   {
    "type": "gate",
    "x": 45.5,
    "y": 4,
    "id": 1
   }
  ],
  "transitions": [
   {
    "side": "L",
    "to": "approach",
    "spawn": "2"
   },
   {
    "side": "R",
    "to": "crown",
    "spawn": "1"
   }
  ]
 },
 "crown": {
  "id": "crown",
  "title": "The Verdant Crown",
  "area": null,
  "biome": "crown",
  "w": 48,
  "h": 20,
  "mapPos": {
   "mx": 408,
   "my": 0
  },
  "tiles": [
   "################################################",
   "################################################",
   "##                                            ##",
   "##                                            ##",
   "##                                            ##",
   "##                                            ##",
   "##                                            ##",
   "##                                            ##",
   "##                                            ##",
   "##                                            ##",
   "##                                            ##",
   "##                                            ##",
   "                                              ##",
   "                                              ##",
   "                                              ##",
   "                                              ##",
   "################################################",
   "################################################",
   "################################################",
   "################################################"
  ],
  "spawns": {
   "1": {
    "x": 4.5,
    "y": 4.5
   }
  },
  "enemies": [],
  "props": [
   {
    "type": "lamp",
    "x": 12.5,
    "y": 4
   },
   {
    "type": "bench",
    "x": 16.5,
    "y": 4
   },
   {
    "type": "sign",
    "x": 24.5,
    "y": 4,
    "text": "The glade breathes again.\nThank you, little wanderer."
   },
   {
    "type": "shrine",
    "x": 30.5,
    "y": 4
   },
   {
    "type": "lamp",
    "x": 36.5,
    "y": 4
   }
  ],
  "transitions": [
   {
    "side": "L",
    "to": "arena",
    "spawn": "2"
   }
  ]
 },
 "dusk": {
  "id": "dusk",
  "title": "The Duskveil",
  "area": null,
  "biome": "dusk",
  "w": 36,
  "h": 20,
  "mapPos": {
   "mx": 72,
   "my": -26
  },
  "tiles": [
   "####################################",
   "####################################",
   "##                                ##",
   "##                                ##",
   "##                                ##",
   "##                                ##",
   "##                                ##",
   "##                                ##",
   "##                                ##",
   "##                                ##",
   "##                                ##",
   "##                                ##",
   "##                                ##",
   "##                                ##",
   "##                                ##",
   "##                         ###    ##",
   "##                         ###    ##",
   "################   #################",
   "################   #################",
   "################   #################"
  ],
  "spawns": {
   "4": {
    "x": 21.5,
    "y": 3.5
   }
  },
  "enemies": [
   {
    "type": "gnatling",
    "x": 24.5,
    "y": 10.5
   },
   {
    "type": "gnatling",
    "x": 12.5,
    "y": 9.5
   }
  ],
  "props": [
   {
    "type": "wings",
    "x": 28.5,
    "y": 6.5
   },
   {
    "type": "sign",
    "x": 8.5,
    "y": 3,
    "text": "Wings of the pale moth,\nshed in shadow. Take them."
   }
  ],
  "transitions": [
   {
    "side": "B",
    "x0": 15,
    "x1": 19,
    "to": "glade",
    "spawn": "3"
   }
  ]
 },
 "test": {
  "id": "test",
  "title": "TestRoom",
  "area": null,
  "biome": "gloom",
  "w": 50,
  "h": 22,
  "mapPos": {
   "mx": 31,
   "my": 27
  },
  "tiles": [
   "##################################################",
   "##################################################",
   "##                                              ##",
   "##                                              ##",
   "##                                              ##",
   "##                                              ##",
   "##                                       #      ##",
   "##                ###        ####        #      ##",
   "##                               #       #      ##",
   "##                                    ##        ##",
   "##           ###                       #        ##",
   "##                    ##                        ##",
   "##       #            ####             #        ##",
   "##       #                                      ##",
   "##      ##                                        ",
   "##      ##                                        ",
   "##################################################",
   "##################################################",
   "##################################################",
   "##################################################",
   "##################################################",
   "##################################################"
  ],
  "spawns": {
   "P": {
    "x": 6.5,
    "y": 7
   }
  },
  "enemies": [],
  "props": [
   {
    "type": "lamp",
    "x": 13.5,
    "y": 6
   },
   {
    "type": "crystal",
    "x": 3,
    "y": 6
   },
   {
    "type": "wings",
    "x": 10,
    "y": 12
   },
   {
    "type": "shrine",
    "x": 32,
    "y": 15
   },
   {
    "type": "textTrigger",
    "x": 19.5,
    "y": 8,
    "w": 4,
    "h": 4,
    "text": "Something stirs...",
    "once": true
   },
   {
    "type": "readable",
    "x": 11.5,
    "y": 6,
    "title": "Old inscription",
    "text": "Words worn by time...",
    "style": "totem"
   },
   {
    "type": "decor",
    "x": 13.5,
    "y": 4,
    "kind": "mushroom",
    "z": -9
   },
   {
    "type": "ray",
    "x": 5,
    "y": 11.5,
    "w": 5,
    "h": 18,
    "rot": -0.15,
    "opacity": 0.1
   },
   {
    "type": "ray",
    "x": 23,
    "y": 13.5,
    "w": 5,
    "h": 18,
    "rot": 0.15,
    "opacity": 0.1
   },
   {
    "type": "cutsceneTrigger",
    "x": 30.5,
    "y": 8,
    "w": 4,
    "h": 4,
    "once": true,
    "cutscene": "expressionsDemo"
   }
  ],
  "transitions": [
   {
    "rect": {
     "x": 48,
     "y": 7,
     "w": 3,
     "h": 4
    },
    "to": "test2",
    "spawn": "P"
   }
  ]
 },
 "test2": {
  "id": "test2",
  "title": "TestRoom2",
  "area": null,
  "biome": "warm",
  "w": 50,
  "h": 22,
  "mapPos": {
   "mx": 82,
   "my": 27
  },
  "tiles": [
   "##################################################",
   "##################################################",
   "##                                              ##",
   "##                                              ##",
   "##                                              ##",
   "##                                              ##",
   "##                                              ##",
   "##                                              ##",
   "##                                              ##",
   "##                                              ##",
   "##                                              ##",
   "##                                              ##",
   "##                                              ##",
   "##                                              ##",
   "                                                ##",
   "                                                ##",
   "#######  #########################################",
   "#######  #########################################",
   "#######  #########################################",
   "#######  #########################################",
   "#######  #########################################",
   "#######  #########################################"
  ],
  "spawns": {
   "P": {
    "x": 1,
    "y": 7
   }
  },
  "enemies": [],
  "props": [
   {
    "type": "bossTrigger",
    "x": 41,
    "y": 8,
    "r": 6,
    "boss": "thornbackAlpha"
   }
  ],
  "transitions": [
   {
    "rect": {
     "x": 8,
     "y": 3.5,
     "w": 3,
     "h": 4
    },
    "to": "glade",
    "spawn": "4",
    "x": null,
    "y": null
   }
  ]
 }
};

// ---- City of Tears (water city) — tiles built here; the Victorian building is stamped on load ----
(function () {
  const W = 100, H = 100, g = [];
  for (let r = 0; r < H; r++) { const wy = H - 1 - r; g.push(wy <= 4 ? 'b'.repeat(W) : ''); }
  const run = (wy, c0, c1, ch) => { const r = H - 1 - wy; let row = (g[r] || '').padEnd(W, ' '); for (let c = c0; c <= c1; c++) row = row.slice(0, c) + ch + row.slice(c + 1); g[r] = row; };
  // right-half street platforms / ledges to traverse the flooded city
  run(12, 60, 99, 'b'); run(13, 60, 99, 'b');
  run(22, 52, 82, 'b'); run(23, 52, 82, 'b');
  run(32, 66, 99, 'b'); run(33, 66, 99, 'b');
  run(20, 88, 99, 'b'); run(21, 88, 99, 'b');
  G.LEVELS.watercity = {
    id: 'watercity', title: 'City of Tears', area: 'C I T Y   O F   T E A R S', biome: 'city', w: W, h: H,
    mapPos: { mx: 150, my: 0 }, weather: 'rain',
    water: { y: 4, strength: 0.55, caustics: 0.5, color: '#74b0e0' },
    tiles: g,
    spawns: { 'P': { x: 52, y: 6 }, '1': { x: 96, y: 6 } },
    enemies: [],
    props: [
      { type: 'bench', x: 52, y: 5 },
      { type: 'sign', x: 49, y: 6, text: 'City of Tears\nA Victorian house stands to the west' }
    ],
    transitions: [{ side: 'R', to: 'steps', spawn: 'P' }],
    buildings: [{ x: 4, y: 5, w: 40, h: 70, seed: 7 }]
  };
})();

// ---- new biome region: forge / mine / village / archive / garden / tombs ----
// Each level is procedurally laid out (ground + a meandering path of reachable ledges) and
// dressed with that biome's signature foreground props. Chained L/R into a traversable loop.
(function () {
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function biomeLevel(o) {
    const W = o.w, H = o.h, gh = o.groundH || 3, M = o.mat || '#', rng = mulberry32(o.seed || 1);
    const g = []; for (let r = 0; r < H; r++) g.push('');
    const set = (c, wy, ch) => { if (c < 0 || c >= W || wy < 0 || wy >= H) return; const r = H - 1 - wy; const row = (g[r] || '').padEnd(W, ' '); g[r] = row.slice(0, c) + ch + row.slice(c + 1); };
    const rect = (c0, wy0, c1, wy1, ch) => { for (let c = c0; c <= c1; c++) for (let wy = wy0; wy <= wy1; wy++) set(c, wy, ch); };
    rect(0, 0, W - 1, gh - 1, M);                                  // ground
    const props = (o.props || []).slice(), decor = o.decor || [];
    const place = (x, y) => { if (!decor.length) return; const d = decor[(rng() * decor.length) | 0]; props.push({ type: 'decor', kind: d.kind, x: x + 0.5, y: y + 0.02, color: d.color, scale: d.scale || (0.8 + rng() * 0.5), z: -0.2 - rng() * 0.3 }); if (d.light) props.push({ type: 'light', x: x + 0.5, y: y + 0.8, color: d.light, scale: 5, opacity: 0.28, flicker: !!d.flicker }); };
    // scatter decor along the ground
    for (let x = 3; x < W - 3; x += 4 + (rng() * 4 | 0)) if (rng() < 0.7) place(x, gh);
    // meandering ledges left -> right
    let px = 5, py = gh + 2 + (rng() * 2 | 0);
    while (px < W - 8) {
      const pw = 3 + (rng() * 5 | 0);
      py = Math.max(gh + 2, Math.min(H - 6, py + ((rng() * 7 | 0) - 3)));
      rect(px, py, px + pw - 1, py, M);
      if (rng() < 0.35) rect(px, gh, px + pw - 1, py - 1, M);       // occasional pillar down to ground
      if (rng() < 0.8) place(px + (pw / 2 | 0), py + 1);
      px += pw + 2 + (rng() * 3 | 0);
    }
    // a few standalone pillars / broken columns for verticality
    for (let i = 0; i < (o.pillars || 3); i++) { const c = 5 + (rng() * (W - 10) | 0), h = 3 + (rng() * 7 | 0); rect(c, gh, c, gh + h, M); }
    return {
      id: o.id, title: o.title, area: o.area || null, biome: o.biome, w: W, h: H, mapPos: o.mapPos,
      weather: o.weather, water: o.water, tiles: g,
      spawns: { 'P': { x: 3.5, y: gh + 1.5 }, 'R': { x: W - 3.5, y: gh + 1.5 } },
      enemies: o.enemies || [], props: props, transitions: o.transitions || []
    };
  }
  const T = (side, to, spawn) => ({ side, to, spawn });
  G.LEVELS.forge = biomeLevel({
    id: 'forge', title: 'The Iron Forge', area: 'A S H F O R G E', biome: 'forge', w: 64, h: 26, seed: 11, mapPos: { mx: 0, my: 60 }, weather: 'embers', pillars: 4,
    decor: [{ kind: 'anvil', color: '#2e2018' }, { kind: 'gear', color: '#3a2c22' }, { kind: 'pipe', color: '#2c2018', light: '#ff7a30', flicker: true }, { kind: 'brokenPillar', color: '#241008' }],
    transitions: [T('L', 'steps', '2'), T('R', 'mine', 'P')]
  });
  G.LEVELS.mine = biomeLevel({
    id: 'mine', title: 'Slate Mineworks', area: 'D E E P D E L V E', biome: 'mine', w: 70, h: 28, seed: 22, mapPos: { mx: 70, my: 60 }, pillars: 5,
    decor: [{ kind: 'cartRail', color: '#2a2e36' }, { kind: 'pipe', color: '#262a32' }, { kind: 'gear', color: '#30353e' }, { kind: 'stalactite', color: '#1c2026' }],
    transitions: [T('L', 'forge', 'R'), T('R', 'village', 'P')]
  });
  G.LEVELS.village = biomeLevel({
    id: 'village', title: 'Lantern Village', area: 'E M B E R H O L L O W', biome: 'village', w: 66, h: 24, seed: 33, mapPos: { mx: 146, my: 60 }, pillars: 2,
    decor: [{ kind: 'hut', color: '#33240f' }, { kind: 'plant', color: '#2f5e2f' }, { kind: 'lamppost', color: '#241a0e', light: '#ffcf86' }, { kind: 'fern', color: '#264a1e' }],
    transitions: [T('L', 'mine', 'R'), T('R', 'archive', 'P')]
  });
  G.LEVELS.archive = biomeLevel({
    id: 'archive', title: 'The Amber Archive', area: 'L O R E V A U L T', biome: 'archive', w: 64, h: 26, seed: 44, mapPos: { mx: 218, my: 60 }, pillars: 4,
    decor: [{ kind: 'bookshelf', color: '#33240f' }, { kind: 'scroll', color: '#b89a52' }, { kind: 'candle', color: '#2a2012', light: '#ffd98a', flicker: true }, { kind: 'column', color: '#2a200f' }],
    transitions: [T('L', 'village', 'R'), T('R', 'garden', 'P')]
  });
  G.LEVELS.garden = biomeLevel({
    id: 'garden', title: 'The Royal Gardens', area: 'B L O O M C O U R T', biome: 'garden', w: 70, h: 26, seed: 55, mapPos: { mx: 290, my: 60 }, weather: 'pollen', pillars: 3,
    decor: [{ kind: 'trellis', color: '#244018' }, { kind: 'hedge', color: '#2f6e3e' }, { kind: 'flower', color: '#d86aa0' }, { kind: 'tree', color: '#1a3a1f' }],
    transitions: [T('L', 'archive', 'R'), T('R', 'tombs', 'P')]
  });
  G.LEVELS.tombs = biomeLevel({
    id: 'tombs', title: 'The Cold Catacombs', area: 'R E S T I N G G R O U N D S', biome: 'tombs', w: 66, h: 26, seed: 66, pillars: 4, mapPos: { mx: 362, my: 60 },
    decor: [{ kind: 'tombstone', color: '#3e4a44' }, { kind: 'sarcophagus', color: '#36403a' }, { kind: 'urn', color: '#414b45' }, { kind: 'statue', color: '#4a544e' }],
    transitions: [T('L', 'garden', 'R'), T('R', 'watercity', 'P')]
  });
  // make watercity loop back, and open the region from the start area (left side of The Sunken Steps)
  if (G.LEVELS.watercity) G.LEVELS.watercity.transitions = [{ side: 'L', to: 'tombs', spawn: 'R' }];
  if (G.LEVELS.steps) G.LEVELS.steps.transitions.push({ side: 'L', to: 'forge', spawn: 'R' });
})();
