"""Narx hisoblash."""


def apply_discount(price: float, percent: float) -> float:
    """Narxga foiz chegirma qo'llaydi."""
    return round(price * (1 - percent / 100), 2)


def add_vat(price: float, rate: float = 0.12) -> float:
    """QQS qo'shadi (O'zbekistonda 12%)."""
    return round(price * (1 + rate), 2)
