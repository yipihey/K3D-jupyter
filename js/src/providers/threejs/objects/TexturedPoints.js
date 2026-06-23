const THREE = require('three');
const buffer = require('../../../core/lib/helpers/buffer');

/**
 * ECHOES fork object: TexturedPoints — instanced, camera-facing galaxy-image billboards.
 *
 * One object per atlas sheet. Each instance is a quad at a galaxy's comoving position, textured
 * from a sub-rectangle of the sheet, sized by the galaxy's true physical diameter and oriented by
 * its axis ratio + position angle. True scale + a companion points layer give an implicit
 * level-of-detail: distant galaxies are sub-pixel (read as points), and the real image resolves as
 * the camera approaches. `size_scale` exaggerates uniformly for overview framing.
 *
 * config fields (from k3d.factory.textured_points):
 *   positions (N*3), atlas_uv (N*4 = u0,v0,u1,v1), sizes (N), axis_ratio (N), position_angle (N),
 *   texture (+texture_file_format), size_scale, opacity, lum_low, lum_high, model_matrix.
 *
 * @method TexturedPoints
 * @memberof K3D.Providers.ThreeJS.Objects
 */
module.exports = {
    create(config, K3D) {
        return new Promise((resolve) => {
            config.opacity = typeof (config.opacity) !== 'undefined' ? config.opacity : 1.0;
            const sizeScale = typeof (config.size_scale) !== 'undefined' ? config.size_scale : 1.0;
            const lumLow = typeof (config.lum_low) !== 'undefined' ? config.lum_low : 0.04;
            const lumHigh = typeof (config.lum_high) !== 'undefined' ? config.lum_high : 0.22;

            const modelMatrix = new THREE.Matrix4();
            modelMatrix.set.apply(modelMatrix, config.model_matrix.data);

            const centers = config.positions.data;          // Float32Array N*3
            const uvRects = config.atlas_uv.data;            // Float32Array N*4
            const sizes = config.sizes.data;                 // Float32Array N
            const ba = config.axis_ratio.data;               // Float32Array N
            const pa = config.position_angle.data;           // Float32Array N
            const count = sizes.length;

            const geometry = new THREE.InstancedBufferGeometry();
            const quad = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
            const quv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
            const index = new Uint16Array([0, 1, 2, 0, 2, 3]);
            geometry.setAttribute('position', new THREE.BufferAttribute(quad, 3));
            geometry.setAttribute('uv', new THREE.BufferAttribute(quv, 2));
            geometry.setIndex(new THREE.BufferAttribute(index, 1));
            geometry.setAttribute('iCenter', new THREE.InstancedBufferAttribute(new Float32Array(centers), 3));
            geometry.setAttribute('iUV', new THREE.InstancedBufferAttribute(new Float32Array(uvRects), 4));
            geometry.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 1));
            geometry.setAttribute('iBA', new THREE.InstancedBufferAttribute(new Float32Array(ba), 1));
            geometry.setAttribute('iPA', new THREE.InstancedBufferAttribute(new Float32Array(pa), 1));
            geometry.instanceCount = count;

            const texture = new THREE.Texture();
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    atlas: { value: texture },
                    sizeScale: { value: sizeScale },
                    uOpacity: { value: config.opacity },
                    lumLow: { value: lumLow },
                    lumHigh: { value: lumHigh },
                },
                vertexShader: require('./shaders/TexturedPoints.vertex.glsl'),
                fragmentShader: require('./shaders/TexturedPoints.fragment.glsl'),
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide,
            });

            const object = new THREE.Mesh(geometry, material);
            object.frustumCulled = false;     // base quad bbox is tiny; instances span the volume
            object.applyMatrix4(modelMatrix);
            object.updateMatrixWorld();

            const image = document.createElement('img');
            image.src = `data:image/${config.texture_file_format};base64,${
                buffer.bufferToBase64(config.texture.data.buffer)}`;
            image.onload = function () {
                texture.image = image;
                texture.flipY = false;
                texture.minFilter = THREE.LinearMipmapLinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = true;
                texture.needsUpdate = true;
                material.needsUpdate = true;
                resolve(object);
            };
            image.onerror = function () { resolve(object); };
        });
    },

    update(config, changes, obj, K3D) {
        // live uniform tweaks; anything else triggers k3d's recreate path (return false).
        let handled = false;
        if (typeof (changes.size_scale) !== 'undefined') {
            obj.material.uniforms.sizeScale.value = changes.size_scale; handled = true;
        }
        if (typeof (changes.opacity) !== 'undefined') {
            obj.material.uniforms.uOpacity.value = changes.opacity; handled = true;
        }
        if (handled) {
            return Promise.resolve({ json: config, obj });
        }
        return false;
    },
};
