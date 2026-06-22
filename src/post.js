// MOSSVEIL — post.js : cinematic post-processing (bloom, colour grade, vignette,
// film grain, chromatic aberration) built on raw Three.js render targets — no addons,
// so it runs from the single vendored three.min.js on file:// and GitHub Pages.
(function () {
  const Post = G.Post = { enabled: false, quality: 'high' };

  const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  let renderer, fsScene, fsCam, quad;
  let sceneRT, bloomA, bloomB, depthRT, dofA, dofB;
  let brightMat, blurMat, compMat;
  const res = new THREE.Vector2();
  let halfDiv = 2;

  // grade state (per-biome target + smoothed current), plus transient "punch"/flash
  const grade = {
    exposure: 1.05, contrast: 1.05, saturation: 1.14, bloom: 0.6, vignette: 0.46,
    grain: 0, dof: 0.55, tint: new THREE.Color(1, 1, 1)
  };
  const target = {
    exposure: 1.05, contrast: 1.05, saturation: 1.14, bloom: 0.6, vignette: 0.46,
    grain: 0, dof: 0.55, tint: new THREE.Color(1, 1, 1)
  };
  let aberr = 0, flash = 0;
  const flashCol = new THREE.Color(1, 1, 1);
  let timeAcc = 0;

  // screen-space reflection for water / wet floors. `y` is the WORLD height of the
  // reflective surface (projected to a screen line each frame); pixels below it mirror
  // the scene above with ripple + tint. Set y=null to disable.
  const water = { y: null, strength: 0.55, ripple: 1, fade: 1.6, color: new THREE.Color(0.62, 0.78, 0.95) };
  const _wv = new THREE.Vector3();
  Post.setWater = function (o) {
    if (!o) { water.y = null; return; }
    water.y = (o.y !== undefined) ? o.y : water.y;
    if (o.strength !== undefined) water.strength = o.strength;
    if (o.ripple !== undefined) water.ripple = o.ripple;
    if (o.fade !== undefined) water.fade = o.fade;
    if (o.color !== undefined) water.color.set(o.color);
  };

  Post.init = function () {
    renderer = G.renderer;
    if (!renderer) return;
    try {
      renderer.getDrawingBufferSize(res);
      const rtOpts = { depthBuffer: true, type: THREE.HalfFloatType, samples: 4 };
      sceneRT = new THREE.WebGLRenderTarget(res.x, res.y, rtOpts);
      const bw = Math.max(1, Math.floor(res.x / halfDiv)), bh = Math.max(1, Math.floor(res.y / halfDiv));
      bloomA = new THREE.WebGLRenderTarget(bw, bh, { depthBuffer: false, type: THREE.HalfFloatType });
      bloomB = new THREE.WebGLRenderTarget(bw, bh, { depthBuffer: false, type: THREE.HalfFloatType });
      // depth-of-field: a half-res depth pass + a blurred copy of the scene, mixed by
      // circle-of-confusion so far background softens while the gameplay plane stays crisp
      dofA = new THREE.WebGLRenderTarget(bw, bh, { depthBuffer: false, type: THREE.HalfFloatType });
      dofB = new THREE.WebGLRenderTarget(bw, bh, { depthBuffer: false, type: THREE.HalfFloatType });
      depthRT = new THREE.WebGLRenderTarget(bw, bh, { depthBuffer: true });
      depthRT.depthTexture = new THREE.DepthTexture(bw, bh, THREE.UnsignedIntType);

      brightMat = new THREE.ShaderMaterial({
        uniforms: { tScene: { value: null }, uThreshold: { value: 0.62 } },
        vertexShader: VERT,
        fragmentShader: `
          uniform sampler2D tScene; uniform float uThreshold; varying vec2 vUv;
          void main(){
            vec3 c = texture2D(tScene, vUv).rgb;
            float l = dot(c, vec3(0.299, 0.587, 0.114));
            float k = max(0.0, l - uThreshold);
            gl_FragColor = vec4(c * (k / (k + 0.35)), 1.0);
          }`
      });
      blurMat = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2(bw, bh) } },
        vertexShader: VERT,
        fragmentShader: `
          uniform sampler2D tDiffuse; uniform vec2 uDir; uniform vec2 uRes; varying vec2 vUv;
          void main(){
            vec2 px = uDir / uRes;
            vec3 c  = texture2D(tDiffuse, vUv).rgb * 0.227027;
            c += texture2D(tDiffuse, vUv + px * 1.3846).rgb * 0.316216;
            c += texture2D(tDiffuse, vUv - px * 1.3846).rgb * 0.316216;
            c += texture2D(tDiffuse, vUv + px * 3.2308).rgb * 0.070270;
            c += texture2D(tDiffuse, vUv - px * 3.2308).rgb * 0.070270;
            gl_FragColor = vec4(c, 1.0);
          }`
      });
      compMat = new THREE.ShaderMaterial({
        uniforms: {
          tScene: { value: null }, tBloom: { value: null }, tDof: { value: null }, tDepth: { value: null },
          uRes: { value: new THREE.Vector2() },
          uTime: { value: 0 }, uExposure: { value: 1 }, uContrast: { value: 1.06 },
          uSaturation: { value: 1.14 }, uBloom: { value: 0.62 }, uVignette: { value: 0.55 },
          uGrain: { value: 0.045 }, uAberr: { value: 0 }, uFlash: { value: 0 },
          uDof: { value: 0 }, uFocus: { value: 30 }, uNear: { value: 1 }, uFar: { value: 300 },
          uReflStr: { value: 0 }, uReflY: { value: 0 }, uReflRipple: { value: 1 }, uReflFade: { value: 1.6 },
          uReflCol: { value: new THREE.Color(0.62, 0.78, 0.95) },
          uTint: { value: new THREE.Color(1, 1, 1) }, uFlashCol: { value: new THREE.Color(1, 1, 1) }
        },
        vertexShader: VERT,
        fragmentShader: `
          uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tDof; uniform sampler2D tDepth;
          uniform vec2 uRes; uniform float uTime;
          uniform float uExposure, uContrast, uSaturation, uBloom, uVignette, uGrain, uAberr, uFlash;
          uniform float uDof, uFocus, uNear, uFar;
          uniform float uReflStr, uReflY, uReflRipple, uReflFade; uniform vec3 uReflCol;
          uniform vec3 uTint, uFlashCol; varying vec2 vUv;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          vec3 toSRGB(vec3 c){
            return mix(1.055 * pow(max(c, 0.0), vec3(1.0/2.4)) - 0.055, c * 12.92, step(c, vec3(0.0031308)));
          }
          void main(){
            vec2 uv = vUv; vec2 cc = uv - 0.5; float r2 = dot(cc, cc);
            float ab = uAberr * (0.45 + r2);
            vec3 col;
            col.r = texture2D(tScene, uv + cc * ab * 0.012).r;
            col.g = texture2D(tScene, uv).g;
            col.b = texture2D(tScene, uv - cc * ab * 0.012).b;
            // depth-of-field: blend in the blurred scene by circle-of-confusion
            if (uDof > 0.001) {
              float zb = texture2D(tDepth, uv).x;
              float ndc = zb * 2.0 - 1.0;
              float linEye = (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
              float coc = clamp((abs(linEye - uFocus) - 4.0) / 42.0, 0.0, 1.0) * uDof;
              col = mix(col, texture2D(tDof, uv).rgb, coc);
            }
            // water / wet-floor: mirror the scene above the surface line with ripple + tint
            if (uReflStr > 0.001 && uv.y < uReflY) {
              float below = uReflY - uv.y;
              float rip = sin(uv.x * 38.0 + uTime * 0.05) * 0.003 * uReflRipple * (0.4 + below * 1.5);
              vec3 refl = texture2D(tScene, vec2(uv.x + rip * 0.6, clamp(uReflY + below + rip, 0.0, 1.0))).rgb;
              col = mix(col, refl * uReflCol, uReflStr * clamp(1.0 - below * uReflFade, 0.0, 1.0));
            }
            col += texture2D(tBloom, uv).rgb * uBloom;
            col *= uExposure * uTint;
            col = (col - 0.5) * uContrast + 0.5;
            float l = dot(col, vec3(0.299, 0.587, 0.114));
            col = mix(vec3(l), col, uSaturation);
            col = mix(col, uFlashCol, clamp(uFlash, 0.0, 1.0));
            float vig = smoothstep(0.9, 0.18, r2 * 2.0);
            col *= mix(1.0, vig, uVignette);
            col = max(col, 0.0);
            col = toSRGB(col);
            col += (hash(uv * uRes + uTime) - 0.5) * uGrain;
            gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
          }`
      });

      fsScene = new THREE.Scene();
      fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), brightMat);
      quad.frustumCulled = false;
      fsScene.add(quad);

      Post.enabled = true;
    } catch (e) {
      console.warn('Post-processing unavailable, falling back to direct render:', e && e.message);
      Post.enabled = false;
    }
  };

  Post.resize = function () {
    if (!Post.enabled) return;
    renderer.getDrawingBufferSize(res);
    sceneRT.setSize(res.x, res.y);
    const bw = Math.max(1, Math.floor(res.x / halfDiv)), bh = Math.max(1, Math.floor(res.y / halfDiv));
    bloomA.setSize(bw, bh); bloomB.setSize(bw, bh);
    dofA.setSize(bw, bh); dofB.setSize(bw, bh); depthRT.setSize(bw, bh);
    blurMat.uniforms.uRes.value.set(bw, bh);
    compMat.uniforms.uRes.value.copy(res);
  };

  // biome / mood grade — pass any subset of { exposure, contrast, saturation, bloom, vignette, grain, tint }
  Post.setGrade = function (g) {
    if (!g) return;
    for (const k of ['exposure', 'contrast', 'saturation', 'bloom', 'vignette', 'grain', 'dof'])
      if (g[k] !== undefined) target[k] = g[k];
    if (g.tint !== undefined) target.tint.set(g.tint);
  };
  // grade smoothing rate (per second); raise for snappy room loads, lower for slow fades
  Post.gradeRate = 3;
  Post.setGradeRate = r => { Post.gradeRate = r > 0 ? r : 3; };
  // user graphics toggles (Settings menu): master 0..1 multipliers per effect
  Post.fx = { bloom: 1, dof: 1, reflections: 1, aberr: 1, vignette: 1 };
  Post.setFX = function (o) { if (!o) return; for (const k in o) if (k in Post.fx) Post.fx[k] = o[k]; };
  // transient hit/landing feedback: a chromatic-aberration spike (+ optional flash)
  Post.punch = function (amt) { aberr = Math.min(2.5, aberr + (amt || 0.6)); };
  Post.flash = function (amt, color) { flash = Math.max(flash, amt || 0.4); if (color !== undefined) flashCol.set(color); };

  function drawQuad(mat, rt) {
    quad.material = mat;
    renderer.setRenderTarget(rt || null);
    renderer.render(fsScene, fsCam);
  }

  Post.render = function (dt) {
    if (!Post.enabled) { renderer.render(G.scene, G.camera); return; }
    dt = dt || 0.016;
    timeAcc += dt;
    // smooth grade toward biome target; decay transient effects
    const k = Math.min(1, dt * Post.gradeRate);
    for (const p of ['exposure', 'contrast', 'saturation', 'bloom', 'vignette', 'grain', 'dof'])
      grade[p] += (target[p] - grade[p]) * k;
    grade.tint.lerp(target.tint, k);
    aberr *= Math.max(0, 1 - dt * 6); flash *= Math.max(0, 1 - dt * 5);

    const lowQ = Post.quality === 'low';
    const dofOn = !lowQ && grade.dof > 0.01 && Post.fx.dof > 0.01;

    // 1) scene -> sceneRT
    renderer.setRenderTarget(sceneRT);
    renderer.render(G.scene, G.camera);

    // 1b) depth-of-field: half-res depth pass + a blurred copy of the scene
    if (dofOn) {
      renderer.setRenderTarget(depthRT);          // grabs the scene's depth into depthRT.depthTexture
      renderer.render(G.scene, G.camera);
      blurMat.uniforms.tDiffuse.value = sceneRT.texture; blurMat.uniforms.uDir.value.set(1.4, 0);
      drawQuad(blurMat, dofA);
      blurMat.uniforms.tDiffuse.value = dofA.texture; blurMat.uniforms.uDir.value.set(0, 1.4);
      drawQuad(blurMat, dofB);
      blurMat.uniforms.tDiffuse.value = dofB.texture; blurMat.uniforms.uDir.value.set(1.4, 0);
      drawQuad(blurMat, dofA);
    }

    // 2) bloom (skipped on low quality)
    if (!lowQ) {
      brightMat.uniforms.tScene.value = sceneRT.texture;
      brightMat.uniforms.uThreshold.value = 0.6;
      drawQuad(brightMat, bloomA);
      const iters = Post.quality === 'medium' ? 1 : 2;
      for (let i = 0; i < iters; i++) {
        blurMat.uniforms.tDiffuse.value = bloomA.texture; blurMat.uniforms.uDir.value.set(1, 0);
        drawQuad(blurMat, bloomB);
        blurMat.uniforms.tDiffuse.value = bloomB.texture; blurMat.uniforms.uDir.value.set(0, 1);
        drawQuad(blurMat, bloomA);
      }
    }

    // 3) composite -> screen
    const u = compMat.uniforms;
    u.tScene.value = sceneRT.texture;
    u.tBloom.value = lowQ ? null : bloomA.texture;
    u.tDof.value = dofA.texture; u.tDepth.value = depthRT.depthTexture;
    u.uTime.value = timeAcc * 60.0;
    u.uExposure.value = grade.exposure; u.uContrast.value = grade.contrast;
    u.uSaturation.value = grade.saturation; u.uBloom.value = (lowQ ? 0 : grade.bloom) * Post.fx.bloom;
    u.uVignette.value = grade.vignette * Post.fx.vignette; u.uGrain.value = grade.grain;
    u.uAberr.value = aberr * Post.fx.aberr; u.uFlash.value = flash;
    u.uDof.value = (dofOn ? grade.dof : 0) * Post.fx.dof;
    u.uFocus.value = (G.camera && G.camera.position) ? G.camera.position.z : 30;
    u.uNear.value = (G.camera && G.camera.near) || 1; u.uFar.value = (G.camera && G.camera.far) || 300;
    // project the world water line to a screen uv.y
    if (water.y !== null && water.strength > 0.001 && Post.fx.reflections > 0.001 && G.camera) {
      _wv.set(G.camera.position.x, water.y, 0).project(G.camera);
      u.uReflStr.value = water.strength * Post.fx.reflections; u.uReflY.value = _wv.y * 0.5 + 0.5;
      u.uReflRipple.value = water.ripple; u.uReflFade.value = water.fade; u.uReflCol.value.copy(water.color);
    } else u.uReflStr.value = 0;
    u.uTint.value.copy(grade.tint); u.uFlashCol.value.copy(flashCol);
    drawQuad(compMat, null);
    renderer.setRenderTarget(null);
  };
})();
