// Юнит-тест splitEvidence (node --test, без jest): node --test parse-evidence.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitEvidence } from "../src/lib/parse-evidence.ts";

test("v5-импортёр: цитата извлекается, спикер отделён", () => {
  const d = 'Текст поручения\n\nКатегория: a | Уверенность: 0.85\n\nОснова (дословные цитаты):\n> «Давайте я обсужу это с Полянской.» — Александр Кот';
  const r = splitEvidence(d);
  assert.equal(r.quotes.length, 1);
  assert.equal(r.quotes[0].speaker, "Александр Кот");
  assert.ok(r.quotes[0].text.includes("Полянской"));
  assert.ok(!r.main.includes("Основа"));
  assert.ok(r.main.includes("Текст поручения"));
});

test("старое поручение без цитат — quotes=[], main=весь текст", () => {
  const r = splitEvidence("Просто описание без цитат");
  assert.equal(r.quotes.length, 0);
  assert.equal(r.main, "Просто описание без цитат");
});

test("null/undefined — безопасно", () => {
  assert.deepEqual(splitEvidence(null), { main: "", quotes: [] });
  assert.deepEqual(splitEvidence(undefined), { main: "", quotes: [] });
});

test("мультикавычки и кавычки внутри текста", () => {
  const d = 'Основа (дословные цитаты):\n> «Срок „до конца месяца“» — Томашова';
  const r = splitEvidence(d);
  assert.equal(r.quotes.length, 1);
  assert.equal(r.quotes[0].speaker, "Томашова");
});
