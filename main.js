'use strict';

var positions   = [];
var normals     = [];
var texcoords   = [];
var numVertices = 0;
var ambient     = null;
var diffuse     = null;
var specular    = null;
var emissive    = null;
var shininess   = null;
var opacity     = null;

/***************** HELPERS WebGL *****************/
function compileShaderSrc(gl, src, type) {
  // creazione oggetto shader
  const sh = gl.createShader(type);
  // associazione codice GLSL e compilazione
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

function createProgramFromIds(gl, vsId, fsId) {
  // compilazione shader vertex e fragment
  const vs = compileShaderSrc(gl, document.getElementById(vsId).textContent, gl.VERTEX_SHADER);
  const fs = compileShaderSrc(gl, document.getElementById(fsId).textContent, gl.FRAGMENT_SHADER);
  // creazione programma
  const p  = gl.createProgram();
  // associazione shader
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  // linking
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p));
  return p;
}

function makeBuffer(gl, data, target) {
  // target è gl.ARRAY_BUFFER per vertici (default) o gl.ELEMENT_ARRAY_BUFFER per indici
  target = target || gl.ARRAY_BUFFER;
  // creazione buffer
  const buf = gl.createBuffer();
  // attivazione buffer e associazione dati
  gl.bindBuffer(target, buf);
  gl.bufferData(target, data, gl.STATIC_DRAW);    // STATIC_DRAW = dati caricati una volta e usati molte volte
  return buf;
}

/***************** CUBEMAP *****************/
function loadCubemap(gl, faces) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);

  // Placeholder: pixel 1x1 (colore temporaneo)
  const placeholder = new Uint8Array([10, 10, 25, 255]);
  // Inizializzazione delle 6 facce con il placeholder
  for (const f of faces)
    gl.texImage2D(gl[f.target], 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, placeholder);

  let loaded = 0;

  // Caricamento asincrono delle immagini reali
  for (const f of faces) {
    const img = new Image();
    // Quando l'immagine è pronta, aggiornare la faccia
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
      gl.texImage2D(gl[f.target], 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      // generazione automatica delle mipmap (quando tutte le facce sono caricate)
      if (++loaded === faces.length) gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    };
    img.onerror = () => console.warn('Skybox: impossibile caricare ' + f.url);
    img.src = f.url;
  }

  // Impostazioni di filtraggio: usare mipmap per la minificazione e interpolazione lineare per la magnificazione
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);  // interpolazione + mipmap
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);                // interpolazione lineare
  // Evitare wrapping perché il cubemap è un'immagine continua (non ha bordi ripetuti)
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/***************** costruire una mesh pronta per la GPU (WebGL) partendo da un file .obj *****************/
async function buildMeshGPU(gl, sourcePath) {

  // Reset degli array globali che conterranno i dati della mesh
  positions   = [];   // coordinate dei vertici
  normals     = [];   // normali
  texcoords   = [];   // coordinate texture
  numVertices = 0;    // numero totale vertici

  // Descrittore della mesh (input per LoadMesh)
  const meshDesc = {
    sourceMesh: sourcePath, // path del file OBJ
    data:       null,       // conterrà la geometria
    fileMTL:    null,       // nome file MTL (se presente)
    materials:  [{}],       // materiali associati
  };

  await LoadMesh(gl, meshDesc);

  let texture = null;
  let specTexture = null;

  // Se esiste MTL usa materiale 1, altrimenti 0
  const matKey = meshDesc.fileMTL ? 1 : 0;
  const mat    = (meshDesc.materials || [])[matKey];
  if (mat && mat.parameter) {
    const candidate = mat.parameter.get('map_Kd'); // texture diffusa
    if (candidate && typeof candidate === 'object') texture = candidate;

    const ks = mat.parameter.get('map_Ks');
    if (ks && typeof ks === 'object') specTexture = ks;
  }

  // Se non esiste texture crea texture bianca di fallback
  if (!texture) {
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                  new Uint8Array([255, 255, 255, 255]));
  }

  // fallback specular nera
  if (!specTexture) {
    specTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, specTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                  new Uint8Array([0, 0, 0, 255]));
  }

  // --- Creazione buffer GPU ---
  return {
    posBuf:  makeBuffer(gl, new Float32Array(positions)),
    normBuf: makeBuffer(gl, new Float32Array(normals)),
    uvBuf:   makeBuffer(gl, new Float32Array(texcoords)),
    count:   numVertices,
    texture,
    specTexture,
    shininess: (typeof shininess === 'number') ? shininess : 150.0,
  };
}

/***************** MAIN *****************/
window.addEventListener('load', () => {

  /* dat.GUI */
  const gui = new dat.GUI();  // creazione pannello GUI

  // Impostazioni modificabili dall'utente
  const fCam = gui.addFolder('Camera');
  fCam.add(settings, 'cameraTarget', ['Sole', 'Terra', 'Luna', 'Mercurio', 'Venere', 'Marte', 'Giove', 'Saturno', 'Urano', 'Nettuno']).name('Segui');
  fCam.open();

  const f1 = gui.addFolder('Parametri orbitali Terra');
  f1.add(settings, 'orbit1Radius', 5,  125).name('Distanza');         // raggio orbita (distanza dal centro)
  f1.add(settings, 'orbit1Speed',  0,   5).name('Velocità');          // velocità angolare dell'orbita
  f1.add(settings, 'orbit1Tilt',   0, Math.PI).name('Inclinazione');  // inclinazione dell'orbita (rotazione del piano orbitale attorno all'asse X)
  f1.open();

  const f2 = gui.addFolder('Parametri orbitali Luna');
  f2.add(settings, 'orbit2Radius', 0.5, 10).name('Distanza');
  f2.add(settings, 'orbit2Speed',  0,    5).name('Velocità');
  f2.add(settings, 'orbit2Tilt',   0, Math.PI).name('Inclinazione');
  f2.open();

  /* Canvas & WebGL */
  // sincronizzare la dimensione reale del canvas (pixel) con la dimensione visiva (CSS)
  const canvas = document.getElementById('glCanvas');
  const resize = () => {
    // Leggere dimensione visiva e moltiplicare per devicePixelRatio per supportare schermi ad alta densità
    canvas.width  = canvas.clientWidth  * (window.devicePixelRatio || 1);
    canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1);
  };
  resize();
  window.addEventListener('resize', resize);

  // inizializzazione contesto WebGL
  const gl = canvas.getContext('webgl')
  if (!gl) { alert('WebGL non disponibile.'); return; }
  console.log('Versione WebGL:', gl.getParameter(gl.VERSION));

  gl.enable(gl.DEPTH_TEST); // attivare test di profondità (Z-buffer)
  gl.enable(gl.CULL_FACE);  // non disegnare facce "dietro" (back faces)

  /* Inizializza controlli camera (definita in camera.js) */
  initCameraControls(canvas);

  /* Programs */
  // Creazione programmi shader a partire dagli script GLSL nel DOM
  const sphereProg   = createProgramFromIds(gl, 'vs-sphere',   'fs-sphere');
  const emissiveProg = createProgramFromIds(gl, 'vs-emissive', 'fs-emissive');
  const skyboxProg   = createProgramFromIds(gl, 'vs-skybox',   'fs-skybox');

  /* Locations pianeti */
  const sph = {
    aPos:          gl.getAttribLocation(sphereProg,  'a_position'),             // posizione vertice
    aNorm:         gl.getAttribLocation(sphereProg,  'a_normal'),               // normale vertice
    aUV:           gl.getAttribLocation(sphereProg,  'a_texcoord'),             // coordinate texture vertice
    uWorld:        gl.getUniformLocation(sphereProg, 'u_world'),                // trasformazioni
    uView:         gl.getUniformLocation(sphereProg, 'u_view'),                 // matrice di vista (camera)
    uProj:         gl.getUniformLocation(sphereProg, 'u_projection'),           // matrice di proiezione
    uViewPos:      gl.getUniformLocation(sphereProg, 'u_viewWorldPosition'),    // posizione della camera (per calcolo riflessi)
    uShininess:    gl.getUniformLocation(sphereProg, 'u_shininess'),            // fattore di lucentezza per il materiale (speculare)
    uTexture:      gl.getUniformLocation(sphereProg, 'u_texture'),              // texture del materiale (diffuse map)
    uSpecTexture: gl.getUniformLocation(sphereProg, 'u_specTexture'),           // texture del materiale (specular map)
    uHasTexture:   gl.getUniformLocation(sphereProg, 'u_hasTexture'),           // flag per indicare se usare la texture (1) o un colore uniforme (0)
    uColor:        gl.getUniformLocation(sphereProg, 'u_color'),                // colore uniforme del materiale (usato se uHasTexture è 0)
    // creazione array di uniform per i campioni di luce (posizioni sulla sfera centrale)
    uLightSamples: Array.from({ length: NUM_LIGHT_SAMPLES }, (_, i) =>
      gl.getUniformLocation(sphereProg, `u_lightSamples[${i}]`)
    ),
  };

  /* Locations sole */
  const emi = {
    aPos:        gl.getAttribLocation(emissiveProg,  'a_position'),
    aUV:         gl.getAttribLocation(emissiveProg,  'a_uv'),
    uWorld:      gl.getUniformLocation(emissiveProg, 'u_world'),
    uView:       gl.getUniformLocation(emissiveProg, 'u_view'),
    uProj:       gl.getUniformLocation(emissiveProg, 'u_projection'),
    uColor:      gl.getUniformLocation(emissiveProg, 'u_color'),
    uTexture:    gl.getUniformLocation(emissiveProg, 'u_texture'),
    uHasTexture: gl.getUniformLocation(emissiveProg, 'u_hasTexture'),
  };

  /* Locations skybox */
  const sky = {
    aPos:    gl.getAttribLocation(skyboxProg,  'a_position'),
    uProj:   gl.getUniformLocation(skyboxProg, 'u_projection'),
    uView:   gl.getUniformLocation(skyboxProg, 'u_view'),
    uSkybox: gl.getUniformLocation(skyboxProg, 'u_skybox'),
  };

  /* Geometria skybox */
  const skyGeo = {
    posBuf: makeBuffer(gl, SKYBOX_VERTS),
    idxBuf: makeBuffer(gl, SKYBOX_IDX, gl.ELEMENT_ARRAY_BUFFER),
    count:  SKYBOX_IDX.length,
  };

  /* Cubemap */
  const cubemap = loadCubemap(gl, SKYBOX_FACES);

  /* Carica campioni area light una volta sola */
  // inizializzare i parametri di illuminazione dello shader delle sfere illuminate
  gl.useProgram(sphereProg);                      // attivazione shader
  for (let i = 0; i < NUM_LIGHT_SAMPLES; i++) {
    // inviare vettore 3D allo shader
    gl.uniform3f(
      sph.uLightSamples[i],
      LIGHT_SAMPLES[i * 3],
      LIGHT_SAMPLES[i * 3 + 1],
      LIGHT_SAMPLES[i * 3 + 2]
    );
  }
  //gl.uniform1f(sph.uShininess, 150.0);

  /* Posizioni world dei corpi — aggiornate ogni frame prima del rendering */
  const worldPos = {
    sun:     [0, 0, 0],
    earth:   [0, 0, 0],
    moon:    [0, 0, 0],
    mercury: [0, 0, 0],
    venus:   [0, 0, 0],
    mars:    [0, 0, 0],
    jupiter: [0, 0, 0],
    saturn:  [0, 0, 0],
    uranus:  [0, 0, 0],
    neptune: [0, 0, 0],
  };

  function bindOBJAttribs(geo, aPos, aNorm, aUV) {
    // --- VERTICI ---
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.posBuf);                   // Attiva buffer vertici
    gl.enableVertexAttribArray(aPos);                             // Abilita attributo shader
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

    // --- NORMALI ---
    if (aNorm >= 0 && geo.normBuf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, geo.normBuf);
      gl.enableVertexAttribArray(aNorm);
      gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0);
    }

    // --- COORDINATE TEXTURE (UV) ---
    if (aUV >= 0 && geo.uvBuf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, geo.uvBuf);
      gl.enableVertexAttribArray(aUV);
      gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
    }
  }

  /* Skybox */
  function drawSkybox(projMat, camMat) {
    const camNoTrans = camMat.slice();
    // Rimozione traslazione camera (per far sembrare il cielo distante e fisso)
    camNoTrans[12] = 0; camNoTrans[13] = 0; camNoTrans[14] = 0;
    // La matrice di vista per il cielo è l'inversa della matrice camera senza traslazione
    const skyView = m4.inverse(camNoTrans);

    gl.depthFunc(gl.LEQUAL);                                                  // skybox dietro tutti gli oggetti
    gl.useProgram(skyboxProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyGeo.posBuf);
    gl.enableVertexAttribArray(sky.aPos);
    gl.vertexAttribPointer(sky.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, skyGeo.idxBuf);
    gl.uniformMatrix4fv(sky.uProj, false, projMat);                           // matrice di proiezione
    gl.uniformMatrix4fv(sky.uView, false, skyView);                           // matrice di vista (camera senza traslazione)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap);
    gl.uniform1i(sky.uSkybox, 0);                                             // collega cubemap allo shader      
    gl.drawElements(gl.TRIANGLES, skyGeo.count, gl.UNSIGNED_SHORT, 0);
    gl.depthFunc(gl.LESS);
  }

  // Variabili globali che conterranno le mesh GPU
  let meshSun     = null;
  let meshEarth   = null;
  let meshMoon    = null;
  let meshMercury = null;
  let meshVenus   = null;
  let meshMars    = null;
  let meshJupiter = null;
  let meshSaturn  = null;
  let meshRings   = null;
  let meshUranus  = null;
  let meshNeptune = null;

  // Caricamento asincrono delle mesh OBJ prima di iniziare il rendering
  (async () => {
    try {
      meshSun   = await buildMeshGPU(gl, '/resources/objects/sun/sun.obj');
      meshEarth = await buildMeshGPU(gl, '/resources/objects/earth2/earth2.obj');
      meshEarth._textures = {
        hot:    loadTexture(gl, '/resources/objects/earth2/', 'earth_hot1.jpg'),
        normal: meshEarth.texture,
        ice:    loadTexture(gl, '/resources/objects/earth2/', 'earth_ice1.jpg')
      };
      meshMoon    = await buildMeshGPU(gl, '/resources/objects/moon/moon.obj');
      meshMercury = await buildMeshGPU(gl, '/resources/objects/mercury/mercury.obj');
      meshVenus   = await buildMeshGPU(gl, '/resources/objects/venus/venus.obj');
      meshMars    = await buildMeshGPU(gl, '/resources/objects/mars/mars.obj');
      meshJupiter = await buildMeshGPU(gl, '/resources/objects/jupiter/jupiter.obj');
      meshSaturn  = await buildMeshGPU(gl, '/resources/objects/saturn3/saturn.obj');
      meshRings   = await buildMeshGPU(gl, '/resources/objects/rings/rings.obj');
      meshUranus  = await buildMeshGPU(gl, '/resources/objects/uranus/uranus.obj');
      meshNeptune = await buildMeshGPU(gl, '/resources/objects/neptune/neptune.obj');
      console.log('Tutte le mesh caricate.');
    } catch (err) {
      console.error('Errore nel caricamento delle mesh:', err);
    }

    const overlay = document.getElementById('loadingOverlay');
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 800);

    requestAnimationFrame(render);
  })();

  /****************************** */
  function updateEarthTextureByDistance(meshEarth, distance) {

    if (!meshEarth._textures) return;

    let tex;

    if (distance < 22) {
        tex = meshEarth._textures.hot;
    } else if (distance > 45) {
        tex = meshEarth._textures.ice;
    } else {
        tex = meshEarth._textures.normal;
    }

    if (meshEarth.texture !== tex) {
        meshEarth.texture = tex;
    }
  }

  /* Posizioni orbitali:
    L'orbita è un cerchio nel piano XZ, applicare il tilt significa
    ruotare quel piano attorno all'asse X di un angolo `tilt`
        x' = x
        y' = -z * sin(tilt)
        z' = z * cos(tilt)
  */
  function computeOrbit(t, radius, speed, tilt, center = [0, 0, 0]) {

    const angle = t * speed;                              // angolo orbita

    // orbita base nel piano XZ
    // x=r*cos(θ),z=r*sin(θ)
    const ox = Math.cos(angle) * radius;                  // x nel piano base
    const oz = Math.sin(angle) * radius;                  // z nel piano base

    // trasformazione orbita circolare nel piano XZ in una orbita inclinata nello spazio 3D
    const x = center[0] + ox;
    const y = center[1] + (-oz * Math.sin(tilt));
    const z = center[2] + ( oz * Math.cos(tilt));

    return {
        angle,
        position: [x, y, z]
    };
  }

  function drawPlanet({mesh, position, tilt = 0, rotationSpeed = 1, scale = 1, time, orbitAngle = 0, syncRotation = false}) {

    if (!mesh) return;

    bindOBJAttribs(mesh, sph.aPos, sph.aNorm, sph.aUV);

    let w = m4.translation(
        position[0],
        position[1],
        position[2]
    );

    // inclinazione asse
    w = m4.multiply(w, m4.zRotation(tilt));

    // rotazione
    if (syncRotation) {         // sincronizza rotazione con altro pianeta
        w = m4.multiply(w, m4.yRotation(-orbitAngle - Math.PI));
    } else {
        w = m4.multiply(w, m4.yRotation(time * rotationSpeed));
    }

    // scala
    w = m4.scale(w, scale, scale, scale);

    gl.uniformMatrix4fv(sph.uWorld, false, w);

    gl.uniform3fv(sph.uColor, [1, 1, 1]);

    // diffuse map
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, mesh.texture);
    gl.uniform1i(sph.uTexture, 0);

    // specular map
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, mesh.specTexture);
    gl.uniform1i(sph.uSpecTexture, 1);

    gl.uniform1i(sph.uHasTexture, 1);

    gl.uniform1f(
        sph.uShininess,
        mesh.shininess
    );

    gl.drawArrays(
        gl.TRIANGLES,
        0,
        mesh.count
    );
  }
  /****************************** */

  /* ── Render loop ── */
  function render(timestamp) {
    requestAnimationFrame(render);
    const t = timestamp * 0.001;

    gl.viewport(0, 0, canvas.width, canvas.height);         // viewport = tutta la dimensione del canvas
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect           = canvas.width / canvas.height;
    const projectionMatrix = m4.perspective(Math.PI / 4, aspect, 0.1, 500);

    /***************** ORBITE *****************/

    // Terra
    const earthOrbit = computeOrbit(
        t, settings.orbit1Radius, settings.orbit1Speed, settings.orbit1Tilt
    );

    const earthDistance = Math.sqrt(
        earthOrbit.position[0] * earthOrbit.position[0] +
        earthOrbit.position[1] * earthOrbit.position[1] +
        earthOrbit.position[2] * earthOrbit.position[2]
    );
    updateEarthTextureByDistance(meshEarth, earthDistance);

    // Luna (centrata sulla Terra)
    const moonOrbit = computeOrbit(
        t, settings.orbit2Radius, settings.orbit2Speed, settings.orbit2Tilt, earthOrbit.position
    );

    // Mercurio
    const mercuryOrbit = computeOrbit(
        t, settings.orbit3Radius, settings.orbit3Speed, settings.orbit3Tilt
    );

    // Venere
    const venusOrbit = computeOrbit(
        t, settings.orbit4Radius, settings.orbit4Speed, settings.orbit4Tilt
    );

    // Marte
    const marsOrbit = computeOrbit(
        t, settings.orbit5Radius, settings.orbit5Speed, settings.orbit5Tilt
    );

    // Giove
    const jupiterOrbit = computeOrbit(
        t, settings.orbit6Radius, settings.orbit6Speed, settings.orbit6Tilt
    );

    // Saturno
    const saturnOrbit = computeOrbit(
        t, settings.orbit7Radius, settings.orbit7Speed, settings.orbit7Tilt
    );

    // Urano
    const uranusOrbit = computeOrbit(
        t, settings.orbit8Radius, settings.orbit8Speed, settings.orbit8Tilt
    );

    // Nettuno
    const neptuneOrbit = computeOrbit(
        t, settings.orbit9Radius, settings.orbit9Speed, settings.orbit9Tilt
    );

    /* Aggiornare posizioni world */
    worldPos.sun     = [0, 0, 0];
    worldPos.earth   = earthOrbit.position;
    worldPos.moon    = moonOrbit.position;
    worldPos.mercury = mercuryOrbit.position;
    worldPos.venus   = venusOrbit.position;
    worldPos.mars    = marsOrbit.position;
    worldPos.jupiter = jupiterOrbit.position;
    worldPos.saturn  = saturnOrbit.position;
    worldPos.uranus  = uranusOrbit.position;
    worldPos.neptune = neptuneOrbit.position;

    // Se il target della camera è cambiato, resettare l'offset di pan
    if (settings.cameraTarget !== lastCameraTarget) {
      panOffset[0] = 0;
      panOffset[1] = 0;
      panOffset[2] = 0;
      lastCameraTarget = settings.cameraTarget;

      // se si torna al Sole e il raggio attuale è sotto il suo minimo, correggere
      const minRadius = settings.cameraTarget === 'Sole' ? 10 : 1;
      if (camera.radius < minRadius) {
        camera.radius = minRadius;
      }
    }

    // spostare il target della camera verso il corpo selezionato
    const desiredTarget =
      settings.cameraTarget === 'Terra'    ? worldPos.earth   :
      settings.cameraTarget === 'Luna'     ? worldPos.moon    :
      settings.cameraTarget === 'Mercurio' ? worldPos.mercury :
      settings.cameraTarget === 'Venere'   ? worldPos.venus   :
      settings.cameraTarget === 'Marte'    ? worldPos.mars    :
      settings.cameraTarget === 'Giove'    ? worldPos.jupiter :
      settings.cameraTarget === 'Saturno'  ? worldPos.saturn  :
      settings.cameraTarget === 'Urano'    ? worldPos.uranus  :
      settings.cameraTarget === 'Nettuno'  ? worldPos.neptune :
                                             worldPos.sun;

    camera.target[0] = desiredTarget[0] + panOffset[0];
    camera.target[1] = desiredTarget[1] + panOffset[1];
    camera.target[2] = desiredTarget[2] + panOffset[2];

    const cameraMatrix   = getCameraMatrix();         // matrice di vista (camera)
    const viewMatrix     = m4.inverse(cameraMatrix);  // matrice di vista inversa (posizione e orientamento camera)
    const cameraPosition = getCameraPosition();       // posizione della camera (per calcolo riflessi)

    /* Skybox */
    drawSkybox(projectionMatrix, cameraMatrix);

    /* 1) SOLE (shader emissivo) */
    if (meshSun) {
      gl.useProgram(emissiveProg);
      bindOBJAttribs(meshSun, emi.aPos, -1, emi.aUV);               // la sfera emissiva non ha normali (non serve per il calcolo dell'illuminazione)
      gl.uniformMatrix4fv(emi.uProj,  false, projectionMatrix);
      gl.uniformMatrix4fv(emi.uView,  false, viewMatrix);
      gl.uniformMatrix4fv(emi.uWorld, false, m4.scale(m4.identity(), 3, 3, 3));
      gl.uniform3fv(emi.uColor, [1.0, 1.0, 1.0]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, meshSun.texture);
      gl.uniform1i(emi.uTexture,    0);
      gl.uniform1i(emi.uHasTexture, 1);
      gl.drawArrays(gl.TRIANGLES, 0, meshSun.count);
    }

    /* Uniforms comuni (pianeti) */
    gl.useProgram(sphereProg);
    gl.uniformMatrix4fv(sph.uProj,  false, projectionMatrix);
    gl.uniformMatrix4fv(sph.uView,  false, viewMatrix);
    gl.uniform3fv(sph.uViewPos, cameraPosition);

    // Inclinazioni assiali in radianti
    const tilt = {
      mercury: 0.034  * Math.PI / 180,
      venus:   177.4  * Math.PI / 180,
      earth:   23.44  * Math.PI / 180,
      mars:    25.19  * Math.PI / 180,
      jupiter: 3.13   * Math.PI / 180,
      saturn:  26.73  * Math.PI / 180,
      uranus:  97.77  * Math.PI / 180,
      neptune: 28.32  * Math.PI / 180,
    };

    /* 2) EARTH */
    drawPlanet({
        mesh: meshEarth,
        position: earthOrbit.position,
        tilt: tilt.earth,
        rotationSpeed: 1.0,
        scale: 0.5,
        time: t
    });

    /* 3) MOON */
    drawPlanet({
        mesh: meshMoon,
        position: moonOrbit.position,
        scale: 0.25,
        time: t,
        orbitAngle: moonOrbit.angle,
        syncRotation: true
    });

    /* 4) MERCURY */
    drawPlanet({
        mesh: meshMercury,
        position: mercuryOrbit.position,
        tilt: tilt.mercury,
        rotationSpeed: 0.017,
        scale: 0.3,
        time: t
    });

    /* 5) VENUS (inclinazione 177.4° = rotazione retrograda) */
    drawPlanet({
        mesh: meshVenus,
        position: venusOrbit.position,
        tilt: tilt.venus,
        rotationSpeed: 0.004,
        scale: 0.3,
        time: t
    });

    /* 6) MARS */
    drawPlanet({
        mesh: meshMars,
        position: marsOrbit.position,
        tilt: tilt.mars,
        rotationSpeed: 0.97,
        scale: 0.3,
        time: t
    });

    /* 7) JUPITER */
    drawPlanet({
        mesh: meshJupiter,
        position: jupiterOrbit.position,
        tilt: tilt.jupiter,
        rotationSpeed: 2.44,
        scale: 0.5,
        time: t
    });

    /* 8) SATURN */
    drawPlanet({
        mesh: meshSaturn,
        position: saturnOrbit.position,
        tilt: tilt.saturn,
        rotationSpeed: 1.02,
        scale: 0.5,
        time: t
    });

    /* 9) ANELLI DI SATURNO */
    drawPlanet({
        mesh: meshRings,
        position: saturnOrbit.position,
        tilt: tilt.saturn,
        rotationSpeed: 1.02,
        scale: 1.3,
        time: t
    });

    /* 10) URANUS */
    drawPlanet({
        mesh: meshUranus,
        position: uranusOrbit.position,
        tilt: tilt.uranus,
        rotationSpeed: 1.39,
        scale: 0.5,
        time: t
    });

    /* 11) NEPTUNE */
    drawPlanet({
        mesh: meshNeptune,
        position: neptuneOrbit.position,
        tilt: tilt.neptune,
        rotationSpeed: 1.49,
        scale: 0.5,
        time: t
    });

  }
});
