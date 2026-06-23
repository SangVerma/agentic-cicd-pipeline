import pytest
import calculator

def test_addition_integers():
    assert calculator.add(2, 3) == 5
    assert calculator.add(-1, 1) == 0

def test_division_by_zero_handling():
    with pytest.raises(ValueError):
        calculator.divide(10, 0)

def test_floating_point_math():
    assert calculator.divide(5, 2) == 2.5
