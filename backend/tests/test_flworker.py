"""Tests for fl_worker — FedAvg aggregation + drift detection."""

import numpy as np
from app.modules.fl_worker.aggregator import fedavg_aggregate, detect_drift, serialize_array, deserialize_array


def test_serialize_deserialize():
    arr = np.array([1.0, 2.0, 3.0, 4.0])
    raw = serialize_array(arr)
    result = deserialize_array(raw)
    np.testing.assert_array_almost_equal(arr, result)


def test_fedavg_aggregate():
    deltas = [
        np.array([1.0, 2.0, 3.0]),
        np.array([3.0, 4.0, 5.0]),
        np.array([2.0, 3.0, 4.0]),
    ]
    result = fedavg_aggregate(deltas)
    expected = np.array([2.0, 3.0, 4.0])
    np.testing.assert_array_almost_equal(result, expected)


def test_drift_detection_no_drift():
    baseline = np.array([1.0, 2.0, 3.0])
    update = np.array([1.1, 2.1, 3.1])  # Very similar direction
    sim, drifted = detect_drift(baseline, update)
    assert sim > 0.99
    assert drifted is False


def test_drift_detection_with_drift():
    baseline = np.array([1.0, 0.0, 0.0])
    update = np.array([0.0, 0.0, 1.0])  # Orthogonal = max drift
    sim, drifted = detect_drift(baseline, update)
    assert sim < 0.01
    assert drifted is True


def test_drift_detection_opposite():
    baseline = np.array([1.0, 2.0, 3.0])
    update = np.array([-1.0, -2.0, -3.0])  # Opposite direction
    sim, drifted = detect_drift(baseline, update)
    assert sim < 0
    assert drifted is True