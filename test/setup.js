const { expect } = require('chai')

global.expect = expect

process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'error'
