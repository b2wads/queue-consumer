const sinon = require('sinon')
const fakePromise = require('q')

const logger = require('src/helpers/logger')
const { Consumer, messageStatus } = require('index')

const wait = require('src/helpers/wait')

const newDriverStub = () => {
  return {
    connect: sinon.stub().returns(fakePromise()),
    disconnect: sinon.stub().returns(fakePromise()),
    notifyBatchFailure: sinon.stub().returns(fakePromise()),
    notifyBatchSuccess: sinon.stub().returns(fakePromise()),
    notifySingleFailure: sinon.stub().returns(fakePromise())
  }
}

describe('[UNIT] Consumer', () => {
  describe('when constructing the consumer', () => {
    context('with correct arguments', () => {
      let thrownError
      let consumer
      const stubDriver = newDriverStub()
      before(() => {
        try {
          consumer = new Consumer({
            driver: stubDriver,
            asyncBatchOutput: () => {}
          })
        } catch (err) {
          thrownError = err
        }
      })

      it('should not throw any errors', () => {
        expect(thrownError).to.be.undefined
      })

      it('should instantiate a consmuer', () => {
        expect(consumer).to.exist
      })

      it('instantiated consumer should have the expected methods', () => {
        expect(consumer.start).to.exist
        expect(consumer.stop).to.exist
      })
    })

    context("with argument 'asyncBatchOutput' missing", () => {
      let thrownError
      const stubDriver = newDriverStub()
      before(() => {
        try {
          // eslint-disable-next-line no-unused-vars
          const consumer = new Consumer({
            driver: stubDriver
          })
        } catch (err) {
          thrownError = err
        }
      })

      it('should throw an error', () => {
        expect(thrownError).to.exist
      })

      it('should throw an error containing a descriptive message', () => {
        expect(thrownError.message).to.match(
          /missing.*(argument|parameter).*asyncBatchOutput/
        )
      })
    })

    context("with argument 'driver' missing", () => {
      let thrownError
      before(() => {
        try {
          // eslint-disable-next-line no-unused-vars
          const consumer = new Consumer({
            asyncBatchOutput: () => {}
          })
        } catch (err) {
          thrownError = err
        }
      })

      it('sholud throw an error', () => {
        expect(thrownError).to.exist
      })

      it('should throw an error containing a descriptive message', () => {
        expect(thrownError.message).to.match(
          /missing.*(argument|parameter).*driver/
        )
      })
    })
  })

  describe('when consuming messages', () => {
    context('with number of messages smaller than batch size', () => {
      const stubDriver = newDriverStub()
      const batchOutputFixture = sinon.stub().returns(fakePromise())
      const messageAdapterFixture = sinon.stub().callsFake(async msg => msg)
      const maxFlushDelay = 500
      const fakeMsgs = [
        { msg: 'this is message 1' },
        { msg: 'this is message 2' }
      ]

      const fakeRawMsgs = fakeMsgs.map(msg => {
        return { content: Buffer.from(JSON.stringify(msg)) }
      })

      const fakeMsgsStatus = fakeMsgs.map(msg => ({
        status: messageStatus.SUCCESS,
        parsedMsg: msg
      }))

      let flushSpy
      let consumer
      before(async () => {
        consumer = new Consumer({
          asyncBatchOutput: batchOutputFixture,
          asyncMessageAdapter: messageAdapterFixture,
          batchSize: 5,
          driver: stubDriver,
          maxFlushDelay
        })

        flushSpy = sinon.spy(Consumer.prototype, '_flushBatch')

        await consumer.start()

        await consumer.consumerCallback(fakeRawMsgs[0])
        await wait(maxFlushDelay + 100)

        await consumer.consumerCallback(fakeRawMsgs[1])
        await wait(maxFlushDelay + 100)
      })

      after(async () => {
        await consumer.stop()
        flushSpy.restore()
      })

      it('should connect the driver', () => {
        expect(stubDriver.connect.calledOnce).to.be.true
      })

      it('should flush messages periodically', () => {
        expect(flushSpy.calledTwice).to.be.true
      })

      it('should empty batch buffer', () => {
        expect(consumer._batch).to.be.empty
      })

      it('should call message adapter the correct number of times', () => {
        expect(messageAdapterFixture.getCalls()).to.have.lengthOf(
          fakeMsgs.length
        )
      })

      it('should call message adapter passing messages as arguments', () => {
        fakeMsgs.forEach(msg => {
          expect(messageAdapterFixture.calledWith(msg)).to.be.true
        })
      })

      it('should call batch handler once for each batch', () => {
        expect(batchOutputFixture.getCalls()).to.have.lengthOf(fakeMsgs.length)
      })

      it('should pass entire batch to batch handler', () => {
        fakeMsgs.forEach(msg => {
          expect(batchOutputFixture.calledWith([msg])).to.be.true
        })
      })

      it('should notify success to driver for each batch', () => {
        expect(stubDriver.notifyBatchSuccess.getCalls()).to.have.lengthOf(
          fakeRawMsgs.length
        )
      })

      it('should notify driver with messages status', () => {
        const calls = stubDriver.notifyBatchSuccess.getCalls()
        expect(calls).to.have.lengthOf(fakeMsgsStatus.length)
        calls.forEach(call => {
          const [[notifiedStatus]] = call.args
          const parsedStatus = {
            status: notifiedStatus.status,
            parsedMsg: JSON.parse(notifiedStatus.rawMsg.content.toString())
          }
          expect(fakeMsgsStatus).to.deep.include(parsedStatus)
        })
      })
    })

    context('with number of messages equal batch size', () => {
      const stubDriver = newDriverStub()
      const batchOutputFixture = sinon.stub().returns(fakePromise())
      const maxFlushDelay = 100000
      const messageAdapterFixture = sinon.stub().callsFake(async msg => msg)
      const fakeMsgs = [
        { msg: 'this is message 1' },
        { msg: 'this is message 2' },
        { msg: 'this is message 3' }
      ]

      const fakeRawMsgs = fakeMsgs.map(fakeMsg => {
        return { content: Buffer.from(JSON.stringify(fakeMsg)) }
      })

      const fakeMsgsStatus = fakeMsgs.map(msg => ({
        status: messageStatus.SUCCESS,
        parsedMsg: msg
      }))

      let flushSpy
      let consumer
      before(async () => {
        consumer = new Consumer({
          driver: stubDriver,
          asyncBatchOutput: batchOutputFixture,
          asyncMessageAdapter: messageAdapterFixture,
          batchSize: fakeMsgs.length,
          maxFlushDelay
        })

        flushSpy = sinon.spy(Consumer.prototype, '_flushBatch')

        await consumer.start()

        await Promise.all(
          fakeRawMsgs.map(msg => consumer.consumerCallback(msg))
        )
      })

      after(async () => {
        await consumer.stop()
        flushSpy.restore()
      })

      it('should connect the driver', () => {
        expect(stubDriver.connect.calledOnce).to.be.true
      })

      it('should flush messages only once', () => {
        expect(flushSpy.calledOnce).to.be.true
      })

      it('should call message adapter the correct number of times', () => {
        expect(messageAdapterFixture.getCalls()).to.have.lengthOf(
          fakeMsgs.length
        )
      })

      it('should call message adapter passing messages as arguments', () => {
        fakeMsgs.forEach(msg => {
          expect(messageAdapterFixture.calledWith(msg)).to.be.true
        })
      })

      it('should call batch handler only once', () => {
        expect(batchOutputFixture.calledOnce).to.be.true
      })

      it('should pass entire batch to batch handler', () => {
        expect(batchOutputFixture.calledWith(fakeMsgs)).to.be.true
      })

      it('should notify batch success to driver only once', () => {
        expect(stubDriver.notifyBatchSuccess.calledOnce).to.be.true
      })

      it('should notify driver with messages status', () => {
        const calls = stubDriver.notifyBatchSuccess.getCalls()
        expect(calls).to.have.lengthOf(1)
        const [notifiedStatuses] = calls[0].args
        const parsedStatuses = notifiedStatuses.map(notifiedStatus => ({
          status: notifiedStatus.status,
          parsedMsg: JSON.parse(notifiedStatus.rawMsg.content.toString())
        }))
        expect(parsedStatuses).to.have.deep.members(fakeMsgsStatus)
      })
    })
  })

  describe('when invalidating messages due to untreated errors', () => {
    context(
      'when message adapter raises an error and consumer is configured to not discard on adapter failure',
      () => {
        const stubDriver = newDriverStub()
        const fakeMsgs = [
          { id: 1, valid: true },
          {
            id: 2,
            valid: false,
            invalid_message: 'forced test error: message 2 is invalid'
          },
          { id: 3, valid: true },
          {
            id: 4,
            valid: false,
            invalid_message: 'forced test error: message 4 is invalid'
          }
        ]
        const fakeRawMsgs = fakeMsgs.map(msg => {
          return { content: Buffer.from(JSON.stringify(msg)) }
        })

        const fakeMsgsStatus = fakeMsgs.map(msg => {
          if (msg.valid)
            return {
              status: messageStatus.SUCCESS,
              parsedMsg: msg
            }
          return {
            status: messageStatus.FAILED,
            parsedMsg: msg
          }
        })

        const messageAdapterFixture = sinon.stub().callsFake(async msg => {
          if (!msg.valid) throw new Error(msg.invalid_message)
        })

        const batchOutputFixture = sinon.stub().returns(fakePromise())

        let loggerStub
        let consumer
        before(async () => {
          consumer = new Consumer({
            driver: stubDriver,
            asyncBatchOutput: batchOutputFixture,
            discardOnAdapterFailure: false,
            asyncMessageAdapter: messageAdapterFixture,
            batchSize: fakeMsgs.length
          })

          loggerStub = sinon.stub(logger, 'error')

          await consumer.start()

          await Promise.all(
            fakeRawMsgs.map(msg => consumer.consumerCallback(msg))
          )
        })

        after(async () => {
          await consumer.stop()
          loggerStub.restore()
        })

        it('should notify driver with messages status', () => {
          const calls = stubDriver.notifyBatchSuccess.getCalls()
          expect(calls).to.have.lengthOf(1)
          const [notifiedStatuses] = calls[0].args
          const parsedStatuses = notifiedStatuses.map(notifiedStatus => ({
            status: notifiedStatus.status,
            parsedMsg: JSON.parse(notifiedStatus.rawMsg.content.toString())
          }))
          expect(parsedStatuses).to.have.deep.members(fakeMsgsStatus)
        })

        it('should log errors', () => {
          expect(loggerStub.called).to.be.true
        })

        it('should properly log error message and stack', () => {
          loggerStub.getCalls().forEach(call => {
            const [message] = call.args
            expect(message).to.include.keys('error', 'stack')
          })
        })
      }
    )

    context('when batch handler raises an error', () => {
      const stubDriver = newDriverStub()
      const fakeMsgs = [
        { id: 1, valid: true },
        {
          id: 2,
          valid: false,
          invalid_message: 'forced test error: message 2 is invalid'
        },
        { id: 3, valid: true },
        {
          id: 4,
          valid: false,
          invalid_message: 'forced test error: message 4 is invalid'
        }
      ]
      const fakeRawMsgs = fakeMsgs.map(msg => {
        return { content: Buffer.from(JSON.stringify(msg)) }
      })

      const fakeMsgsStatus = fakeMsgs.map(msg => {
        if (msg.valid)
          return {
            status: messageStatus.SUCCESS,
            parsedMsg: msg
          }
        return {
          status: messageStatus.FAILED,
          parsedMsg: msg
        }
      })

      const messageAdapterFixture = sinon.stub().callsFake(async msg => {
        if (!msg.valid) throw new Error(msg.invalid_message)
      })
      const batchOutputFixture = sinon
        .stub()
        .throws('batch error', 'forced test error: batch error')

      let loggerStub
      let consumer
      before(async () => {
        consumer = new Consumer({
          driver: stubDriver,
          asyncBatchOutput: batchOutputFixture,
          discardOnAdapterFailure: false,
          asyncMessageAdapter: messageAdapterFixture,
          batchSize: fakeMsgs.length
        })

        loggerStub = sinon.stub(logger, 'error')
        await consumer.start()

        await Promise.all(
          fakeRawMsgs.map(msg => consumer.consumerCallback(msg))
        )
      })

      after(async () => {
        await consumer.stop()
        loggerStub.restore()
      })

      it('should notify driver of batch failure only once', () => {
        expect(stubDriver.notifyBatchFailure.calledOnce).to.be.true
      })

      it('should notify driver with messages status', () => {
        const calls = stubDriver.notifyBatchFailure.getCalls()
        expect(calls).to.have.lengthOf(1)
        const [notifiedStatuses] = calls[0].args
        const parsedStatuses = notifiedStatuses.map(notifiedStatus => ({
          status: notifiedStatus.status,
          parsedMsg: JSON.parse(notifiedStatus.rawMsg.content.toString())
        }))
        expect(parsedStatuses).to.have.deep.members(fakeMsgsStatus)
      })

      it('should not notify driver of success', () => {
        expect(stubDriver.notifyBatchSuccess.called).to.be.false
      })

      it('should log errors', () => {
        expect(loggerStub.called).to.be.true
      })

      it('should properly log error message and stack', () => {
        loggerStub.getCalls().forEach(call => {
          const [message] = call.args
          expect(message).to.include.keys('error', 'stack')
        })
      })
    })
  })

  describe('when flushing batch', () => {
    context('when batch is empty', () => {
      const stubDriver = newDriverStub()
      const messageAdapterFixture = sinon.stub()
      const batchOutputFixture = sinon.stub()

      let consumer
      before(async () => {
        consumer = new Consumer({
          driver: stubDriver,
          asyncBatchOutput: batchOutputFixture,
          asyncMessageAdapter: messageAdapterFixture,
          batchSize: 1
        })

        sinon.spy(consumer, '_scheduleNextFlush')

        await consumer._flushBatch()
      })

      it('should not try to adapt messages', () => {
        expect(messageAdapterFixture.called).to.be.false
      })

      it('should not try to output batch', () => {
        expect(batchOutputFixture.called).to.be.false
      })

      it('should schedule the next flush', () => {
        expect(consumer._scheduleNextFlush.calledOnce).to.be.true
      })
    })
  })
})
