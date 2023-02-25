# RABBITMQ RPC (Request & Reply Pattern)

Check this tutorial about rpc queue using **rabbitmq** [here](https://www.rabbitmq.com/tutorials/tutorial-six-python.html) and check this tutorial about messaging pattern request & reply [here](https://www.enterpriseintegrationpatterns.com/RequestReply.html), if you need tutorial about rabbitmq check my repo [here](https://github.com/restuwahyu13/node-rabbitmq), or if you need other example rpc pattern using go [here](https://github.com/restuwahyu13/golang-rabbitmq-rpc).

## Server RPC

```ts
import { faker } from '@faker-js/faker'
import { RabbitMQ, consumerOverwriteResponse } from './rabbitmq'

const requestData: Record<string, any> = {
  id: faker.datatype.uuid(),
  name: faker.name.fullName(),
  country: faker.address.country(),
  city: faker.address.city(),
  postcode: faker.address.zipCode()
}

const replyTo: consumerOverwriteResponse = {
  data: requestData
}

const rabbitmq: InstanceType<typeof RabbitMQ> = new RabbitMQ()
rabbitmq.consumerRpc('account', replyTo)

process.on('SIGINT', function () {
  console.log(`Terminated process: ${process.pid} successfully`)
  process.exit(0)
})

setInterval(() => console.log('...........................'), 3000)
```

## Client RPC

```ts
import { faker } from '@faker-js/faker'
import { RabbitMQ, rpcResponse } from './rabbitmq'

const requestData: Record<string, any> = {
  id: faker.datatype.uuid(),
  name: faker.name.fullName(),
  country: faker.address.country(),
  city: faker.address.city(),
  postcode: faker.address.zipCode()
}

const rabbitmq: InstanceType<typeof RabbitMQ> = new RabbitMQ()

rabbitmq.publishRpc('account', requestData).then((value: rpcResponse) => {
  console.log(JSON.parse(value.data))
})
```

## Noted Important!

if queue name  is not deleted like this image below, after consumers consuming data from queue, because there is problem with your consumers.

![](https://i.imgur.com/NpczUuG.png)