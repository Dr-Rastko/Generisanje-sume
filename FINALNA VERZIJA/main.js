// --- GLOBALNE POSTAVKE ---
let NUM_TREES = 70;
const GROUND_SIZE = 80;
const MIN_TREE_SEPARATION = 10;
const TREE_TEXTURE_URL = 'drvo_tekstura.jpg'; // **OVDE PROMENI PUTANJU DO TVOJE TEKSTURE**

// --- PARAMETRI DRVEĆA ---
let treeParams = {
    iterations: 3,
    angle: 25,
    length: 1.7,
    trunkScale: 3.5,
    taper: 0.12,
    branchScale: 0.35,
    leafDensity: 0.9
};

// --- WebGL INICIJALIZACIJA ---
const canvas = document.getElementById('canvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const gl = canvas.getContext('webgl');
if (!gl) alert('WebGL nije podržan.');
gl.enable(gl.DEPTH_TEST);

// --- SHADERI I PROGRAM ---
// Funkcija za učitavanje shadera sa eksternog fajla
async function loadShader(url, type) {
    const response = await fetch(url);
    const source = await response.text();
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader error (' + url + '):', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(vs, fs) {
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

let program; // Declare program globally
let posLoc, texCoordLoc, normalLoc;
let mvpMatrixLoc, modelMatrixLoc, colorLoc, samplerLoc, useTextureLoc;
let lightDirLoc, lightColorLoc, ambientColorLoc, eyeLoc;

async function initShadersAndLocations() {
    const vertexShader = await loadShader('vertexShader.glsl', gl.VERTEX_SHADER);
    const fragmentShader = await loadShader('fragmentShader.glsl', gl.FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) {
        return; // Exit if shaders fail to load
    }

    program = createProgram(vertexShader, fragmentShader);
    gl.useProgram(program);

    posLoc = gl.getAttribLocation(program, 'a_position');
    texCoordLoc = gl.getAttribLocation(program, 'a_texCoord');
    normalLoc = gl.getAttribLocation(program, 'a_normal');

    mvpMatrixLoc = gl.getUniformLocation(program, 'u_mvpMatrix');
    modelMatrixLoc = gl.getUniformLocation(program, 'u_modelMatrix');
    colorLoc = gl.getUniformLocation(program, 'u_color');
    samplerLoc = gl.getUniformLocation(program, 'u_sampler');
    useTextureLoc = gl.getUniformLocation(program, 'u_useTexture');

    lightDirLoc = gl.getUniformLocation(program, 'u_lightDir');
    lightColorLoc = gl.getUniformLocation(program, 'u_lightColor');
    ambientColorLoc = gl.getUniformLocation(program, 'u_ambientColor');
    eyeLoc = gl.getUniformLocation(program, 'u_eye');
    
    // Now that program is ready, load texture and start rendering
    loadTexture(TREE_TEXTURE_URL);
    generateForest(); // Generate initial forest after shaders are ready
    render(); // Start the rendering loop
}

// --- TEKSTURA ---
let treeTexture = null;

function loadTexture(url) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                    new Uint8Array([0, 0, 255, 255])); // Blue placeholder

    const image = new Image();
    image.onload = function() {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

        if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        } else {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        }
        treeTexture = texture;
    };
    image.src = url;
    return texture;
}

function isPowerOf2(value) {
    return (value & (value - 1)) === 0;
}

// --- GEOMETRIJA ---
function createCylinder(r, h, s) {
    const v = [], i = [], uv = [], n = [];
    for(let j = 0; j <= s; j++) {
        const a = j * 2 * Math.PI / s;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        v.push(x, 0, z, x, h, z);
        uv.push(j / s, 0, j / s, 1);
        n.push(x / r, 0, z / r, x / r, 0, z / r);
    }
    const topCenterIdx = v.length / 3;
    v.push(0, h, 0);
    uv.push(0.5, 0.5);
    n.push(0, 1, 0);
    
    const bottomCenterIdx = v.length / 3;
    v.push(0, 0, 0);
    uv.push(0.5, 0.5);
    n.push(0, -1, 0);

    for(let j = 0; j < s; j++) {
        const p = j * 2;
        i.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
        
        i.push(topCenterIdx, (j * 2 + 3) % (s * 2), (j * 2 + 1)); 
        i.push(bottomCenterIdx, (j * 2) % (s * 2), (j * 2 + 2) % (s * 2));
    }
    return {
        verts: new Float32Array(v),
        idx: new Uint16Array(i),
        uvs: new Float32Array(uv),
        normals: new Float32Array(n)
    };
}

function createSphere(r, lat, lon) {
    const v = [], i = [], n = [];
    for(let a = 0; a <= lat; a++) {
        const th = a * Math.PI / lat;
        const sth = Math.sin(th), cth = Math.cos(th);
        for(let b = 0; b <= lon; b++) {
            const p = b * 2 * Math.PI / lon;
            const sp = Math.sin(p), cp = Math.cos(p);
            const x = r * cp * sth, y = r * cth, z = r * sp * sth;
            v.push(x, y, z);
            n.push(cp * sth, cth, sp * sth);
        }
    }
    for(let a = 0; a < lat; a++) {
        for(let b = 0; b < lon; b++) {
            const f = (a * (lon + 1)) + b;
            const s = f + lon + 1;
            i.push(f, s, f + 1, s, s + 1, f + 1);
        }
    }
    return {
        verts: new Float32Array(v),
        idx: new Uint16Array(i),
        uvs: new Float32Array(v.length / 3 * 2).fill(0),
        normals: new Float32Array(n)
    };
}

function createGround(s) {
    return {
        verts: new Float32Array([-s, 0, -s, s, 0, -s, s, 0, s, -s, 0, s]),
        idx: new Uint16Array([0, 1, 2, 0, 2, 3]),
        uvs: new Float32Array([0,0, 1,0, 1,1, 0,1]),
        normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0])
    };
}

const branchGeom = createCylinder(0.08, 1, 6);
const leafGeom = createSphere(0.18, 5, 5);
const groundGeom = createGround(GROUND_SIZE);

function createBuffer(data, type, usage) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(type, buffer);
    gl.bufferData(type, data, usage);
    return buffer;
}

const branchVBO = createBuffer(branchGeom.verts, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
const branchIBO = createBuffer(branchGeom.idx, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
const branchUVBO = createBuffer(branchGeom.uvs, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
const branchNBO = createBuffer(branchGeom.normals, gl.ARRAY_BUFFER, gl.STATIC_DRAW);

const leafVBO = createBuffer(leafGeom.verts, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
const leafIBO = createBuffer(leafGeom.idx, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
const leafNBO = createBuffer(leafGeom.normals, gl.ARRAY_BUFFER, gl.STATIC_DRAW);

const groundVBO = createBuffer(groundGeom.verts, gl.ARRAY_BUFFER, gl.STATIC_DRAW);
const groundIBO = createBuffer(groundGeom.idx, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW);
const groundNBO = createBuffer(groundGeom.normals, gl.ARRAY_BUFFER, gl.STATIC_DRAW);


// --- MATRIČNA MATEMATIKA ---
const m4 = {
    identity: () => new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),
    
    multiply: (a, b) => {
        const result = new Float32Array(16);
        for(let i = 0; i < 4; i++) {
            for(let j = 0; j < 4; j++) {
                let sum = 0;
                for(let k = 0; k < 4; k++) {
                    sum += a[i + k * 4] * b[k + j * 4];
                }
                result[i + j * 4] = sum;
            }
        }
        return result;
    },
    
    translate: (m, x, y, z) => m4.multiply(m, [1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]),
    scale: (m, x, y, z) => m4.multiply(m, [x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1]),
    
    rotate: (m, angle, axis) => {
        let [x, y, z] = axis;
        const len = Math.hypot(x, y, z);
        if(len < 1e-6) return m;
        x /= len; y /= len; z /= len;
        
        const s = Math.sin(angle), c = Math.cos(angle), t = 1 - c;
        const rot = m4.identity();
        rot[0] = x * x * t + c;       rot[1] = y * x * t + z * s; rot[2] = z * x * t - y * s;
        rot[4] = x * y * t - z * s; rot[5] = y * y * t + c;       rot[6] = z * y * t + x * s;
        rot[8] = x * z * t + y * s; rot[9] = y * z * t - x * s; rot[10] = z * z * t + c;
        return m4.multiply(m, rot);
    },
    
    perspective: (fov, aspect, near, far) => {
        const tan = Math.tan(fov / 2);
        return new Float32Array([
            1/(aspect * tan), 0, 0, 0,
            0, 1/tan, 0, 0,
            0, 0, (far + near)/(near - far), -1,
            0, 0, 2 * far * near/(near - far), 0
        ]);
    },
    
    lookAt: (eye, center, up) => {
        const z = new Float32Array([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]);
        let len = 1 / Math.hypot(z[0], z[1], z[2]);
        z[0] *= len; z[1] *= len; z[2] *= len;
        
        const x = new Float32Array([up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]]);
        len = 1 / Math.hypot(x[0], x[1], x[2]);
        x[0] *= len; x[1] *= len; x[2] *= len;
        
        const y = new Float32Array([z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]]);
        
        return new Float32Array([
            x[0], y[0], z[0], 0,
            x[1], y[1], z[1], 0,
            x[2], y[2], z[2], 0,
            -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
            -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
            -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
            1
        ]);
    }
};

// --- L-SISTEM ---
const lSystemPresets = {
    'simple3d': { axiom: 'F', rules: { 'F': 'F[+F][-F][/F][\\F]' } },
    'minimal3d': { axiom: 'X', rules: { 'X': 'F[+X][-X][/X]', 'F': 'F' } },
    'basic3d': { axiom: 'F', rules: { 'F': 'FF[+F][-F][\\F]' } }
};
const presetKeys = Object.keys(lSystemPresets);

function generateLSystem(axiom, rules, iterations) {
    let current = axiom;
    for(let i = 0; i < iterations; i++) {
        let next = '';
        for(const char of current) {
            next += rules[char] || char;
        }
        current = next;
    }
    return current;
}

// --- KLASA ZA DRVO ---
class Tree {
    constructor(x, z) {
        this.x = x;
        this.z = z;
        this.rotY = Math.random() * Math.PI * 2;
        const randomType = presetKeys[Math.floor(Math.random() * presetKeys.length)];
        const preset = lSystemPresets[randomType];
        this.preset = preset;
        this.regenerate();
    }

    regenerate() {
        this.lSystemString = generateLSystem(this.preset.axiom, this.preset.rules, treeParams.iterations);
        this.leafRandoms = [];
        let leafCounter = 0;
        for (const char of this.lSystemString) {
            if (char === ']') {
                const numLeaves = Math.round(treeParams.leafDensity * 8);
                const leafSet = [];
                for (let leafIdx = 0; leafIdx < numLeaves; leafIdx++) {
                    leafSet.push({
                        offsetX: (Math.random() - 0.5) * 0.6,
                        offsetY: (Math.random() - 0.5) * 0.4,
                        offsetZ: (Math.random() - 0.5) * 0.6,
                        rotX: (Math.random() - 0.5) * 0.5,
                        rotY: (Math.random() - 0.5) * 0.5,
                        rotZ: (Math.random() - 0.5) * 0.5
                    });
                }
                this.leafRandoms.push(leafSet);
            }
        }
    }

    draw(viewProjMatrix) {
        let initialMatrix = m4.translate(m4.identity(), this.x, 0, this.z);
        initialMatrix = m4.rotate(initialMatrix, this.rotY, [0, 1, 0]);
        const stack = [];
        let currentMatrix = initialMatrix;
        let branchScale = treeParams.trunkScale;
        let segmentCount = 0;
        let branchLevel = 0;
        const angle = treeParams.angle * Math.PI / 180;
        let leafRandomIdx = 0;

        for(const char of this.lSystemString) {
            switch(char) {
                case 'F':
                    if(branchLevel === 0) {
                        const taper = Math.max(0.3, 1 - (segmentCount * treeParams.taper));
                        branchScale = treeParams.trunkScale * taper;
                        segmentCount++;
                    }
                    const scaledMatrix = m4.scale(currentMatrix, branchScale, treeParams.length, branchScale);
                    const modelMatrixBranch = scaledMatrix;
                    if (treeTexture) {
                        drawTexturedPrimitive(branchVBO, branchIBO, branchUVBO, branchNBO, branchGeom.idx.length, treeTexture, m4.multiply(viewProjMatrix, scaledMatrix), modelMatrixBranch);
                    } else {
                        drawColoredPrimitive(branchVBO, branchIBO, branchNBO, branchGeom.idx.length, [0.55, 0.27, 0.07, 1.0], m4.multiply(viewProjMatrix, scaledMatrix), modelMatrixBranch);
                    }
                    currentMatrix = m4.translate(currentMatrix, 0, treeParams.length, 0);
                    break;
                case '+':
                    currentMatrix = m4.rotate(currentMatrix, angle, [0, 0, 1]);
                    break;
                case '-':
                    currentMatrix = m4.rotate(currentMatrix, -angle, [0, 0, 1]);
                    break;
                case '/':
                    currentMatrix = m4.rotate(currentMatrix, angle, [1, 0, 0]);
                    break;
                case '\\':
                    currentMatrix = m4.rotate(currentMatrix, -angle, [1, 0, 0]);
                    break;
                case '&':
                    currentMatrix = m4.rotate(currentMatrix, angle, [0, 1, 0]);
                    break;
                case '^':
                    currentMatrix = m4.rotate(currentMatrix, -angle, [0, 1, 0]);
                    break;
                case '[':
                    stack.push({
                        matrix: currentMatrix,
                        scale: branchScale,
                        level: branchLevel,
                        segments: segmentCount
                    });
                    branchLevel++;
                    segmentCount = 0;
                    if(branchLevel === 1) branchScale *= treeParams.branchScale;
                    else if(branchLevel === 2) branchScale *= 0.55;
                    else if(branchLevel === 3) branchScale *= 0.65;
                    else branchScale *= 0.75;
                    break;
                case ']':
                    const leafSet = this.leafRandoms[leafRandomIdx++] || [];
                    for (let leafIdx = 0; leafIdx < leafSet.length; leafIdx++) {
                        let leafMatrix = currentMatrix;
                        const r = leafSet[leafIdx];
                        leafMatrix = m4.translate(leafMatrix, r.offsetX, r.offsetY, r.offsetZ);
                        leafMatrix = m4.rotate(leafMatrix, r.rotX, [1, 0, 0]);
                        leafMatrix = m4.rotate(leafMatrix, r.rotY, [0, 1, 0]);
                        leafMatrix = m4.rotate(leafMatrix, r.rotZ, [0, 0, 1]);
                        
                        const scaledLeafMatrix = m4.scale(leafMatrix, 0.8, 0.8, 0.8);
                        const modelMatrixLeaf = scaledLeafMatrix;

                        drawColoredPrimitive(leafVBO, leafIBO, leafNBO, leafGeom.idx.length, [0.2, 0.7, 0.2, 1.0],
                            m4.multiply(viewProjMatrix, scaledLeafMatrix), modelMatrixLeaf);
                    }
                    const restoredState = stack.pop();
                    currentMatrix = restoredState.matrix;
                    branchScale = restoredState.scale;
                    branchLevel = restoredState.level;
                    segmentCount = restoredState.segments;
                    break;
            }
        }
    }
}


// --- CRTANJE PRIMITIVA ---
function drawTexturedPrimitive(vbo, ibo, uvbo, nbo, count, texture, mvpMatrix, modelMatrix) {
    gl.uniformMatrix4fv(mvpMatrixLoc, false, mvpMatrix);
    gl.uniformMatrix4fv(modelMatrixLoc, false, modelMatrix);
    gl.uniform1i(useTextureLoc, true);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(samplerLoc, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(posLoc);

    gl.bindBuffer(gl.ARRAY_BUFFER, uvbo);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(texCoordLoc);

    gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
    gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(normalLoc);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);

    gl.disableVertexAttribArray(posLoc);
    gl.disableVertexAttribArray(texCoordLoc);
    gl.disableVertexAttribArray(normalLoc);
}

function drawColoredPrimitive(vbo, ibo, nbo, count, color, mvpMatrix, modelMatrix) {
    gl.uniformMatrix4fv(mvpMatrixLoc, false, mvpMatrix);
    gl.uniformMatrix4fv(modelMatrixLoc, false, modelMatrix);
    gl.uniform1i(useTextureLoc, false);
    gl.uniform4fv(colorLoc, color);

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(posLoc);

    gl.disableVertexAttribArray(texCoordLoc);

    gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
    gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(normalLoc);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);

    gl.disableVertexAttribArray(posLoc);
    gl.disableVertexAttribArray(normalLoc);
}

// --- GENERISANJE ŠUME ---
let forest = [];
function generateForest() {
    forest = [];
    let attempts = 0;
    while (forest.length < NUM_TREES && attempts < NUM_TREES * 10) {
        const x = (Math.random() * 2 - 1) * (GROUND_SIZE - 5);
        const z = (Math.random() * 2 - 1) * (GROUND_SIZE - 5);
        let tooClose = false;
        for (const tree of forest) {
            const dist = Math.hypot(x - tree.x, z - tree.z);
            if (dist < MIN_TREE_SEPARATION) {
                tooClose = true;
                break;
            }
        }
        if (!tooClose) {
            forest.push(new Tree(x, z));
        }
        attempts++;
    }
}


// --- RENDER FUNKCIJA ---
function render() {
    if (!program) return; // Don't render if program isn't ready

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.2, 0.35, 0.5, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const camX = camDist * Math.sin(camPhi) * Math.sin(camTheta);
    const camY = camTargetY + camDist * Math.cos(camPhi);
    const camZ = camDist * Math.sin(camPhi) * Math.cos(camTheta);

    const viewMatrix = m4.lookAt([camX, camY, camZ], [0, camTargetY, 0], [0, 1, 0]);
    const projMatrix = m4.perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 500);
    const viewProjMatrix = m4.multiply(projMatrix, viewMatrix);

    gl.uniform3fv(lightDirLoc, [0.5, 1, 0.7]);
    gl.uniform3fv(lightColorLoc, [1, 1, 1]);
    gl.uniform3fv(ambientColorLoc, [0.18, 0.18, 0.18]);
    gl.uniform3fv(eyeLoc, [camX, camY, camZ]);

    drawColoredPrimitive(groundVBO, groundIBO, groundNBO, groundGeom.idx.length, [0.3, 0.5, 0.3, 1.0], viewProjMatrix, m4.identity());

    for(const tree of forest) {
        tree.draw(viewProjMatrix);
    }

    requestAnimationFrame(render);
}


// --- KONTROLE KAMERE I KORISNIČKI INTERFEJS ---
let camDist = 50;
let camTheta = 0;
let camPhi = Math.PI / 2 - 0.2;
let camTargetY = 10;

let isDragging = false;
let lastX, lastY;

canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'grab';
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    camTheta += dx * 0.005;
    camPhi = Math.max(0.1, Math.min(Math.PI - 0.1, camPhi - dy * 0.005));
    render();
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camDist += e.deltaY * 0.05;
    camDist = Math.max(10, Math.min(150, camDist));
    render();
});

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    render();
});

// UI kontroleri
const regenerateButton = document.getElementById('regenerate');
regenerateButton.addEventListener('click', () => {
    generateForest();
    render();
});

const iterationsSlider = document.getElementById('iterations');
const angleSlider = document.getElementById('angle');
const lengthSlider = document.getElementById('length');
const trunkScaleSlider = document.getElementById('trunkScale');
const taperSlider = document.getElementById('taper');
const branchScaleSlider = document.getElementById('branchScale');
const leafDensitySlider = document.getElementById('leafDensity');
const numTreesSlider = document.getElementById('numTrees');

const iterationsValue = document.getElementById('iterationsValue');
const angleValue = document.getElementById('angleValue');
const lengthValue = document.getElementById('lengthValue');
const trunkScaleValue = document.getElementById('trunkScaleValue');
const taperValue = document.getElementById('taperValue');
const branchScaleValue = document.getElementById('branchScaleValue');
const leafDensityValue = document.getElementById('leafDensityValue');
const numTreesValue = document.getElementById('numTreesValue');

function updateTreeParams() {
    treeParams.iterations = parseInt(iterationsSlider.value);
    treeParams.angle = parseInt(angleSlider.value);
    treeParams.length = parseFloat(lengthSlider.value);
    treeParams.trunkScale = parseFloat(trunkScaleSlider.value);
    treeParams.taper = parseFloat(taperSlider.value);
    treeParams.branchScale = parseFloat(branchScaleSlider.value);
    treeParams.leafDensity = parseFloat(leafDensitySlider.value);
    NUM_TREES = parseInt(numTreesSlider.value);

    iterationsValue.textContent = treeParams.iterations;
    angleValue.textContent = treeParams.angle + '°';
    lengthValue.textContent = treeParams.length;
    trunkScaleValue.textContent = treeParams.trunkScale;
    taperValue.textContent = treeParams.taper;
    branchScaleValue.textContent = treeParams.branchScale;
    leafDensityValue.textContent = treeParams.leafDensity;
    numTreesValue.textContent = NUM_TREES;

    generateForest();
    render();
}

iterationsSlider.addEventListener('input', updateTreeParams);
angleSlider.addEventListener('input', updateTreeParams);
lengthSlider.addEventListener('input', updateTreeParams);
trunkScaleSlider.addEventListener('input', updateTreeParams);
taperSlider.addEventListener('input', updateTreeParams);
branchScaleSlider.addEventListener('input', updateTreeParams);
leafDensitySlider.addEventListener('input', updateTreeParams);
numTreesSlider.addEventListener('input', updateTreeParams);

// Initial setup to load shaders and start rendering
initShadersAndLocations();
updateTreeParams(); // Set initial values for UI displays