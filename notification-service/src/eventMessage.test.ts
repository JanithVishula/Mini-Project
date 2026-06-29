import { buildNotification } from './eventMessage';

describe('buildNotification', () => {
  it('returns the correct title/message for ORDER_PLACED', () => {
    const result = buildNotification('ORDER_PLACED');
    expect(result.title).toBe('Order Placed');
    expect(result.message).toBe('Your order has been placed successfully!');
  });

  it('returns the correct title for ORDER_CONFIRMED', () => {
    expect(buildNotification('ORDER_CONFIRMED').title).toBe('Order Confirmed');
  });

  it('returns the correct title for ORDER_DELIVERED', () => {
    expect(buildNotification('ORDER_DELIVERED').title).toBe('Delivered');
  });

  it('returns the correct title for ORDER_CANCELLED', () => {
    expect(buildNotification('ORDER_CANCELLED').title).toBe('Cancelled');
  });

  it('returns the correct title for DELIVERY_ASSIGNED', () => {
    expect(buildNotification('DELIVERY_ASSIGNED').title).toBe('Rider Assigned');
  });

  // EDGE CASE: an unknown event type should hit the default branch
  it('returns a generic notification for an unknown type', () => {
    const result = buildNotification('SOMETHING_RANDOM');
    expect(result.title).toBe('Notification');
    expect(result.message).toBe('You have a new notification.');
  });

  // EDGE CASE: empty string should also hit the default
  it('returns a generic notification for an empty string', () => {
    expect(buildNotification('').title).toBe('Notification');
  });

  // Verify the shape: always returns both title and message
  it('always returns an object with title and message', () => {
    const result = buildNotification('ORDER_READY');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('message');
  });
});
