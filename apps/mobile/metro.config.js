// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

/*
 * The bundled scripture database is an asset, not source. Metro has no opinion about
 * `.db` by default and would try to parse it as JavaScript, so it has to be told.
 */
config.resolver.assetExts.push('db')

module.exports = config
