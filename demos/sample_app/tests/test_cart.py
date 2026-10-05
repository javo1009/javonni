from shop.cart import Cart


def test_total_with_vat():
    c = Cart()
    c.add("non", 1000, 2)
    assert c.total() == 2240.0
