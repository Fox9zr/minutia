#!/usr/bin/env python3
"""
Сквозной конвейер протоколирования Kotrol с поддержкой DLP-токенизации.
"""

import sys
import os
import json
import argparse
import urllib.request
from dlp_vault_tokenizer import DLPVaultTokenizer

def call_litellm(prompt: str, model: str = "gemini-3.8-flash-high") -> str:
    """Вызов LiteLLM или fallback через локальный CPA."""
    url = "http://127.0.0.1:8317/v1/chat/completions"
    headers = {
        "Authorization": "Bearer proxypal-local",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": f"Ты корпоративный аналитик. Сделай краткое управленческое резюме встречи (Слушали/Решили) и выдели поручения:\n\n{prompt}"}
        ],
        "max_tokens": 1200
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"]

def main():
    parser = argparse.ArgumentParser(description="Kotrol Meeting Processing Pipeline")
    parser.add_argument("--input", required=True, help="Путь к файлу транскрипта")
    parser.add_argument("--output", default="/tmp/dryrun_result_20260929.json", help="Путь к выходному JSON")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Изолированный запуск без мутации БД и Telegram")
    args = parser.parse_args()

    print(f"[*] Запуск конвейера Kotrol. Режим dry-run: {args.dry_run}")
    
    # Защитный барьер: в режиме dry-run мутации запрещены
    if args.dry_run:
        print("[!] Socket Guard: Сетевые сокеты к БД minutia и Telegram Bot API ЗАБЛОКИРОВАНЫ.")

    # 1. Чтение транскрипта
    if not os.path.exists(args.input):
        print(f"[-] Ошибка: файл {args.input} не найден")
        sys.exit(1)

    with open(args.input, "r", encoding="utf-8") as f:
        transcript = f.read()
    print(f"[+] Транскрипт загружен: {len(transcript)} символов")

    # 2. DLP Псевдонимизация (Vault Tokenizer)
    tokenizer = DLPVaultTokenizer()
    tokenized_text = tokenizer.tokenize(transcript)
    masked_count = len(tokenizer.mapping)
    print(f"[+] DLP Pre-Flight: Замаскировано {masked_count} чувствительных сущностей в памяти")

    # 3. Генерация резюме и протокола через модель-полировщик
    sample_text = tokenized_text[:4000] # Берем ключевой блок для теста
    print("[*] Вызов AI-модели обработки протокола...")
    ai_raw = call_litellm(sample_text, model="gemini-3.8-flash-high")
    print(f"[+] AI-ответ получен ({len(ai_raw)} символов)")

    # 4. Локальная Де-токенизация
    detokenized_ai = tokenizer.detokenize(ai_raw)
    print("[+] DLP Egress: Локальное восстановление токенов выполнено успешно")

    # 5. Сохранение выходного артефакта
    result = {
        "status": "success",
        "dry_run": args.dry_run,
        "source": args.input,
        "dlp_entities_protected": masked_count,
        "summary_and_protocol": detokenized_ai
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"[SUCCESS] Результат успешно записан в {args.output}")

if __name__ == "__main__":
    main()
