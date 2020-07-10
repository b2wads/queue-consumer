# Queue Consumer
- [Consumer](#consumer)
  - [constructor](#consumer_constructor)
  - [start](#consumer_start)
  - [stop](#consumer_stop)

- [Driver](#driver)
  - [connect](#driver_connect)
  - [disconnect](#driver_disconnect)
  - [notifyBatchSuccess](#driver_notifybatchsuccess)
  - [notifyBatchFailure](#driver_notifybatchfailure)
  - [RabbitDriver](#rabbitdriver)
    - [constructor](#rabbitdriver_constructor)

## Consumer

### Consumer#constructor

```JavaScript
constructor({
  asyncMessageAdapter,
  asyncBatchOutput,
  batchSize,
  discardOnAdapterFailure,
  driver,
  errorHandler,
  maxFlushDelay,
  messageToObject
})
```

#### asyncMessageAdapter

- Type: asynchronous function
- Default: identity function

Asynchronous function that takes a message as argument and returns data to be output. By default this will be the identity function

#### asyncBatchOutput

- Type: asynchronous function
- Default: No default, this argument is required

Asynchronous function which takes an array containing all returns of `asyncMessageAdapter` and outputs it somewhere. This is required and has no default

#### batchSize

- Type: number
- Default: 10

Size of the batch. Default is 10.

#### discardOnAdapterFailure

- Type: boolean
- Default: true

Tells whether or not messages should be discarded if `asyncMessageAdapter` throws an exception. Default is true

#### driver

- Type: [Driver](#driver)
- Default: No default, this argument is required

[Driver](#driver) to use for connecting with the queue server.

#### errorHandler

- Type: function
- Default: logs errors to standard error output

Function to handle errors in `asyncMessageAdapter` and `asyncBatchOutput`.

If `discardOnAdapterFailure=true` this won't be used for `asyncMessageAdapter`.

#### maxFlushDelay

- Type: number
- Default: 10000

Maximum idle time allowed (in milliseconds) before the consumer will start processing an incomplete batch.

#### messageToObject

- Type: function
- Default: parses the contents from an amqplib message as a JavaScript object.

Function to convert a raw message from the driver to a JavaScript object.

### Consumer#start

Connects the consumer to the queue server and starts processing messages.

`Consumer#start()`

Returns a promise which resolves after the internal driver successfully connects to the queue server

### Consumer#stop

Disconnects the consumer from the queue server and stops processing messages. This termination is ungraceful, meaning unexpected errors can occur if messages are being processed when this function is called.

`Consumer#stop()`

Returns a promise which resolves after the internal driver successfully disconnects from the queue server

## Driver

A driver is an interface for connecting a consumer to a queue server.

### Driver#connect

TODO

