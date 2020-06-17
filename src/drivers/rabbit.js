// eslint-disable-next-line import/no-extraneous-dependencies
const amqplib = require('amqplib')

const logger = require('../helpers/logger')
const wait = require('../helpers/wait')
const { errorParser } = require('../helpers/error-parser')
const MessageStatus = require('../message-status-enum')

const { rabbitDriverConfig: defaultConfigs } = require('../../config')

class RabbitDriver {
  constructor(configs) {
    this.config = { ...defaultConfigs, ...configs }
    this.validateConfigs()
  }

  validateConfigs() {
    if (!this.config.uri) throw Error("missing required configuration 'uri'")
    if (!this.config.queue) throw Error("missing required configuration 'queue'")
    if (!this.config.batchSize) throw Error("missing required configuration 'batchSize'")
  }

  async _openNewChannel() {
    let retries = 0
    let lastError

    while (!this._channel && retries < this.config.maxConnectionRetries) {
      try {
        if (retries) await wait(this.config.retryDelay)
        if (this._channel) await this._channel.close()
        if (this._connection) await this._connection.close()

        this._connection = await amqplib.connect(this.config.uri)
        this._channel = await this._connection.createChannel({ noAck: false })
        await this._channel.prefetch(Math.floor(this.config.batchSize * (1 + this.config.extraPrefetchPercentage)))

        await this._channel.checkQueue(this.config.queue)

        this._channel.on('close', async () => {
          if (!this._manuallyDisconnected) {
            logger.error({
              action: 'RabbitClient._channel',
              msg: 'channel closed unexpectedly',
            })

            if (this.config.keepAlive) {
              await wait(this.config.retryDelay)
              this._channel = false
              await this.disconnect()
              await this.connect(this._callback)
            }
          }
        })
      } catch (err) {
        logger.warn({
          action: 'RabbitClient._openNewChannel',
          msg: 'failed to create channel, retrying',
          ...errorParser(err),
        })

        lastError = err
        retries += 1

        await wait(this.config.retryDelay)
      }
    }

    if (!this._channel) {
      logger.error({
        action: 'RabbitClient._openNewChannel',
        msg: 'failed to create channel too many times',
        ...errorParser(lastError),
      })
      lastError.message = `could not connect to rabbit: ${lastError.message}`
      throw lastError
    }
  }

  async connect(callback) {
    this._manuallyDisconnected = false
    this._callback = callback
    await this._openNewChannel()
    await this._channel.consume(this.config.queue, this._callback)
  }

  async disconnect() {
    this._manuallyDisconnected = true
    if (this._channel) {
      try {
        await this._channel.close()
      } catch (err) {
        logger.warn({
          action: 'rabbit-driver.disconnect',
          msg: 'could not close channel',
          ...errorParser(err),
        })
      }
      this._channel = false
    }

    if (this._connection) {
      try {
        await this._connection.close()
      } catch (err) {
        logger.warn({
          action: 'rabbit-driver.disconnect',
          msg: 'could not close connection',
          ...errorParser(err),
        })
      }

      this._connection = false
    }
  }

  // eslint-disable-next-line class-methods-use-this
  async _bulkProcessStatus(indexBegin, limit, messages, targetStatus, asyncCallback) {
    let i = indexBegin
    let lastMsgWithStatus

    // eslint-disable-next-line security/detect-object-injection
    while (i < limit && messages[i].status === targetStatus) {
      // eslint-disable-next-line security/detect-object-injection
      lastMsgWithStatus = messages[i].rawMsg
      i += 1
    }

    if (lastMsgWithStatus) await asyncCallback(lastMsgWithStatus)

    return i
  }

  async notifyBatchSuccess(msgs) {
    let i = 0
    while (i < msgs.length) {
      i = await this._bulkProcessStatus(i, msgs.length, msgs, MessageStatus.SUCCESS, async (msg) => {
        return this._channel.ack(msg, true)
      })

      i = await this._bulkProcessStatus(i, msgs.length, msgs, MessageStatus.DISCARDED, async (msg) => {
        return this._channel.nack(msg, true, false)
      })

      i = await this._bulkProcessStatus(i, msgs.length, msgs, MessageStatus.FAILED, async (msg) => {
        return this._channel.nack(msg, true, this.config.requeueOnFailure)
      })
    }
  }

  async notifyBatchFailure(msgs) {
    let i = 0
    while (i < msgs.length) {
      i = await this._bulkProcessStatus(i, msgs.length, msgs, MessageStatus.SUCCESS, async (msg) => {
        return this._channel.nack(msg, true, this.config.requeueOnFailure)
      })

      i = await this._bulkProcessStatus(i, msgs.length, msgs, MessageStatus.DISCARDED, async (msg) => {
        return this._channel.nack(msg, true, false)
      })

      i = await this._bulkProcessStatus(i, msgs.length, msgs, MessageStatus.FAILED, async (msg) => {
        return this._channel.nack(msg, true, this.config.requeueOnFailure)
      })
    }
  }
}

module.exports = RabbitDriver
