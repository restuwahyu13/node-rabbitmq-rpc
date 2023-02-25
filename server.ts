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
