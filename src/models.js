// MOSSVEIL — models.js : a tiny model registry + builder shared by the editor's Model
// tab and the game. A model is { parts:[ {shape,x,y,z,rx,ry,rz,sx,sy,sz,color,name} ] }.
// Parts are flat-shaded primitives lit by one shared light so they read as 3D form while
// the rest of the game (flat MeshBasic) is untouched. Saved models live in localStorage
// (and can be placed in levels via the `model` prop).
(function () {
  const M = G.Models = { lib: {} };
  const KEY = 'mossveil_models';
  try { M.lib = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { M.lib = {}; }

  M.list = () => Object.keys(M.lib).sort();
  M.get = name => M.lib[name];
  M.save = (name, model) => { M.lib[name] = JSON.parse(JSON.stringify(model)); persist(); };
  M.rename = (from, to) => { if (M.lib[from] && !M.lib[to]) { M.lib[to] = M.lib[from]; delete M.lib[from]; persist(); } };
  M.remove = name => { delete M.lib[name]; persist(); };
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(M.lib)); } catch (e) { } }

  // primitive geometry factory (unit-sized; scaled per part)
  M.SHAPES = ['box', 'sphere', 'cylinder', 'cone', 'capsule', 'prism', 'pyramid', 'wedge', 'torus', 'plane'];
  M.geom = function (shape) {
    switch (shape) {
      case 'sphere': return new THREE.SphereGeometry(0.5, 20, 14);
      case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, 22);
      case 'cone': return new THREE.ConeGeometry(0.5, 1, 22);
      case 'capsule': return new THREE.CapsuleGeometry(0.4, 0.5, 6, 14);
      case 'prism': return new THREE.CylinderGeometry(0.5, 0.5, 1, 3);
      case 'pyramid': return new THREE.ConeGeometry(0.62, 1, 4);
      case 'wedge': { const g = new THREE.CylinderGeometry(0.0001, 0.71, 1, 4); g.rotateY(Math.PI / 4); return g; }
      case 'torus': return new THREE.TorusGeometry(0.34, 0.16, 12, 22);
      case 'plane': return new THREE.PlaneGeometry(1, 1);
      default: return new THREE.BoxGeometry(1, 1, 1);
    }
  };
  M.mesh = function (p) {
    const geo = M.geom(p.shape || 'box');
    const mat = new THREE.MeshLambertMaterial({ color: p.color || '#c8c8c8', side: THREE.DoubleSide, emissive: 0x000000 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p.x || 0, p.y || 0, p.z || 0);
    m.rotation.set((p.rx || 0) * Math.PI / 180, (p.ry || 0) * Math.PI / 180, (p.rz || 0) * Math.PI / 180);
    m.scale.set(p.sx || 1, p.sy || 1, p.sz || 1);
    return m;
  };
  // build a THREE.Group for a whole model
  M.buildGroup = function (model) {
    const grp = new THREE.Group();
    if (model && model.parts) for (const p of model.parts) grp.add(M.mesh(p));
    return grp;
  };
  M.buildByName = name => M.buildGroup(M.lib[name]);

  // a single shared light pair so Lambert models shade; harmless to the flat MeshBasic world
  M.ensureLight = function (scene) {
    if (!scene || scene.userData._modelLight) return;
    const dir = new THREE.DirectionalLight(0xffffff, 1.05); dir.position.set(0.6, 1.1, 1.4);
    const amb = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(dir); scene.add(amb); scene.userData._modelLight = true;
  };
})();
