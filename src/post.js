// MOSSVEIL — post.js : cinematic post-processing (bloom, colour grade, vignette,
// film grain, chromatic aberration) built on raw Three.js render targets — no addons,
// so it runs from the single vendored three.min.js on file:// and GitHub Pages.
(function () {
  const Post = G.Post = { enabled: false, quality: 'high' };

  const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  let renderer, fsScene, fsCam, quad;
  let sceneRT, depthRT, dofA, dofB;
  let brightMat, blurMat, dsMat, usMat, compMat;
  let bloomMips = [];
  const NMIPS = 5;
  const res = new THREE.Vector2();
  let halfDiv = 2;
  let prevCamX = null, prevCamY = null;   // for camera motion blur
  const MAXL = 24;   // max dynamic lights sampled in the composite

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
  const water = { y: null, strength: 0.55, ripple: 1, fade: 1.6, caustics: 0.5, color: new THREE.Color(0.62, 0.78, 0.95) };
  const _wv = new THREE.Vector3();
  Post.setWater = function (o) {
    if (!o) { water.y = null; return; }
    water.y = (o.y !== undefined) ? o.y : water.y;
    if (o.strength !== undefined) water.strength = o.strength;
    if (o.ripple !== undefined) water.ripple = o.ripple;
    if (o.fade !== undefined) water.fade = o.fade;
    if (o.caustics !== undefined) water.caustics = o.caustics;
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
      // dual-filter Kawase bloom: a small mip pyramid (down- then up-sampled) for a wide soft glow
      for (let i = 0; i < NMIPS; i++) {
        bloomMips.push(new THREE.WebGLRenderTarget(Math.max(1, bw >> i), Math.max(1, bh >> i),
          { depthBuffer: false, type: THREE.HalfFloatType }));
      }
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
      // Kawase dual-filter downsample (13-tap, energy-preserving)
      dsMat = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } },
        vertexShader: VERT,
        fragmentShader: `
          uniform sampler2D tDiffuse; uniform vec2 uTexel; varying vec2 vUv;
          void main(){
            vec2 t = uTexel;
            vec3 c = texture2D(tDiffuse, vUv).rgb * 0.125;
            c += texture2D(tDiffuse, vUv + vec2(-t.x, -t.y)).rgb * 0.125;
            c += texture2D(tDiffuse, vUv + vec2( t.x, -t.y)).rgb * 0.125;
            c += texture2D(tDiffuse, vUv + vec2(-t.x,  t.y)).rgb * 0.125;
            c += texture2D(tDiffuse, vUv + vec2( t.x,  t.y)).rgb * 0.125;
            c += texture2D(tDiffuse, vUv + vec2(-2.0*t.x, 0.0)).rgb * 0.0625;
            c += texture2D(tDiffuse, vUv + vec2( 2.0*t.x, 0.0)).rgb * 0.0625;
            c += texture2D(tDiffuse, vUv + vec2(0.0, -2.0*t.y)).rgb * 0.0625;
            c += texture2D(tDiffuse, vUv + vec2(0.0,  2.0*t.y)).rgb * 0.0625;
            c += texture2D(tDiffuse, vUv + vec2(-2.0*t.x, -2.0*t.y)).rgb * 0.03125;
            c += texture2D(tDiffuse, vUv + vec2( 2.0*t.x, -2.0*t.y)).rgb * 0.03125;
            c += texture2D(tDiffuse, vUv + vec2(-2.0*t.x,  2.0*t.y)).rgb * 0.03125;
            c += texture2D(tDiffuse, vUv + vec2( 2.0*t.x,  2.0*t.y)).rgb * 0.03125;
            gl_FragColor = vec4(c, 1.0);
          }`
      });
      // 3x3 tent upsample, additively blended back up the pyramid
      usMat = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } },
        vertexShader: VERT, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
        fragmentShader: `
          uniform sampler2D tDiffuse; uniform vec2 uTexel; varying vec2 vUv;
          void main(){
            vec2 t = uTexel;
            vec3 c = texture2D(tDiffuse, vUv).rgb * 4.0;
            c += texture2D(tDiffuse, vUv + vec2(-t.x, 0.0)).rgb * 2.0;
            c += texture2D(tDiffuse, vUv + vec2( t.x, 0.0)).rgb * 2.0;
            c += texture2D(tDiffuse, vUv + vec2(0.0, -t.y)).rgb * 2.0;
            c += texture2D(tDiffuse, vUv + vec2(0.0,  t.y)).rgb * 2.0;
            c += texture2D(tDiffuse, vUv + vec2(-t.x, -t.y)).rgb;
            c += texture2D(tDiffuse, vUv + vec2( t.x, -t.y)).rgb;
            c += texture2D(tDiffuse, vUv + vec2(-t.x,  t.y)).rgb;
            c += texture2D(tDiffuse, vUv + vec2( t.x,  t.y)).rgb;
            gl_FragColor = vec4(c / 16.0, 1.0);
          }`
      });
      const lPos = [], lCol = [], lRad = new Float32Array(MAXL), lInt = new Float32Array(MAXL);
      for (let i = 0; i < MAXL; i++) { lPos.push(new THREE.Vector2()); lCol.push(new THREE.Vector3()); }
      compMat = new THREE.ShaderMaterial({
        uniforms: {
          tScene: { value: null }, tBloom: { value: null }, tDof: { value: null }, tDepth: { value: null },
          uRes: { value: new THREE.Vector2() },
          uTime: { value: 0 }, uExposure: { value: 1 }, uContrast: { value: 1.06 }, uTonemap: { value: 1 },
          uSaturation: { value: 1.14 }, uBloom: { value: 0.62 }, uVignette: { value: 0.55 },
          uGrain: { value: 0.045 }, uAberr: { value: 0 }, uFlash: { value: 0 }, uMotion: { value: new THREE.Vector2() },
          uDof: { value: 0 }, uFocus: { value: 30 }, uNear: { value: 1 }, uFar: { value: 300 },
          uAO: { value: 0 }, uAORad: { value: 0.006 },
          uReflStr: { value: 0 }, uReflY: { value: 0 }, uReflRipple: { value: 1 }, uReflFade: { value: 1.6 }, uCaustic: { value: 0 },
          uReflCol: { value: new THREE.Color(0.62, 0.78, 0.95) },
          uLightOn: { value: 0 }, uLightCount: { value: 0 }, uAspect: { value: 1.78 }, uRim: { value: 0.7 }, uLightStr: { value: 1 },
          uAmbient: { value: new THREE.Vector3(0.32, 0.34, 0.4) },
          uLightPos: { value: lPos }, uLightCol: { value: lCol }, uLightRad: { value: lRad }, uLightInt: { value: lInt },
          uShadow: { value: null }, uShadowOn: { value: 0 }, uShadowMax: { value: 28 }, uShadowSoft: { value: 11 }, uLightDebug: { value: 0 },
          uRoomSize: { value: new THREE.Vector2(1, 1) }, uCamPos: { value: new THREE.Vector2() }, uTanHalf: { value: 0.2867 },
          uTint: { value: new THREE.Color(1, 1, 1) }, uFlashCol: { value: new THREE.Color(1, 1, 1) }
        },
        vertexShader: VERT,
        fragmentShader: `
          uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tDof; uniform sampler2D tDepth;
          uniform vec2 uRes; uniform float uTime;
          uniform float uExposure, uContrast, uSaturation, uBloom, uVignette, uGrain, uAberr, uFlash, uTonemap;
          uniform float uDof, uFocus, uNear, uFar, uAO, uAORad;
          uniform float uReflStr, uReflY, uReflRipple, uReflFade, uCaustic; uniform vec3 uReflCol; uniform vec2 uMotion;
          uniform float uLightOn, uAspect, uRim, uLightStr; uniform int uLightCount; uniform vec3 uAmbient;
          uniform vec2 uLightPos[24]; uniform vec3 uLightCol[24]; uniform float uLightRad[24]; uniform float uLightInt[24];
          uniform sampler2D uShadow; uniform float uShadowOn, uShadowMax, uShadowSoft, uTanHalf, uLightDebug;
          uniform vec2 uRoomSize, uCamPos;
          uniform vec3 uTint, uFlashCol; varying vec2 vUv;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float linAt(vec2 p){ float z = texture2D(tDepth, p).x; float n = z * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - n * (uFar - uNear)); }
          float sdfAt(vec2 wp){ return (texture2D(uShadow, wp / uRoomSize).r * 2.0 - 1.0) * uShadowMax; }   // signed world dist (− inside terrain)
          // screen-space ambient occlusion from depth: darken where nearer geometry crowds a pixel
          float computeAO(vec2 uv, float d0){
            float occ = 0.0, jit = hash(uv * uRes + uTime) * 6.2831853;
            for (int i = 0; i < 8; i++){
              float a = float(i) * 0.7853982 + jit;
              vec2 o = vec2(cos(a), sin(a)) * uAORad * (0.5 + 0.5 * hash(uv * uRes + float(i)));
              float diff = d0 - linAt(uv + o);                 // >0: neighbour is in front (occluder)
              // tight contact range only — a closer layer right next to this pixel, not far backdrops
              occ += step(0.15, diff) * smoothstep(1.4, 0.15, diff);
            }
            return 1.0 - (occ / 8.0) * uAO;
          }
          // sphere-traced soft shadow: march from a surface point toward a light through the SDF
          float softShadow(vec2 wp, vec2 lp){
            vec2 dir = lp - wp; float dl = length(dir); if (dl < 0.001) return 1.0; dir /= dl;
            float res = 1.0, t = 0.35;
            for (int s = 0; s < 28; s++){
              if (t >= dl) break;
              float h = sdfAt(wp + dir * t);
              if (h < 0.06) return 0.0;
              res = min(res, uShadowSoft * h / t);
              t += clamp(h, 0.35, 3.0);
            }
            return clamp(res, 0.0, 1.0);
          }
          vec3 toSRGB(vec3 c){
            return mix(1.055 * pow(max(c, 0.0), vec3(1.0/2.4)) - 0.055, c * 12.92, step(c, vec3(0.0031308)));
          }
          // animated underwater caustics (moving wave-interference web)
          float caustics(vec2 uv){
            float ct = uTime * 0.013;
            vec2 p = mod(uv * 6.2831853, 6.2831853) - 250.0, i = p;
            float c = 1.0, inten = 0.0035;
            for (int n = 0; n < 4; n++){
              float t = ct * (1.0 - (3.5 / float(n + 1)));
              i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
              c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
            }
            c /= 4.0; c = 1.17 - pow(c, 1.4);
            return pow(abs(c), 8.0);
          }
          // ACES filmic tonemap (Narkowicz fit) — soft filmic shoulder on highlights
          vec3 tmACES(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
          // AgX (minimal approximation) — modern look, preserves hue, desaturates highlights gracefully
          vec3 agxContrast(vec3 x){
            vec3 x2 = x * x, x4 = x2 * x2;
            return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
          }
          vec3 tmAgX(vec3 col){
            const mat3 m = mat3(0.8424790623, 0.0423282423, 0.0423756549,
                                0.0784336000, 0.8784686365, 0.0784336000,
                                0.0792237451, 0.0791661275, 0.8791429738);
            const mat3 mi = mat3(1.1968790051, -0.0528968518, -0.0529716355,
                                -0.0980208811, 1.1519031299, -0.0980434501,
                                -0.0990297441, -0.0989611768, 1.1510736726);
            col = m * col;
            col = clamp((clamp(log2(col), -12.473931, 4.026069) + 12.473931) / 16.5, 0.0, 1.0);
            col = agxContrast(col);
            col = mi * col;
            return pow(max(col, 0.0), vec3(2.2));
          }
          vec3 tonemap(vec3 c, float mode){
            if (mode < 0.5) return c;
            if (mode < 1.5) return tmACES(c);
            return tmAgX(c);
          }
          void main(){
            vec2 uv = vUv; vec2 cc = uv - 0.5; float r2 = dot(cc, cc);
            float ab = uAberr * (0.45 + r2);
            vec3 col;
            if (dot(uMotion, uMotion) > 1e-7) {
              // camera motion blur: average taps along the per-frame screen velocity
              vec3 acc = vec3(0.0);
              for (int i = 0; i < 6; i++) acc += texture2D(tScene, uv + uMotion * (float(i) / 5.0 - 0.5)).rgb;
              col = acc / 6.0;
            } else {
              col.r = texture2D(tScene, uv + cc * ab * 0.012).r;
              col.g = texture2D(tScene, uv).g;
              col.b = texture2D(tScene, uv - cc * ab * 0.012).b;
            }
            // linear eye depth (depth pass runs whenever DOF or lighting is on)
            float zb = texture2D(tDepth, uv).x;
            float ndc = zb * 2.0 - 1.0;
            float linEye = (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
            // depth-of-field: blend in the blurred scene by circle-of-confusion
            if (uDof > 0.001) {
              float coc = clamp((abs(linEye - uFocus) - 4.0) / 42.0, 0.0, 1.0) * uDof;
              col = mix(col, texture2D(tDof, uv).rgb, coc);
            }
            // water / wet-floor: mirror the scene above the surface line with ripple + tint
            if (uReflStr > 0.001 && uv.y < uReflY) {
              float below = uReflY - uv.y;
              float rip = sin(uv.x * 38.0 + uTime * 0.05) * 0.003 * uReflRipple * (0.4 + below * 1.5);
              vec3 refl = texture2D(tScene, vec2(uv.x + rip * 0.6, clamp(uReflY + below + rip, 0.0, 1.0))).rgb;
              col = mix(col, refl * uReflCol, uReflStr * clamp(1.0 - below * uReflFade, 0.0, 1.0));
              // animated caustics dancing under the surface (fade in just below, out with depth)
              if (uCaustic > 0.001) {
                float ca = caustics(vec2(uv.x * uAspect, uv.y) * 5.5);
                float cfade = smoothstep(0.0, 0.04, below) * clamp(1.0 - below * 0.7, 0.0, 1.0);
                col += uReflCol * ca * uCaustic * cfade;
              }
            }
            // ambient occlusion — contact shadows / crevice darkening on the gameplay layer
            if (uAO > 0.001) {
              float aogp = 1.0 - smoothstep(uFocus + 3.0, uFocus + 9.0, linEye);
              if (aogp > 0.01) col *= mix(1.0, computeAO(uv, linEye), aogp);
            }
            // dynamic 2D lighting: flat surfaces darken to ambient and pool coloured light;
            // already-bright (emissive) pixels — sky, glows, the lamps themselves — stay lit
            if (uLightOn > 0.5) {
              // only the gameplay layer is lit; the far atmospheric backdrop stays bright
              float gp = 1.0 - smoothstep(uFocus + 3.0, uFocus + 9.0, linEye);
              if (uLightDebug > 1.5) { gl_FragColor = vec4(vec3(gp), 1.0); return; }
              if (gp > 0.001) {
                // reconstruct this pixel's world position from its depth (camera is axis-aligned)
                vec2 pw = uCamPos + (uv - 0.5) * 2.0 * uTanHalf * linEye * vec2(uAspect, 1.0);
                // screen-space surface normal from depth → offset the shadow origin off the
                // surface (into the lit air) so terrain never self-shadows, and feed the rim
                float e = 0.003;
                float gdr = linAt(uv + vec2(e, 0.0)), gdl = linAt(uv - vec2(e, 0.0));
                float gdu = linAt(uv + vec2(0.0, e)), gdd = linAt(uv - vec2(0.0, e));
                // outward normal points toward the air (greater depth): ∇(linEye) — used to
                // push the shadow origin off the surface so terrain never self-shadows
                vec3 N = normalize(vec3(clamp(gdr - gdl, -3.0, 3.0), clamp(gdu - gdd, -3.0, 3.0), 0.12));
                float terrainGate = smoothstep(uFocus + 0.55, uFocus + 0.95, linEye);    // deep terrain layer only
                // SOFT 3D edge from the SDF: terrain glows gently as it nears a silhouette edge,
                // fading smoothly into the wall face (no hard outline line). Strongest near lights.
                float edgeGlow = (1.0 - smoothstep(0.0, 1.6, max(0.0, -sdfAt(pw)))) * terrainGate;
                vec2 swp = pw + N.xy * 0.6;
                vec3 lsum = vec3(0.0);
                for (int i = 0; i < 24; i++) {
                  if (i >= uLightCount) break;
                  float dist = distance(pw, uLightPos[i]), R = max(uLightRad[i], 1e-4);
                  float f = clamp(1.0 - dist / R, 0.0, 1.0);
                  float core = f * f * (3.0 - 2.0 * f);                       // bright pool
                  float halo = clamp(1.0 - dist / (R * 1.45), 0.0, 1.0) * 0.2; // soft volumetric scatter
                  float sh = (uShadowOn > 0.5 && i < 8) ? mix(1.0, softShadow(swp, uLightPos[i]), 0.85) : 1.0;
                  lsum += uLightCol[i] * (core + halo) * uLightInt[i] * sh;
                }
                float lum = dot(col, vec3(0.299, 0.587, 0.114));
                float emis = smoothstep(0.5, 0.85, lum);
                vec3 lit = mix(col * (uAmbient + lsum), col, emis);
                lit += lsum * edgeGlow * uRim * (1.0 - emis);   // soft coloured edge glow (no hard line)
                col = mix(col, lit, gp * uLightStr);
                if (uLightDebug > 0.5) col = mix(col, uAmbient + lsum, gp);   // debug: show the light/shadow term
              }
            }
            col += texture2D(tBloom, uv).rgb * uBloom;
            col *= uExposure * uTint;
            col = tonemap(col, uTonemap);          // filmic shoulder (ACES / AgX) on the exposed HDR
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
    for (let i = 0; i < bloomMips.length; i++) bloomMips[i].setSize(Math.max(1, bw >> i), Math.max(1, bh >> i));
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
  Post.lighting = true;       // dynamic 2D lights (Settings toggle)
  Post.lightStrength = 1;     // 0..1 — overall strength of the lighting effect (tuning)
  Post.lightRim = 0.55;       // strength of the soft SDF edge glow on terrain (no hard line)
  Post.shadows = true;        // soft shadows ray-marched from the per-room terrain SDF
  Post.shadowSoft = 11;       // penumbra hardness (higher = sharper shadows)
  Post.debugLight = 0;        // 1 = show light term, 2 = show gameplay gate (dev only)
  Post.tonemap = 1;           // 0 = none, 1 = ACES (filmic), 2 = AgX (modern)
  Post.ssao = 0.6;            // screen-space ambient occlusion strength (0 disables)
  Post.motion = 0.6;          // camera motion-blur strength (0 disables)
  // user graphics toggles (Settings menu): master 0..1 multipliers per effect
  Post.fx = { bloom: 1, dof: 1, reflections: 1, aberr: 1, vignette: 1 };
  Post.setFX = function (o) { if (!o) return; for (const k in o) if (k in Post.fx) Post.fx[k] = o[k]; };
  // transient hit/landing feedback: a chromatic-aberration spike (+ optional flash)
  Post.punch = function (amt) { aberr = Math.min(2.5, aberr + (amt || 0.6)); };
  Post.flash = function (amt, color) { flash = Math.max(flash, amt || 0.4); if (color !== undefined) flashCol.set(color); };

  function drawQuad(mat, rt, noClear) {
    quad.material = mat;
    renderer.setRenderTarget(rt || null);
    const prevAC = renderer.autoClear;
    if (noClear) renderer.autoClear = false;
    renderer.render(fsScene, fsCam);
    renderer.autoClear = prevAC;
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
    const Lt = G.Lights;
    const lightingActive = Post.lighting && Lt && Lt.enabled && Lt.list.length && G.camera;
    const needDepth = dofOn || lightingActive || (!lowQ && Post.ssao > 0.001);

    // 1) scene -> sceneRT
    renderer.setRenderTarget(sceneRT);
    renderer.render(G.scene, G.camera);

    // 1b) depth pass (DOF and/or the lighting depth-gate need it)
    if (needDepth) {
      renderer.setRenderTarget(depthRT);          // grabs the scene's depth into depthRT.depthTexture
      renderer.render(G.scene, G.camera);
    }
    // depth-of-field: a blurred copy of the scene
    if (dofOn) {
      blurMat.uniforms.tDiffuse.value = sceneRT.texture; blurMat.uniforms.uDir.value.set(1.4, 0);
      drawQuad(blurMat, dofA);
      blurMat.uniforms.tDiffuse.value = dofA.texture; blurMat.uniforms.uDir.value.set(0, 1.4);
      drawQuad(blurMat, dofB);
      blurMat.uniforms.tDiffuse.value = dofB.texture; blurMat.uniforms.uDir.value.set(1.4, 0);
      drawQuad(blurMat, dofA);
    }

    // 2) dual-filter Kawase bloom (skipped on low quality): bright pass -> downsample
    //    pyramid -> additive tent upsample back to mip0 = wide, soft, multi-scale glow
    if (!lowQ) {
      brightMat.uniforms.tScene.value = sceneRT.texture;
      brightMat.uniforms.uThreshold.value = 0.6;
      drawQuad(brightMat, bloomMips[0]);
      const levels = Post.quality === 'medium' ? 4 : NMIPS;
      for (let i = 1; i < levels; i++) {
        const src = bloomMips[i - 1];
        dsMat.uniforms.tDiffuse.value = src.texture;
        dsMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        drawQuad(dsMat, bloomMips[i]);
      }
      for (let i = levels - 1; i > 0; i--) {
        const src = bloomMips[i];
        usMat.uniforms.tDiffuse.value = src.texture;
        usMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        drawQuad(usMat, bloomMips[i - 1], true);   // additive onto the larger mip
      }
    }

    // 3) composite -> screen
    const u = compMat.uniforms;
    u.tScene.value = sceneRT.texture;
    u.tBloom.value = lowQ ? null : bloomMips[0].texture;
    u.tDof.value = dofA.texture; u.tDepth.value = depthRT.depthTexture;
    u.uTime.value = timeAcc * 60.0;
    u.uExposure.value = grade.exposure; u.uContrast.value = grade.contrast; u.uTonemap.value = Post.tonemap;
    u.uSaturation.value = grade.saturation; u.uBloom.value = (lowQ ? 0 : grade.bloom) * Post.fx.bloom;
    u.uVignette.value = grade.vignette * Post.fx.vignette; u.uGrain.value = grade.grain;
    u.uAberr.value = aberr * Post.fx.aberr; u.uFlash.value = flash;
    u.uDof.value = (dofOn ? grade.dof : 0) * Post.fx.dof;
    u.uAO.value = lowQ ? 0 : Post.ssao;
    // camera motion blur: per-frame screen-space velocity (near zero when walking, larger on fast pans)
    if (G.camera && !lowQ && Post.motion > 0.001) {
      const cx = G.camera.position.x, cy = G.camera.position.y;
      if (prevCamX === null) { prevCamX = cx; prevCamY = cy; }
      const tan = Math.tan(G.camera.fov * 0.5 * Math.PI / 180), camDist = Math.abs(G.camera.position.z) || 30;
      const visH = 2 * tan * camDist, visW = visH * (res.x / Math.max(1, res.y));
      let mx = (cx - prevCamX) / Math.max(visW, 1e-3) * Post.motion;
      let my = (cy - prevCamY) / Math.max(visH, 1e-3) * Post.motion;
      prevCamX = cx; prevCamY = cy;
      u.uMotion.value.set(Math.max(-0.04, Math.min(0.04, mx)), Math.max(-0.04, Math.min(0.04, my)));
    } else { u.uMotion.value.set(0, 0); if (G.camera) { prevCamX = G.camera.position.x; prevCamY = G.camera.position.y; } }
    u.uFocus.value = (G.camera && G.camera.position) ? G.camera.position.z : 30;
    u.uNear.value = (G.camera && G.camera.near) || 1; u.uFar.value = (G.camera && G.camera.far) || 300;
    // project the world water line to a screen uv.y
    if (water.y !== null && water.strength > 0.001 && Post.fx.reflections > 0.001 && G.camera) {
      _wv.set(G.camera.position.x, water.y, 0).project(G.camera);
      u.uReflStr.value = water.strength * Post.fx.reflections; u.uReflY.value = _wv.y * 0.5 + 0.5;
      u.uReflRipple.value = water.ripple; u.uReflFade.value = water.fade; u.uReflCol.value.copy(water.color);
      u.uCaustic.value = lowQ ? 0 : (water.caustics != null ? water.caustics : 0.5) * Post.fx.reflections;
    } else { u.uReflStr.value = 0; u.uCaustic.value = 0; }
    // dynamic 2D lights → composite uniforms
    if (lightingActive) {
      const aspect = res.x / Math.max(1, res.y);
      const gathered = Lt.gather(G.camera, MAXL);
      let n = 0;
      for (const gl of gathered) {
        if (n >= MAXL) break;
        u.uLightPos.value[n].set(gl.x, gl.y);
        u.uLightCol.value[n].set(gl.r, gl.g, gl.b);
        u.uLightRad.value[n] = gl.rad;
        u.uLightInt.value[n] = gl.i;
        n++;
      }
      u.uLightCount.value = n;
      u.uAspect.value = aspect;
      const amb = Lt.ambient(); u.uAmbient.value.set(amb.r, amb.g, amb.b);   // Color→Vector3 (not .copy!)
      u.uLightStr.value = Post.lightStrength;
      u.uRim.value = Post.lightRim;
      // world-position reconstruction (camera is axis-aligned, looks down -z onto the plane)
      u.uCamPos.value.set(G.camera.position.x, G.camera.position.y);
      u.uTanHalf.value = Math.tan(G.camera.fov * 0.5 * Math.PI / 180);
      // soft shadows from the per-room terrain SDF
      const sh = Post.shadows && Lt.sdfTex;
      if (sh) {
        u.uShadow.value = Lt.sdfTex;
        u.uRoomSize.value.set(Lt.roomW, Lt.roomH);
        u.uShadowMax.value = Lt.sdfMaxD;
        u.uShadowSoft.value = Post.shadowSoft;
      }
      u.uShadowOn.value = sh ? 1 : 0;
      u.uLightDebug.value = Post.debugLight || 0;
      u.uLightOn.value = n > 0 ? 1 : 0;
    } else u.uLightOn.value = 0;
    u.uTint.value.copy(grade.tint); u.uFlashCol.value.copy(flashCol);
    drawQuad(compMat, null);
    renderer.setRenderTarget(null);
  };
})();
