from .pricing import add_vat, apply_discount


class Cart:
    def __init__(self):
        self.items: list[tuple[str, float, int]] = []

    def add(self, name: str, price: float, qty: int = 1) -> None:
        self.items.append((name, price, qty))

    def subtotal(self) -> float:
        return sum(p * q for _, p, q in self.items)

    def total(self, discount_percent: float = 0) -> float:
        return add_vat(apply_discount(self.subtotal(), discount_percent))
