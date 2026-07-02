import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

const GS_CANDIDATES = [
    process.env.GHOSTSCRIPT_PATH,
    '/opt/homebrew/bin/gs',
    '/usr/local/bin/gs',
    '/usr/bin/gs',
].filter(Boolean) as string[];

const resolveGhostscriptPath = (): string => {
    for (const candidate of GS_CANDIDATES) {
        if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error(
        'Ghostscript (gs) is required to compress large PDFs. Install with: brew install ghostscript'
    );
};

/**
 * Compress PDFs that exceed Cloudinary's upload limit using Ghostscript.
 * Install: brew install ghostscript (macOS) or apt install ghostscript (Linux)
 */
export const compressPdfIfNeeded = async (
    buffer: Buffer,
    maxBytes: number = DEFAULT_MAX_BYTES
): Promise<Buffer> => {
    if (buffer.byteLength <= maxBytes) {
        return buffer;
    }

    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `pdf-in-${Date.now()}.pdf`);
    const outputPath = path.join(tmpDir, `pdf-out-${Date.now()}.pdf`);

    try {
        fs.writeFileSync(inputPath, buffer);

        const gsPath = resolveGhostscriptPath();
        await execFileAsync(gsPath, [
            '-sDEVICE=pdfwrite',
            '-dCompatibilityLevel=1.4',
            '-dPDFSETTINGS=/ebook',
            '-dNOPAUSE',
            '-dQUIET',
            '-dBATCH',
            `-sOutputFile=${outputPath}`,
            inputPath,
        ]);

        const compressed = fs.readFileSync(outputPath);

        if (compressed.byteLength > maxBytes) {
            throw new Error(
                `PDF too large even after compression (${(compressed.byteLength / (1024 * 1024)).toFixed(1)}MB > ${(maxBytes / (1024 * 1024)).toFixed(0)}MB). Split or reduce quality.`
            );
        }

        return compressed;
    } catch (error: any) {
        if (error?.code === 'ENOENT' || error?.message?.includes('ENOENT')) {
            throw new Error(
                'Ghostscript (gs) is required to compress large PDFs. Install with: brew install ghostscript'
            );
        }
        throw error;
    } finally {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
};
