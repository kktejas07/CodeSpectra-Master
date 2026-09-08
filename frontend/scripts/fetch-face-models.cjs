#!/usr/bin/env node
/**
 * One-time local helper: mirror face-api model files into
 * frontend/public/models/ so local dev also skips the CDN.
 * (Docker builds do this automatically; the dir is gitignored.)
 * Usage: node scripts/fetch-face-models.cjs
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

const BASE = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model'
const FILES = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model.bin',
  'face_landmark_68_tiny_model-weights_manifest.json',
  'face_landmark_68_tiny_model.bin',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
]

function get(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          file.close()
          fs.rmSync(dest, { force: true })
          reject(new Error(`HTTP ${res.statusCode} for ${url}`))
          return
        }
        res.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
      })
      .on('error', (err) => {
        fs.rmSync(dest, { force: true })
        reject(err)
      })
  })
}

async function main() {
  const dir = path.join(__dirname, '..', 'public', 'models')
  fs.mkdirSync(dir, { recursive: true })
  for (const f of FILES) {
    const dest = path.join(dir, f)
    if (fs.existsSync(dest)) {
      console.log(`skip (exists): ${f}`)
      continue
    }
    process.stdout.write(`fetching ${f} ... `)
    await get(`${BASE}/${f}`, dest)
    console.log('ok')
  }
  console.log(`done → ${dir}`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
