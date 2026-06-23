# ECHOES fork of k3d — `TexturedPoints`

This fork adds one object type, **`TexturedPoints`**, used by the ECHOES local-universe viewer
(`pipeline/build_local_viewer_fork.py` in the ECHOES repo): instanced, **camera-facing**,
true-physical-scale galaxy-image billboards textured from an atlas sheet, oriented by axis ratio +
position angle, with the sky keyed transparent by luminance so galaxies glow in 3D. True scale + a
companion points layer give implicit level-of-detail (far = points, the image resolves on approach);
`size_scale` exaggerates uniformly for overview framing.

## Files added/changed
- `js/src/providers/threejs/objects/TexturedPoints.js` — the renderer (InstancedBufferGeometry quad +
  raw `ShaderMaterial`; per-instance `iCenter/iUV/iSize/iBA/iPA`; atlas sampler; base64 texture load).
- `js/src/providers/threejs/objects/shaders/TexturedPoints.{vertex,fragment}.glsl`.
- `js/src/providers/threejs/provider.js` — registers `TexturedPoints`.
- `k3d/objects/textured_points.py` + `k3d/factory/textured_points.py` — traitlets object + factory.
- exports in `k3d/objects/__init__.py`, `k3d/objects/utils.py` (`objects_map`), `k3d/factory/__init__.py`,
  `k3d/__init__.py`.

## Build (Node 20)

```bash
# 1. a node toolchain (we used a dedicated conda env)
conda create -y -n k3dbuild -c conda-forge nodejs=20
export PATH=~/.local/share/anaconda3/envs/k3dbuild/bin:$PATH

# 2. JS deps + the two raw-imported deps the standalone snapshot needs at the REPO ROOT
cd js && npm install && cd ..
npm install --no-save fflate@0.7.4 requirejs          # snapshot.js imports ../../../../node_modules/{fflate/umd/index,requirejs/require}?raw

# 3. build the standalone bundle (-> k3d/static/standalone.js, with TexturedPoints)
cd js && npm run build && cd ..

# 4. metadata the Python package reads at import (normally written by `pip install`/labextension build)
cp package.json k3d/package.json
mkdir -p k3d/labextension && cp package.json k3d/labextension/package.json
```

## Use (no pip install needed — run from source)

```bash
# the ECHOES viewer builder picks up the fork via PYTHONPATH; snapshot_type='full' embeds the
# local renderer (self-contained, no CDN).
PYTHONPATH=~/Projects/echoes-k3d JAX_PLATFORMS=cpu ~/.venv/k3d/bin/python3 \
    pipeline/build_local_viewer_fork.py --atlas-dir docs/visualizer-local/data --out docs/local_viewer_fork.html
```

Minimal smoke test:

```python
import k3d, numpy as np
plot = k3d.plot(snapshot_type="full")
plot += k3d.textured_points(positions=np.zeros((1,3),np.float32),
                            atlas_uv=np.array([[0,0,1,1]],np.float32),
                            sizes=np.array([1.0],np.float32), texture=open("tile.jpg","rb").read())
open("out.html","w").write(plot.get_snapshot())
```

## Verification status
`npm run build` succeeds and the self-contained snapshot embeds both the renderer (`TexturedPoints`
GLSL) and the serialized object (`atlas_uv` data) — confirmed by decompressing the embedded
`[K3D_SOURCE]`/`[DATA]` blobs. The live WebGL render was **not** verifiable in the headless build
sandbox (no WebGL); confirm appearance in a browser.

## To publish as a real fork
Push this repo to a GitHub fork and `pip install` it (the build copies `package.json` into the package
and runs the labextension build, removing the manual `cp` step above).
