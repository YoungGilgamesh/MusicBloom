/**
 * flyControls.js — constant-speed forward flight with drag-to-steer.
 *
 * The camera always moves forward along its look axis at FLY_SPEED × speedScale.
 * speedScale is set from the live mood via setSpeedScale() — tempo-led
 * (slow track → crawl, fast → rush). Drag to steer; heading damped; roll zero.
 *
 * Pitch is clamped shy of ±90° to avoid gimbal flip. A pure click (no drag) is
 * left untouched so the pick-paint system can still use it.
 */

import * as THREE from 'three';
import { FLY_SPEED, FLY_SENSITIVITY, FLY_DAMPING, FLY_MAX_PITCH, COVER_CAMERA_EASE_TIME, coverCameraEaseIn } from '../config.js';
import { scaledLookSensitivity } from '../camera/lookSensitivity.js';

export function createFlyControls(camera, domElement, onDrag) {
  let yaw = 0, pitch = 0;         // current (damped)
  let targetYaw = 0, targetPitch = 0;
  let dragging = false, lastX = 0, lastY = 0;
  let speedScale = 1;
  // Carried-over auto-drift spin from the cover page's orbitControls (see
  // setInitialSpin) — decays to 0 over spinEaseTime with the same cubic
  // ease-in as the forward-speed ramp, so cover spin holds at the start
  // instead of dying the instant Start is clicked. targetYaw keeps advancing
  // by this rate each frame, on top of any drag-steering, until it decays away.
  let spinRate = 0, spinEaseTime = 1, spinElapsed = 0;

  const onDown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
  const onUp = () => { dragging = false; };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    if ((Math.abs(dx) > 3 || Math.abs(dy) > 3) && typeof onDrag === 'function') onDrag();
    const look = scaledLookSensitivity(FLY_SENSITIVITY);
    targetYaw -= dx * look;
    targetPitch -= dy * look;
    targetPitch = Math.max(-FLY_MAX_PITCH, Math.min(FLY_MAX_PITCH, targetPitch));
    // A deliberate steer overrides any residual auto-drift spin immediately.
    spinRate = 0;
  };

  domElement.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointermove', onMove);

  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const fwd = new THREE.Vector3();

  function update(dt) {
    if (spinRate !== 0) {
      spinElapsed += dt;
      const t = Math.min(1, spinElapsed / spinEaseTime);
      const decayed = spinRate * (1 - coverCameraEaseIn(t));
      targetYaw += decayed * dt;
      if (t >= 1) spinRate = 0;
    }
    yaw += (targetYaw - yaw) * FLY_DAMPING;
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

  // Snap heading (used by initial cloud framing so lookAt isn't overwritten next frame).
  // Optional targetYaw/targetPitch preserve orbitControls' chase gap on the
  // cover→flight handoff — without them both sides snap equal and spin dies
  // for a frame (see orbitControls.getHeading).
  function setHeading(yawRad, pitchRad, targetYawRad, targetPitchRad) {
    yaw = yawRad;
    pitch = Math.max(-FLY_MAX_PITCH, Math.min(FLY_MAX_PITCH, pitchRad));
    targetYaw = targetYawRad !== undefined ? targetYawRad : yaw;
    targetPitch = targetPitchRad !== undefined
      ? Math.max(-FLY_MAX_PITCH, Math.min(FLY_MAX_PITCH, targetPitchRad))
      : pitch;
  }

  /**
   * Carries over the cover page's idle auto-drift yaw rate at handoff, decaying
   * it to 0 over `easeTime` with a cubic ease-in (same curve as the
   * forward-speed ramp) instead of letting the rotation stop dead the instant
   * flyControls takes over. A no-op if rate is 0 (drag was active / user had
   * already stopped the drift before clicking Start).
   */
  function setInitialSpin(rate, easeTime = COVER_CAMERA_EASE_TIME) {
    spinRate = rate;
    spinEaseTime = Math.max(0.0001, easeTime);
    spinElapsed = 0;
  }

  return {
    update,
    dispose,
    setHeading,
    setInitialSpin,
    setSpeedScale: (s) => { speedScale = s; },
  };
}
