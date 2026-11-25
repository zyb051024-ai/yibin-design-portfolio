(() => {
  const mobile = matchMedia('(max-width: 760px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let canvas = document.querySelector('#bg');
  const tau = Math.PI * 2;

  function randomSource() {
    let state = 202607;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function drawFallback() {
    const context = canvas.getContext('2d');
    if (!context) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    context.scale(dpr, dpr);
    context.globalCompositeOperation = 'lighter';
    const random = randomSource();
    const radius = Math.min(width * .42, height * .42);
    for (let i = 0; i < 24000; i++) {
      const t = random() * tau;
      const a = random() * tau;
      const ring = .32 + .042 * Math.sin(2 * t + .7) + .035 * Math.cos(3 * t - 1.3);
      const tube = .115 + .047 * Math.sin(t - .9) + .018 * Math.cos(3 * t + .6);
      const r = ring + tube * Math.cos(a);
      const x = r * Math.cos(t);
      const y = r * Math.sin(t);
      const z = tube * Math.sin(a);
      const size = (random() * .9 + .35) * Math.min(radius / 225, 1);
      const sparkle = random() > .987;
      context.fillStyle = sparkle ? '#a98afa90' : `rgba(220,224,233,${.018 + random() * .13})`;
      context.fillRect(width * .53 + (x * .95 + y * .15 - z * .26) * radius * 2.35,
        height * (mobile.matches ? .43 : .50) + (x * -.21 + y * .87 + z * .42) * radius * 2.35,
        size, size);
    }
  }

  const sculpt = `
    float surface(vec3 p) {
      float outer = length(p);
      if (outer > .8) return outer - .7;
      const float size = .80;
      p /= size;
      p.z = sqrt(p.z * p.z * 1.60 + .0215) - sqrt(.012);
      vec3 q = p.zxy;
      float angle = atan(q.z, q.y);
      float ring = .34 + .036 * sin(2. * angle + .7) + .024 * cos(3. * angle - 1.3);
      float thickness = .118 + .037 * sin(angle - .9) + .013 * cos(3. * angle + .6);
      float bend = .039 * sin(2. * angle - .65);
      vec2 section = vec2(length(q.yz) - ring, (q.x - .097 - bend) * 1.12);
      return (length(section) - thickness) * size;
    }
    vec3 normalAt(vec3 p) {
      vec2 e = vec2(.001, 0.);
      return normalize(vec3(surface(p+e.xyy)-surface(p-e.xyy), surface(p+e.yxy)-surface(p-e.yxy),
        surface(p+e.yyx)-surface(p-e.yyx)) + vec3(1.e-7));
    }
    vec3 curlWave(vec3 p) {
      vec3 a = vec3(3.3, -1.7, 5.1), b = vec3(2.8, 4.2, -2.9), c = vec3(-4.2, 2.5, 2.7);
      return normalize(cross(a, vec3(0., 1., .4)) * cos(dot(a,p))
        + cross(b, vec3(.4, 0., 1.)) * cos(dot(b,p) + 1.7)
        + cross(c, vec3(1., .4, 0.)) * cos(dot(c,p) - 2.1) + vec3(1.e-7));
    }`;

  const stepShader = `
    vec3 pos = texture2D(previous, uvField).xyz;
    vec3 root = texture2D(origin, uvField).xyz;
    if (length(pos) > .7) pos *= .5;
    pos += curlWave(pos * .1 + clockTime * .05) * .0002 * hz;
    vec3 n = normalAt(pos);
    pos += cross(normalize(pos + vec3(1.e-7)), n) * .0005 * hz;
    float pull = mix(.0275, .5, smoothstep(0., 2.7, clockTime));
    pos -= n * surface(pos) * pull * min(hz, 1.4);
    pos += (root - pos) * .0002 * hz;
    if (fluidOn > .5) {
      vec4 clip = cameraProjection * particleModel * vec4(pos, 1.);
      vec2 screen = (clip.xy / clip.w) * .5 + .5;
      if (screen.x > 0. && screen.x < 1. && screen.y > 0. && screen.y < 1.) {
        vec2 flow = texture2D(fluidVelocity, screen).xy;
        float dye = texture2D(fluidDensity, screen).r;
        pos += (cameraWorld * vec4(flow, 0., 0.)).xyz * .0001 * hz * .4 * dye;
      }
    }
    gl_FragColor = vec4(pos, 1.);
  `;

  function matcap() {
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 64;
    const context = sprite.getContext('2d');
    const light = context.createRadialGradient(23, 19, 1, 32, 32, 32);
    light.addColorStop(0, '#fff');
    light.addColorStop(.38, '#bdbdbd');
    light.addColorStop(.76, '#646464');
    light.addColorStop(1, '#202020');
    context.fillStyle = light;
    context.fillRect(0, 0, 64, 64);
    return new THREE.TextureLoader().load(sprite.toDataURL('image/png'));
  }

  function makeCloud(size, passes) {
    const count = size * size;
    const initial = new Float32Array(count * 4);
    const lookup = new Float32Array(count * 3);
    const randoms = new Float32Array(count * 4);
    const random = randomSource();
    for (let i = 0; i < count; i++) {
      const k = i * 4;
      lookup[i * 3] = (i % size + .5) / size;
      lookup[i * 3 + 1] = (Math.floor(i / size) + .5) / size;
      for (let j = 0; j < 3; j++) initial[k + j] = random() * 2 - 1;
      initial[k + 3] = 1;
      for (let j = 0; j < 4; j++) randoms[k + j] = random();
    }
    const origin = new THREE.DataTexture(initial, size, size, THREE.RGBAFormat, THREE.FloatType);
    origin.needsUpdate = true;
    const positions = passes.pair(size, THREE.FloatType, THREE.NearestFilter);
    const simulation = passes.shader(`
      uniform sampler2D previous, origin, fluidVelocity, fluidDensity;
      uniform mat4 cameraProjection, particleModel, cameraWorld;
      uniform float clockTime, hz, fluidOn;
      ${sculpt}`, stepShader, {
      previous: origin, origin, fluidVelocity: null, fluidDensity: null, cameraProjection: null,
      particleModel: null, cameraWorld: null, clockTime: 0, hz: 1, fluidOn: 0
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(lookup, 3));
    geometry.setAttribute('random', new THREE.BufferAttribute(randoms, 4));
    const material = new THREE.ShaderMaterial({
      uniforms: { pointsTexture: { value: origin }, sprite: { value: matcap() }, clockTime: { value: 0 }, dpi: { value: 1 } },
      transparent: true, blending: THREE.AdditiveBlending, depthTest: true, depthWrite: false,
      vertexShader: `
        attribute vec4 random;
        uniform sampler2D pointsTexture;
        uniform float dpi;
        varying vec4 particle;
        varying float pointScale;
        void main() {
          particle = random;
          vec3 p = texture2D(pointsTexture, position.xy).xyz;
          p *= mix(1., 1.5, pow(random.y, 150.));
          vec4 view = modelViewMatrix * vec4(p, 1.);
          float distanceToEye = max(.1, -view.z);
          pointScale = smoothstep(3., 15., distanceToEye) * mix(.5, 1., random.z);
          gl_PointSize = .04 * dpi * 2. * pointScale * (1000. / distanceToEye);
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `
        uniform sampler2D sprite;
        uniform float clockTime;
        varying vec4 particle;
        varying float pointScale;
        void main() {
          vec2 p = gl_PointCoord - .5;
          float radius = length(p);
          if (radius > .5 || pointScale < .1) discard;
          float angle = sin(clockTime + particle.z * 20.) * .5 + 1.;
          vec2 rotated = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p + .5;
          float cap = texture2D(sprite, rotated).r;
          float gray = mix(0., .2, particle.x);
          vec3 color = mix(vec3(gray), vec3(.6, .45, 1.), pow(particle.z, 100.));
          float glint = .5 + (.4 + sin(clockTime * 4. + particle.y * 20.)) * pow(particle.z, 10.) * 2.5;
          vec3 soft = mix(color * (1. - (1. - 2. * cap) * (1. - color)),
            color + (2. * cap - 1.) * (sqrt(color) - color), step(.5, cap));
          vec3 lit = mix(color, soft, .8);
          lit = mix(lit, mix(2. * cap * lit, 1. - 2. * (1. - cap) * (1. - lit), step(.5, lit)), .2);
          gl_FragColor = vec4(lit * max(.13, glint) * (1. - smoothstep(.32, .5, radius)), 1.);
        }`
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return { points, origin, positions, simulation,
      dispose() {
        origin.dispose(); positions.read.dispose(); positions.write.dispose(); simulation.dispose();
        geometry.dispose(); material.uniforms.sprite.value.dispose(); material.dispose();
      }
    };
  }

  function startGpu() {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) return false;
    const renderer = new THREE.WebGLRenderer({ canvas, context: gl });
    renderer.setClearColor(0x000000, 1);
    const { FieldPasses, CursorFluid } = window.AxonFields;
    const passes = new FieldPasses(renderer);
    const fluid = new CursorFluid(passes);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, .1, 1000);
    const base = new THREE.Vector3(-1.17, 0, 6);
    const target = base.clone();
    const viewProjection = new THREE.Matrix4();
    camera.position.copy(base);
    const sculpture = new THREE.Group();
    sculpture.position.set(.343, .16, -1);
    sculpture.rotation.set(...[-28.4, 390, 4.92].map(THREE.MathUtils.degToRad));
    sculpture.scale.set(5, 5, 6);
    sculpture.updateMatrixWorld();
    scene.add(sculpture);

    let cloud, now = 0, lastFrame = 0, lastSplat = -Infinity;
    let width, height, pointer, previous, pointerTime, raf;
    const originalCanvas = canvas;

    function resize() {
      width = Math.max(1, canvas.clientWidth);
      height = Math.max(1, canvas.clientHeight);
      const dpr = Math.min(devicePixelRatio, 2);
      renderer.setRenderTarget(null);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.zoom = Math.min(1, camera.aspect / .85);
      camera.updateProjectionMatrix();
      fluid.resize(width, height);
      cloud.points.material.uniforms.dpi.value = dpr;
    }

    function rebuild() {
      if (cloud) {
        sculpture.remove(cloud.points);
        cloud.dispose();
      }
      cloud = makeCloud(mobile.matches ? 128 : 512, passes);
      sculpture.add(cloud.points);
      now = 0;
      resize();
    }

    function onPointer(event) {
      if (event.isPrimary === false) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (!previous || event.type === 'pointerdown') previous = pointer;
      pointerTime = performance.now();
    }

    function tick(timestamp) {
      raf = 0;
      const dt = lastFrame ? Math.min((timestamp - lastFrame) / 1000, .0333) : 1 / 60;
      lastFrame = timestamp;
      now += dt;
      const hz = dt * 60;
      if (pointer) {
        target.set(base.x - (pointer.x / width * 2 - 1), base.y + (pointer.y / height * 2 - 1) * 2, base.z);
        const dx = pointer.x - previous.x;
        const dy = pointer.y - previous.y;
        const distance = Math.hypot(dx, dy);
        if (distance > .01) {
          const end = new THREE.Vector2(pointer.x / width, 1 - pointer.y / height);
          const start = pointerTime - lastSplat > 50 ? end : new THREE.Vector2(previous.x / width, 1 - previous.y / height);
          fluid.splat(start, end, dx, dy, distance, width, height, mobile.matches);
          lastSplat = pointerTime;
          previous = pointer;
        }
      }
      camera.position.lerp(target, .05);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const fluidOn = timestamp - lastSplat < 1500;
      if (fluidOn) fluid.step();
      const { points, simulation, positions, origin } = cloud;
      passes.run(simulation, positions.write, {
        previous: simulation.uniforms.clockTime.value === 0 ? origin : positions.read.texture,
        fluidVelocity: fluid.velocity.read.texture, fluidDensity: fluid.mask.texture,
        clockTime: now, hz, fluidOn: Number(fluidOn), cameraWorld: camera.matrixWorld,
        cameraProjection: viewProjection, particleModel: sculpture.matrixWorld
      });
      positions.swap();
      points.material.uniforms.pointsTexture.value = positions.read.texture;
      points.material.uniforms.clockTime.value = now;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }

    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        lastFrame = 0;
        raf = requestAnimationFrame(tick);
      }
    }

    originalCanvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      removeEventListener('pointermove', onPointer);
      removeEventListener('pointerdown', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      mobile.removeEventListener('change', rebuild);
      useFallback();
    }, { once: true });
    addEventListener('pointermove', onPointer, { passive: true });
    addEventListener('pointerdown', onPointer, { passive: true });
    addEventListener('resize', resize);
    mobile.addEventListener('change', rebuild);
    document.addEventListener('visibilitychange', onVisibility);
    rebuild();
    canvas.dataset.renderer = 'gpu';
    onVisibility();
    return true;
  }

  function useFallback() {
    const replacement = canvas.cloneNode(false);
    canvas.replaceWith(replacement);
    canvas = replacement;
    canvas.dataset.renderer = 'static';
    drawFallback();
    addEventListener('resize', drawFallback);
  }

  reduced.addEventListener('change', () => location.reload());
  if (reduced.matches || !window.THREE || !startGpu()) useFallback();
})();
