/* eslint-disable import/no-unresolved */

const amqplib = require('amqplib')

const { Consumer, RabbitDriver } = require('index')
const wait = require('src/helpers/wait')

const rabbitUri = 'amqp://localhost'

describe('[INTEGRATION] cosumer and rabbit-driver', () => {
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

  describe('when message adapter fails', () => {
    const messageAdapter = async () => {
      throw Error('error forced by test')
    }
    const batchOutput = async () => {}

    context('when driver is configured to requeue on failure and to not discard on adapter failure', () => {
      const driverConfigFixture = {
        requeueOnFailure: true,
        uri: rabbitUri,
        queue: queueFixture,
        batchSize: 1,
      }

      const consumerConfigFixture = {
        asyncMessageAdapter: messageAdapter,
        discardOnAdapterFailure: false,
        asyncBatchOutput: batchOutput,
        batchSize: 1,
        errorHandler: () => {},
      }

      const messageFixture = { msg: 'test message requeueing' }

      const requeuedMessages = []
      before(async () => {
        const driver = new RabbitDriver(driverConfigFixture)
        const consumer = new Consumer({
          ...consumerConfigFixture,
          driver,
        })

        await rabbit.channel.sendToQueue(queueFixture, Buffer.from(JSON.stringify(messageFixture)))

        await consumer.start()
        await wait(250)
        await consumer.stop()
        await wait(250)

        let rawMsg
        // eslint-disable-next-line no-cond-assign
        while ((rawMsg = await rabbit.channel.get(queueFixture)))
          requeuedMessages.push(JSON.parse(rawMsg.content.toString()))
      })

      after(async () => {
        await rabbit.channel.purgeQueue(queueFixture)
      })

      it('should requeue message', () => {
        expect(requeuedMessages).to.have.lengthOf(1)
      })

      it('should requeue correct message', () => {
        expect(requeuedMessages[0]).to.deep.equal(messageFixture)
      })
    })

    context('when driver is configured to not requeue on failure', () => {
      const driverConfigFixture = {
        requeueOnFailure: false,
        uri: rabbitUri,
        queue: queueFixture,
        batchSize: 1,
      }

      const consumerConfigFixture = {
        asyncMessageAdapter: messageAdapter,
        asyncBatchOutput: batchOutput,
        batchSize: 1,
        errorHandler: () => {},
      }

      const messageFixture = { msg: 'test message not requeueing' }

      const requeuedMessages = []
      before(async () => {
        const driver = new RabbitDriver(driverConfigFixture)
        const consumer = new Consumer({
          ...consumerConfigFixture,
          driver,
        })

        await rabbit.channel.sendToQueue(queueFixture, Buffer.from(JSON.stringify(messageFixture)))

        await consumer.start()
        await wait(250)
        await consumer.stop()
        await wait(250)

        let rawMsg
        // eslint-disable-next-line no-cond-assign
        while ((rawMsg = await rabbit.channel.get(queueFixture)))
          requeuedMessages.push(Buffer.from(rawMsg.content.toString()))
      })

      after(async () => {
        await rabbit.channel.purgeQueue(queueFixture)
      })

      it('should not requeue message', () => {
        expect(requeuedMessages).to.have.lengthOf(0)
      })
    })
  })

  describe('when batch output fails', () => {
    const messageAdapter = (msg) => {
      if (!msg.valid) throw Error('error forced by test')
    }

    const batchOutput = () => {
      throw Error('error forced by test')
    }

    context('when driver is configured to requeue on failure', () => {
      const driverConfigFixture = {
        requeueOnFailure: true,
        uri: rabbitUri,
        queue: queueFixture,
        batchSize: 1,
      }

      const consumerConfigFixture = {
        asyncMessageAdapter: messageAdapter,
        discardOnAdapterFailure: false,
        asyncBatchOutput: batchOutput,
        batchSize: 1,
        errorHandler: () => {},
      }

      const messagesFixtures = [
        { msg: 'message 1', valid: true },
        { msg: 'message 2', valid: false },
        { msg: 'message 3', valid: true },
      ]

      const requeuedMessages = []
      before(async () => {
        const driver = new RabbitDriver(driverConfigFixture)
        const consumer = new Consumer({
          ...consumerConfigFixture,
          driver,
        })

        await Promise.all(
          messagesFixtures.map((msg) => {
            return rabbit.channel.sendToQueue(queueFixture, Buffer.from(JSON.stringify(msg)))
          })
        )

        await consumer.start()
        await wait(250)
        await consumer.stop()
        await wait(250)

        let rawMsg
        // eslint-disable-next-line no-cond-assign
        while ((rawMsg = await rabbit.channel.get(queueFixture)))
          requeuedMessages.push(JSON.parse(rawMsg.content.toString()))
      })

      after(async () => {
        await rabbit.channel.purgeQueue(queueFixture)
      })

      it('should requeue all messages', () => {
        expect(requeuedMessages).to.have.lengthOf(messagesFixtures.length)
      })

      it('should requeue all messages', () => {
        expect(requeuedMessages).to.have.deep.members(messagesFixtures)
      })
    })
  })
})
