// ECHOES fork: galaxy-image billboard fragment.
// The cutouts are bright galaxies on a (near-black) sky, so we key the alpha to luminance: the sky
// becomes transparent and only the galaxy shows. A soft circular edge falloff hides the tile border,
// giving glowing galaxies floating in 3D rather than opaque square cards.
precision highp float;

uniform sampler2D atlas;
uniform float uOpacity;
uniform float lumLow;        // luminance where the sky fades in to transparent
uniform float lumHigh;       // luminance at which the galaxy is fully opaque

varying vec2 vUV;
varying vec2 vLocal;

void main() {
    vec4 t = texture2D(atlas, vUV);
    float lum = dot(t.rgb, vec3(0.299, 0.587, 0.114));
    float a = smoothstep(lumLow, lumHigh, lum);          // black sky -> 0, galaxy -> 1
    float rad = length(vLocal) * 2.0;                    // 0 centre .. ~1.41 corner
    a *= smoothstep(1.0, 0.72, rad);                     // soft circular vignette
    a *= uOpacity;
    if (a < 0.008) discard;
    gl_FragColor = vec4(t.rgb, a);
}
