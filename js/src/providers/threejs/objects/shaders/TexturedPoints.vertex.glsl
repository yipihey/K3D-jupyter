// ECHOES fork: instanced galaxy-image billboards that face the head in WORLD space.
// Each instance is a quad placed at a galaxy's comoving position, sized by its true physical
// diameter (so it resolves into an image only as the camera approaches — implicit LOD against the
// companion points layer), oriented/inclined by its position angle + axis ratio, and textured from
// a sub-rectangle of the atlas sheet. The quad is built in WORLD space facing uCamPos (the camera
// world position, shared by both eyes) — eye-independent, so it is correct in WebXR stereo (a
// per-eye view-space offset makes billboards diverge/flatten between the eyes). Equivalent on desktop.
precision highp float;

attribute vec3 iCenter;      // galaxy comoving position [world units]
attribute vec4 iUV;          // atlas tile rect (u0, v0, u1, v1)
attribute float iSize;       // true physical diameter [world units]
attribute float iBA;         // axis ratio b/a (minor/major)
attribute float iPA;         // position angle [rad], N->E

uniform float sizeScale;     // global size exaggeration (1.0 = true scale)
uniform vec3 uCamPos;        // camera world position (set per-frame; shared by both XR eyes)

varying vec2 vUV;
varying vec2 vLocal;

void main() {
    vUV = mix(iUV.xy, iUV.zw, uv);          // map the base quad's [0,1] uv into the tile rect
    vLocal = position.xy;                   // [-0.5, 0.5]^2 for the circular edge falloff

    // major axis along +y (image "up"), minor along x squashed by b/a, rotated by PA
    vec2 p = vec2(position.x * iBA, position.y);
    float ca = cos(iPA), sa = sin(iPA);
    vec2 r = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);

    // build a world-space billboard basis facing the head (eye-independent)
    vec4 worldCenter = modelMatrix * vec4(iCenter, 1.0);
    vec3 toCam = normalize(uCamPos - worldCenter.xyz);
    vec3 worldUp = vec3(0.0, 0.0, 1.0);     // scene up = +Z (Camera.js camera.up)
    vec3 right = cross(worldUp, toCam);
    float rl = length(right);
    right = rl > 1e-4 ? right / rl : vec3(1.0, 0.0, 0.0);   // pole guard
    vec3 up = cross(toCam, right);

    vec3 worldPos = worldCenter.xyz + (right * r.x + up * r.y) * (iSize * sizeScale);
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
