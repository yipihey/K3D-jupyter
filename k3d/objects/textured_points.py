"""TexturedPoints object for K3D (ECHOES fork).

Camera-facing galaxy-image billboards: one drawable per atlas sheet, each instance a quad placed at
a galaxy's comoving position, textured from a sub-rectangle of the sheet, sized by the galaxy's true
physical diameter and oriented by its axis ratio + position angle. See the JS object
``js/src/providers/threejs/objects/TexturedPoints.js``.
"""

import numpy as np
from traitlets import Bytes, Float, Unicode

from traittypes import Array

from .base import Drawable, TimeSeries
from ..helpers import array_serialization_wrap, get_bounding_box_points


class TexturedPoints(Drawable):
    """
    Instanced, camera-facing galaxy-image billboards textured from an atlas sheet.

    Attributes:
        positions: (N, 3) `array_like` comoving positions of the galaxies.
        atlas_uv: (N, 4) `array_like` atlas tile rectangles (u0, v0, u1, v1) per instance.
        sizes: (N,) `array_like` true physical diameter of each galaxy [world units].
        axis_ratio: (N,) `array_like` minor/major axis ratio b/a.
        position_angle: (N,) `array_like` position angle [radians], N->E.
        texture: `bytes` the atlas sheet image (e.g. JPEG/PNG bytes).
        texture_file_format: `str` the texture format ('jpg', 'png', ...).
        size_scale: `float` global size exaggeration (1.0 = true scale).
        opacity: `float` overall opacity.
        lum_low / lum_high: `float` luminance band over which the (black) sky fades to the galaxy.
        model_matrix: (4, 4) `array_like` model transform.
    """

    type = Unicode(read_only=True).tag(sync=True)
    positions = Array(dtype=np.float32).tag(
        sync=True, **array_serialization_wrap("positions")
    )
    atlas_uv = Array(dtype=np.float32).tag(
        sync=True, **array_serialization_wrap("atlas_uv")
    )
    sizes = Array(dtype=np.float32).tag(sync=True, **array_serialization_wrap("sizes"))
    axis_ratio = Array(dtype=np.float32).tag(
        sync=True, **array_serialization_wrap("axis_ratio")
    )
    position_angle = Array(dtype=np.float32).tag(
        sync=True, **array_serialization_wrap("position_angle")
    )
    texture = Bytes(allow_none=True).tag(sync=True, **array_serialization_wrap("texture"))
    texture_file_format = Unicode(allow_none=True).tag(sync=True)
    size_scale = TimeSeries(Float(default_value=1.0)).tag(sync=True)
    opacity = TimeSeries(Float(min=0.0, max=1.0, default_value=1.0)).tag(sync=True)
    lum_low = Float(default_value=0.04).tag(sync=True)
    lum_high = Float(default_value=0.22).tag(sync=True)
    model_matrix = TimeSeries(Array(dtype=np.float32)).tag(
        sync=True, **array_serialization_wrap("model_matrix")
    )

    def __init__(self, **kwargs):
        super(TexturedPoints, self).__init__(**kwargs)
        self.set_trait("type", "TexturedPoints")

    def get_bounding_box(self):
        return get_bounding_box_points(self.positions, self.model_matrix)
