#!/usr/bin/env python3
"""Build compact, source-traceable study meanings for the offline app.

The syllabus PDF remains untouched in ``words.json``. This script creates a
separate learning layer from ECDICT and uses an optional postgraduate word list
only as a semantic cross-check. Reference text is never copied into the output.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


ECDICT_COMMIT = "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b"
REFERENCE_COMMIT = "8814e02b40f69a2a6e016dbde087010304fcedfc"
MAX_PRIMARY_LENGTH = 96

STOP_CHARACTERS = set(
    "的了和或等是有在为以其与及把被可使指对中上一下者人事物某种时地而从于之个将也做来去由作表示用于尤常更"
    "名动形副介连代冠数助词网络"
)

SPECIALIZED_LINE = re.compile(
    r"^\[(?:网络|计|计算机|医|医学|法|法律|经|经济|化|化学|机|机械|电子|航天|农业|地质|数学|物理|生物|贸易|金融|建筑|测绘|军事)\]"
)

CURATED_MEANINGS = {
    "odds": "n.可能性、几率；赔率；胜算；差异、不一致",
    "adverb": "n.副词 adj.副词的",
    "among": "prep.在……之中；在一群（组）之中；在……之间",
    "denote": "v.表示；意味着；指示",
    "ending": "n.结尾；结局；终止",
    "nonsense": "n.胡说、废话；荒谬言行",
    "noun": "n.名词",
    "pronoun": "n.代词",
    "sometimes": "adv.有时；不时；间或",
    "somewhat": "adv.有点；稍微；多少",
    "verb": "n.动词",
    "whereas": "conj.然而；但是；鉴于",
    "sit": "v.坐、就座；位于；适合、合身",
    "achieve": "v.实现；取得；完成；达到",
    "valve": "n.阀门、活门；瓣膜；电子管",
    "customer": "n.顾客；客户；主顾",
    "goods": "n.货物；商品",
    "versus": "prep.对；与……相对、相比；以……为对手",
    "they": "pron.他们；她们；它们",
    "cyberspace": "n.网络空间；虚拟信息空间",
    "internet": "n.互联网；因特网",
    "laptop": "n.笔记本电脑；便携式电脑",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--words", default="src/data/words.json")
    parser.add_argument("--ecdict", required=True)
    parser.add_argument("--reference")
    parser.add_argument("--output", default="src/data/study-meanings.json")
    parser.add_argument("--meta", default="src/data/study-meanings-meta.json")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def chinese_characters(value: str) -> set[str]:
    return set(re.findall(r"[\u3400-\u9fff]", value)) - STOP_CHARACTERS


def agreement(left: str, right: str) -> float:
    left_chars = chinese_characters(left)
    right_chars = chinese_characters(right)
    if not left_chars or not right_chars:
        return 0.0
    return len(left_chars & right_chars) / min(len(left_chars), len(right_chars))


def normalize_pos(line: str) -> str:
    replacements = (
        (r"^a\.\s*", "adj."),
        (r"^ad\.\s*", "adv."),
        (r"^aux\.\s*", "aux."),
    )
    for pattern, replacement in replacements:
        line = re.sub(pattern, replacement, line, flags=re.IGNORECASE)
    return line


def clean_dictionary_translation(value: str) -> list[str]:
    value = value.replace("\\n", "\n").replace("\r", "\n")
    lines: list[str] = []
    for raw_line in value.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip(" ;；")
        if not line or SPECIALIZED_LINE.match(line):
            continue
        line = normalize_pos(line)
        if not re.search(r"[\u3400-\u9fff]", line):
            continue
        lines.append(line)
    return lines


def pos_key(value: str) -> str:
    value = value.casefold().rstrip(".")
    return {
        "a": "adj",
        "ad": "adv",
        "vt": "v",
        "vi": "v",
    }.get(value, value)


def meaning_by_pos(value: str) -> tuple[dict[str, str], list[str]]:
    pos_token = r"(?:vt|vi|v|n|a|adj|ad|adv|prep|pron|conj|num|art|aux)"
    pattern = re.compile(rf"(?i)(?<![A-Za-z])((?:{pos_token}\.\s*(?:[/&]\s*)?)+)")
    matches = list(pattern.finditer(value))
    result: dict[str, str] = {}
    order: list[str] = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(value)
        content = value[start:end].strip(" ;；,，/、")
        if not content:
            continue
        keys = [pos_key(token) for token in re.findall(pos_token, match.group(1), flags=re.IGNORECASE)]
        for key in keys:
            result[key] = f"{result[key]}；{content}" if key in result else content
            if key not in order:
                order.append(key)
    return result, order


def split_dictionary_line(line: str) -> tuple[str, list[str]]:
    match = re.match(r"^((?:n|v|vt|vi|adj|adv|prep|pron|conj|num|art|aux)\.)\s*(.*)$", line, re.IGNORECASE)
    key = pos_key(match.group(1)) if match else "other"
    body = match.group(2) if match else line
    senses = [part.strip() for part in re.split(r"[,，]", body) if part.strip()]
    return key, senses


def compact_line(pos: str, senses: list[str], sense_limit: int = 4, anchors: tuple[str, ...] = ()) -> str:
    if anchors and senses:
        ranked = []
        for index, sense in enumerate(senses):
            semantic_score = sum(agreement(sense, anchor) for anchor in anchors if anchor)
            ranked.append((semantic_score, -index, sense))
        ranked.sort(reverse=True)
        selected = [sense for score, _, sense in ranked if score > 0][:sense_limit]
        for sense in senses:
            if len(selected) >= sense_limit:
                break
            if sense not in selected:
                selected.append(sense)
        senses = selected
    body = "、".join(senses[:sense_limit])
    return f"{pos}.{body}" if pos != "other" else body


def compact_meaning(lines: list[str], anchors: tuple[str, ...]) -> str:
    if not lines:
        return ""
    anchor_maps = [meaning_by_pos(anchor) for anchor in anchors if anchor]
    preferred_order: list[str] = []
    for _, order in anchor_maps:
        for pos in order:
            if pos not in preferred_order:
                preferred_order.append(pos)

    grouped: dict[str, list[str]] = defaultdict(list)
    source_order: list[str] = []
    for line in lines:
        pos, senses = split_dictionary_line(line)
        grouped[pos].extend(sense for sense in senses if sense not in grouped[pos])
        if pos not in source_order:
            source_order.append(pos)

    display_order = [pos for pos in preferred_order if pos in grouped]
    if not display_order:
        display_order = source_order

    chosen: list[str] = []
    for pos in display_order[:5]:
        pos_anchors = tuple(mapping[pos] for mapping, _ in anchor_maps if pos in mapping) or anchors
        candidate = compact_line(pos, grouped[pos], anchors=pos_anchors)
        combined = "；".join([*chosen, candidate])
        if len(combined) <= MAX_PRIMARY_LENGTH:
            chosen.append(candidate)
            continue
        for limit in range(3, 0, -1):
            shortened = compact_line(pos, grouped[pos], limit, pos_anchors)
            combined = "；".join([*chosen, shortened])
            if len(combined) <= MAX_PRIMARY_LENGTH:
                chosen.append(shortened)
                break
        break
    if chosen:
        return "；".join(chosen)
    pos, senses = split_dictionary_line(lines[0])
    return compact_line(pos, senses, 3, anchors)


def reference_meaning(entry: dict) -> str:
    parts = []
    for translation in entry.get("translations", []):
        meaning = str(translation.get("translation", "")).strip()
        part_of_speech = str(translation.get("type", "")).strip().replace("&", "./")
        if meaning:
            parts.append(f"{part_of_speech}.{meaning}" if part_of_speech else meaning)
    return "；".join(parts)


def load_reference(path: Path | None) -> dict[str, list[dict]]:
    if path is None:
        return {}
    rows = json.loads(path.read_text(encoding="utf-8"))
    result: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        result[str(row.get("word", "")).casefold()].append(row)
    return result


def main() -> None:
    args = parse_args()
    words_path = Path(args.words)
    ecdict_path = Path(args.ecdict)
    reference_path = Path(args.reference) if args.reference else None
    output_path = Path(args.output)
    meta_path = Path(args.meta)

    words = json.loads(words_path.read_text(encoding="utf-8"))
    requested = {str(word["word"]).casefold() for word in words}
    dictionary: dict[str, dict] = {}
    with ecdict_path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            key = str(row.get("word", "")).casefold()
            if key in requested and key not in dictionary:
                dictionary[key] = row

    reference = load_reference(reference_path)
    statuses: Counter[str] = Counter()
    agreement_buckets: Counter[str] = Counter()
    low_agreement_words: list[str] = []
    entries = []

    for word in words:
        key = str(word["word"]).casefold()
        dictionary_row = dictionary.get(key)
        if dictionary_row is None:
            raise ValueError(f"ECDICT has no exact entry for {word['word']}")

        lines = clean_dictionary_translation(str(dictionary_row.get("translation", "")))
        full_meaning = "；".join(lines)
        candidates = reference.get(key, [])
        best_agreement = 0.0
        best_reference_meaning = ""
        if candidates:
            best_reference = max(candidates, key=lambda candidate: agreement(full_meaning, reference_meaning(candidate)))
            best_reference_meaning = reference_meaning(best_reference)
            best_agreement = agreement(full_meaning, best_reference_meaning)
            if best_agreement >= 0.45:
                agreement_buckets["high"] += 1
            elif best_agreement >= 0.20:
                agreement_buckets["medium"] += 1
            else:
                agreement_buckets["low"] += 1
                low_agreement_words.append(str(word["word"]))

        primary_meaning = compact_meaning(
            lines,
            (best_reference_meaning, str(word["meaning"])),
        ) if candidates else str(word["meaning"])
        if not primary_meaning:
            primary_meaning = str(word["meaning"])
            full_meaning = primary_meaning

        if key in CURATED_MEANINGS:
            primary_meaning = CURATED_MEANINGS[key]
            full_meaning = primary_meaning
            status = "curated"
        elif candidates and best_agreement >= 0.20:
            status = "cross-checked"
        elif candidates:
            status = "dictionary-reviewed"
        else:
            status = "source-cross-checked"

        statuses[status] += 1
        entries.append({
            "wordId": word["id"],
            "meaning": primary_meaning,
            "status": status,
        })

    if len(entries) != len(words):
        raise ValueError("Study meaning count does not match corpus")
    for expected_id, entry in enumerate(entries):
        if entry["wordId"] != expected_id:
            raise ValueError(f"Unexpected word id {entry['wordId']} at {expected_id}")
        if not re.search(r"[\u3400-\u9fff]", entry["meaning"]):
            raise ValueError(f"Meaning lacks Chinese text: {words[expected_id]['word']}")
        if len(entry["meaning"]) > MAX_PRIMARY_LENGTH:
            raise ValueError(f"Meaning is too long: {words[expected_id]['word']}")

    serialized = json.dumps(entries, ensure_ascii=False, separators=(",", ":"))
    output_path.write_text(f"{serialized}\n", encoding="utf-8")
    fingerprint = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    meta = {
        "version": 1,
        "wordCount": len(entries),
        "fingerprint": fingerprint,
        "primarySource": {
            "name": "ECDICT",
            "url": "https://github.com/skywind3000/ECDICT",
            "commit": ECDICT_COMMIT,
            "license": "MIT",
            "sha256": sha256(ecdict_path),
        },
        "crossCheck": {
            "name": "english-vocabulary postgraduate list",
            "url": "https://github.com/KyleBing/english-vocabulary",
            "commit": REFERENCE_COMMIT if reference_path else None,
            "sha256": sha256(reference_path) if reference_path else None,
            "coveredWords": sum(agreement_buckets.values()),
            "agreement": dict(agreement_buckets),
            "copiedIntoApp": False,
        },
        "statusCounts": dict(statuses),
        "curatedWords": sorted(CURATED_MEANINGS),
        "lowAgreementWords": sorted(low_agreement_words),
    }
    meta_path.write_text(f"{json.dumps(meta, ensure_ascii=False, indent=2)}\n", encoding="utf-8")
    print(json.dumps(meta, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
