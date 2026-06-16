import * as THREE from 'three';

export function initPicking({ scene, camera, renderer, particles, pixelThreshold = 12 }) {
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.2;
    const pointer = new THREE.Vector2();

    let clickMarker = null;

    function placeClickMarker(position) {
        // remove previous marker
        if (clickMarker) {
            clickMarker.geometry.dispose();
            clickMarker.material.dispose();
            scene.remove(clickMarker);
            clickMarker = null;
        }

        // size marker relative to camera distance so it appears consistent
        const distance = camera.position.distanceTo(position);
        const radius = Math.max(0.01, distance * 0.01);

        const geo = new THREE.SphereGeometry(radius, 12, 12);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(position);
        scene.add(mesh);
        clickMarker = mesh;
    }

    function onPointerDown(event) {
        if (!particles) return;

        const rect = renderer.domElement.getBoundingClientRect();
        const mousePixelX = event.clientX - rect.left;
        const mousePixelY = event.clientY - rect.top;
        const width = rect.width;
        const height = rect.height;

        pointer.x = (mousePixelX / width) * 2 - 1;
        pointer.y = -(mousePixelY / height) * 2 + 1;

        raycaster.setFromCamera(pointer, camera);
        // Raycast against the Points object; intersects are sorted by distance
        const intersects = raycaster.intersectObject(particles);
        if (intersects && intersects.length > 0) {
            const hit = intersects[0];
            // hit.point is the world-space intersection point (depth-aware)
            placeClickMarker(hit.point);
            return;
        }

        // Fallback: CPU-based nearest-screen-space pick
        // Project each particle to screen space and find the nearest within a pixel threshold
        const posAttr = particles.geometry.getAttribute('position');
        if (!posAttr) return;

        const pixelThresholdSq = pixelThreshold * pixelThreshold;

        const tmp = new THREE.Vector3();
        const tmpWorld = new THREE.Vector3();

        let bestIndex = -1;
        let bestDistSq = Infinity;

        const matWorld = particles.matrixWorld;

        for (let i = 0; i < posAttr.count; i++) {
            tmp.fromArray(posAttr.array, i * 3);
            // convert to world
            tmpWorld.copy(tmp).applyMatrix4(matWorld);
            // project to NDC
            tmpWorld.project(camera);
            // convert to pixel coords
            const px = (tmpWorld.x * 0.5 + 0.5) * width;
            const py = (-tmpWorld.y * 0.5 + 0.5) * height;

            const dx = px - mousePixelX;
            const dy = py - mousePixelY;
            const d2 = dx * dx + dy * dy;
            if (d2 <= pixelThresholdSq && d2 < bestDistSq) {
                bestDistSq = d2;
                bestIndex = i;
            }
        }

        if (bestIndex !== -1) {
            const worldPos = new THREE.Vector3().fromArray(posAttr.array, bestIndex * 3).applyMatrix4(matWorld);
            placeClickMarker(worldPos);
        }
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    return {
        dispose() {
            renderer.domElement.removeEventListener('pointerdown', onPointerDown);
            if (clickMarker) {
                clickMarker.geometry.dispose();
                clickMarker.material.dispose();
                scene.remove(clickMarker);
                clickMarker = null;
            }
        },
    };
}
