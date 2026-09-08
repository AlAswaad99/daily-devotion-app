#!/usr/bin/env node
// Windows' Gradle/Metro entry-file resolution needs a REAL (non-symlink) copy of
// expo-router inside this package's own node_modules — see the comment in
// metro.config.js and android/app/build.gradle for why. pnpm's `node-linker=hoisted`
// mode only hoists this package to the monorepo root, so `pnpm install` wipes this
// copy every time; recreate it after every install.
const fs = require('fs')
const path = require('path')

const source = path.join(__dirname, '..', '..', '..', 'node_modules', 'expo-router')
const dest = path.join(__dirname, '..', 'node_modules', 'expo-router')

if (!fs.existsSync(source)) {
  console.warn('[fix-expo-router-local-copy] hoisted expo-router not found, skipping')
  process.exit(0)
}

fs.rmSync(dest, { recursive: true, force: true })
fs.cpSync(source, dest, { recursive: true })
console.log('[fix-expo-router-local-copy] refreshed local expo-router copy')
