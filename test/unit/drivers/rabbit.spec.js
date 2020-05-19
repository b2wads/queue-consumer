const amqplib = require('amqplib')
const sinon = require('sinon')
const { performance } = require('perf_hooks')

const logger = require('src/helpers/logger')

const RabbitDriver = require('src/drivers/rabbit')

describe('[UNIT] rabbit-driver', () => {
  describe('when instantiating driver', () => {
    context('with missing config "uri"', () => {
      let thrownError
      before(() => {
        try {
          // eslint-disable-next-line no-unused-vars
          const driver = new RabbitDriver({
            queue: 'doesnt-matter',
            batchSize: 5
          })
        } catch (err) {
          thrownError = err
        }
      })

      it('should throw error', () => {
        expect(thrownError).to.exist
      })

      it('should throw error informing of the missing field', () => {
        expect(thrownError.message).to.match(/missing .*uri/)
      })
    })

    context('with missing config "queue"', () => {
      let thrownError
      before(() => {
        try {
          // eslint-disable-next-line no-unused-vars
          const driver = new RabbitDriver({
            uri: 'amqp://doesnt-matter',
            batchSize: 5
          })
        } catch (err) {
          thrownError = err
        }
      })

      it('should throw error', () => {
        expect(thrownError).to.exist
      })

      it('should throw error informing of the missing field', () => {
        expect(thrownError.message).to.match(/missing .*queue/)
      })
    })

    context('with missing config "batchSize"', () => {
      let thrownError
      before(() => {
        try {
          // eslint-disable-next-line no-unused-vars
          const driver = new RabbitDriver({
            uri: 'amqp://doesnt-matter',
            queue: 'doesnt-matter'
          })
        } catch (err) {
          thrownError = err
        }
      })

      it('should throw error', () => {
        expect(thrownError).to.exist
      })

      it('should throw error informing of the missing field', () => {
        expect(thrownError.message).to.match(/missing .*batchSize/)
      })
    })
  })

  describe('when connecting to rabbit', () => {
    let timeTaken
    context('when connection is not possible', () => {
      const configFixture = {
        uri: 'amqp://uri-doesnt-matter.com',
        maxConnectionRetries: 5,
        retryDelay: 200,
        queue: 'queue-doesnt-matter',
        batchSize: 10
      }

      let thrownError
      const amqpSandbox = sinon.createSandbox()
      const loggerSandbox = sinon.createSandbox()
      before(async () => {
        amqpSandbox
          .stub(amqplib, 'connect')
          .throws('connection error', 'error forced by test')

        loggerSandbox.stub(logger, 'warn')
        loggerSandbox.stub(logger, 'error')

        const driver = new RabbitDriver(configFixture)

        const beginTime = performance.now()
        try {
          await driver.connect()
        } catch (err) {
          thrownError = err
        }
        timeTaken = performance.now() - beginTime
      })

      after(() => {
        amqpSandbox.restore()
        loggerSandbox.restore()
      })

      it('should attempt to connect multiple times, following limit in the configuration', () => {
        expect(amqplib.connect.getCalls()).to.have.lengthOf(
          configFixture.maxConnectionRetries
        )
      })

      it('should wait between connection retries, following configured delay', () => {
        expect(timeTaken).to.be.at.least(
          configFixture.retryDelay * (configFixture.maxConnectionRetries - 1)
        )
      })

      it('should throw error', () => {
        expect(thrownError).to.exist
      })

      it('should throw an error indicating a connection error', () => {
        expect(thrownError.message).to.match(
          /(could not connect)|(connection failed)|(failed to connect)/
        )
      })

      it('should log warnings on every connection retry', () => {
        expect(logger.warn.getCalls()).to.have.lengthOf(
          configFixture.maxConnectionRetries
        )
      })

      it('should log error after too many failed attempts', () => {
        expect(logger.error.calledOnce).to.be.true
      })
    })
  })
})
