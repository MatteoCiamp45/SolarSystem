/**
 * camera.js — Orbit Camera per il Solar System WebGL
 * Gestisce: posizione sferica, rotazione, zoom, pan, input mouse e touch
 *
 * Dipende da: config.js (settings), m4 (globale)
 */

'use strict';

/**************************** ORBIT CAMERA */
var camera = {
  theta:       0.3,
  phi:         0.3,
  radius:      30,
  target:      [0, 0, 0],
  sensitivity: 0.005,
  zoomSpeed:   1.1,
  panSpeed:    0.008,
};

// offset di pan accumulato (in world space) per spostare il target della camera rispetto al centro del corpo selezionato
var panOffset = [0, 0, 0];
var lastCameraTarget = settings.cameraTarget;

// posizione camera
function getCameraPosition() {
  const cosPhi = Math.cos(camera.phi);
  return [
    // conversione coordinate sferiche (theta, phi, radius) in coordinate cartesiane (x, y, z)
    camera.target[0] + camera.radius * cosPhi * Math.sin(camera.theta),
    camera.target[1] + camera.radius * Math.sin(camera.phi),
    camera.target[2] + camera.radius * cosPhi * Math.cos(camera.theta),
  ];
}

// matrice di vista (camera)
function getCameraMatrix() {
  return m4.lookAt(getCameraPosition(), camera.target, [0, 1, 0]);  // asse Y è "up"
}

/**************************** INPUT MOUSE E TOUCH */

// stato del mouse (pulsanti e ultima posizione)
var mouse = { left: false, right: false, lastX: 0, lastY: 0 };

var lastTouchDist = null;

function initCameraControls(canvas) {

  canvas.addEventListener('mousedown', (e) => {
    console.log('button:', e.button);
    if (e.button === 0) mouse.left  = true; // sinistro: rotazione camera
    if (e.button === 2) mouse.right = true; // destro: pan camera
    mouse.lastX = e.clientX;
    mouse.lastY = e.clientY;
    e.preventDefault();
  });

  window.addEventListener('mouseup', () => {
    mouse.left = false;
    mouse.right = false;
  });

  window.addEventListener('mousemove', (e) => {
    // calcolare spostamento del mouse
    const dx = e.clientX - mouse.lastX;
    const dy = e.clientY - mouse.lastY;
    mouse.lastX = e.clientX;
    mouse.lastY = e.clientY;

    if (mouse.left) {
      camera.theta -= dx * camera.sensitivity;  // rotazione orizzontale
      camera.phi   += dy * camera.sensitivity;  // rotazione verticale
      camera.phi = Math.max(-Math.PI / 2 + 0.05,
                   Math.min( Math.PI / 2 - 0.05, camera.phi)); // limite rotazione (evita flip)
    }

    if (mouse.right) {
      const camMat = getCameraMatrix();
      const right  = [camMat[0], camMat[1], camMat[2]];
      const upDir  = [camMat[4], camMat[5], camMat[6]];
      const s = camera.radius * camera.panSpeed;

      // aggiornare offset di pan accumulato in world space
      panOffset[0] -= right[0] * dx * s - upDir[0] * dy * s;
      panOffset[1] -= right[1] * dx * s - upDir[1] * dy * s;
      panOffset[2] -= right[2] * dx * s - upDir[2] * dy * s;
    }
  });

  canvas.addEventListener('wheel', (e) => {
    camera.radius *= (e.deltaY > 0) ? camera.zoomSpeed : 1 / camera.zoomSpeed;
    const minRadius = settings.cameraTarget === 'Sole' ? 10 : 1;
    camera.radius = Math.max(minRadius, Math.min(150, camera.radius));
    e.preventDefault();
  }, { passive: false });

  // evitare apertura menu browser con click destro
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) { // un dito: rotazione camera
      mouse.left  = true;
      mouse.lastX = e.touches[0].clientX;
      mouse.lastY = e.touches[0].clientY;
    }
    if (e.touches.length === 2) { // due dita: zoom camera
      mouse.left    = false;
      lastTouchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && mouse.left) {
      const dx = e.touches[0].clientX - mouse.lastX;
      const dy = e.touches[0].clientY - mouse.lastY;
      mouse.lastX = e.touches[0].clientX;
      mouse.lastY = e.touches[0].clientY;
      camera.theta -= dx * camera.sensitivity;
      camera.phi   += dy * camera.sensitivity;
      camera.phi = Math.max(-Math.PI / 2 + 0.05,
                   Math.min( Math.PI / 2 - 0.05, camera.phi));
    }
    if (e.touches.length === 2 && lastTouchDist !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      camera.radius *= lastTouchDist / dist;
      const minRadius = settings.cameraTarget === 'Sole' ? 10 : 1;
      camera.radius = Math.max(minRadius, Math.min(150, camera.radius));
      lastTouchDist  = dist;
    }
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    mouse.left    = false;
    lastTouchDist = null;
  });

}