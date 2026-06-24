// ECHOES fork: WebXR (immersive VR + AR passthrough) for the textured local-universe viewer.
//
// Exposed as `K3DInstance.enableWebXR(config)` (wired in Core.js). Feature-detects WebXR, adds
// "Enter VR"/"Enter AR" buttons, and on entry: parents the camera + controllers under a player rig,
// suspends the desktop rAF loop (Canvas.js guards on renderer.xr.isPresenting) and drives frames via
// renderer.setAnimationLoop with a single-pass draw + cross-headset locomotion. Locomotion math is in
// the DOM-free, Node-tested xrLocomotion.js. AR mode clears transparent so passthrough shows.
//
// Cross-headset input: grab-to-move (one squeeze/pinch + drag) and grab-to-scale (two) work on Quest
// controllers AND Vision Pro hands/pinch; thumbstick fly + snap-turn + comfort vignette are Quest
// extras (simply absent when there's no gamepad, e.g. Vision Pro).
const THREE = require('three');
const XL = require('./xrLocomotion');

function enableWebXR(K3D, config) {
    config = config || {};
    const modes = config.modes || ['vr', 'ar'];
    const snapDeg = config.snapTurnDegrees != null ? config.snapTurnDegrees : 30;
    const enableFly = config.enableFly !== false;
    const useVignette = config.vignette !== false;

    if (typeof navigator === 'undefined' || !navigator.xr) return { dispose() {} };
    const world = K3D.getWorld();
    const { renderer, scene, camera, targetDOMNode } = world;

    // ---- UI: a small button bar (dark, matches the context-menu aesthetic) ----
    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;left:50%;bottom:18px;transform:translateX(-50%);'
        + 'z-index:10001;display:flex;gap:8px;pointer-events:auto';
    function mkBtn(id, label, mode) {
        const b = document.createElement('button');
        b.id = id; b.textContent = label; b.style.display = 'none';
        b.style.cssText += 'font:13px -apple-system,sans-serif;color:#dff;background:rgba(11,11,15,0.92);'
            + 'border:1px solid #2a6;border-radius:8px;padding:8px 16px;cursor:pointer';
        b.onclick = () => startSession(mode, b);
        navigator.xr.isSessionSupported(mode === 'ar' ? 'immersive-ar' : 'immersive-vr')
            .then((ok) => { if (ok) b.style.display = ''; }).catch(() => {});
        bar.appendChild(b);
        return b;
    }
    if (modes.indexOf('vr') >= 0) mkBtn('echoes-vr-btn', 'Enter VR', 'vr');
    if (modes.indexOf('ar') >= 0) mkBtn('echoes-ar-btn', 'Enter AR', 'ar');
    (targetDOMNode || document.body).appendChild(bar);

    // ---- session state ----
    const st = {
        session: null, mode: null, rig: null, cameraParent: null,
        controllers: [], grabs: [null, null], grabbing: 0,
        rigPosStart: null, rigScaleStart: 1, handStart: [null, null],
        camPos0: null, camQuat0: null, vignette: null, prevRigPos: null, snapArmed: true,
    };

    function sceneBboxDiameter() {
        try {
            const bb = K3D.getSceneBoundingBox ? K3D.getSceneBoundingBox() : null;
            if (bb) { const s = new THREE.Vector3(); bb.getSize(s); return Math.max(s.x, s.y, s.z) || 1; }
        } catch (e) { /* fall through */ }
        return 1;
    }

    function makeVignette() {
        const cv = document.createElement('canvas'); cv.width = cv.height = 256;
        const g = cv.getContext('2d');
        const rad = g.createRadialGradient(128, 128, 60, 128, 128, 130);
        rad.addColorStop(0, 'rgba(0,0,0,0)'); rad.addColorStop(1, 'rgba(0,0,0,1)');
        g.fillStyle = rad; g.fillRect(0, 0, 256, 256);
        const tex = new THREE.CanvasTexture(cv);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false,
            depthWrite: false, opacity: 0 });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), mat);
        mesh.position.z = -1; mesh.renderOrder = 999; mesh.frustumCulled = false;
        return mesh;
    }

    function startSession(mode, btn) {
        const xrMode = mode === 'ar' ? 'immersive-ar' : 'immersive-vr';
        const opts = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };
        navigator.xr.requestSession(xrMode, opts).then((session) => {
            st.mode = mode;
            renderer.xr.enabled = true;
            renderer.xr.setReferenceSpaceType('local-floor');
            return renderer.xr.setSession(session).then(() => onSessionStart(session));
        }).catch((err) => { console.warn('[echoes-xr] requestSession failed:', err); });
    }

    function onSessionStart(session) {
        st.session = session;
        world.controls.enabled = false;
        st.camPos0 = camera.position.clone(); st.camQuat0 = camera.quaternion.clone();

        // player rig: parent the camera + controllers; rig transform = locomotion
        st.cameraParent = camera.parent;
        st.rig = new THREE.Group(); scene.add(st.rig); st.rig.add(camera);

        const D = sceneBboxDiameter();
        const roomM = st.mode === 'ar' ? 1.0 : 3.0;
        const spanMpc = st.mode === 'ar' ? D : Math.min(D, 60);     // AR: whole field on a table
        const s = roomM / Math.max(spanMpc, 1e-6);
        st.rig.scale.setScalar(s);
        // place the scaled field a few metres in front, eye height ~1.2 m
        st.rig.position.set(0, 1.2, -roomM * 0.6);

        for (let i = 0; i < 2; i++) {
            const c = renderer.xr.getController(i);
            st.rig.add(c);
            const grip = renderer.xr.getControllerGrip(i); st.rig.add(grip);
            grip.add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8),
                new THREE.MeshBasicMaterial({ color: 0x44ddaa })));
            st.rig.add(renderer.xr.getHand(i));
            c.userData.idx = i;
            c.addEventListener('squeezestart', () => onGrabStart(i));
            c.addEventListener('squeezeend', () => onGrabEnd(i));
            c.addEventListener('selectstart', () => onGrabStart(i));   // pinch (AVP) / trigger
            c.addEventListener('selectend', () => onGrabEnd(i));
            st.controllers[i] = c;
        }

        if (useVignette) { st.vignette = makeVignette(); camera.add(st.vignette); }
        if (st.mode === 'ar') { scene.background = null; renderer.setClearAlpha(0); }
        st.prevRigPos = st.rig.position.clone();

        session.addEventListener('end', onSessionEnd);
        renderer.setAnimationLoop(frame);
    }

    function handRoom(i) { const p = st.controllers[i].position; return [p.x, p.y, p.z]; }

    function onGrabStart(i) {
        st.grabs[i] = true; st.grabbing += 1;
        st.handStart[i] = handRoom(i);
        st.rigPosStart = [st.rig.position.x, st.rig.position.y, st.rig.position.z];
        st.rigScaleStart = st.rig.scale.x;
        // if the OTHER hand was already grabbing, re-anchor it too (two-hand start)
        const o = 1 - i;
        if (st.grabs[o]) st.handStart[o] = handRoom(o);
    }
    function onGrabEnd(i) {
        if (st.grabs[i]) st.grabbing -= 1;
        st.grabs[i] = false;
        // re-anchor a still-held hand for continued one-hand drag
        const o = 1 - i;
        if (st.grabs[o]) {
            st.handStart[o] = handRoom(o);
            st.rigPosStart = [st.rig.position.x, st.rig.position.y, st.rig.position.z];
            st.rigScaleStart = st.rig.scale.x;
        }
    }

    function applyGrab() {
        if (st.grabbing === 2) {
            const t = XL.twoHandGrabTransform({
                aStart: st.handStart[0], bStart: st.handStart[1],
                aNow: handRoom(0), bNow: handRoom(1),
                posStart: st.rigPosStart, scaleStart: st.rigScaleStart,
                minScale: st.rigScaleStart / 50, maxScale: st.rigScaleStart * 50,
            });
            st.rig.position.set(t.position[0], t.position[1], t.position[2]);
            st.rig.scale.setScalar(t.scale);
        } else if (st.grabbing === 1) {
            const i = st.grabs[0] ? 0 : 1;
            const p = XL.oneHandGrabPosition({
                handStart: st.handStart[i], handNow: handRoom(i),
                posStart: st.rigPosStart, scaleStart: st.rigScaleStart,
            });
            st.rig.position.set(p[0], p[1], p[2]);
        }
    }

    const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(0, 0, 1);
    function applyFlyAndTurn(dt) {
        if (!st.session) return;
        const sources = st.session.inputSources;
        for (let k = 0; k < sources.length; k++) {
            const gp = sources[k].gamepad;
            if (!gp || !gp.axes || gp.axes.length < 4) continue;
            const lx = gp.axes[2], ly = gp.axes[3];               // primary thumbstick
            if (enableFly && (Math.abs(lx) > 0.15 || Math.abs(ly) > 0.15)) {
                camera.getWorldDirection(_fwd); _fwd.z = _fwd.z; _fwd.normalize();
                _right.crossVectors(_fwd, _up).normalize();
                const d = XL.flyStep({ headForward: [_fwd.x, _fwd.y, _fwd.z],
                    headRight: [_right.x, _right.y, _right.z], stickX: lx, stickY: ly,
                    speed: 3.0, dt, rigScale: st.rig.scale.x });
                st.rig.position.x += d[0]; st.rig.position.y += d[1]; st.rig.position.z += d[2];
            }
            // snap-turn on the right stick X (debounced via snapArmed)
            const rx = gp.axes.length >= 4 ? gp.axes[2] : 0;
            if (Math.abs(rx) < 0.3) st.snapArmed = true;
            if (st.snapArmed && Math.abs(rx) > 0.7) {
                const head = new THREE.Vector3(); camera.getWorldPosition(head);
                const r = XL.snapTurn({ rigPos: [st.rig.position.x, st.rig.position.y, st.rig.position.z],
                    rigQuat: [st.rig.quaternion.x, st.rig.quaternion.y, st.rig.quaternion.z, st.rig.quaternion.w],
                    headWorld: [head.x, head.y, head.z], degrees: rx > 0 ? -snapDeg : snapDeg });
                st.rig.position.set(r.position[0], r.position[1], r.position[2]);
                st.rig.quaternion.set(r.quaternion[0], r.quaternion[1], r.quaternion[2], r.quaternion[3]);
                st.snapArmed = false;
            }
        }
    }

    let _last = 0;
    function frame(time) {
        const dt = _last ? Math.min(0.05, (time - _last) / 1000) : 0.016; _last = time;
        applyGrab();
        applyFlyAndTurn(dt);
        if (st.vignette) {                                        // ramp vignette with motion
            const v = st.prevRigPos ? st.rig.position.distanceTo(st.prevRigPos) / Math.max(dt, 1e-3) : 0;
            const target = Math.min(0.85, v / (st.rig.scale.x * 8 + 1e-6));
            st.vignette.material.opacity += (target - st.vignette.material.opacity) * 0.2;
        }
        st.prevRigPos = st.rig.position.clone();
        renderer.render(scene, camera);                          // single-pass (uCamPos via onBeforeRender)
    }

    function onSessionEnd() {
        renderer.setAnimationLoop(null);
        renderer.xr.enabled = false;
        if (st.vignette) { camera.remove(st.vignette); st.vignette = null; }
        if (st.rig) {
            st.rig.remove(camera);
            (st.cameraParent || scene).add(camera);
            scene.remove(st.rig); st.rig = null;
        }
        if (st.camPos0) camera.position.copy(st.camPos0);
        if (st.camQuat0) camera.quaternion.copy(st.camQuat0);
        if (st.mode === 'ar') { renderer.setClearAlpha(1); }
        world.controls.enabled = true; world.controls.update();
        st.session = null; st.grabbing = 0; st.grabs = [null, null];
        if (world.resumeRefreshLoop) world.resumeRefreshLoop();
        K3D.render();
    }

    return { dispose() { try { bar.remove(); } catch (e) { /* */ } } };
}

module.exports = enableWebXR;
