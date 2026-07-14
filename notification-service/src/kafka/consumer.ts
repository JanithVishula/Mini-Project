import { Kafka } from 'kafkajs';
import * as dotenv from 'dotenv';
import prisma from '../prisma';
import { buildNotification } from '../eventMessage';

dotenv.config();

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID!,
  brokers: process.env.KAFKA_BROKERS!.split(',')
});

const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ID! });

export async function startConsumer() {
  await consumer.connect();
  console.log('✅ Kafka consumer connected');

  await consumer.subscribe({ topic: 'order-events', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const raw = message.value?.toString();
      if (!raw) return;

      const event = JSON.parse(raw);
      const { userId, type, metadata } = event;

      const { title, message: text } = buildNotification(type);

      await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message: text,
          metadata: metadata ? JSON.stringify(metadata) : null
        }
      });

      console.log(`📨 [${type}] notification created for user ${userId}`);
      // In production: ALSO send a real email / push here
    }
  });
}
