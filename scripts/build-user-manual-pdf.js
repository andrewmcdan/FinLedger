#!/usr/bin/env node

/**
 * Build a single PDF from markdown files in docs/User Manual.
 *
 * Usage:
 *   node scripts/build-user-manual-pdf.js
 *   node scripts/build-user-manual-pdf.js --out "docs/User Manual/FinLedger_User_Manual.pdf"
 */

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_MANUAL_DIR = path.join(REPO_ROOT, "docs", "User Manual");
const DEFAULT_OUTPUT = path.join(DEFAULT_MANUAL_DIR, "FinLedger_User_Manual.pdf");
const SECTION_DIR_PATTERN = /^(\d+)_/;
const BRAND_LOGO_PATH = path.join(REPO_ROOT, "web", "public_images", "FL-logo.png");
const HAS_BRAND_LOGO = fs.existsSync(BRAND_LOGO_PATH);
const BRAND_COLORS = {
    bg: "#063b12",
    bgDeep: "#04280c",
    ink: "#084e17",
    accent: "#0b7b6c",
    accentStrong: "#738b71",
    surface: "#f3f7f4",
    text: "#111111",
    muted: "#475569",
    link: "#0b7b6c",
};

function parseArgs(argv) {
    const args = { output: DEFAULT_OUTPUT, manualDir: DEFAULT_MANUAL_DIR };
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === "--out") {
            const value = argv[i + 1];
            if (!value) {
                throw new Error("Missing value for --out");
            }
            args.output = path.resolve(REPO_ROOT, value);
            i += 1;
            continue;
        }
        if (token === "--manual-dir") {
            const value = argv[i + 1];
            if (!value) {
                throw new Error("Missing value for --manual-dir");
            }
            args.manualDir = path.resolve(REPO_ROOT, value);
            i += 1;
            continue;
        }
        if (token === "--help" || token === "-h") {
            printUsage();
            process.exit(0);
        }
        throw new Error(`Unknown argument: ${token}`);
    }
    return args;
}

function printUsage() {
    console.log("Build FinLedger User Manual PDF");
    console.log("");
    console.log("Usage:");
    console.log("  node scripts/build-user-manual-pdf.js");
    console.log("  node scripts/build-user-manual-pdf.js --out \"docs/User Manual/FinLedger_User_Manual.pdf\"");
    console.log("  node scripts/build-user-manual-pdf.js --manual-dir \"docs/User Manual\"");
}

function sortSectionDirs(entries) {
    return entries.sort((a, b) => {
        const aMatch = a.name.match(SECTION_DIR_PATTERN);
        const bMatch = b.name.match(SECTION_DIR_PATTERN);
        const aNum = aMatch ? Number.parseInt(aMatch[1], 10) : Number.MAX_SAFE_INTEGER;
        const bNum = bMatch ? Number.parseInt(bMatch[1], 10) : Number.MAX_SAFE_INTEGER;
        if (aNum !== bNum) {
            return aNum - bNum;
        }
        return a.name.localeCompare(b.name);
    });
}

function collectSources(manualDir) {
    if (!fs.existsSync(manualDir)) {
        throw new Error(`Manual directory not found: ${manualDir}`);
    }

    const sources = [];
    const warnings = [];

    const sectionDirs = sortSectionDirs(
        fs.readdirSync(manualDir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && SECTION_DIR_PATTERN.test(entry.name)),
    );

    for (const entry of sectionDirs) {
        const readmePath = path.join(manualDir, entry.name, "README.md");
        if (!fs.existsSync(readmePath)) {
            warnings.push(`Skipping section without README: ${path.relative(REPO_ROOT, readmePath)}`);
            continue;
        }
        const markdown = fs.readFileSync(readmePath, "utf8");
        const sectionTitle = extractHeading(markdown) || entry.name.replace(SECTION_DIR_PATTERN, "").replace(/_/g, " ");
        sources.push({
            key: entry.name,
            title: sectionTitle,
            anchor: `sec_${entry.name}`,
            filePath: readmePath,
            content: markdown,
        });
    }

    if (sources.length === 0) {
        throw new Error(`No markdown sources found in ${manualDir}`);
    }

    return { sources, warnings };
}

function extractHeading(markdown) {
    const match = markdown.match(/^#\s+(.+)$/m);
    if (!match) {
        return null;
    }
    return cleanInline(match[1]).trim();
}

function startsNewBlock(line) {
    const trimmed = line.trim();
    return (
        trimmed === "" ||
        /^#{1,6}\s+/.test(trimmed) ||
        /^```/.test(trimmed) ||
        /^\s*[-*]\s+/.test(line) ||
        /^\s*\d+\.\s+/.test(line)
    );
}

function parseMarkdownBlocks(markdown) {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed === "") {
            blocks.push({ type: "blank" });
            i += 1;
            continue;
        }

        if (/^```/.test(trimmed)) {
            i += 1;
            const codeLines = [];
            while (i < lines.length && !/^```/.test(lines[i].trim())) {
                codeLines.push(lines[i]);
                i += 1;
            }
            if (i < lines.length && /^```/.test(lines[i].trim())) {
                i += 1;
            }
            blocks.push({ type: "code", text: codeLines.join("\n") });
            continue;
        }

        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            blocks.push({
                type: "heading",
                level: headingMatch[1].length,
                text: headingMatch[2].trim(),
            });
            i += 1;
            continue;
        }

        const unorderedMatch = line.match(/^\s*[-*]\s+(.+)$/);
        if (unorderedMatch) {
            const items = [];
            while (i < lines.length) {
                const itemLine = lines[i];
                const itemMatch = itemLine.match(/^\s*[-*]\s+(.+)$/);
                if (!itemMatch) {
                    break;
                }
                let itemText = itemMatch[1].trim();
                i += 1;
                while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
                    itemText += ` ${lines[i].trim()}`;
                    i += 1;
                }
                items.push(itemText);
            }
            blocks.push({ type: "unorderedList", items });
            continue;
        }

        const orderedMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
        if (orderedMatch) {
            const items = [];
            while (i < lines.length) {
                const itemLine = lines[i];
                const itemMatch = itemLine.match(/^\s*(\d+)\.\s+(.+)$/);
                if (!itemMatch) {
                    break;
                }
                let itemText = itemMatch[2].trim();
                i += 1;
                while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
                    itemText += ` ${lines[i].trim()}`;
                    i += 1;
                }
                items.push(itemText);
            }
            blocks.push({ type: "orderedList", items });
            continue;
        }

        const paragraphLines = [line.trim()];
        i += 1;
        while (i < lines.length && !startsNewBlock(lines[i])) {
            paragraphLines.push(lines[i].trim());
            i += 1;
        }
        blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
    }

    return blocks;
}

function cleanInline(input) {
    let text = input;
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
    text = text.replace(/`([^`]+)`/g, "$1");
    text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
    text = text.replace(/__([^_]+)__/g, "$1");
    text = text.replace(/\*([^*]+)\*/g, "$1");
    text = text.replace(/_([^_]+)_/g, "$1");
    return text;
}

function renderMarkdown(doc, markdown) {
    const blocks = parseMarkdownBlocks(markdown);
    const headingSizes = { 1: 24, 2: 18, 3: 14, 4: 12, 5: 11, 6: 10 };
    const renderWrappedListItem = (marker, itemText) => {
        const baseX = doc.page.margins.left;
        const markerX = baseX + 16;
        const textX = baseX + 30;
        const width = doc.page.width - doc.page.margins.right - textX;
        const y = doc.y;
        doc.text(marker, markerX, y, { lineBreak: false });
        doc.text(cleanInline(itemText), textX, y, {
            width,
            lineGap: 1,
            paragraphGap: 3,
        });
        doc.x = baseX;
    };

    for (const block of blocks) {
        if (block.type === "blank") {
            doc.moveDown(0.4);
            continue;
        }

        if (block.type === "heading") {
            const size = headingSizes[block.level] || 10;
            const headingColor = block.level === 1 ? BRAND_COLORS.ink : block.level === 2 ? BRAND_COLORS.accent : BRAND_COLORS.text;
            doc.font("Helvetica-Bold").fillColor(headingColor).fontSize(size).text(cleanInline(block.text), {
                paragraphGap: block.level <= 2 ? 8 : 4,
            });
            if (block.level === 1) {
                const lineY = doc.y + 2;
                const lineWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
                doc.save();
                doc.strokeColor(BRAND_COLORS.accentStrong).lineWidth(1).moveTo(doc.page.margins.left, lineY).lineTo(doc.page.margins.left + lineWidth, lineY).stroke();
                doc.restore();
                doc.moveDown(0.5);
            }
            continue;
        }

        if (block.type === "paragraph") {
            doc.font("Helvetica").fillColor(BRAND_COLORS.text).fontSize(11).text(cleanInline(block.text), {
                paragraphGap: 8,
                lineGap: 1,
            });
            continue;
        }

        if (block.type === "unorderedList") {
            doc.font("Helvetica").fillColor(BRAND_COLORS.text).fontSize(11);
            for (const item of block.items) {
                renderWrappedListItem("•", item);
            }
            doc.moveDown(0.2);
            continue;
        }

        if (block.type === "orderedList") {
            doc.font("Helvetica").fillColor(BRAND_COLORS.text).fontSize(11);
            block.items.forEach((item, index) => {
                renderWrappedListItem(`${index + 1}.`, item);
            });
            doc.moveDown(0.2);
            continue;
        }

        if (block.type === "code") {
            doc.font("Courier").fillColor("#1f2937").fontSize(9).text(block.text || "", {
                indent: 16,
                lineGap: 1,
                paragraphGap: 8,
            });
            continue;
        }
    }
}

function renderPageBranding(doc, pageLabel) {
    const pageWidth = doc.page.width;
    const left = doc.page.margins.left;
    const topBandHeight = 44;

    doc.save();
    doc.rect(0, 0, pageWidth, topBandHeight).fill(BRAND_COLORS.bg);
    doc.rect(0, topBandHeight - 2, pageWidth, 2).fill(BRAND_COLORS.accent);
    doc.restore();

    let headingX = left;
    if (HAS_BRAND_LOGO) {
        try {
            doc.image(BRAND_LOGO_PATH, left, 8, { fit: [20, 20], align: "left", valign: "top" });
            headingX = left + 26;
        } catch (error) {
            headingX = left;
        }
    }

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#ffffff").text("FinLedger User Manual", headingX, 12, { lineBreak: false });
    if (pageLabel) {
        doc.font("Helvetica").fontSize(9).fillColor("#dfe7e2").text(pageLabel, left, 28, { lineBreak: false });
    }
    doc.y = Math.max(doc.y, doc.page.margins.top + 6);
    doc.fillColor(BRAND_COLORS.text);
}

function renderCoverPage(doc) {
    const generatedAt = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const fullWidth = pageWidth;

    doc.save();
    doc.rect(0, 0, pageWidth, pageHeight).fill(BRAND_COLORS.surface);
    doc.rect(0, 0, pageWidth, 210).fill(BRAND_COLORS.bg);
    doc.rect(0, 210, pageWidth, 8).fill(BRAND_COLORS.accent);
    doc.restore();

    if (HAS_BRAND_LOGO) {
        try {
            const logoWidth = 90;
            const logoX = (pageWidth - logoWidth) / 2;
            doc.image(BRAND_LOGO_PATH, logoX, 56, { fit: [logoWidth, logoWidth], align: "center", valign: "center" });
        } catch (error) {
            // If logo rendering fails, continue with text-only cover.
        }
    }

    doc.font("Helvetica-Bold").fontSize(34).fillColor("#ffffff").text("FinLedger", 0, 152, {
        align: "center",
        width: fullWidth,
    });
    doc.font("Helvetica-Bold").fontSize(24).fillColor("#ffffff").text("User Manual", 0, 190, {
        align: "center",
        width: fullWidth,
    });

    doc.font("Helvetica").fontSize(12).fillColor(BRAND_COLORS.muted).text("Financial management system", 0, 248, {
        align: "center",
        width: fullWidth,
    });
    doc.font("Helvetica").fontSize(11).fillColor(BRAND_COLORS.muted).text(`Generated: ${generatedAt}`, 0, 272, {
        align: "center",
        width: fullWidth,
    });
}

function renderContentsPage(doc, sources) {
    doc.addPage();
    renderPageBranding(doc, "Contents");
    doc.font("Helvetica-Bold").fillColor(BRAND_COLORS.ink).fontSize(22).text("Contents", {
        paragraphGap: 12,
    });
    doc.save();
    doc.strokeColor(BRAND_COLORS.accentStrong).lineWidth(1).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
    doc.restore();
    doc.moveDown(0.8);

    doc.font("Helvetica").fontSize(11).fillColor(BRAND_COLORS.link);
    sources.forEach((source, index) => {
        doc.text(`${index + 1}. ${source.title}`, {
            indent: 8,
            lineGap: 1,
            paragraphGap: 3,
            goTo: source.anchor,
            underline: true,
        });
    });
    doc.fillColor(BRAND_COLORS.text);
}

async function writePdf({ outputPath, sources }) {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    const doc = new PDFDocument({
        size: "LETTER",
        margins: { top: 54, bottom: 54, left: 54, right: 54 },
        info: {
            Title: "FinLedger User Manual",
            Author: "FinLedger",
            Subject: "User Manual",
        },
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    renderCoverPage(doc);
    renderContentsPage(doc, sources);

    sources.forEach((source) => {
        doc.addPage();
        renderPageBranding(doc, source.title);
        doc.addNamedDestination(source.anchor, "XYZ", null, doc.y, null);
        renderMarkdown(doc, source.content);
    });

    doc.end();

    await new Promise((resolve, reject) => {
        stream.on("finish", resolve);
        stream.on("error", reject);
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const { sources, warnings } = collectSources(args.manualDir);

    if (warnings.length > 0) {
        warnings.forEach((warning) => {
            console.warn(`[manual:pdf] Warning: ${warning}`);
        });
    }

    await writePdf({
        outputPath: args.output,
        sources,
    });

    console.log(`[manual:pdf] PDF written to ${path.relative(REPO_ROOT, args.output)}`);
    console.log(`[manual:pdf] Included ${sources.length} markdown source file(s).`);
}

main().catch((error) => {
    console.error(`[manual:pdf] Failed: ${error.message}`);
    process.exitCode = 1;
});
