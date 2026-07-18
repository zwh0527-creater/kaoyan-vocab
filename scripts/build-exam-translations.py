#!/usr/bin/env python3
"""Build a resumable offline translation cache for extracted exam contexts.

This helper intentionally keeps machine-assisted translations separate from
the source exam text. The app labels them as auxiliary translations so they
cannot be mistaken for official answer-book wording.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--details", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--answer-text", type=Path)
    parser.add_argument("--backend", choices=("argos", "marian"), default="argos")
    return parser.parse_args()


def clean_translation(value: str) -> str:
    return (
        value.strip()
        .replace(" ,", "，")
        .replace(",", "，")
        .replace(" .", "。")
        .replace(".", "。")
        .replace(" ?", "？")
        .replace("?", "？")
        .replace(" !", "！")
        .replace("!", "！")
    )


def save(path: Path, cache: dict[str, dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def official_answer_segments(raw_text: str) -> dict[tuple[int, int], str]:
    segments: dict[tuple[int, int], str] = {}
    for page in raw_text.split("\f"):
        year_match = re.search(r"(20(?:1\d|2[0-3]))\s*年", page)
        if not year_match:
            continue
        year = int(year_match.group(1))
        markers = list(re.finditer(r"(?m)^\s*(4[6-9]|50)\.\s*", page))
        for index, marker in enumerate(markers):
            end = markers[index + 1].start() if index + 1 < len(markers) else len(page)
            translation = re.sub(r"\s+", "", page[marker.end() : end]).strip()
            translation = re.split(r"Section|见分析", translation, maxsplit=1)[0]
            chinese_count = sum("\u3400" <= character <= "\u9fff" for character in translation)
            if (
                chinese_count >= 8
                and chinese_count / max(len(translation), 1) >= 0.45
                and "�" not in translation
            ):
                segments[(year, int(marker.group(1)))] = translation
    return segments


def apply_explicit_official_answers(
    details: list[dict],
    cache: dict[str, dict[str, str]],
    answer_text: str,
) -> int:
    answers = official_answer_segments(answer_text)
    applied: set[str] = set()
    for entry in details:
        for phrase in entry.get("exam", {}).get("phrases", []):
            for context in phrase.get("contexts", []):
                marker = re.match(r"^\s*['\"]?\s*\(\s*(4[6-9]|50)\s*\)", context["text"])
                if not marker:
                    continue
                key = (context.get("year"), int(marker.group(1)))
                if key not in answers:
                    continue
                cache[context["text"]] = {
                    "translation": answers[key],
                    "source": "official-answer",
                    "question": str(key[1]),
                }
                applied.add(context["text"])
    return len(applied)


def main() -> None:
    args = arguments()
    details = json.loads(args.details.read_text(encoding="utf-8"))
    cache = (
        json.loads(args.output.read_text(encoding="utf-8"))
        if args.output.exists()
        else {}
    )
    contexts = sorted(
        {
            context["text"]
            for entry in details
            for phrase in entry.get("exam", {}).get("phrases", [])
            for context in phrase.get("contexts", [])
            if context.get("text")
        }
    )

    pending = [text for text in contexts if text not in cache]
    print(f"contexts={len(contexts)} pending={len(pending)}", flush=True)
    if args.backend == "argos":
        from argostranslate import translate

        for index, text in enumerate(pending, start=1):
            translated = clean_translation(translate.translate(text, "en", "zh"))
            if any("\u3400" <= character <= "\u9fff" for character in translated):
                cache[text] = {
                    "translation": translated,
                    "source": "local-machine",
                }
            if index % 50 == 0:
                save(args.output, cache)
                print(f"translated={index}/{len(pending)}", flush=True)
    else:
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        model_name = "Helsinki-NLP/opus-mt-en-zh"
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
        device = "mps" if torch.backends.mps.is_available() else "cpu"
        model.to(device)
        batch_size = 32
        for start in range(0, len(pending), batch_size):
            texts = pending[start : start + batch_size]
            encoded = tokenizer(
                texts,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=512,
            ).to(device)
            generated = model.generate(**encoded)
            translations = tokenizer.batch_decode(generated, skip_special_tokens=True)
            for text, translated in zip(texts, translations, strict=True):
                cleaned = clean_translation(translated)
                if any("\u3400" <= character <= "\u9fff" for character in cleaned):
                    cache[text] = {
                        "translation": cleaned,
                        "source": "local-machine",
                    }
            completed = min(start + batch_size, len(pending))
            if completed % 64 == 0 or completed == len(pending):
                save(args.output, cache)
                print(f"translated={completed}/{len(pending)}", flush=True)

    official_count = 0
    if args.answer_text:
        official_count = apply_explicit_official_answers(
            details,
            cache,
            args.answer_text.read_text(encoding="utf-8"),
        )

    cache = {text: cache[text] for text in contexts if text in cache}
    save(args.output, cache)
    print(f"saved={len(cache)} official={official_count}", flush=True)


if __name__ == "__main__":
    main()
