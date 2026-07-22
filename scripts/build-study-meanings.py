#!/usr/bin/env python3
"""Build source-first, cross-checked study meanings for the offline app.

The exam-syllabus meaning in ``words.json`` is the starting point. ECDICT
verifies that every headword maps to a real dictionary entry, while independent
public postgraduate lists provide additional review evidence. Their text is
never copied wholesale into the output. The automatic score detects likely
extraction conflicts; missing high-value senses still require manual review.
Confirmed problems are corrected explicitly in ``CURATED_MEANINGS`` so every
deviation remains reviewable.

The automatic agreement score only proves that two entries share at least one
meaning. It must never be presented as proof that the source covers every
common or exam-relevant sense.
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
QWERTY_COMMIT = "2498f753aaf955645f466664d3972c2c7d29dd55"
MAX_PRIMARY_LENGTH = 96

STOP_CHARACTERS = set(
    "的了和或等是有在为以其与及把被可使指对中上一下者人事物某种时地而从于之个将也做来去由作表示用于尤常更"
    "名动形副介连代冠数助词网络"
)

SPECIALIZED_LINE = re.compile(
    r"(?:^|\s)\[(?:网络|计|计算机|医|医学|法|法律|经|经济|化|化学|机|机械|电子|航天|农业|地质|数学|物理|生物|贸易|金融|建筑|测绘|军事)\]"
)
SUBJECT_LABEL = re.compile(
    r"\[(?:网络|计|计算机|医|医学|法|法律|经|经济|化|化学|机|机械|电子|航天|农业|地质|数学|物理|生物|贸易|金融|建筑|测绘|军事)\]"
)
POS_TOKEN = r"(?:interj|prep|pron|conj|adj|adv|aux|art|num|int|det|vt|vi|ad|n|v|a)"
POS_MARKER = re.compile(
    rf"(?<![A-Za-z])(?P<pos>{POS_TOKEN}(?:[.．](?:[/&]+)?{POS_TOKEN})*)[.．]",
    re.IGNORECASE,
)
POS_FAMILIES = {
    "a": "adj",
    "adj": "adj",
    "ad": "adv",
    "adv": "adv",
    "v": "v",
    "vt": "v",
    "vi": "v",
}

CURATED_MEANINGS = {
    "a": "art.一（个）；每一（个）；任一（个）",
    "account": "n.账户；账目；叙述；说明 v.解释；说明；占（比例）；导致",
    "acquaint": "v.使熟悉；使了解；介绍",
    "address": "n.地址；演讲；称呼 v.致辞；写地址；处理、解决",
    "odds": "n.可能性、几率；赔率；胜算；差异、不一致",
    "adverb": "n.副词 adj.副词的",
    "air-conditioning": "n.空调；空调系统、设备",
    "among": "prep.在……之中；在一群（组）之中；在……之间",
    "and": "conj.和；与；而且；然后",
    "animal": "n.动物；兽；牲畜 adj.动物的",
    "be": "v.是；存在；成为；发生",
    "bill": "n.账单；钞票；法案、议案；票据；广告 v.开账单",
    "board": "n.木板；董事会、委员会；膳食 v.登上（交通工具）；寄宿",
    "bowl": "n.碗；一碗的量；碗状物；保龄球 v.投球",
    "brace": "v.支撑；加固；使做好准备 n.支架；一对",
    "cat": "n.猫；猫科动物",
    "cloud": "n.云；阴影；忧虑 v.使模糊；笼罩",
    "color": "n.颜色；色彩；肤色 v.给……着色；影响",
    "comprehension": "n.理解；理解力；领悟；包含",
    "confident": "adj.确信的；自信的；有把握的",
    "concern": "v.涉及；使担忧；关心 n.担忧；关切；重要的事；关系",
    "denote": "v.表示；意味着；指示",
    "disastrous": "adj.灾难性的；造成严重损失的；极糟糕的",
    "due": "adj.到期的；应支付的；预定到达的；应有的（due to 表示‘由于’）",
    "dull": "adj.枯燥、无聊的；迟钝、愚笨的；钝的；暗淡的；（声音）沉闷的 v.使变钝、迟钝；使变暗淡；减弱、缓和",
    "e-mail": "n.电子邮件 v.发送电子邮件",
    "ending": "n.结尾；结局；终止",
    "few": "adj./pron.很少；几乎没有；少数（a few 表示“几个、有些”）",
    "figure": "n.数字；数值；人物；体形；图形 v.计算；认为；推断",
    "file": "n.文件；档案；卷宗；锉刀 v.归档；提交、申请；锉",
    "goose": "n.鹅；鹅肉",
    "handy": "adj.方便的；有用的；手边的；手巧的",
    "help": "v.帮助；有助于；避免 n.帮助；助手",
    "hi": "interj.嗨；你好",
    "insert": "v.插入；嵌入；插播 n.插入物；插页",
    "interest": "n.兴趣；利益；利息；重要性；权益 v.使感兴趣",
    "justice": "n.公正；正义；司法；法官",
    "kick": "v./n.踢；踹 n.刺激；兴奋",
    "kind": "adj.友善的；仁慈的 n.种类；类型",
    "liquor": "n.烈酒；酒类；液体、溶液",
    "mean": "v.意思是；意味着；打算 adj.卑鄙的；吝啬的；平均的 n.平均数",
    "magnitude": "n.大小；规模；数量级；重要性、重大程度；震级",
    "nonsense": "n.胡说、废话；荒谬言行",
    "noun": "n.名词",
    "often": "adv.常常；经常；通常",
    "on": "prep.在……上；关于 adv.向前；继续 adj.开着的；进行中的",
    "onto": "prep.到……上；在……上",
    "or": "conj.或者；否则；也就是",
    "one": "num.一；一个 pron.一个人（物）；代替可数名词",
    "patch": "n.小块；补丁；斑点 v.修补；临时解决",
    "preposition": "n.介词",
    "practice": "n.练习；实践；惯例；执业、业务 v.练习；实践；从事（职业）",
    "present": "adj.现在的；出席的 n.现在；礼物 v.提出；呈现；介绍；赠送",
    "pronoun": "n.代词",
    "provided": "conj.如果；只要 v.提供（provide 的过去式和过去分词）",
    "shall": "aux.将要；应该；必须（用于第一人称、建议或命令）",
    "set": "v.放置；设置；确定；树立；使处于；日落 n.一套；一组；集合 adj.固定的；准备好的",
    "someone": "pron.某人；有人",
    "something": "pron.某事；某物；重要的事物",
    "sometimes": "adv.有时；不时；间或",
    "somewhat": "adv.有点；稍微；多少",
    "state": "n.状态；情况；国家；州 v.陈述；说明；规定",
    "subject": "n.主题；学科；主语；研究对象 adj.易受……影响的；受制于……的 v.使遭受",
    "upon": "prep.在……上；一……就；根据；关于",
    "verb": "n.动词",
    "whereas": "conj.然而；但是；鉴于",
    "wretched": "adj.可怜的；悲惨的；极差的；卑鄙的",
    "sit": "v.坐、就座；位于；适合、合身",
    "achieve": "v.实现；取得；完成；达到",
    "case": "n.情况；事例、案例；案件；病例；箱、盒；论点、理由",
    "valve": "n.阀门、活门；瓣膜；电子管",
    "customer": "n.顾客；客户；主顾",
    "goods": "n.货物；商品",
    "versus": "prep.对；与……相对、相比；以……为对手",
    "they": "pron.他们；她们；它们",
    "cyberspace": "n.网络空间；虚拟信息空间",
    "internet": "n.互联网；因特网",
    "laptop": "n.笔记本电脑；便携式电脑",
    "if": "conj.如果；是否；即使",
    "eternal": "adj.永久的；永恒的；无休止的",
    "naval": "adj.海军的；军舰的",
    "stale": "adj.不新鲜的；变质的；陈旧的；乏味的",
    "thrift": "n.节约；节俭",
    "yes": "adv./interj.是；是的 n.赞同",
    "about": "prep.关于；围绕；在……周围 adv.大约；到处 adj.即将……的",
    "accord": "n.一致；符合；协议 v.给予；授予；相符合",
    "answer": "n.答案；回答 v.回答；答复；响应；符合",
    "as": "adv.同样地 conj.当……时；因为；像……一样 prep.作为",
    "at": "prep.在；向；以（价格、速度等）；在……方面",
    "available": "adj.可获得的；可使用的；有空的；可联系到的",
    "before": "prep./conj.在……以前；在……前面 adv.以前；从前",
    "being": "n.存在；生命；生物；人",
    "both": "det./pron.两者；双方 adv.两者都 conj.既……又……",
    "challenge": "n.挑战；难题；质疑 v.向……挑战；质疑；考验",
    "could": "aux.能够（can 的过去式）；可能；可以；本来可以",
    "court": "n.法院；法庭；宫廷；院子；球场 v.追求；招致；讨好",
    "do": "v.做；执行；完成；处理 aux.构成疑问、否定或强调 n.聚会",
    "different": "adj.不同的；有差异的；与众不同的",
    "for": "prep.为了；给；支持；对于；达（时间） conj.因为",
    "found": "v.建立；创办；把……建立在……基础上；也是 find 的过去式和过去分词",
    "fund": "n.资金；基金；储备 v.为……提供资金",
    "go": "v.去；走；离开；运转；变得；进行 n.尝试；轮到的机会",
    "grant": "v.授予；准予；承认 n.拨款；补助金；授予",
    "how": "adv.怎样；如何；多么；到什么程度 n.方法",
    "image": "n.图像；影像；形象；印象；声誉；比喻 v.想象；反映",
    "in": "prep.在……里；在……期间；用；穿着；处于 adv.进入；在家 adj.时髦的",
    "long": "adj.长的；长期的 adv.长久地 v.渴望；盼望",
    "make": "v.制造；做；使成为；引起；组成；赚得 n.品牌；型号",
    "napkin": "n.餐巾；餐巾纸；尿布（英式旧用法）",
    "off": "adv.离开；断开；关闭 adj.休息的；不新鲜的 prep.离；从……离开",
    "own": "adj.自己的 pron.自己的东西 v.拥有；承认",
    "official": "adj.官方的；正式的；公务的 n.官员；公务员",
    "orchard": "n.果园；果园里的果树",
    "play": "v.玩；比赛；演奏；扮演；发挥作用 n.游戏；比赛；戏剧",
    "point": "n.点；要点；观点；目的；分数；地点 v.指向；指出；表明",
    "provide": "v.提供；供应；规定；预防（provide against）",
    "report": "n.报告；报道；传闻 v.报告；报道；汇报；举报",
    "romance": "n.浪漫；恋爱、恋情；爱情故事；传奇（故事） v.与……谈恋爱；追求",
    "round": "adj.圆的 prep.围绕 adv.在周围 v.绕行 n.一轮；回合",
    "send": "v.发送；寄出；派遣；使进入某种状态",
    "show": "v.显示；表明；展示；带领；上演 n.节目；表演；展览",
    "that": "det./pron.那；那个 conj.引导从句；以便 adv.那么",
    "their": "det.他（她、它）们的；其",
    "take": "v.拿；带走；采取；接受；花费；需要；认为；记录",
    "to": "prep.向；到；给；直到；与……相比；用于构成不定式",
    "well": "adv.好；充分地；很 adj.健康的 interj.好吧 n.井",
    "what": "pron./det.什么；多么；……的事物；所……的",
    "when": "adv./conj./pron.什么时候；当……时；在那时",
    "where": "adv./conj./pron.在哪里；在那里；……的地方",
    "we": "pron.我们",
    "which": "pron./det.哪一个；哪些；用于引导定语从句",
    "work": "n.工作；作品；劳动 v.工作；运转；起作用；奏效；经营",
    "year": "n.年；年度；学年；年龄",
    "elite": "n.精英；精华；中坚分子 adj.精英的",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--words", default="src/data/words.json")
    parser.add_argument("--ecdict", required=True)
    parser.add_argument("--reference")
    parser.add_argument("--qwerty-reference", action="append", default=[])
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
        if not line or SPECIALIZED_LINE.search(line):
            continue
        line = normalize_pos(line)
        if not re.search(r"[\u3400-\u9fff]", line):
            continue
        lines.append(line)
    return lines


def clean_source_meaning(value: str) -> str:
    """Remove display-only subject tags while retaining the syllabus senses."""
    value = SUBJECT_LABEL.sub("", value)
    value = re.sub(r"<(?:主格|法|英|美俚)>", "", value)
    value = value.replace("pron．", "pron.").replace("pron..", "pron.")
    value = re.sub(r"\s+([,，;；])", r"\1", value)
    return re.sub(r"\s+", " ", value).strip(" ;；,，.")


def meaning_inventory(value: str) -> Counter[str]:
    """Character inventory used to prove automatic ordering neither adds nor drops source text."""
    return Counter(re.sub(r"[\s;；,，.．]", "", value))


def split_senses(value: str) -> list[str]:
    """Split top-level sense separators without breaking parenthetical notes."""
    parts: list[str] = []
    current: list[str] = []
    depth = 0
    opening = "（([【"
    closing = "）)]】"
    for character in value:
        if character in opening:
            depth += 1
        elif character in closing and depth:
            depth -= 1
        if character in ";；,，" and depth == 0:
            part = "".join(current).strip()
            if part:
                parts.append(part)
            current = []
        else:
            current.append(character)
    part = "".join(current).strip()
    if part:
        parts.append(part)
    return parts


def parse_meaning_groups(value: str) -> list[dict]:
    matches = list(POS_MARKER.finditer(value))
    if not matches:
        return [{"pos": "", "label": "", "senses": split_senses(value)}]

    groups: list[dict] = []
    leading = value[:matches[0].start()].strip(" ;；,，")
    if leading:
        groups.append({"pos": "", "label": "", "senses": split_senses(leading)})
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(value)
        label = match.group("pos")
        content = value[match.end():end].strip(" ;；,，")
        senses = split_senses(content)
        if senses:
            pos_parts = [
                POS_FAMILIES.get(part.casefold(), part.casefold())
                for part in re.split(r"[.．/&]+", label)
                if part
            ]
            groups.append({
                "pos": "/".join(dict.fromkeys(pos_parts)),
                "label": label,
                "senses": senses,
            })
    return groups


def priority_order_meaning(source_meaning: str, references: list[str]) -> tuple[str, bool]:
    """Reorder only source senses, using public exam-list order as ranking evidence."""
    source_groups = parse_meaning_groups(source_meaning)
    if sum(len(group["senses"]) for group in source_groups) < 2:
        return source_meaning, False

    ranked_references: list[dict] = []
    for reference_index, reference in enumerate(references):
        position = 0
        for group_index, group in enumerate(parse_meaning_groups(reference)):
            for sense_index, sense in enumerate(group["senses"]):
                characters = chinese_characters(sense)
                if characters:
                    ranked_references.append({
                        "rank": reference_index * 1000 + position,
                        "reference_index": reference_index,
                        "group_index": group_index,
                        "sense_index": sense_index,
                        "pos": group["pos"],
                        "characters": characters,
                    })
                position += 1
    if not ranked_references:
        return source_meaning, False

    def sense_match(sense: str, pos: str) -> dict | None:
        characters = chinese_characters(sense)
        if not characters:
            return None
        matches = []
        for reference in ranked_references:
            source_pos = set(pos.split("/"))
            reference_pos = set(reference["pos"].split("/"))
            if source_pos and reference_pos and source_pos.isdisjoint(reference_pos):
                continue
            overlap = len(characters & reference["characters"])
            score = overlap / min(len(characters), len(reference["characters"]))
            enough_evidence = overlap >= 2 or min(len(characters), len(reference["characters"])) == 1
            if enough_evidence and score >= 0.60:
                matches.append(reference)
        return min(matches, key=lambda item: item["rank"]) if matches else None

    ranked_groups = []
    for group_index, group in enumerate(source_groups):
        ranked_senses = []
        for sense_index, sense in enumerate(group["senses"]):
            match = sense_match(sense, group["pos"])
            ranked_senses.append((match is None, match["rank"] if match else 0, sense_index, sense, match))
        may_reorder_senses = any(
            item[4]
            and item[4]["reference_index"] == 0
            and item[4]["sense_index"] == 0
            for item in ranked_senses
        )
        if may_reorder_senses:
            ranked_senses.sort(key=lambda item: item[:3])
        group_rank = min((item[1] for item in ranked_senses if not item[0]), default=None)
        ranked_groups.append((group_rank is None, group_rank or 0, group_index, group, ranked_senses))
    may_reorder_groups = any(
        sense[4]
        and sense[4]["reference_index"] == 0
        and sense[4]["group_index"] == 0
        for _, _, _, _, ranked_senses in ranked_groups
        for sense in ranked_senses
    )
    if may_reorder_groups:
        ranked_groups.sort(key=lambda item: item[:3])

    group_order_changed = [item[2] for item in ranked_groups] != list(range(len(source_groups)))
    sense_order_changed = any(
        [sense[2] for sense in ranked_senses] != list(range(len(group["senses"])))
        for _, _, _, group, ranked_senses in ranked_groups
    )
    if not group_order_changed and not sense_order_changed:
        return source_meaning, False

    rendered_groups = []
    for _, _, _, group, ranked_senses in ranked_groups:
        content = "；".join(item[3] for item in ranked_senses)
        rendered_groups.append(f"{group['label']}.{content}" if group["label"] else content)
    ordered = " ".join(rendered_groups)
    return ordered, ordered != source_meaning


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


def load_qwerty_references(paths: list[Path]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = defaultdict(list)
    for path in paths:
        rows = json.loads(path.read_text(encoding="utf-8"))
        for row in rows:
            key = str(row.get("name", "")).casefold()
            meaning = "；".join(str(item).strip() for item in row.get("trans", []) if str(item).strip())
            if key and meaning and meaning not in result[key]:
                result[key].append(meaning)
    return result


def main() -> None:
    args = parse_args()
    words_path = Path(args.words)
    ecdict_path = Path(args.ecdict)
    reference_path = Path(args.reference) if args.reference else None
    qwerty_reference_paths = [Path(path) for path in args.qwerty_reference]
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
    qwerty_reference = load_qwerty_references(qwerty_reference_paths)
    statuses: Counter[str] = Counter()
    agreement_buckets: Counter[str] = Counter()
    qwerty_agreement_buckets: Counter[str] = Counter()
    dictionary_agreement_buckets: Counter[str] = Counter()
    low_agreement_words: list[str] = []
    source_only_words: list[str] = []
    unresolved_conflict_words: list[str] = []
    priority_reordered_words: list[str] = []
    entries = []

    for word in words:
        key = str(word["word"]).casefold()
        dictionary_row = dictionary.get(key)
        if dictionary_row is None:
            raise ValueError(f"ECDICT has no exact entry for {word['word']}")

        lines = clean_dictionary_translation(str(dictionary_row.get("translation", "")))
        full_meaning = "；".join(lines)
        source_meaning = str(word["meaning"])
        if full_meaning:
            dictionary_agreement = agreement(source_meaning, full_meaning)
            if dictionary_agreement >= 0.45:
                dictionary_agreement_buckets["high"] += 1
            elif dictionary_agreement >= 0.20:
                dictionary_agreement_buckets["medium"] += 1
            else:
                dictionary_agreement_buckets["low"] += 1
        else:
            dictionary_agreement_buckets["missingTranslation"] += 1
        candidates = reference.get(key, [])
        qwerty_candidates = qwerty_reference.get(key, [])
        best_agreement = 0.0
        best_reference_meaning = ""
        if candidates:
            best_reference = max(candidates, key=lambda candidate: agreement(source_meaning, reference_meaning(candidate)))
            best_reference_meaning = reference_meaning(best_reference)
            best_agreement = agreement(source_meaning, best_reference_meaning)
            if best_agreement >= 0.45:
                agreement_buckets["high"] += 1
            elif best_agreement >= 0.20:
                agreement_buckets["medium"] += 1
            else:
                agreement_buckets["low"] += 1

        best_qwerty_agreement = 0.0
        best_qwerty_meaning = ""
        if qwerty_candidates:
            best_qwerty_meaning = max(qwerty_candidates, key=lambda candidate: agreement(source_meaning, candidate))
            best_qwerty_agreement = agreement(source_meaning, best_qwerty_meaning)
            if best_qwerty_agreement >= 0.45:
                qwerty_agreement_buckets["high"] += 1
            elif best_qwerty_agreement >= 0.20:
                qwerty_agreement_buckets["medium"] += 1
            else:
                qwerty_agreement_buckets["low"] += 1
        else:
            qwerty_agreement_buckets["missing"] += 1

        primary_meaning = clean_source_meaning(source_meaning)

        if key in CURATED_MEANINGS:
            primary_meaning = CURATED_MEANINGS[key]
            status = "curated"
        else:
            ordering_references = list(qwerty_candidates)
            if best_reference_meaning:
                ordering_references.append(best_reference_meaning)
            primary_meaning, reordered = priority_order_meaning(primary_meaning, ordering_references)
            if meaning_inventory(primary_meaning) != meaning_inventory(clean_source_meaning(source_meaning)):
                raise ValueError(f"Priority ordering changed source content: {word['word']}")
            if reordered:
                priority_reordered_words.append(str(word["word"]))

            if candidates and qwerty_candidates and best_agreement >= 0.20 and best_qwerty_agreement >= 0.20:
                status = "triple-cross-checked"
            elif (candidates and best_agreement >= 0.20) or (qwerty_candidates and best_qwerty_agreement >= 0.20):
                status = "cross-checked"
            elif candidates:
                status = "dictionary-reviewed"
            else:
                status = "source-cross-checked"

        independent_scores = [
            score
            for score, present in (
                (best_agreement, bool(candidates)),
                (best_qwerty_agreement, bool(qwerty_candidates)),
            )
            if present
        ]
        if not independent_scores:
            source_only_words.append(str(word["word"]))
        elif max(independent_scores) < 0.20:
            low_agreement_words.append(str(word["word"]))
            if key not in CURATED_MEANINGS:
                unresolved_conflict_words.append(str(word["word"]))

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
        "authoritativeSource": {
            "name": "考研大纲词汇乱序版",
            "wordCount": len(words),
            "wordsSha256": sha256(words_path),
        },
        "dictionaryCrossCheck": {
            "name": "ECDICT",
            "url": "https://github.com/skywind3000/ECDICT",
            "commit": ECDICT_COMMIT,
            "license": "MIT",
            "sha256": sha256(ecdict_path),
            "exactHeadwordCoverage": len(words),
            "agreement": dict(dictionary_agreement_buckets),
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
        "qwertyCrossCheck": {
            "name": "Qwerty Learner postgraduate lists",
            "url": "https://github.com/RealKai42/qwerty-learner",
            "commit": QWERTY_COMMIT if qwerty_reference_paths else None,
            "files": [
                {"name": path.name, "sha256": sha256(path)}
                for path in qwerty_reference_paths
            ],
            "coveredWords": len(words) - qwerty_agreement_buckets["missing"],
            "agreement": dict(qwerty_agreement_buckets),
            "copiedIntoApp": False,
        },
        "statusCounts": dict(statuses),
        "validationScope": {
            "agreementMeaning": "自动交叉核对只确认词头和至少一个已有义项相符，不代表常用义完整",
            "curatedMeaning": "人工校订项补充已确认的常见义、考研义或修正明显错误",
        },
        "priorityOrdering": {
            "rule": "同一词条优先显示公开考研词库中靠前的基础义和常见义；只重排大纲已有义项，不自动增删释义",
            "primaryReference": qwerty_reference_paths[0].name if qwerty_reference_paths else None,
            "reorderedWords": len(priority_reordered_words),
            "curatedWords": len(CURATED_MEANINGS),
        },
        "curatedWords": sorted(CURATED_MEANINGS),
        "lowAgreementWords": sorted(low_agreement_words),
        "sourceOnlyWords": sorted(source_only_words),
        "unresolvedConflictWords": sorted(unresolved_conflict_words),
    }
    meta_path.write_text(f"{json.dumps(meta, ensure_ascii=False, indent=2)}\n", encoding="utf-8")
    print(json.dumps(meta, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
