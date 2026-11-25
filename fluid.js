/* Eulerian fluid solver. Vector fields live in the XY channels, scalars in R. */
(() => {
  const vertex = `
    varying vec2 uvField;
    void main() { uvField = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `;

  class FieldPasses {
    constructor(renderer) {
      this.renderer = renderer;
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
      this.quad.frustumCulled = false;
      this.scene.add(this.quad);
    }

    shader(declarations, code, defaults) {
      return new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: `varying vec2 uvField; ${declarations}
          void main() { ${code} }`,
        uniforms: Object.fromEntries(Object.entries(defaults).map(([name, value]) => [name, { value }])),
        depthTest: false, depthWrite: false
      });
    }

    run(material, target, inputs = {}) {
      for (const [name, value] of Object.entries(inputs)) material.uniforms[name].value = value;
      this.quad.material = material;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, this.camera);
    }

    target(width, height, type = THREE.HalfFloatType, filter = THREE.LinearFilter) {
      const target = new THREE.WebGLRenderTarget(width, height, {
        type, minFilter: filter, magFilter: filter, depthBuffer: false, stencilBuffer: false
      });
      this.renderer.setRenderTarget(target);
      this.renderer.clear();
      return target;
    }

    pair(size, type, filter) {
      return {
        read: this.target(size, size, type, filter),
        write: this.target(size, size, type, filter),
        swap() { [this.read, this.write] = [this.write, this.read]; }
      };
    }
  }

  class CursorFluid {
    constructor(passes) {
      this.passes = passes;
      this.velocity = passes.pair(256);
      this.dye = passes.pair(512);
      this.pressure = passes.pair(256, THREE.HalfFloatType, THREE.NearestFilter);
      this.curl = passes.target(256, 256);
      this.divergence = passes.target(256, 256);
      const fields = 'uniform sampler2D field; uniform vec2 cell;';
      const neighbors = `
        vec4 l = texture2D(field, uvField - vec2(cell.x, 0.));
        vec4 r = texture2D(field, uvField + vec2(cell.x, 0.));
        vec4 b = texture2D(field, uvField - vec2(0., cell.y));
        vec4 t = texture2D(field, uvField + vec2(0., cell.y));`;
      const grid = { field: null, cell: new THREE.Vector2(1 / 256, 1 / 256) };
      const build = (decl, code, uniforms) => passes.shader(decl, code, uniforms);

      this.inject = build(`uniform sampler2D field; uniform vec2 start, end; uniform vec3 ink;
        uniform float radius, aspect;`, `
        vec2 rel = (uvField - start) * vec2(aspect, 1.);
        vec2 line = (end - start) * vec2(aspect, 1.);
        vec2 d = rel - line * clamp(dot(rel, line) / max(dot(line, line), 1e-7), 0., 1.);
        float weight = exp(-6. * dot(d, d) / max(radius * radius, 1e-7));
        gl_FragColor = vec4(texture2D(field, uvField).rgb + ink * weight, 1.);
      `, { field: null, start: null, end: null, ink: null, radius: 0, aspect: 1 });
      this.spin = build(fields, `${neighbors}
        gl_FragColor = vec4(.5 * (r.y - l.y - t.x + b.x), 0., 0., 1.);`, grid);
      this.confinement = build(`${fields} uniform sampler2D velocity;`, `${neighbors}
        vec2 force = .5 * vec2(abs(t.x) - abs(b.x), abs(r.x) - abs(l.x));
        force *= (30. / 60.) * texture2D(field, uvField).x / max(length(force), 1e-4);
        force.y *= -1.;
        vec2 result = texture2D(velocity, uvField).xy + force;
        gl_FragColor = vec4(clamp(result, -240., 240.), 0., 1.);`, { ...grid, velocity: null });
      this.spread = build(fields, `${neighbors}
        vec2 center = texture2D(field, uvField).xy;
        if (uvField.x < cell.x) l.x = -center.x;
        if (uvField.x > 1. - cell.x) r.x = -center.x;
        if (uvField.y < cell.y) b.y = -center.y;
        if (uvField.y > 1. - cell.y) t.y = -center.y;
        gl_FragColor = vec4(.5 * (r.x - l.x + t.y - b.y), 0., 0., 1.);`, grid);
      this.decay = build('uniform sampler2D field;',
        'gl_FragColor = texture2D(field, uvField) * .95;', { field: null });
      this.jacobi = build(`${fields} uniform sampler2D divergence;`, `${neighbors}
        float div = texture2D(divergence, uvField).x;
        gl_FragColor = vec4((l.x + r.x + b.x + t.x - div) * .25, 0., 0., 1.);`, { ...grid, divergence: null });
      this.project = build(`${fields} uniform sampler2D velocity;`, `${neighbors}
        vec2 result = texture2D(velocity, uvField).xy - vec2(r.x - l.x, t.x - b.x);
        gl_FragColor = vec4(result, 0., 1.);`, { ...grid, velocity: null });
      this.transport = build(`${fields} uniform sampler2D velocity; uniform float dissipation;`, `
        vec2 origin = uvField - texture2D(velocity, uvField).xy * cell / 60.;
        gl_FragColor = vec4(texture2D(field, origin).rgb * dissipation, 1.);
      `, { ...grid, velocity: null, dissipation: 1 });
      this.showDye = build('uniform sampler2D field;', `
        vec3 color = clamp(texture2D(field, uvField).rgb, 0., 1.);
        gl_FragColor = vec4(color, max(max(color.r, color.g), color.b));
      `, { field: null });
    }

    resize(width, height) {
      this.mask?.dispose();
      this.mask = this.passes.target(width, height, THREE.UnsignedByteType);
    }

    into(pair, shader, inputs = {}) {
      this.passes.run(shader, pair.write, { field: pair.read.texture, ...inputs });
      pair.swap();
    }

    splat(start, end, dx, dy, distance, width, height, mobile) {
      const force = Math.min(distance / 15, 1) * 10;
      const radius = Math.min(distance / 5, 1) * 60 * (mobile ? .8 : .6) / 200;
      const input = { start, end, radius, aspect: width / height };
      this.into(this.velocity, this.inject, { ...input, ink: new THREE.Vector3(dx * force, -dy * force, 1) });
      this.into(this.dye, this.inject, { ...input, ink: new THREE.Vector3(1, 1, 1) });
    }

    step() {
      const { passes, velocity, pressure, dye, curl, divergence } = this;
      passes.run(this.spin, curl, { field: velocity.read.texture });
      this.into(velocity, this.confinement, { field: curl.texture, velocity: velocity.read.texture });
      passes.run(this.spread, divergence, { field: velocity.read.texture });
      this.into(pressure, this.decay);
      for (let i = 0; i < 5; i++) this.into(pressure, this.jacobi, { divergence: divergence.texture });
      this.into(velocity, this.project, { field: pressure.read.texture, velocity: velocity.read.texture });
      this.into(velocity, this.transport, { velocity: velocity.read.texture, dissipation: .98 });
      this.into(dye, this.transport, { velocity: velocity.read.texture, dissipation: .97 });
      passes.run(this.showDye, this.mask, { field: dye.read.texture });
    }
  }

  window.AxonFields = { CursorFluid, FieldPasses };
})();
