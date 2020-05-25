const logger = require('./helpers/logger')
const asyncMap = require('./helpers/async-map')
const { errorParser } = require('./helpers/error-parser')
const MessageStatus = require('./message-status-enum')

const defaultErrorHandler = async (error, messages) => {
  logger.error({
    action: 'consumer.defaultErrorHandler',
    msg: 'messages could not be processed because an error occurred',
    ...errorParser(error),
    messages,
  })
}

const defaultMessageToObject = (rawMsg) => {
  return JSON.parse(rawMsg.content.toString())
}

const defaultMessageAdapter = async (msg) => msg

class Consumer {
  constructor({
    asyncMessageAdapter = defaultMessageAdapter,
    asyncBatchOutput,
    batchSize = 10,
    discardOnAdapterFailure = true,
    driver,
    errorHandler = defaultErrorHandler,
    maxFlushDelay = 10000,
    messageToObject = defaultMessageToObject,
  }) {
    if (!asyncBatchOutput) throw Error("missing required parameter 'asyncBatchOutput'")
    if (!driver) throw Error("missing required parameter 'driver'")

    this.asyncMessageAdapter = asyncMessageAdapter
    this.asyncBatchOutput = asyncBatchOutput
    this.batchSize = batchSize
    this.discardOnAdapterFailure = discardOnAdapterFailure
    this.driver = driver
    this.errorHandler = errorHandler
    this.maxFlushDelay = maxFlushDelay
    this.messageToObject = messageToObject

    this._batch = []
    this._processingBatch = false

    this.consumerCallback = async (rawMsg) => {
      this._batch.push(rawMsg)
      if (this._batch.length >= this.batchSize) {
        await this._flushBatch()
      }
    }
  }

  _scheduleNextFlush() {
    this._flushTimeout = setTimeout(this._flushBatch.bind(this), this.maxFlushDelay)
  }

  _unscheduleNextFlush() {
    clearTimeout(this._flushTimeout)
  }

  _acquireNextBatch() {
    if (!this._batch.length) return false

    const batchForProcessing = this._batch
    this._batch = []

    return batchForProcessing
  }

  async _outputBatch(validAdaptedMsgs, messagesStatus) {
    try {
      if (validAdaptedMsgs.length) await this.asyncBatchOutput(validAdaptedMsgs)

      await this.driver.notifyBatchSuccess(messagesStatus)
    } catch (err) {
      await this.driver.notifyBatchFailure(messagesStatus)
      this.errorHandler(err, validAdaptedMsgs)
    }
  }

  async _adaptAll(batchUnderProcess) {
    const adaptedMsgs = []

    const messagesStatus = await asyncMap(batchUnderProcess, async (rawMsg) => {
      let msg

      try {
        msg = this.messageToObject(rawMsg)

        let adaptedMsg
        try {
          adaptedMsg = await this.asyncMessageAdapter(msg)
        } catch (err) {
          if (this.discardOnAdapterFailure) {
            logger.info({
              action: 'consumer._flushBatch',
              msg: 'message invalidated by message adapter',
              reason: err.message || err.text,
              message: msg,
            })

            return {
              status: MessageStatus.DISCARDED,
              rawMsg,
            }
          }

          throw err
        }

        adaptedMsgs.push(adaptedMsg)

        return {
          status: MessageStatus.SUCCESS,
          rawMsg,
        }
      } catch (err) {
        this.errorHandler(err, [msg])
        return {
          status: MessageStatus.FAILED,
          rawMsg,
        }
      }
    })

    return { adaptedMsgs, messagesStatus }
  }

  _startBatchProcessing() {
    this._processingBatch = true
    this._unscheduleNextFlush()
  }

  _finishBatchProcessing() {
    this._processingBatch = false
    this._scheduleNextFlush()
  }

  async _flushBatch() {
    if (this._processingBatch) return
    this._startBatchProcessing()

    const batch = this._acquireNextBatch()
    if (!batch) {
      this._finishBatchProcessing()
      return
    }

    const { adaptedMsgs, messagesStatus } = await this._adaptAll(batch)

    await this._outputBatch(adaptedMsgs, messagesStatus)

    this._finishBatchProcessing()
  }

  async start() {
    await this.driver.connect(this.consumerCallback)
    this._scheduleNextFlush()
  }

  async stop() {
    clearTimeout(this._flushTimeout)
    this._batch = []
    await this.driver.disconnect()
  }
}

module.exports = Consumer
