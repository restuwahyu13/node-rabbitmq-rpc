import 'dotenv/config'
import rabbitmq, { Channel, Connection, ConsumeMessage, Replies } from 'amqplib'
import shortid from 'short-uuid'
import delay from 'delay'
import { Mutex } from 'async-mutex'
import { nextTick } from 'process'

enum exchangeType {
  Direct = 'direct',
  Topic = 'topic',
  Fanout = 'fanout',
  Header = 'header'
}

interface publishMetadata {
  correlationId: string
  replyTo: string
  contentType: string
  timestamp: string
}

export interface consumerRpcResponse {
  readonly data: any
  resolve?: (value: any) => void
  reject?: (err: any) => void
}

export interface consumerOverwriteResponse {
  correlationId?: string
  replyTo?: string
  contentType?: string
  timestamp?: string
  data: Record<string, any> | any[]
}

export class RabbitMQ {
  private url: string = ''
  private exchangeName: string = ''
  private uuid: string = ''
  private rpcQueue: string = ''
  private publishMetadata: publishMetadata = {
    correlationId: '',
    replyTo: '',
    contentType: '',
    timestamp: ''
  }
  private requestPublishMetadata: publishMetadata[] = []
  private mutex: InstanceType<typeof Mutex> | undefined = undefined
  private rpcResponse: consumerRpcResponse = {
    data: '',
    resolve: Promise.resolve,
    reject: Promise.reject
  }

  constructor() {
    this.url = process.env.AMQP_URL
    this.exchangeName = process.env.EXCHANGE_NAME
    this.uuid = shortid().generate()
    this.mutex = new Mutex()
  }

  private async amqpConnection(): Promise<Connection> {
    try {
      const con: Connection = await rabbitmq.connect(this.url)
      if (!con) {
        console.error('AMQP client not connected')
        this.rpcResponse.reject(new Error(`AMQP client not connected`))

        con.close()
      }

      return con
    } catch (err: any) {
      console.error(`AMQP client error: ${err.message}`)
      this.rpcResponse.reject(new Error(`AMQP client error: ${err.message}`))

      return err
    }
  }

  private async amqpChannel(con: Connection): Promise<Channel> {
    try {
      const channel: Channel = await con.createChannel()
      if (!channel) {
        console.error('AMQP channel not found')
        this.rpcResponse.reject(new Error(`AMQP channel not found`))

        channel.close()
      }

      return channel
    } catch (err: any) {
      console.error(`AMQP channel error: ${err.message}`)
      this.rpcResponse.reject(new Error(`AMQP channel error: ${err.message}`))

      return err
    }
  }

  private async listeningConsumer(ch: Channel, metadata: publishMetadata): Promise<void> {
    this.rpcQueue = metadata.replyTo
    console.info('START CLIENT CONSUMER RPC -> %s', this.rpcQueue)

    try {
      const assertExchange: Replies.AssertExchange = await ch.assertExchange(this.exchangeName, exchangeType.Direct, { durable: true })
      const assertQueue: Replies.AssertQueue = await ch.assertQueue(this.rpcQueue, { durable: true, autoDelete: true })

      await ch.bindExchange(assertExchange.exchange, assertExchange.exchange, assertQueue.queue)
      await ch.bindQueue(assertQueue.queue, assertExchange.exchange, assertQueue.queue)

      ch.consume(assertQueue.queue, (delivery: ConsumeMessage) => {
        if (this.publishMetadata.correlationId != delivery.properties.correlationId) {
          ch.nack(delivery, false, true)
          this.listeningConsumerRpc(delivery)
        }

        this.listeningConsumerRpc(delivery)
        ch.ack(delivery)
      })
    } catch (err: any) {
      this.rpcResponse.reject(new Error(`Consumer error: ${err.message}`))
    }
  }

  private listeningConsumerRpc(delivery: ConsumeMessage): void {
    for (let d of this.requestPublishMetadata) {
      if (d.correlationId == delivery.properties.correlationId) {
        this.rpcResponse.resolve(JSON.parse(delivery.content.toString()))
      } else {
        this.rpcResponse.resolve(JSON.stringify({ data: '' }))
      }
    }
  }

  async publishRpc(queue: string, data: any): Promise<any> {
    console.info('START PUBLISHER RPC -> %s', queue)

    try {
      const con: Connection = await this.amqpConnection()
      const ch: Channel = await this.amqpChannel(con)

      this.publishMetadata.correlationId = this.uuid
      this.publishMetadata.replyTo = `rpc.${this.uuid}`
      this.publishMetadata.contentType = 'application/json'
      this.publishMetadata.timestamp = new Date().toISOString()

      await this.mutex.acquire()
      this.requestPublishMetadata.push(this.publishMetadata)

      if (this.mutex.isLocked() && this.requestPublishMetadata.length) {
        this.mutex.release()
      }

      await this.listeningConsumer(ch, this.publishMetadata)

      const assertExchange: Replies.AssertExchange = await ch.assertExchange(this.exchangeName, exchangeType.Direct, { durable: true })
      await ch.bindExchange(assertExchange.exchange, assertExchange.exchange, queue)

      const isPublish: boolean = await ch.sendToQueue(queue, Buffer.from(JSON.stringify(data)), {
        persistent: true,
        correlationId: this.publishMetadata.correlationId,
        replyTo: this.publishMetadata.replyTo,
        contentType: this.publishMetadata.contentType,
        expiration: 60 * 60 // 1 hours
      })

      if (!isPublish) {
        console.error('Publishing data into queue failed: %v', isPublish)
        return this.rpcResponse.reject(new Error(`Publishing data into queue failed: ${isPublish}`))
      }

      nextTick(async () => {
        await delay(10)
        con.close()
      })

      return new Promise((resolve: (value: any) => void, reject: (err: any) => void): void => {
        this.rpcResponse.resolve = resolve
        this.rpcResponse.reject = reject
      })
    } catch (err: any) {
      return this.rpcResponse.reject(`Publisher error: ${err.message}`)
    }
  }

  async consumerRpc(queue: string, consumerOverwriteResponse?: consumerOverwriteResponse): Promise<void> {
    console.info('START SERVER CONSUMER RPC -> %s', queue)

    try {
      const con: Connection = await this.amqpConnection()
      const ch: Channel = await this.amqpChannel(con)

      const assertExchange: Replies.AssertExchange = await ch.assertExchange(this.exchangeName, exchangeType.Direct, { durable: true })
      const assertQueue: Replies.AssertQueue = await ch.assertQueue(queue, { durable: true, autoDelete: false })

      await ch.bindExchange(assertExchange.exchange, assertExchange.exchange, assertQueue.queue)
      await ch.bindQueue(assertQueue.queue, assertExchange.exchange, assertQueue.queue)

      await ch.consume(assertQueue.queue, async (delivery: ConsumeMessage): Promise<void> => {
        console.info('CONSUMER CORRELATIONID: ', delivery.properties.correlationId)
        console.info('CONSUMER REPLY TO: ', delivery.properties.replyTo)

        let bodyContent: consumerOverwriteResponse = {
          data: {},
          correlationId: '',
          replyTo: '',
          contentType: '',
          timestamp: ''
        }

        if (consumerOverwriteResponse && consumerOverwriteResponse.data) {
          consumerOverwriteResponse.correlationId = delivery.properties.correlationId
          consumerOverwriteResponse.replyTo = delivery.properties.replyTo
          consumerOverwriteResponse.contentType = delivery.properties.contentType
          consumerOverwriteResponse.timestamp = new Date().toISOString()

          bodyContent = consumerOverwriteResponse
        } else {
          bodyContent.data = JSON.parse(delivery.content.toString())
          bodyContent.correlationId = delivery.properties.correlationId
          bodyContent.replyTo = delivery.properties.replyTo
          bodyContent.contentType = delivery.properties.contentType
          bodyContent.timestamp = new Date().toISOString()
        }

        const isPublish: boolean = await ch.sendToQueue(delivery.properties.replyTo, Buffer.from(JSON.stringify(bodyContent)), {
          persistent: true,
          correlationId: delivery.properties.correlationId,
          replyTo: delivery.properties.replyTo,
          contentType: delivery.properties.contentType,
          expiration: delivery.properties.expiration
        })

        for (let d of this.requestPublishMetadata) {
          if (!isPublish || d.correlationId != delivery.properties.correlationId) {
            ch.nack(delivery, false, true)
          }
        }

        ch.ack(delivery)
      })
    } catch (err: any) {
      console.error(`Consumer error: ${err.message}`)
    }
  }
}
