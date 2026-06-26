import { Kafka, Producer } from 'kafkajs';
import * as dotenv from 'dotenv';

dotenv.config();

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID!,
  brokers: process.env.KAFKA_BROKERS!.split(',')
});

const producer: Producer = kafka.producer();
let connected = false;

export async function connectProducer() {
  if (!connected) {
    await producer.connect();
    connected = true;
    console.log('✅ Kafka producer connected');
  }
}

export async function publishEvent(userId: string, type: string, metadata?: any) {
  try {
    await producer.send({
      topic: 'order-events',
      messages: [
        { key: userId, value: JSON.stringify({ userId, type, metadata }) }
      ]
    });
    console.log(`📤 Published ${type} for user ${userId}`);
  } catch (err) {
    console.error('Failed to publish event:', err);
  }
}
