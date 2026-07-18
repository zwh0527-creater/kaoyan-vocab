import AppKit
import Foundation
import PDFKit
import Vision

struct WordEntry: Decodable {
    let word: String
}

struct OCRLine {
    let text: String
    let x: CGFloat
    let y: CGFloat
}

struct RedbookRecord: Encodable {
    let headword: String
    let page: Int
    let meaningLines: [String]
    let collocationLines: [String]
    let relatedLines: [String]
}

enum ContentSection: Equatable {
    case none
    case meaning
    case collocation
    case related
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

guard CommandLine.arguments.count >= 4 else {
    fail("Usage: swift extract-redbook-collocations.swift <pdf> <words.json> <output.ndjson> [start-page] [end-page]")
}

let pdfURL = URL(fileURLWithPath: CommandLine.arguments[1])
let wordsURL = URL(fileURLWithPath: CommandLine.arguments[2])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[3])
guard let document = PDFDocument(url: pdfURL) else { fail("Cannot open PDF: \(pdfURL.path)") }
guard let wordsData = try? Data(contentsOf: wordsURL),
      let words = try? JSONDecoder().decode([WordEntry].self, from: wordsData) else {
    fail("Cannot decode words JSON: \(wordsURL.path)")
}

let startPage = max(1, Int(CommandLine.arguments.count > 4 ? CommandLine.arguments[4] : "1") ?? 1)
let requestedEnd = Int(CommandLine.arguments.count > 5 ? CommandLine.arguments[5] : "\(document.pageCount)") ?? document.pageCount
let endPage = min(document.pageCount, max(startPage, requestedEnd))
let canonicalWords = Dictionary(uniqueKeysWithValues: Set(words.map { $0.word.lowercased() }).map { ($0, $0) })
let specialWords = canonicalWords.keys.filter { $0.contains(" ") }.sorted { $0.count > $1.count }
let relatedMarkers = ["同义", "同必", "近义", "反义", "派生"]
let stopMarkers = ["真题", "辨析", "词性", "助记", "记忆", "典型考题", "试题分析"]

FileManager.default.createFile(atPath: outputURL.path, contents: nil)
guard let output = try? FileHandle(forWritingTo: outputURL) else { fail("Cannot write: \(outputURL.path)") }
defer { try? output.close() }
let encoder = JSONEncoder()

func writeRecord(headword: String?, page: Int, meaningLines: [String], collocationLines: [String], relatedLines: [String]) {
    guard let headword, !meaningLines.isEmpty || !collocationLines.isEmpty || !relatedLines.isEmpty else { return }
    let record = RedbookRecord(
        headword: headword,
        page: page,
        meaningLines: meaningLines,
        collocationLines: collocationLines,
        relatedLines: relatedLines
    )
    guard let data = try? encoder.encode(record) else { return }
    output.write(data)
    output.write(Data("\n".utf8))
}

func normalize(_ text: String) -> String {
    text
        .replacingOccurrences(of: "\u{00a0}", with: " ")
        .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

struct DetectedHeader {
    let canonicalHeadword: String?
}

func detectedHeader(in line: OCRLine) -> DetectedHeader? {
    let lower = line.text.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    let sitsOnHeaderRail = line.x < 0.18 || (line.x >= 0.5 && line.x < 0.61)
    guard sitsOnHeaderRail else { return nil }

    let headerOnly = lower.range(of: #"^[a-z][a-z()（） .'-]{0,30}$"#, options: .regularExpression) != nil
    if headerOnly {
        let withoutOptionalU = lower
            .replacingOccurrences(of: "(u)", with: "")
            .replacingOccurrences(of: "（u）", with: "")
        let withOptionalU = lower
            .replacingOccurrences(of: "(u)", with: "u")
            .replacingOccurrences(of: "（u）", with: "u")
        let canonical = canonicalWords[lower] ?? canonicalWords[withoutOptionalU] ?? canonicalWords[withOptionalU]
        return DetectedHeader(canonicalHeadword: canonical)
    }

    for word in specialWords where lower.hasPrefix(word) {
        let remainder = String(lower.dropFirst(word.count).prefix(28))
        if remainder.contains("[") { return DetectedHeader(canonicalHeadword: canonicalWords[word]) }
    }
    guard let match = lower.range(of: #"^[a-z][a-z'-]*"#, options: .regularExpression) else { return nil }
    let token = String(lower[match])
    let remainder = String(lower[match.upperBound...].prefix(28))
    guard remainder.contains("[") else { return nil }
    return DetectedHeader(canonicalHeadword: canonicalWords[token])
}

func recognizedLines(on page: PDFPage) -> [OCRLine] {
    let bounds = page.bounds(for: .mediaBox)
    let targetWidth: CGFloat = 2100
    let targetHeight = targetWidth * bounds.height / max(bounds.width, 1)
    let image = page.thumbnail(of: NSSize(width: targetWidth, height: targetHeight), for: .mediaBox)
    var imageRect = CGRect(origin: .zero, size: image.size)
    guard let cgImage = image.cgImage(forProposedRect: &imageRect, context: nil, hints: nil) else { return [] }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = true
    request.minimumTextHeight = 0.007
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    do {
        try handler.perform([request])
    } catch {
        return []
    }

    let lines = (request.results ?? []).compactMap { observation -> OCRLine? in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let text = normalize(candidate.string)
        guard !text.isEmpty else { return nil }
        return OCRLine(text: text, x: observation.boundingBox.midX, y: observation.boundingBox.midY)
    }
    let left = lines.filter { $0.x < 0.5 }.sorted { lhs, rhs in
        abs(lhs.y - rhs.y) > 0.008 ? lhs.y > rhs.y : lhs.x < rhs.x
    }
    let right = lines.filter { $0.x >= 0.5 }.sorted { lhs, rhs in
        abs(lhs.y - rhs.y) > 0.008 ? lhs.y > rhs.y : lhs.x < rhs.x
    }
    return left + right
}

for pageNumber in startPage...endPage {
    autoreleasepool {
        guard let page = document.page(at: pageNumber - 1) else { return }
        var currentHeadword: String?
        var section: ContentSection = .none
        var meaningLines: [String] = []
        var collocationLines: [String] = []
        var relatedLines: [String] = []

        let pageLines = recognizedLines(on: page)
        if ProcessInfo.processInfo.environment["DEBUG_OCR"] == "1" {
            for line in pageLines {
                FileHandle.standardError.write(Data((String(format: "%.3f %.3f %@\n", line.x, line.y, line.text)).utf8))
            }
        }

        for line in pageLines {
            if let header = detectedHeader(in: line) {
                writeRecord(
                    headword: currentHeadword,
                    page: pageNumber,
                    meaningLines: meaningLines,
                    collocationLines: collocationLines,
                    relatedLines: relatedLines
                )
                currentHeadword = header.canonicalHeadword
                section = .none
                meaningLines = []
                collocationLines = []
                relatedLines = []
                continue
            }

            if line.text.contains("词义") {
                section = currentHeadword == nil ? .none : .meaning
                if section == .meaning { meaningLines.append(line.text) }
                continue
            }

            if line.text.contains("词组") {
                section = currentHeadword == nil ? .none : .collocation
                if section == .collocation { collocationLines.append(line.text) }
                continue
            }

            if relatedMarkers.contains(where: { line.text.contains($0) }) {
                section = currentHeadword == nil ? .none : .related
                if section == .related { relatedLines.append(line.text) }
                continue
            }

            if section != .none && stopMarkers.contains(where: { line.text.contains($0) }) {
                section = .none
                continue
            }

            switch section {
            case .meaning:
                meaningLines.append(line.text)
            case .collocation:
                collocationLines.append(line.text)
            case .related:
                relatedLines.append(line.text)
            case .none:
                break
            }
        }

        writeRecord(
            headword: currentHeadword,
            page: pageNumber,
            meaningLines: meaningLines,
            collocationLines: collocationLines,
            relatedLines: relatedLines
        )
        FileHandle.standardError.write(Data(("OCR page \(pageNumber)/\(endPage)\n").utf8))
    }
}
