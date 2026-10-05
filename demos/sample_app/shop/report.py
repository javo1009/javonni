from .cart import Cart
from .pricing import apply_discount


def receipt(cart: Cart, discount_percent: float = 0) -> str:
    lines = [f"{n} x{q} = {p * q:.2f}" for n, p, q in cart.items]
    lines.append(f"Chegirmadan keyin: {apply_discount(cart.subtotal(), discount_percent):.2f}")
    lines.append(f"JAMI (QQS bilan): {cart.total(discount_percent):.2f}")
    return "\n".join(lines)
