// MOSSVEIL — camera.js : gameplay camera feel (G.Cam).
// How the camera follows the player — the follow stiffness, the springy look-ahead that leads toward
// where you're heading, the vertical bias, and the little zoom-"punch" kick on impacts — was a set of
// magic numbers inside main.js updateCamera() / camPunch() / snapCamera(). They live here as a data
// overlay (data/camera.js -> G.CAMERA_DATA) so the in-editor Camera editor can author the feel.
// (The camera distance/FOV and the room-clamping stay in main.js — this is feel, not framing.)
// Defaults are byte-identical to the old constants. No THREE/Audio at load (so gen-data can node-eval
// it). main.js reads these via G.Cam.* with a literal fallback, so the game still runs without it.
(function () {
  const C = G.Cam = {};
  const clone = o => JSON.parse(JSON.stringify(o));
  const DEFAULTS = {
    followX: 6.5,         // horizontal follow stiffness (damp rate; higher = snappier)
    followY: 5.5,         // vertical follow stiffness
    lookAhead: 2.1,       // how far the camera leads in the facing direction (world units)
    lookVelFactor: 0.16,  // extra lead per unit of horizontal velocity
    lookVelMax: 2.2,      // clamp on the velocity-based lead
    lookSpring: 3,        // how quickly the look-ahead eases to its target
    vBias: 1.2,           // camera sits this far above the player's feet
    vVelFactor: 0.07,     // vertical lead per unit of vertical velocity
    vClampDown: -1.4,     // clamp when falling
    vClampUp: 0.7,        // clamp when rising
    punchMax: 3.2,        // most a zoom-kick can stack to
    punchEase: 9,         // how fast the kick eases back out (damp rate)
    punchDefault: 0.8     // kick amount when camPunch() is called with no argument
  };
  let DATA = clone(DEFAULTS);
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;

  function applyData(data) {
    const d = data || G.CAMERA_DATA || null;
    DATA = clone(DEFAULTS);
    if (d) {
      DATA.followX = Math.max(0.1, num(d.followX, DEFAULTS.followX));
      DATA.followY = Math.max(0.1, num(d.followY, DEFAULTS.followY));
      DATA.lookAhead = num(d.lookAhead, DEFAULTS.lookAhead);
      DATA.lookVelFactor = num(d.lookVelFactor, DEFAULTS.lookVelFactor);
      DATA.lookVelMax = Math.max(0, num(d.lookVelMax, DEFAULTS.lookVelMax));
      DATA.lookSpring = Math.max(0.1, num(d.lookSpring, DEFAULTS.lookSpring));
      DATA.vBias = num(d.vBias, DEFAULTS.vBias);
      DATA.vVelFactor = num(d.vVelFactor, DEFAULTS.vVelFactor);
      DATA.vClampDown = num(d.vClampDown, DEFAULTS.vClampDown);
      DATA.vClampUp = num(d.vClampUp, DEFAULTS.vClampUp);
      DATA.punchMax = Math.max(0, num(d.punchMax, DEFAULTS.punchMax));
      DATA.punchEase = Math.max(0.001, num(d.punchEase, DEFAULTS.punchEase));
      DATA.punchDefault = Math.max(0, num(d.punchDefault, DEFAULTS.punchDefault));
    }
  }
  C.applyData = applyData;
  C.exportDefaults = () => clone(DEFAULTS);
  C.exportCurrent = () => clone(DATA);

  // ---- live reads (main.js calls these) ----
  C.followX = () => DATA.followX;
  C.followY = () => DATA.followY;
  C.lookAhead = () => DATA.lookAhead;
  C.lookVelFactor = () => DATA.lookVelFactor;
  C.lookVelMax = () => DATA.lookVelMax;
  C.lookSpring = () => DATA.lookSpring;
  C.vBias = () => DATA.vBias;
  C.vVelFactor = () => DATA.vVelFactor;
  C.vClampDown = () => DATA.vClampDown;
  C.vClampUp = () => DATA.vClampUp;
  C.punchMax = () => DATA.punchMax;
  C.punchEase = () => DATA.punchEase;
  C.punchDefault = () => DATA.punchDefault;

  applyData();
})();
