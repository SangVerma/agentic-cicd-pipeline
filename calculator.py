def add(a, b):
    return a + b

def divide(a, b):
    # QA regression tests will fail since b is not verified before division
    return a / 0
