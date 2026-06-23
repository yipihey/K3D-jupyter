// ECHOES fork: instanced, camera-facing galaxy-image billboards.
// Each instance is a quad placed at a galaxy's comoving position, sized by its true physical
// diameter (so it resolves into an image only as the camera approaches — implicit LOD against the
// companion points layer), oriented/inclined by its position angle + axis ratio, and textured from
// a sub-rectangle of the atlas sheet. Camera-facing: the quad is offset in view space so it always
// presents the image to the camera.
precision highp float;

attribute vec3 iCenter;      // galaxy comoving position [world units]
attribute vec4 iUV;          // atlas tile rect (u0, v0, u1, v1)
attribute float iSize;       // true physical diameter [world units]
attribute float iBA;         // axis ratio b/a (minor/major)
attribute float iPA;         // position angle [rad], N->E

uniform float sizeScale;     // global size exaggeration (1.0 = true scale)

varying vec2 vUV;
varying vec2 vLocal;

void main() {
    vUV = mix(iUV.xy, iUV.zw, uv);          // map the base quad's [0,1] uv into the tile rect
    vLocal = position.xy;                   // [-0.5, 0.5]^2 for the circular edge falloff

    // major axis along +y (image "up"), minor along x squashed by b/a, rotated by PA
    vec2 p = vec2(position.x * iBA, position.y);
    float ca = cos(iPA), sa = sin(iPA);
    vec2 r = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);

    // camera-facing: offset in view space about the instance centre
    vec4 viewCenter = modelViewMatrix * vec4(iCenter, 1.0);
    viewCenter.xy += r * iSize * sizeScale;
    gl_Position = projectionMatrix * viewCenter;
}
