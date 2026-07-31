"""Core sea-level and ocean-connectivity model."""

from __future__ import annotations

import numpy as np
from scipy import ndimage

FOUR_NEIGHBOURS = ndimage.generate_binary_structure(rank=2, connectivity=1)


def boundary_seed(mask: np.ndarray) -> np.ndarray:
    """Return true cells where a 2D mask touches the raster boundary."""
    if mask.ndim != 2:
        raise ValueError("mask must be two-dimensional")
    seed = np.zeros_like(mask, dtype=bool)
    seed[0, :] = mask[0, :]
    seed[-1, :] = mask[-1, :]
    seed[:, 0] = mask[:, 0]
    seed[:, -1] = mask[:, -1]
    return seed


def ocean_connected_water(elevation: np.ndarray, sea_level: float) -> np.ndarray:
    """Classify only boundary-connected cells at or below sea level as ocean."""
    if elevation.ndim != 2:
        raise ValueError("elevation must be two-dimensional")
    water_candidate = np.isfinite(elevation) & (elevation <= sea_level)
    seed = boundary_seed(water_candidate)
    return ndimage.binary_propagation(seed, structure=FOUR_NEIGHBOURS, mask=water_candidate)


def classify_terrain(elevation: np.ndarray, sea_level: float) -> dict[str, np.ndarray]:
    """Return present/model ocean, land, and exposed-shelf masks."""
    model_ocean = ocean_connected_water(elevation, sea_level)
    current_ocean = ocean_connected_water(elevation, 0.0)
    model_land = ~model_ocean & np.isfinite(elevation)
    current_land = ~current_ocean & np.isfinite(elevation)
    exposed_shelf = model_land & current_ocean
    return {
        "model_ocean": model_ocean,
        "model_land": model_land,
        "current_ocean": current_ocean,
        "current_land": current_land,
        "exposed_shelf": exposed_shelf,
    }
