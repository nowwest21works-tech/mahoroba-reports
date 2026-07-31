from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "preprocess"))

from model import classify_terrain, ocean_connected_water


def test_enclosed_depression_is_not_classified_as_ocean():
    elevation = np.full((5, 5), 10.0)
    elevation[2, 2] = -200.0

    ocean = ocean_connected_water(elevation, -120.0)

    assert not ocean[2, 2]


def test_boundary_connected_water_is_classified_as_ocean():
    elevation = np.full((5, 5), 10.0)
    elevation[0:3, 2] = -120.0

    ocean = ocean_connected_water(elevation, -120.0)

    assert ocean[0, 2]
    assert ocean[1, 2]
    assert ocean[2, 2]


def test_four_neighbour_rule_does_not_cross_diagonal():
    elevation = np.full((3, 3), 10.0)
    elevation[0, 0] = -200.0
    elevation[1, 1] = -200.0

    ocean = ocean_connected_water(elevation, -120.0)

    assert ocean[0, 0]
    assert not ocean[1, 1]


def test_exposed_shelf_is_current_ocean_and_model_land():
    elevation = np.array(
        [
            [-500.0, -500.0, -500.0],
            [-500.0, -100.0, 50.0],
            [-500.0, -500.0, -500.0],
        ]
    )

    result = classify_terrain(elevation, -120.0)

    assert result["current_ocean"][1, 1]
    assert result["model_land"][1, 1]
    assert result["exposed_shelf"][1, 1]
