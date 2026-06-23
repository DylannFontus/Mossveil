// MOSSVEIL — models.js : model registry + rig/animation, shared by the editor's Model tab
// and the game. A model is { name, parts:[...], clips:{name:{dur,loop,tracks}} }.
//   part  = { id, shape, parent, x,y,z (joint in parent space), rx,ry,rz (deg), sx,sy,sz,
//            ox,oy,oz (mesh offset from the joint -> rotate limbs around a pivot), color, name }
//   clip  = { dur, loop, tracks:{ partId:[ {t, rx,ry,rz} ] } }  (absolute bone rotations, deg)
// Parts are flat-shaded primitives lit by one shared light (the flat MeshBasic world is
// untouched). buildRig() returns { group, bones } so clips animate the bones live.
(function () {
  const M = G.Models = { lib: {} };
  const KEY = 'mossveil_models';
  try { M.lib = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { M.lib = {}; }
  const rad = d => (d || 0) * Math.PI / 180;

  M.list = () => Object.keys(M.lib).sort();
  M.get = name => { const m = M.lib[name]; if (m) M.ensureIds(m); return m; };
  M.save = (name, model) => { M.ensureIds(model); M.lib[name] = JSON.parse(JSON.stringify(model)); persist(); };
  M.rename = (from, to) => { if (M.lib[from] && !M.lib[to]) { M.lib[to] = M.lib[from]; delete M.lib[from]; persist(); } };
  M.remove = name => { delete M.lib[name]; persist(); };
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(M.lib)); } catch (e) { } }

  M.ensureIds = function (model) {
    if (!model || !model.parts) return;
    let mx = 0; for (const p of model.parts) if (typeof p.id === 'number' && p.id > mx) mx = p.id;
    for (const p of model.parts) if (typeof p.id !== 'number') p.id = ++mx;
    model.clips = model.clips || {};
  };

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
  // flat (MeshBasic, matches the game's silhouette art) by default; shaded (Lambert) optional
  M.partMesh = function (p, shaded) {              // mesh sits offset from its bone (the pivot)
    const mat = shaded
      ? new THREE.MeshLambertMaterial({ color: p.color || '#c8c8c8', side: THREE.DoubleSide })
      : new THREE.MeshBasicMaterial({ color: p.color || '#c8c8c8', side: THREE.DoubleSide });
    const m = new THREE.Mesh(M.geom(p.shape || 'box'), mat);
    m.position.set(p.ox || 0, p.oy || 0, p.oz || 0);
    m.scale.set(p.sx || 1, p.sy || 1, p.sz || 1);
    return m;
  };
  // build a rig: nested bones (one per part) + meshes; returns handles for live animation
  M.buildRig = function (model) {
    const root = new THREE.Group(), bones = {}, meshes = {}, shaded = !!(model && model.shaded);
    if (!model || !model.parts) return { group: root, bones, meshes };
    M.ensureIds(model);
    for (const p of model.parts) {
      const bone = new THREE.Object3D();
      bone.position.set(p.x || 0, p.y || 0, p.z || 0);
      bone.rotation.set(rad(p.rx), rad(p.ry), rad(p.rz));
      bone.userData.base = { x: p.x || 0, y: p.y || 0, z: p.z || 0, rx: rad(p.rx), ry: rad(p.ry), rz: rad(p.rz) };
      const mesh = M.partMesh(p, shaded); mesh.userData.partId = p.id;
      bone.add(mesh); bones[p.id] = bone; meshes[p.id] = mesh;
    }
    for (const p of model.parts) { const par = (p.parent != null && bones[p.parent] && p.parent !== p.id) ? bones[p.parent] : root; par.add(bones[p.id]); }
    return { group: root, bones, meshes };
  };
  M.buildGroup = model => M.buildRig(model).group;
  M.buildByName = name => M.buildGroup(M.get(name));

  function sampleTrack(keys, t) {
    if (t <= keys[0].t) return keys[0];
    if (t >= keys[keys.length - 1].t) return keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t >= a.t && t <= b.t) { const f = (t - a.t) / Math.max(1e-4, b.t - a.t), o = {}; for (const k of ['rx', 'ry', 'rz']) o[k] = (a[k] || 0) + ((b[k] || 0) - (a[k] || 0)) * f; return o; }
    }
    return keys[keys.length - 1];
  }
  // apply a clip to the bones at time t (seconds); resets unanimated bones to rest pose
  M.applyClip = function (model, bones, clipName, t) {
    for (const id in bones) { const b = bones[id], base = b.userData.base; if (base) b.rotation.set(base.rx, base.ry, base.rz); }
    const clip = model && model.clips && model.clips[clipName];
    if (!clip || !clip.tracks) return;
    const dur = clip.dur || 1, tt = (clip.loop === false) ? Math.min(t, dur) : (t % dur + dur) % dur;
    for (const pid in clip.tracks) {
      const keys = clip.tracks[pid], b = bones[pid];
      if (!b || !keys || !keys.length) continue;
      const v = sampleTrack(keys, tt);
      b.rotation.set(rad(v.rx), rad(v.ry), rad(v.rz));
    }
  };

  // sampled absolute rotations (deg) per animated part at time t — for the editor's scrub/pose flow
  M.clipPose = function (model, clipName, t) {
    const out = {}, clip = model && model.clips && model.clips[clipName];
    if (!clip || !clip.tracks) return out;
    const dur = clip.dur || 1, tt = (clip.loop === false) ? Math.min(t, dur) : ((t % dur) + dur) % dur;
    for (const pid in clip.tracks) { const keys = clip.tracks[pid]; if (keys && keys.length) { const v = sampleTrack(keys, tt); out[pid] = { rx: v.rx || 0, ry: v.ry || 0, rz: v.rz || 0 }; } }
    return out;
  };

  M.ensureLight = function (scene) {
    if (!scene || scene.userData._modelLight) return;
    const dir = new THREE.DirectionalLight(0xffffff, 1.05); dir.position.set(0.6, 1.1, 1.4);
    scene.add(dir); scene.add(new THREE.AmbientLight(0xffffff, 0.55)); scene.userData._modelLight = true;
  };
})();
