const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

config.server = {
  ...config.server,
  urlOpts: {
    ...config.server?.urlOpts,
    platform: 'android',
  },
}

module.exports = config
