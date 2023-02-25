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
