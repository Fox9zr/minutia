import re

# Список сотрудников компании (Whitelist)
STAFF_WHITELIST = [
    "Томашова", "Кот", "Мозолевский", "Дайко", "Метельская", "Амельянчик",
    "Новиков", "Илюсевич", "Полянская", "Гарбаль", "Щекоткович"
]

class DLPVaultTokenizer:
    """
    Реверсивный токенизатор чувствительных данных (DLP Vault Tokenizer).
    Псевдонимизирует телефоны, паспорта, IBAN, банковские карты и оклады,
    сохраняя имена сотрудников для распределения задач.
    """
    def __init__(self):
        self.mapping = {}
        self.reverse_mapping = {}
        self.counter = 0

    def _get_token(self, category: str, original_val: str) -> str:
        clean_val = original_val.strip()
        if clean_val in self.mapping:
            return self.mapping[clean_val]
        self.counter += 1
        token = f"[{category}_{self.counter}]"
        self.mapping[clean_val] = token
        self.reverse_mapping[token] = clean_val
        return token

    def tokenize(self, text: str) -> str:
        out = text

        # 1. Банковские карты (16 цифр)
        def replace_card(m):
            return self._get_token("CARD", m.group(0))
        out = re.sub(r'\b(?:\d{4}[ -]?){3}\d{4}\b', replace_card, out)

        # 2. Телефоны (+375... / 80...)
        def replace_phone(m):
            return self._get_token("PHONE", m.group(0))
        out = re.sub(r'(\+375|80)\s?\(?\d{2}\)?\s?\d{3}[\s-]?\d{2}[\s-]?\d{2}', replace_phone, out)

        # 3. Номера паспортов (2 буквы + 7 цифр, например MP1234567, АВ1234567)
        def replace_passport(m):
            val = m.group(0)
            return self._get_token("PASSPORT", val)
        out = re.sub(r'\b[A-ZА-Я]{2}\d{7}\b', replace_passport, out)

        # 4. Счета IBAN (BY... 28 символов)
        def replace_iban(m):
            return self._get_token("IBAN", m.group(0))
        out = re.sub(r'\bBY\d{2}[A-Z]{4}\d{20}\b', replace_iban, out)

        # 5. Персональные оклады и суммы (например "оклад 5000 рублей", "ставка 3500 BYN")
        def replace_salary(m):
            prefix = m.group(1)
            amount = m.group(2)
            token = self._get_token("SALARY", amount)
            return f"{prefix} {token}"
        out = re.sub(r'\b(оклад|ставка|зарплата|бонус)\s*[:=]?\s*(\d+[\s\d]*\s*(?:руб|byn|usd|\$|бел\.?\s*руб))', replace_salary, out, flags=re.IGNORECASE)

        return out

    def detokenize(self, text: str) -> str:
        out = text
        for token, original in self.reverse_mapping.items():
            out = out.replace(token, original)
        return out
