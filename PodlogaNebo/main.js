const canvas = document.getElementById("glcanvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const gl = canvas.getContext("webgl");

if (!gl) {
  alert("WebGL nije podržan");
}

async function loadShaderSource(url) {
  const res = await fetch(url);
  return await res.text();
}

async function init() {
  const vsSource = await loadShaderSource("shaders/vertex.glsl");
  const fsSource = await loadShaderSource("shaders/fragment.glsl");

  const vertexShader = compileShader(gl.VERTEX_SHADER, vsSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fsSource);

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);
  gl.useProgram(shaderProgram);

  const size = 10;
  const vertices = new Float32Array([
    -size, 0, -size,  0.2, 0.6, 0.2,
     size, 0, -size,  0.2, 0.6, 0.2,
    -size, 0,  size,  0.2, 0.6, 0.2,
     size, 0,  size,  0.2, 0.6, 0.2,
  ]);
  const indices = new Uint16Array([0, 1, 2, 1, 2, 3]);

  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  const aPosition = gl.getAttribLocation(shaderProgram, "aPosition");
  const aColor = gl.getAttribLocation(shaderProgram, "aColor");

  gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 6 * 4, 0);
  gl.enableVertexAttribArray(aPosition);

  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 6 * 4, 3 * 4);
  gl.enableVertexAttribArray(aColor);

  const uProjection = gl.getUniformLocation(shaderProgram, "uProjection");
  const uView = gl.getUniformLocation(shaderProgram, "uView");

  const projection = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
  const view = lookAt([5, 5, 5], [0, 0, 0], [0, 1, 0]);

  gl.uniformMatrix4fv(uProjection, false, projection);
  gl.uniformMatrix4fv(uView, false, view);

  gl.clearColor(0.5, 0.8, 1.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
}

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function perspective(fov, aspect, near, far) {
  const f = 1.0 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * nf, -1,
    0, 0, (2 * near * far) * nf, 0,
  ]);
}

function lookAt(eye, target, up) {
  const z = normalize(subtract(eye, target));
  const x = normalize(cross(up, z));
  const y = cross(z, x);

  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0],
  ];
}

function dot(a, b) {
  return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
}

function normalize(v) {
  const len = Math.hypot(...v);
  return v.map(x => x / len);
}

init();