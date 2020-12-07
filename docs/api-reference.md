# Queue Consumer

#### Table of Contents
- [Consumer](#consumer)
  - [constructor](#consumerconstructoroptions)
  - [start](#consumerstart)
  - [stop](#consumerstop)
- [Driver](#driver)
  - [connect](#driverconnectcallback)
  - [disconnect](#driverdisconnect)
  - [notifyBatchSuccess](#drivernotifybatchsuccessmessageBatch)
  - [notifyBatchFailure](#drivernotifybatchfailuremessageBatch)
- [RabbitDriver](#rabbitdriver)
  - [constructor](#rabbitdriverconstructoroptions)
- [MessageStatus](#messagestatus)


## Consumer

### Consumer#constructor(options)

Instantiates a new Consumer

- returns: new Consumer instance


- options:

| option              | type            | description         | default     |
| :------------------ | :-------------: | :-----------------: | --------------: |
| asyncBatchOutput    |  async function | function which takes an array of all returns from `asyncMessageAdapter` and outputs it somewhere | no default, required |
| asyncMessageAdapter |  async function | function which takes a message and returns data to be output | identity function |
| batchSize           |  number         | size of the batch   | 10 |
| discardOnAdapterFailure |  boolean    | whether or not messages should be discarded if `asyncMessageAdapter` throws an exception | true |
| driver              | [Driver](#driver) | [Driver](#driver) to use for communicating with the queue server | no default, required |
| errorHandler        |  function       | function to handle errors in `asyncMessageAdapter` (only if `discardOnAdapterFailure=false`) and `asyncBatchOutput` | logs errors to standard error |
| maxFlushDelay       |  number         | Maximum time (in milliseconds) before the consumer will start processing an incomplete batch | 10000 |
| messageToObject     |  function       | Function to convert a raw message from the driver to a JavaScript object | converts contents from an amqplib message |

### Consumer#start()

Connects the consumer to the queue server and starts processing messages.

- returns: promise which resolves after the internal driver successfully connects to the queue server

### Consumer#stop()

Disconnects the consumer from the queue server and stops processing messages. This termination is ungraceful, meaning unexpected errors can occur if messages are being processed when this function is called.

- returns: promise which resolves after the internal driver successfully disconnects from the queue server

## Driver

A driver is an interface for connecting a consumer to a queue server.

### Driver#connect(callback)

Connects the driver to the queue server

- returns: promise which resolves after a connection is successfully established

- callback: function to be called for each message fetched from the queue. The callback takes the retrieved message as its only argument

### Driver#disconnect()

Disconnects the driver from the queue server

- returns: promise which resolves after the connection has been closed

### Driver#notifyBatchSuccess(messageBatch)

Notifies queue server that a batch has finished processing.

- returns: promise which resolves after the server has received the status of all messages

- messageBatch: array of objects, where each object contains the following attributes:
  - status: processing status of the message. One of [MessageStatus](#message-status)
  - rawMsg: message as received from the driver, without any alteration

### Driver#notifyBatchFailure(messageBatch)

Notifies queue server that a batch has failed.

- returns: promise which resolves after the server has received the status of all messages

- messageBatch: array of objects, where each object contains the following attributes:
  - status: processing status of the message. One of [MessageStatus](#message-status)
  - rawMsg: message as received from the driver, without any alteration

## RabbitDriver

An implementation of [Driver](#driver), designed for communication with a RabbitMQ server.

### RabbitDriver#constructor(options)


Instantiates a new RabbitDriver

- returns: new RabbitDriver instance


- options:

| option              | type            | description         | default     |
| :------------------ | :-------------: | :-----------------: | --------------: |
| batchSize           |  number         | size of the batch   | no default, required |
| extraPrefetchPercentage | number      | factor of extra messages to keep in buffer while a batch is being processed. eg.: a value of 0.5 will cause the driver to fetch 50% of the next batch while the current batch is being processed | 1.0 |
| keepAlive    | boolean                | whether the driver should try to connect again in case of a connection failure | true |
| maxConnectionRetries | number         | maximum number of reconnection attempts the driver is allowed to make | 3 |
| queue               | string          | RabbitMQ queue from which to fetch messages | no default, required |
| requeueOnFailure     | boolean        | whether the driver should requeue messages in case of a failure | true |
| retryDelay | number | time to wait idly (in milliseconds) before attempting a reconnection | 1000 |
| uri                 | string          | uri identifying the RabbitMQ server | no default, required |

## MessageStatus

Enumerator of all possible message status. Contains the following values:

- SUCCESS: message was successfully processed
- FAILED: message processing failed
- DISCARDED: message was not processed because it was intentionally discarded

