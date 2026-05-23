/**
 * config.js — Configurazione globale del Solar System WebGL
 * Contiene: costanti, settings GUI, campioni luce (Fibonacci), geometria skybox
 */

'use strict';

var SKYBOX_FACES = [
  { target: 'TEXTURE_CUBE_MAP_POSITIVE_X', url: '/resources/images/milky-way/px.jpg' },
  { target: 'TEXTURE_CUBE_MAP_NEGATIVE_X', url: '/resources/images/milky-way/nx.jpg' },
  { target: 'TEXTURE_CUBE_MAP_POSITIVE_Y', url: '/resources/images/milky-way/py.jpg' },
  { target: 'TEXTURE_CUBE_MAP_NEGATIVE_Y', url: '/resources/images/milky-way/ny.jpg' },
  { target: 'TEXTURE_CUBE_MAP_POSITIVE_Z', url: '/resources/images/milky-way/pz.jpg' },
  { target: 'TEXTURE_CUBE_MAP_NEGATIVE_Z', url: '/resources/images/milky-way/nz.jpg' },
];

var LIGHT_SPHERE_RADIUS = 1.0;
var NUM_LIGHT_SAMPLES   = 16;

var settings = new function () {
  /* selezione target camera */
  this.cameraTarget = 'Sole';   // 'Sole' | 'Terra' | 'Luna'

  /* Orbita 1 — Earth attorno al Sole */
  this.orbit1Radius = 30;
  this.orbit1Speed  = 0.6;
  this.orbit1Tilt   = 0.3;

  /* Orbita 2 — Moon attorno alla Earth */
  this.orbit2Radius = 1.8;
  this.orbit2Speed  = 1.4;
  this.orbit2Tilt   = 0.8;

  /* Orbita 3 - Mercurio attorno al Sole */
  this.orbit3Radius = 10;
  this.orbit3Speed  = 1.2;
  this.orbit3Tilt   = 0.3;

  /* Orbita 4 - Venere attorno al Sole */
  this.orbit4Radius = 20;
  this.orbit4Speed  = 0.8;
  this.orbit4Tilt   = 0.3;

  /* Orbita 5 - Marte attorno al Sole */
  this.orbit5Radius = 40;
  this.orbit5Speed  = 0.5;
  this.orbit5Tilt   = 0.2;

  /* Orbita 6 - Giove attorno al Sole */
  this.orbit6Radius = 60;
  this.orbit6Speed  = 0.4;
  this.orbit6Tilt   = 0.3;

  /* Orbita 7 - Saturno attorno al Sole */
  this.orbit7Radius = 80;
  this.orbit7Speed  = 0.3;
  this.orbit7Tilt   = 0.3;

  /* Orbita 8 - Urano attorno al Sole */
  this.orbit8Radius = 100;
  this.orbit8Speed  = 0.2;
  this.orbit8Tilt   = 0.3;

  /* Orbita 9 - Nettuno attorno al Sole */
  this.orbit9Radius = 120;
  this.orbit9Speed  = 0.1;
  this.orbit9Tilt   = 0.3;
};

/******************** DISTRIBUZIONE DI FIBONACCI sulla sfera
   Distribuisco in modo uniforme i campioni di luce sulla superficie del sole
   in modo da ottenere un'illuminazione più realistica. Le ombre ottenute saranno più morbide e dettagliate.
*/
function fibonacciSpherePoints(n, r) {
  const pts = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // angolo aureo per distribuire i punti in modo uniforme (circa 137.5°)
  for (let i = 0; i < n; i++) {
    const y   = 1 - (i / (n - 1)) * 2;              // divide la sfera in "fasce" orizzontali uniformi
    const rAt = Math.sqrt(1 - y * y);               // raggio del cerchio alla latitudine y
    const theta = goldenAngle * i;                  // angolo per distribuire i punti lungo il cerchio
    pts.push(r * rAt * Math.cos(theta),
             r * y,
             r * rAt * Math.sin(theta));
  }
  return new Float32Array(pts);
}

var LIGHT_SAMPLES = fibonacciSpherePoints(NUM_LIGHT_SAMPLES, LIGHT_SPHERE_RADIUS);

var SKYBOX_VERTS = new Float32Array([
  -1,-1,-1,  1,-1,-1,  1, 1,-1, -1, 1,-1,
  -1,-1, 1,  1,-1, 1,  1, 1, 1, -1, 1, 1,
  -1, 1,-1, -1, 1, 1, -1,-1, 1, -1,-1,-1,
   1, 1,-1,  1, 1, 1,  1,-1, 1,  1,-1,-1,
  -1,-1,-1, -1,-1, 1,  1,-1, 1,  1,-1,-1,
  -1, 1,-1, -1, 1, 1,  1, 1, 1,  1, 1,-1,
]);

var SKYBOX_IDX = new Uint16Array([
   0,1,2,  0,2,3,   4,6,5,  4,7,6,
   8,9,10, 8,10,11, 12,14,13, 12,15,14,
  16,17,18, 16,18,19, 20,22,21, 20,23,22,
]);