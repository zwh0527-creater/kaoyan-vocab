#!/usr/bin/env python3
"""Clean English I OCR contexts and build their offline Chinese translations.

Official answer-book translations are preserved. Machine translations are generated
locally and labelled as auxiliary translations in the app. When --rewrite-details is
used, the cleaned English and translations are written back atomically and the detail
metadata fingerprint is refreshed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Callable


CURATED_SUBSTRING_TRANSLATIONS = (
    (
        "give the commission explicit authority once and for all",
        "它需要明确赋予委员会权力，一劳永逸地禁止宽带服务商干预其网络上的数据流量，并制定清晰规则，保护互联网的开放与创新。",
    ),
    (
        "may help expand user traffic for all companies concerned",
        "除了带来收入，其他营销商的存在还会让该网站显得更客观，使企业有机会了解其他公司营销活动的吸引力，并可能帮助所有相关企业扩大用户流量。",
    ),
    (
        "Curbs on business-method claims would be a dramatic about-face",
        "限制商业方法专利申请将是一次戏剧性的立场逆转，因为正是联邦巡回上诉法院在 1998 年的所谓“道富银行案”判决中引入了这类专利，并批准了一项关于汇集共同基金资产方法的专利。",
    ),
    (
        "made efforts to curb their impact on labor and the environment",
        "虽然包括推出绿色“环保自觉系列”的 H&M 在内，几家快时尚公司已努力减少其对劳工和环境的影响，但克莱因认为，持久的改变只能由消费者促成。",
    ),
    (
        "really hit home that this is something that has to be protected",
        "黄石公园历史学家艾丽西亚·墨菲说：“这些可视化资料，尤其是那些照片，让人真切意识到，这里确实是必须保护的地方。”",
    ),
    (
        "executives and headhunters have adhered to the rule",
        "多年来，高管和猎头一直奉行一条规则：最有吸引力的首席执行官候选人，往往是那些必须从别处挖来的人。",
    ),
    (
        "The traditional rule was it's safer to stay where you are",
        "一位猎头说：“传统规则是留在原位更稳妥，但如今这一规则已经被彻底颠倒了。”",
    ),
    (
        "forced him to eat his words and stand down",
        "但接连曝出的尴尬丑闻，以及共和党左翼在近期欧洲议会选举中大受欢迎，迫使他收回前言并辞职。",
    ),
    (
        "bank shares rose and the changes enhance",
        "然而，银行股价上涨了；这些调整还扩大了某游说团体委婉所称的“管理层运用判断的空间”。",
    ),
    (
        "departed as president of Bank of America in August",
        "利亚姆·麦吉于 8 月卸任美国银行总裁时，给出的解释出人意料地坦率。",
    ),
    (
        "Bank of England's top economist, Andrew Haldane",
        "英格兰银行首席经济学家安德鲁·霍尔丹表示，上市公司中的“短期主义”，即追求快速获利的倾向，已经愈演愈烈。",
    ),
    (
        "companies are banking on the halo effect",
        "它也没有说明，企业在制定公益政策时有多大程度是在押注“光环效应”，而非其他可能的好处。",
    ),
    (
        "The sharp hit to growth predicted around the world and in the UK",
        "预计全球和英国经济增长将遭受重创，这可能导致我们赖以维持福祉和推动增长的日常公共服务水平下降。",
    ),
    (
        "become a sudden hit in the new world of text-to-image AI generation",
        "他在文生图人工智能这个新兴领域突然走红。",
    ),
    (
        "we've known what we've known due to artifacts that have survived",
        "数千年来，我们对过去的认识来自留存至今的文物；而这些文物往往是在其最初创造者疏于照管的情况下保存下来的。",
    ),
    (
        "Beavers build dams and birds make nests",
        "海狸筑坝，鸟类筑巢。",
    ),
    (
        "go to my CD shelf or boot up my computer",
        "我只需走到 CD 架前，或者打开电脑，再从 iTunes 下载更多录制好的音乐。",
    ),
    (
        "the industry would get cracking on responding to DNT requests",
        "2 月，美国联邦贸易委员会与数字广告联盟达成一致：广告行业将立即着手响应“禁止追踪”（DNT）请求。",
    ),
    (
        "The zoology program at my university attracts students",
        "我校的动物学专业吸引了许多学生；对他们而言，参观动物园是促使其选择生物科学专业的一段关键成长经历。",
    ),
    (
        "The Federal Circuit's action comes in the wake",
        "此前最高法院接连作出多项判决，缩小了对专利权人的保护范围；联邦巡回上诉法院正是在这一背景下采取了行动。",
    ),
    (
        "The Gutenberg printing press transformed civilisation",
        "古腾堡印刷机改变文明，靠的并非改变书写本身，而是降低书写成本；若没有纸张这一常被忽视的技术同时大幅降低书写载体的价格，它也难有多大作为。",
    ),
    (
        "Latin phrase 'sapere aude' or 'dare to know'",
        "这种主动求知、理解既有信息的行为，被拉丁语“sapere aude”（意为“敢于求知”）概括出来；康德在《回答这个问题：什么是启蒙？》一文中使用了这一说法。",
    ),
    (
        "The nail hoard was discovered in 1960",
        "这批铁钉于 1960 年在一个四米深的坑中被发现，坑上覆盖着两米厚的砾石。",
    ),
    (
        "executives who don't get the nod also may wish to move on",
        "面对股东压力，董事会会仔细审查接班计划；没有获选的高管也可能因此选择离职。",
    ),
    (
        '"The Heart of the Matter" never gets to the heart of the matter',
        "遗憾的是，这份耗时两年半完成的《问题的核心》报告始终没有触及真正的核心：顶尖高校所谓自由教育中实际存在的不自由本质。",
    ),
)


OCR_LITERAL_REPLACEMENTS = {
    "about-fkce": "about-face",
    "backloadedpublic": "backloaded public",
    "equ ities": "equities",
    "firiends": "friends",
    "fiom": "from",
    "judgm ent": "judgment",
    "on ce": "once",
    "thoughtfill": "thoughtful",
    "unammous": "unanimous",
    "who5ve": "who've",
    "thafs": "that's",
    "ifs safer": "it's safer",
    "courfs judges": "court's judges",
    "Federal Circuifs": "Federal Circuit's",
    "wouldVe": "would've",
    "big-cily": "big-city",
    "soul-cmshingly": "soul-crushingly",
    "ccthe": '"the',
    "describingdifferent": "describing different",
    "indifferent shoes": "in different shoes",
    "diferent": "different",
    "huntergatherer": "hunter-gatherer",
    "canwe": "can we",
    "ifwe": "if we",
    "comingfrom": "coming from",
    "shel£": "shelf",
    "iT unes": "iTunes",
    "onthe": "on the",
    "A n A nsw er": "An Answer",
    "Enlightenm ent": "Enlightenment",
}

OCR_CASE_SENSITIVE_REPLACEMENTS = {
    "CE O": "CEO",
    "W eb": "Web",
    "F A SB": "FASB",
}


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--details", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--meta", type=Path)
    parser.add_argument("--answer-text", type=Path)
    parser.add_argument(
        "--backend",
        choices=("argos", "marian", "t5", "nllb"),
        default="nllb",
    )
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument(
        "--repair-ratio",
        type=float,
        default=0,
        help="Retranslate machine entries below this Chinese-character/English-word ratio.",
    )
    parser.add_argument(
        "--replace-machine",
        action="store_true",
        help="Regenerate auxiliary translations while preserving official answers.",
    )
    parser.add_argument(
        "--rewrite-details",
        action="store_true",
        help="Write cleaned contexts and translations back to --details.",
    )
    parser.add_argument(
        "--audit-only",
        action="store_true",
        help="Report normalization and filtering counts without loading a model or writing files.",
    )
    parser.add_argument(
        "--allow-download",
        action="store_true",
        help="Allow Transformers to download a missing model instead of requiring the local cache.",
    )
    return parser.parse_args()


def clean_translation(value: str) -> str:
    text = re.sub(r"\s+", " ", value.strip())
    for source, target in (
        (" ,", "，"),
        (",", "，"),
        (" .", "。"),
        (".", "。"),
        (" ?", "？"),
        ("?", "？"),
        (" !", "！"),
        ("!", "！"),
        (" ;", "；"),
        (";", "；"),
    ):
        text = text.replace(source, target)
    return text.strip()


def normalize_context(value: str) -> str:
    text = str(value or "").replace("\u00a0", " ").replace("、", ",")
    text = text.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    for source, target in OCR_LITERAL_REPLACEMENTS.items():
        text = re.sub(re.escape(source), target, text, flags=re.IGNORECASE)
    for source, target in OCR_CASE_SENSITIVE_REPLACEMENTS.items():
        text = text.replace(source, target)

    # OCR frequently read an apostrophe as 5 or 9 in words such as companies'.
    text = re.sub(r"\b([A-Za-z]+)[59]\s+s\b", r"\1's", text)
    text = re.sub(r"\b([A-Za-z]+)[59]s\b", r"\1's", text)
    text = re.sub(r"\b([A-Za-z]+)[59](?=\s+[A-Za-z])", r"\1'", text)
    text = re.sub(r"\b([A-Za-z]+)5ve\b", r"\1've", text, flags=re.IGNORECASE)
    text = re.sub(r"(?<=[a-z])/[59](?=\s|$)", ',"', text)
    text = re.sub(r"(?<=[a-z])[56]{2}(?=\s|$)", '"', text)
    text = re.sub(r"(?<!\d)66(?=[A-Za-z])", '"', text)
    text = re.sub(r"\b(20)\s+(\d)\s+(\d)\b", r"\1\2\3", text)
    text = re.sub(r"\b(20)\s+(\d{2})\b", r"\1\2", text)

    # Join the common single-letter splits created by scanned serif capitals.
    text = re.sub(r"\b([B-HJ-Z])\s+([a-z]{2,})\b", r"\1\2", text)
    text = re.sub(
        r"\bA\s+(merica|ugust|fter|nd|ccounting|ppeals|llen|ccording|t|s|nyway|chievement|ll|nnette)\b",
        lambda match: "A" + match.group(1),
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\bA\s+m\s+erica\b", "America", text, flags=re.IGNORECASE)
    text = re.sub(r"\bI\s+(n|t|s)\b", lambda match: "I" + match.group(1), text)
    text = re.sub(r"\bW\s+e\b", "We", text)
    text = re.sub(r"\bH\s+e\b", "He", text)
    text = re.sub(r"\bM\s+r\b", "Mr", text)
    text = re.sub(r"\b(?:m\s+ost|f\s+ar|par\s+t)\b", lambda match: re.sub(r"\s+", "", match.group(0)), text)
    text = re.sub(r"\bdispropor\s+tionately\b", "disproportionately", text, flags=re.IGNORECASE)
    text = re.sub(r"\bGeneration\s+Z(?=(?:need|seeking)\b)", "Generation Z ", text)
    text = re.sub(r"\bAl(?=\s+art\b)", "AI", text)
    text = re.sub(r"\b(2010)\s+s\b", r"\1s", text)
    text = re.sub(r"/J\s+We\b", ". We", text)
    text = re.sub(r"(?<=[A-Za-z])—(?=[A-Za-z])", " — ", text)
    text = re.sub(
        r"\b(?:[A-Z]\s+){2,}[A-Z]\b",
        lambda match: re.sub(r"\s+", "", match.group(0)),
        text,
    )

    text = re.sub(r"^\s*Text\s*\d+\s+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^\s*\(\s*(4[1-9]|50)\s*\)\s*(?!_)", "", text)
    text = re.sub(r"\s+/\d+\b", '"', text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip(" \t\r\n,;")
    text = re.sub(r"^['\"]\s+", lambda match: match.group(0).strip(), text)
    return text


def reliable_context(text: str) -> bool:
    if len(text) < 28 or len(text) > 520 or not re.search(r"[A-Za-z]", text):
        return False
    if re.search(r"_{2,}|�|□|■|◆", text):
        return False
    if re.search(
        r"^(?:Directions|Part\s+[A-C]|Section\b|Choose the best|Read the following|"
        r"In your essay|According to (?:Paragraph|the text)|Which of the following|"
        r"What does |The author's attitude)",
        text,
        flags=re.IGNORECASE,
    ):
        return False
    if re.search(r"\d{4}\s*年\s*英语|第\s*\d+\s*页|\bquestions?\s+\d+", text, flags=re.IGNORECASE):
        return False
    if re.search(r"(?:^|\s)(?:[1-4]?\d|50)$", text):
        return False
    if re.search(r"\b[A-Za-z]+\d+[A-Za-z]*\b", text):
        return False
    if re.search(r"_\s*\d+\s*_", text):
        return False
    blank_numbers = re.findall(r"(?<!\d)\b(?:[1-9]|[1-3]\d|40)\b(?!\d)", text)
    if blank_numbers:
        return False
    words = re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text)
    if len(words) < 6:
        return False
    unquoted_start = re.sub(r"^[\s'\"]+", "", text)
    if unquoted_start[:1].islower():
        return False
    if re.search(r"\b[A-Z]$", text):
        return False
    if re.search(r"extra choices?.+blanks?", text, flags=re.IGNORECASE):
        return False
    if re.search(r"(?:fit in with|best title for|learned from).+\btext\b", text, flags=re.IGNORECASE):
        return False
    if re.search(r"(?:Part\s+B|list\s+A-G|numbered paragraphs)", text, flags=re.IGNORECASE):
        return False
    if re.search(r"\b(?:Mr|Mrs|Ms|Dr|St|U\.?S\.?)$", text):
        return False
    return True


def save_json(path: Path, value: object, *, pretty: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    serialized = json.dumps(
        value,
        ensure_ascii=False,
        indent=2 if pretty else None,
        separators=None if pretty else (",", ":"),
    )
    temporary.write_text(serialized + "\n", encoding="utf-8")
    temporary.replace(path)


def official_answer_segments(raw_text: str) -> dict[tuple[int, int], str]:
    segments: dict[tuple[int, int], str] = {}
    for page in raw_text.split("\f"):
        year_match = re.search(r"(20(?:1\d|2[0-5]))\s*年", page)
        if not year_match:
            continue
        year = int(year_match.group(1))
        markers = list(re.finditer(r"(?m)^\s*(4[6-9]|50)\.\s*", page))
        for index, marker in enumerate(markers):
            end = markers[index + 1].start() if index + 1 < len(markers) else len(page)
            translation = re.sub(r"\s+", "", page[marker.end() : end]).strip()
            translation = re.split(r"Section|见分析", translation, maxsplit=1)[0]
            chinese_count = sum("\u3400" <= character <= "\u9fff" for character in translation)
            if chinese_count >= 8 and chinese_count / max(len(translation), 1) >= 0.45 and "�" not in translation:
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
                normalized = normalize_context(context["text"])
                cache[normalized] = {
                    "translation": answers[key],
                    "source": "official-answer",
                    "question": str(key[1]),
                }
                applied.add(normalized)
    return len(applied)


def clean_details_and_cache(
    details: list[dict],
    existing_cache: dict[str, dict[str, str]],
) -> tuple[list[dict], dict[str, dict[str, str]], dict[str, int]]:
    remapped_cache: dict[str, dict[str, str]] = {}
    for original, value in existing_cache.items():
        normalized = normalize_context(original)
        current = remapped_cache.get(normalized)
        if current is None or value.get("source") in {"official-answer", "curated"}:
            remapped_cache[normalized] = value

    stats = {"seen": 0, "normalized": 0, "filtered": 0, "deduplicated": 0}
    cleaned_details: list[dict] = []
    for entry in details:
        exam = entry.get("exam")
        if not exam:
            cleaned_details.append(entry)
            continue
        phrases = []
        for phrase in exam.get("phrases", []):
            contexts = []
            seen_contexts: set[str] = set()
            for context in phrase.get("contexts", []):
                stats["seen"] += 1
                normalized = normalize_context(context.get("text", ""))
                if normalized != context.get("text"):
                    stats["normalized"] += 1
                if not reliable_context(normalized):
                    stats["filtered"] += 1
                    continue
                if normalized in seen_contexts:
                    stats["deduplicated"] += 1
                    continue
                seen_contexts.add(normalized)
                contexts.append({
                    "text": normalized,
                    "year": context["year"],
                    **(
                        {"translationQuestion": context["translationQuestion"]}
                        if context.get("translationQuestion")
                        else {}
                    ),
                })
            if contexts:
                phrases.append({**phrase, "contexts": contexts})

        cleaned_entry = {key: value for key, value in entry.items() if key != "exam"}
        if phrases:
            cleaned_entry["exam"] = {**exam, "phrases": phrases}
        if (
            cleaned_entry.get("coreMeaning")
            or cleaned_entry.get("collocations")
            or cleaned_entry.get("examples")
            or cleaned_entry.get("relatedWords")
            or cleaned_entry.get("redbook")
            or cleaned_entry.get("exam")
        ):
            cleaned_details.append(cleaned_entry)
    return cleaned_details, remapped_cache, stats


def split_translation_segments(text: str) -> list[str]:
    pieces = re.split(r"(?<=[,;:])\s+|\s+[—-]\s+", text)
    return [piece.strip() for piece in pieces if piece.strip()]


def translate_with_transformers(
    texts: list[str],
    backend: str,
    batch_size: int,
    allow_download: bool,
    progress: Callable[[int, int], None],
) -> dict[str, str]:
    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    if backend == "marian":
        model_name = "Helsinki-NLP/opus-mt-en-zh"
        source_prefix = ""
        tokenizer_options = {}
        forced_bos_token_id = None
    elif backend == "t5":
        model_name = "utrobinmv/t5_translate_en_ru_zh_small_1024"
        source_prefix = "translate to zh: "
        tokenizer_options = {}
        forced_bos_token_id = None
    else:
        model_name = "facebook/nllb-200-distilled-600M"
        source_prefix = ""
        tokenizer_options = {"src_lang": "eng_Latn"}
        forced_bos_token_id = None

    local_only = not allow_download
    tokenizer = AutoTokenizer.from_pretrained(
        model_name,
        local_files_only=local_only,
        **tokenizer_options,
    )
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name, local_files_only=local_only)
    if backend == "nllb":
        forced_bos_token_id = tokenizer.convert_tokens_to_ids("zho_Hans")
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model.to(device)
    model.eval()

    segments_by_text = {text: split_translation_segments(text) for text in texts}
    unique_segments = list(dict.fromkeys(segment for segments in segments_by_text.values() for segment in segments))
    translated_segments: dict[str, str] = {}
    with torch.inference_mode():
        for start in range(0, len(unique_segments), batch_size):
            batch = unique_segments[start : start + batch_size]
            encoded = tokenizer(
                [f"{source_prefix}{text}" for text in batch],
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=512,
            ).to(device)
            generation_options = {
                "max_new_tokens": 256,
                "num_beams": 2 if backend == "nllb" else 1,
            }
            if forced_bos_token_id is not None:
                generation_options["forced_bos_token_id"] = forced_bos_token_id
            generated = model.generate(**encoded, **generation_options)
            outputs = tokenizer.batch_decode(generated, skip_special_tokens=True)
            for source, translated in zip(batch, outputs):
                translated_segments[source] = clean_translation(translated)
            progress(min(start + len(batch), len(unique_segments)), len(unique_segments))

    return {
        text: "".join(translated_segments[segment] for segment in segments)
        for text, segments in segments_by_text.items()
    }


def curated_translation(text: str) -> str | None:
    for needle, translation in CURATED_SUBSTRING_TRANSLATIONS:
        if needle.lower() in text.lower():
            return translation
    return None


def attach_translations(details: list[dict], cache: dict[str, dict[str, str]]) -> list[dict]:
    for entry in details:
        for phrase in entry.get("exam", {}).get("phrases", []):
            translated_contexts = []
            for context in phrase.get("contexts", []):
                translated = cache.get(context["text"])
                if not translated:
                    continue
                translated_contexts.append({
                    **context,
                    "translation": translated["translation"],
                    "translationSource": translated["source"],
                    **(
                        {"translationQuestion": int(translated["question"])}
                        if translated.get("question")
                        else {}
                    ),
                })
            phrase["contexts"] = translated_contexts
        if entry.get("exam"):
            entry["exam"]["phrases"] = [
                phrase for phrase in entry["exam"]["phrases"] if phrase["contexts"]
            ]
            if not entry["exam"]["phrases"]:
                del entry["exam"]
    return [
        entry
        for entry in details
        if entry.get("coreMeaning")
        or entry.get("collocations")
        or entry.get("examples")
        or entry.get("relatedWords")
        or entry.get("redbook")
        or entry.get("exam")
    ]


def update_meta(details: list[dict], meta_path: Path) -> None:
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    serialized = json.dumps(details, ensure_ascii=False, separators=(",", ":"))
    meta.update(
        {
            "entryCount": len(details),
            "coreMeaningCount": sum(bool(entry.get("coreMeaning")) for entry in details),
            "collocationCount": sum(len(entry.get("collocations", [])) for entry in details),
            "redbookEntryCount": sum(bool(entry.get("redbook")) for entry in details),
            "collocationSectionCount": sum(
                bool(entry.get("redbook", {}).get("hasCollocationSection")) for entry in details
            ),
            "unparsedCollocationSectionCount": sum(
                bool(entry.get("redbook", {}).get("hasCollocationSection"))
                and not entry.get("collocations")
                for entry in details
            ),
            "exampleCount": sum(len(entry.get("examples", [])) for entry in details),
            "relatedWordCount": sum(len(entry.get("relatedWords", [])) for entry in details),
            "examEntryCount": sum(bool(entry.get("exam")) for entry in details),
            "examPhraseCount": sum(len(entry.get("exam", {}).get("phrases", [])) for entry in details),
            "examContextCount": sum(
                len(phrase.get("contexts", []))
                for entry in details
                for phrase in entry.get("exam", {}).get("phrases", [])
            ),
            "examTranslationCount": sum(
                bool(context.get("translation"))
                for entry in details
                for phrase in entry.get("exam", {}).get("phrases", [])
                for context in phrase.get("contexts", [])
            ),
            "fingerprint": hashlib.sha256(serialized.encode("utf-8")).hexdigest(),
        }
    )
    save_json(meta_path, meta, pretty=True)


def main() -> None:
    args = arguments()
    original_details = json.loads(args.details.read_text(encoding="utf-8"))
    existing_cache = json.loads(args.output.read_text(encoding="utf-8")) if args.output.exists() else {}
    details, cache, cleaning_stats = clean_details_and_cache(original_details, existing_cache)

    print(
        " ".join(f"{key}={value}" for key, value in cleaning_stats.items()),
        flush=True,
    )
    if args.audit_only:
        contexts = {
            context["text"]
            for entry in details
            for phrase in entry.get("exam", {}).get("phrases", [])
            for context in phrase.get("contexts", [])
        }
        print(f"kept_unique={len(contexts)}", flush=True)
        return

    if args.answer_text:
        official_count = apply_explicit_official_answers(
            original_details,
            cache,
            args.answer_text.read_text(encoding="utf-8"),
        )
    else:
        official_count = sum(value.get("source") == "official-answer" for value in cache.values())

    contexts = sorted(
        {
            context["text"]
            for entry in details
            for phrase in entry.get("exam", {}).get("phrases", [])
            for context in phrase.get("contexts", [])
        }
    )
    if args.replace_machine:
        cache = {
            text: value
            for text, value in cache.items()
            if value.get("source") in {"official-answer", "curated"} and text in contexts
        }
    elif args.repair_ratio > 0:
        for text in contexts:
            value = cache.get(text)
            if not value or value.get("source") in {"official-answer", "curated"}:
                continue
            english_words = len(re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text))
            chinese_characters = len(re.findall(r"[\u3400-\u9fff]", value.get("translation", "")))
            if english_words and chinese_characters / english_words < args.repair_ratio:
                del cache[text]

    pending = [text for text in contexts if text not in cache]
    print(f"contexts={len(contexts)} pending={len(pending)} official={official_count}", flush=True)
    if pending and args.backend == "argos":
        from argostranslate import translate

        translated = {}
        for index, text in enumerate(pending, start=1):
            translated[text] = clean_translation(translate.translate(text, "en", "zh"))
            if index % 50 == 0 or index == len(pending):
                print(f"translated={index}/{len(pending)}", flush=True)
    elif pending:
        translated = translate_with_transformers(
            pending,
            args.backend,
            args.batch_size,
            args.allow_download,
            lambda done, total: print(f"segments={done}/{total}", flush=True)
            if done % max(args.batch_size * 4, 1) == 0 or done == total
            else None,
        )
    else:
        translated = {}

    for text in pending:
        curated = curated_translation(text)
        value = curated or translated.get(text, "")
        if any("\u3400" <= character <= "\u9fff" for character in value):
            cache[text] = {
                "translation": value,
                "source": "curated" if curated else "local-machine",
            }
    for text in contexts:
        override = curated_translation(text)
        if override:
            cache[text] = {"translation": override, "source": "curated"}

    missing = [text for text in contexts if text not in cache]
    if missing:
        raise RuntimeError(f"Missing {len(missing)} translations; first: {missing[0]}")
    cache = {text: cache[text] for text in contexts}
    details = attach_translations(details, cache)
    save_json(args.output, cache)
    if args.rewrite_details:
        if not args.meta:
            raise RuntimeError("--meta is required with --rewrite-details")
        save_json(args.details, details, pretty=True)
        update_meta(details, args.meta)
    print(
        f"saved={len(cache)} official={sum(value.get('source') == 'official-answer' for value in cache.values())}",
        flush=True,
    )


if __name__ == "__main__":
    main()
