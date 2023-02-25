import { faker } from '@faker-js/faker'
import { RabbitMQ, consumerRpcResponse } from './rabbitmq'

const requestData: Record<string, any> = {
  id: faker.datatype.uuid(),
  name: faker.name.fullName(),
  country: faker.address.country(),
  city: faker.address.city(),
  postcode: faker.address.zipCode()
}

const rabbitmq: InstanceType<typeof RabbitMQ> = new RabbitMQ()

rabbitmq.publishRpc('account', requestData).then((value: consumerRpcResponse) => {
  console.log(`From consumer rpc in client rpc: `, value)
})
