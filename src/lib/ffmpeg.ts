import { execFile } from 'child_process'
import { promisify } from 'util'
import { unlink, rename } from 'fs/promises'
import path from 'path'

const execFileAsync = promisify(execFile)

/**
 * Converts a video file to H.264 + AAC inside an MP4 container using ffmpeg.
 * Ensures compatibility with Facebook and Instagram (both reject H.265/HEVC).
 *
 * Settings:
 *  - Video : H.264 (libx264), CRF 28, preset fast
 *  - Bitrate cap : 4 Mbps max (recommended limit for FB/IG)
 *  - Scale : forces even pixel dimensions (required by H.264)
 *  - Audio : AAC 128 kbps (optional stream — works on silent videos too)
 *  - movflags +faststart : metadata first for progressive streaming
 *
 * Uses execFile (not exec) to pass arguments as an array, bypassing the shell
 * entirely. This prevents '?' in '-map 0:a?' from being treated as a shell glob
 * pattern (which silently strips the argument and breaks audio conversion).
 *
 * The original file is deleted and the converted .mp4 takes its place.
 * Returns the path to the final .mp4 file.
 */
export async function convertVideoForSocial(inputPath: string): Promise<string> {
  const dir = path.dirname(inputPath)
  const ext = path.extname(inputPath)
  const basename = path.basename(inputPath, ext)

  // Write to a temp name first so a partial failure never corrupts the original
  const tempOutput = path.join(dir, `${basename}-converting.mp4`)
  const finalOutput = path.join(dir, `${basename}.mp4`)

  // Pass args as an array to execFile — this completely bypasses the shell,
  // so '0:a?' is delivered literally to ffmpeg (optional audio stream selector)
  // instead of being glob-expanded by the shell to an empty string.
  const ffmpegArgs = [
    '-i',         inputPath,
    '-c:v',       'libx264',
    '-preset',    'fast',
    '-crf',       '28',
    '-profile:v', 'main',
    '-level',     '4.0',          // Facebook-compatible H.264 profile + level
    '-pix_fmt',   'yuv420p',      // required pixel format for broad compatibility
    '-maxrate',   '4M',
    '-bufsize',   '8M',
    '-vf',        'scale=trunc(iw/2)*2:trunc(ih/2)*2',  // ensure even dimensions
    '-map',       '0:v:0',        // map first video stream
    '-map',       '0:a?',         // map audio if present (optional — won't fail if none)
    '-c:a',       'aac',
    '-b:a',       '128k',
    '-movflags',  '+faststart',   // moov atom first for streaming
    '-y',         tempOutput,
  ]

  try {
    await execFileAsync('ffmpeg', ffmpegArgs, {
      timeout: 300_000,            // 5-minute hard limit for large files
      maxBuffer: 10 * 1024 * 1024, // ffmpeg writes progress to stderr
    })

    // Replace original with the converted file
    if (inputPath !== finalOutput) {
      await unlink(inputPath).catch(() => {})
    }
    await rename(tempOutput, finalOutput)

    return finalOutput
  } catch (err) {
    // Best-effort cleanup of the incomplete temp file
    await unlink(tempOutput).catch(() => {})
    throw new Error(
      `Video conversion failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}
