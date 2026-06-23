"""Factory function for TexturedPoints (ECHOES fork): galaxy-image billboards."""

import numpy as np
from typing import Any
from typing import Dict as TypingDict
from typing import List as TypingList
from typing import Optional, Tuple, Union

from ..objects import TexturedPoints
from ..transform import process_transform_arguments

ArrayLike = Union[TypingList, np.ndarray, Tuple]


def textured_points(
        positions: ArrayLike,
        atlas_uv: ArrayLike,
        sizes: ArrayLike,
        texture: bytes,
        texture_file_format: str = "jpg",
        axis_ratio: ArrayLike = None,
        position_angle: ArrayLike = None,
        size_scale: float = 1.0,
        opacity: float = 1.0,
        lum_low: float = 0.04,
        lum_high: float = 0.22,
        name: Optional[str] = None,
        group: Optional[str] = None,
        custom_data: Optional[TypingDict[str, Any]] = None,
        compression_level: int = 0,
        **kwargs: Any,
) -> TexturedPoints:
    """Create instanced, camera-facing galaxy-image billboards textured from one atlas sheet.

    `positions` (N, 3), `atlas_uv` (N, 4) tile rects, `sizes` (N) true physical diameters; optional
    `axis_ratio` / `position_angle` (default round, PA 0). `texture` is the atlas-sheet image bytes.
    `size_scale` exaggerates uniformly (1.0 = true scale). See `k3d.objects.TexturedPoints`.
    """
    n = len(np.asarray(sizes))
    if axis_ratio is None:
        axis_ratio = np.ones(n, np.float32)
    if position_angle is None:
        position_angle = np.zeros(n, np.float32)

    return process_transform_arguments(
        TexturedPoints(
            positions=np.array(positions, np.float32),
            atlas_uv=np.array(atlas_uv, np.float32),
            sizes=np.array(sizes, np.float32),
            axis_ratio=np.array(axis_ratio, np.float32),
            position_angle=np.array(position_angle, np.float32),
            texture=texture,
            texture_file_format=texture_file_format,
            size_scale=size_scale,
            opacity=opacity,
            lum_low=lum_low,
            lum_high=lum_high,
            name=name,
            group=group,
            custom_data=custom_data,
            compression_level=compression_level,
        ),
        **kwargs,
    )
