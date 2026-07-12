/**
 * flyControls.js — constant-speed forward flight with drag-to-steer.
 *
 * The camera always moves forward along its look axis at FLY_SPEED. Dragging the
 * pointer adjusts heading: horizontal drag → yaw, vertical drag → pitch. Heading
 * is persistent (you stay pointed where you left off) and damped so turns ease in
 * and out. Roll is kept at zero to avoid disorientation.
 *
 * Pitch is clamped shy of ±90° to avoid gimbal flip. A pure click (no drag) is
 * left untouched so the pick-paint system can still use it.
 */

import * as THREE from 'three';
import { FLY_SPEED, FLY_SENSITIVITY, FLY_DAMPING, FLY_MAX_PITCH } from '../config.js';

export function createFlyControls(camera, domElement) {
  let yaw = 0, pitch = 0;         // current (damped)
  let targetYaw = 0, targetPitch = 0;
  let dragging = false, lastX = 0, lastY = 0;
  let speedScale = 1;

  const onDown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
  const onUp   = () => { dragging = false; };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    targetYaw   -= dx * FLY_SENSITIVITY;
    targetPitch -= dy * FLY_SENSITIVITY;
    targetPitch = Math.max(-FLY_MAX_PITCH, Math.min(FLY_MAX_PITCH, targetPitch));
  };

  domElement.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointermove', onMove);

  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const fwd = new THREE.Vector3();

  function update(dt) {
    yaw   += (targetYaw   - yaw)   * FLY_DAMPING;
    pitch += (targetPitch - pitch) * FLY_DAMPING;
    euler.set(pitch, yaw, 0);
    camera.quaternion.setFromEuler(euler);
    fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(fwd, FLY_SPEED * speedScale * dt);
  }

  function dispose() {
    domElement.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointermove', onMove);
  }

  return {
    update,
    dispose,
    setSpeedScale: (s) => { speedScale = s; },
  };
}
