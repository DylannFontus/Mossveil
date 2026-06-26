// Attack/move parameters overlay (roadmap #10). Edited by the Move editor (Edit ▸ Content).
// An empty overlay means "use the built-in defaults" (byte-identical). The editor writes the full
// per-move parameter snapshot here on first save. bosses.js (G.Bosses) consumes it via applyMoveData.
window.G = window.G || {};
G.MOVES_DATA = {};
