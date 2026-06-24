/*
 * xrLocomotion.js — pure WebXR locomotion math (DOM-free, THREE-free, UMD).
 *
 * The ECHOES fork's WebXR module wires these into the XR frame loop; keeping the math here makes it
 * Node-testable (no headset/GPU). All positions are [x,y,z] arrays in the XR reference ("room") frame;
 * the rig is the player group (camera lives under it) with a uniform `scale` and a `position`. Returns
 * plain numbers/arrays the caller applies to the rig.
 *
 * Player-rig convention: a world point W relates to a room-frame point h by W = rigPos + rigScale*h
 * (uniform scale, no rig rotation for grab — yaw is handled separately). Grab locomotion keeps the
 * grabbed world point pinned under the hand by solving for rigPos (and rigScale for two-hand).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.XRLocomotion = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // One-hand grab: pin the grabbed world point to the moving hand. Returns the rig position that keeps
  // W = rigStart.position + rigStart.scale*handStart fixed under the hand now at handNow:
  //   posNow = posStart + scaleStart*(handStart - handNow)
  function oneHandGrabPosition(opts) {
    const { handStart, handNow, posStart, scaleStart } = opts;
    return add(posStart, scale(sub(handStart, handNow), scaleStart));
  }

  // Two-hand grab: scale the rig by the hand-distance ratio about the (room) midpoint, keeping the
  // grabbed world midpoint fixed. ratio = |bNow-aNow| / |bStart-aStart|.
  //   scaleNow = clamp(scaleStart*ratio, min, max)
  //   posNow   = posStart + scaleStart*midStart - scaleNow*midNow
  function twoHandGrabTransform(opts) {
    const { aStart, bStart, aNow, bNow, posStart, scaleStart, minScale, maxScale } = opts;
    const dStart = len(sub(bStart, aStart));
    const dNow = len(sub(bNow, aNow));
    const ratio = dStart > 1e-9 ? dNow / dStart : 1.0;
    const scaleNow = clamp(scaleStart * ratio, minScale || 1e-12, maxScale || 1e30);
    const W = add(posStart, scale(mid(aStart, bStart), scaleStart));      // fixed world midpoint
    const posNow = sub(W, scale(mid(aNow, bNow), scaleNow));
    return { scale: scaleNow, position: posNow };
  }

  // --- quaternion helpers (for snap-turn about the head's vertical axis) ---
  function quatAxisAngle(axis, angleRad) {
    const h = angleRad / 2, s = Math.sin(h);
    return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
  }
  function quatMul(a, b) {                                                 // a * b (xyzw)
    const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
    return [
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    ];
  }
  function quatRotate(q, v) {                                              // rotate vec3 by quat
    const [x, y, z, w] = q, [vx, vy, vz] = v;
    const ix = w * vx + y * vz - z * vy;
    const iy = w * vy + z * vx - x * vz;
    const iz = w * vz + x * vy - y * vx;
    const iw = -x * vx - y * vy - z * vz;
    return [
      ix * w + iw * -x + iy * -z - iz * -y,
      iy * w + iw * -y + iz * -x - ix * -z,
      iz * w + iw * -z + ix * -y - iy * -x,
    ];
  }

  // Snap-turn: rotate the rig about the head's world position around the up axis (default +Z, the
  // fork's scene up). Returns new {position, quaternion} of the rig.
  function snapTurn(opts) {
    const { rigPos, rigQuat, headWorld, degrees, up } = opts;
    const axis = up || [0, 0, 1];
    const q = quatAxisAngle(axis, (degrees * Math.PI) / 180);
    const position = add(headWorld, quatRotate(q, sub(rigPos, headWorld)));
    const quaternion = quatMul(q, rigQuat || [0, 0, 0, 1]);
    return { position, quaternion };
  }

  // Smooth fly: translate the rig along head-relative horizontal directions from a thumbstick.
  // headForward/headRight are world-space unit vectors (caller projects to horizontal if desired).
  // delta = (headRight*stickX + headForward*(-stickY)) * speed * dt * rigScale   (-stickY: up = forward)
  function flyStep(opts) {
    const { headForward, headRight, stickX, stickY, speed, dt, rigScale } = opts;
    const s = (speed || 1) * (dt || 0) * (rigScale == null ? 1 : rigScale);
    return scale(add(scale(headRight, stickX), scale(headForward, -stickY)), s);
  }

  return { oneHandGrabPosition, twoHandGrabTransform, snapTurn, flyStep,
           _v: { sub, add, scale, mid, len, clamp, quatAxisAngle, quatMul, quatRotate } };
});
