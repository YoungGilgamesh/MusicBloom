/**
 * orbitControls.js — cover-page camera: the camera itself is the pivot, sitting
 * at the center of the particle cloud (same as gameplay's flyControls, just
 * with zero forward travel) and only rotating to look around. NOT an orbit
 * around an external focus point at a distance — "orbit" here means the view
 * direction slowly turns in place, same steering feel as flyControls (drag to
 * look, damped yaw/pitch), so the handoff to flyControls on Start is a
 * continuous, un-jarring motion (same position, same look direction).
 *
 * Pure DIY (no three.js OrbitControls import) to match the rest of the
 * project's hand-rolled camera rigs.
 */

import * as THREE from 'three';
import {
    COVER_ORBIT_SPEED,
    COVER_ORBIT_SENSITIVITY,
    COVER_ORBIT_DAMPING,
    COVER_ORBIT_MAX_PITCH,
} from '../config.js';
import { scaledLookSensitivity } from './lookSensitivity.js';

export function createOrbitControls(camera, domElement, onLook) {
    let yaw = Math.random() * Math.PI * 2; // random starting look direction each load
    let pitch = (Math.random() * 2 - 1) * 0.3;
    let targetYaw = yaw, targetPitch = pitch;
    let dragging = false, lastX = 0, lastY = 0;
    let autoDrift = true;

    const onDown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
    // Resume the slow idle auto-drift once the drag ends — otherwise a single
    // drag would permanently freeze the auto-rotation for the rest of cover.
    const onUp = () => { dragging = false; autoDrift = true; };
    const onMove = (e) => {
        if (!dragging) return;
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) autoDrift = false;
        if ((Math.abs(dx) > 3 || Math.abs(dy) > 3) && typeof onLook === 'function') onLook();
        const look = scaledLookSensitivity(COVER_ORBIT_SENSITIVITY);
        targetYaw -= dx * look;
        targetPitch -= dy * look;
        targetPitch = Math.max(-COVER_ORBIT_MAX_PITCH, Math.min(COVER_ORBIT_MAX_PITCH, targetPitch));
    };

    domElement.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);

    const euler = new THREE.Euler(0, 0, 0, 'YXZ');

    function update(dt) {
        if (autoDrift) targetYaw += COVER_ORBIT_SPEED * dt;
        yaw += (targetYaw - yaw) * COVER_ORBIT_DAMPING;
        pitch += (targetPitch - pitch) * COVER_ORBIT_DAMPING;

        euler.set(pitch, yaw, 0);
        camera.quaternion.setFromEuler(euler);
        // Camera stays put — it's the pivot, sitting at the cloud's center (world
        // origin, wherever main.js has placed it — never moved here).
    }

    function dispose() {
        domElement.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointermove', onMove);
    }

    /** Current look direction — used to hand off smoothly to flyControls.
     *  Includes the damped targets: auto-drift keeps targetYaw ahead of yaw,
     *  and that gap IS the visible spin. Dropping it on handoff makes the
     *  orbit die for a frame while flyControls rebuilds the lead. */
    function getHeading() {
        return { yaw, pitch, targetYaw, targetPitch };
    }

    /**
     * Hard-snap the look direction (both current AND target, so damping
     * doesn't visibly drift-in from the old heading) — used to point the
     * cover camera at the densest part of the freshly-reseeded particle
     * cloud right as it fades in (see main.js's findDensestDirection).
     * Real implementation (overrides the flyControls-compat no-op below).
     */
    function setHeading(newYaw, newPitch) {
        yaw = targetYaw = newYaw;
        pitch = targetPitch = Math.max(-COVER_ORBIT_MAX_PITCH, Math.min(COVER_ORBIT_MAX_PITCH, newPitch));
    }

    /**
     * Current idle auto-drift yaw rate (rad/sec), or 0 if the user is actively
     * dragging (or last touched the view) when Start is clicked. Used so
     * flyControls can carry the same spin momentum for a moment instead of the
     * rotation snapping dead the instant control is handed off (see
     * flyControls.setInitialSpin).
     */
    function getAutoDriftRate() {
        return autoDrift ? COVER_ORBIT_SPEED : 0;
    }

    return {
        update,
        dispose,
        getHeading,
        getAutoDriftRate,
        setHeading,
        // No-op so code that unconditionally calls the flyControls-shaped API
        // (setSpeedScale each frame) doesn't need to branch on which controller
        // is currently active.
        setSpeedScale: () => { },
    };
}
