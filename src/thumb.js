// MOSSVEIL — thumb.js : render any THREE.Object3D to a small framed canvas (a "portrait").
// Used by the in-game Hunter's Journal (enemy portraits) and the editor asset browser.
// A tiny dedicated offscreen renderer keeps it isolated from the main scene/canvas.
(function () {
  let r = null, scene = null, cam = null, canvas = null, SIZE = 0;

  function ensure(size) {
    if (r && SIZE === size) return;
    if (r) { r.dispose(); }
    SIZE = size;
    canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const d = new THREE.DirectionalLight(0xffffff, 0.7); d.position.set(0.6, 1.2, 1.6); scene.add(d);
    cam = new THREE.PerspectiveCamera(34, 1, 0.05, 200);
  }

  // returns a fresh HTMLCanvasElement holding the framed render of `obj` (left intact for the caller)
  G.Thumb = {
    snapshot(obj, opts) {
      opts = opts || {};
      const size = opts.size || 160;
      ensure(size);
      const holder = new THREE.Group(); holder.add(obj); scene.add(holder);
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) { scene.remove(holder); const c = document.createElement('canvas'); c.width = c.height = size; return c; }
      const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
      const radius = Math.max(s.x, s.y, s.z, 0.5) * 0.5;
      const dist = (radius / Math.tan(34 * Math.PI / 360)) * (opts.zoom || 1.7);
      const az = opts.az !== undefined ? opts.az : 0.5, el = opts.el !== undefined ? opts.el : 0.18;
      cam.position.set(c.x + dist * Math.sin(az), c.y + radius + dist * el, c.z + dist * Math.cos(az));
      cam.lookAt(c.x, c.y, c.z);
      cam.updateProjectionMatrix();
      r.render(scene, cam);
      // copy into a standalone canvas so callers can keep it while we reuse the renderer
      const out = document.createElement('canvas'); out.width = out.height = size;
      out.getContext('2d').drawImage(canvas, 0, 0);
      scene.remove(holder);
      return out;
    }
  };
})();
