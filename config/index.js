const envLoader = require('env-o-loader')

const rabbitDriverConfig = envLoader('rabbit-driver.yaml')

module.exports = {
  rabbitDriverConfig
}
