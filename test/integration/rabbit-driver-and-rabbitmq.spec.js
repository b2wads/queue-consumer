/* eslint-disable import/no-unresolved */

const amqplib = require('amqplib')

const { RabbitDriver } = require('index')

const wait = require('src/helpers/wait')

const rabbitUri = 'amqp://localhost'

describe('[INTEGRATION] rabbit-driver and RabbitMQ', () => {
  const queueFixture = 'test_queue'

  let rabbit
  before(async () => {
    const connection = await amqplib.connect(rabbitUri)
    const channel = await connection.createConfirmChannel()

    await channel.assertQueue(queueFixture)

    rabbit = { connection, channel }
  })

  after(async () => {
    await rabbit.channel.deleteQueue(queueFixture)
    await rabbit.channel.close()
    await rabbit.connection.close()
  })

  describe('when connection closes abruptly', () => {
    context('with configuration set to keep connection alive', () => {
      const configFixture = {
        keepAlive: true,
        uri: rabbitUri,
        queue: queueFixture,
        batchSize: 1,
        retryDelay: 100,
      }
      const messageFixture = 'this is a message'

      const messages = []
      let reconnected
      let driver
      before(async () => {
        driver = new RabbitDriver(configFixture)

        await driver.connect((rawMsg) => {
          messages.push(rawMsg.content.toString())
        })

        await driver._connection.close()

        await wait(configFixture.retryDelay + 150)

        try {
          await driver._channel.checkQueue(queueFixture)
          reconnected = true
        } catch (err) {
          reconnected = false
        }

        await rabbit.channel.sendToQueue(queueFixture, Buffer.from(messageFixture))
        await wait(500)
      })

      after(async () => {
        await driver.disconnect()
        await rabbit.channel.purgeQueue(queueFixture)
      })

      it('should reconnect automatically', () => {
        expect(reconnected).to.be.true
      })

      it('should continue to process messages normally', () => {
        expect(messages).to.have.lengthOf(1)
        expect(messages[0]).to.equal(messageFixture)
      })
    })

    context('with configuration set to not keep connection alive', () => {
      const configFixture = {
        keepAlive: false,
        uri: rabbitUri,
        queue: queueFixture,
        batchSize: 1,
        retryDelay: 100,
      }
      const messageFixture = 'this is a message'

      const messages = []
      let reconnected
      let driver
      before(async () => {
        driver = new RabbitDriver(configFixture)

        await driver.connect((rawMsg) => {
          messages.push(rawMsg.content.toString())
        })

        await driver._connection.close()

        await wait(configFixture.retryDelay + 150)

        try {
          await driver._channel.checkQueue(queueFixture)
          reconnected = true
        } catch (err) {
          reconnected = false
        }

        await rabbit.channel.sendToQueue(queueFixture, Buffer.from(messageFixture))
        await wait(500)
      })

      after(async () => {
        await driver.disconnect()
        await rabbit.channel.purgeQueue(queueFixture)
      })

      it('should not reconnect automatically', () => {
        expect(reconnected).to.be.false
      })

      it('should stop processing messages', () => {
        expect(messages).to.have.lengthOf(0)
      })
    })
  })
})
