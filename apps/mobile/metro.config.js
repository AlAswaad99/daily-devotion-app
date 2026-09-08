// Learn more https://docs.expo.io/guides/customizing-metro
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

/*
 * The bundled scripture database is an asset, not source. Metro has no opinion about
 * `.db` by default and would try to parse it as JavaScript, so it has to be told.
 */
config.resolver.assetExts.push('db')

/*
 * A real (non-symlink) copy of expo-router lives at node_modules/expo-router in this
 * package too — required so the Windows Gradle/Metro entry-file path resolution (see
 * android/app/build.gradle) computes a short-enough relative path. Left alone, that
 * duplicate makes Metro load two separate instances of expo-router's modules — most
 * visibly two different LinkPreviewContext React contexts, which crashes with
 * "useLinkPreviewContext must be used within a LinkPreviewContextProvider" in release
 * builds. Force every `expo-router` import, everywhere, onto the single hoisted copy.
 */
const HOISTED_EXPO_ROUTER = path.join(__dirname, '../../node_modules/expo-router')
const defaultResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'expo-router' || moduleName.startsWith('expo-router/')) {
    const rewritten = path.join(HOISTED_EXPO_ROUTER, moduleName.slice('expo-router'.length))
    return (defaultResolveRequest ?? context.resolveRequest)(context, rewritten, platform)
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform)
}

module.exports = config
