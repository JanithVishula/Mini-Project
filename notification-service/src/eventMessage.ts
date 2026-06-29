export function buildNotification(type: string): { title: string; message: string } {
  switch (type) {
    case 'ORDER_PLACED':
      return { title: 'Order Placed', message: 'Your order has been placed successfully!' };
    case 'ORDER_CONFIRMED':
      return { title: 'Order Confirmed', message: 'The restaurant confirmed your order.' };
    case 'ORDER_PREPARING':
      return { title: 'Preparing', message: 'Your food is being prepared.' };
    case 'ORDER_READY':
      return { title: 'Ready', message: 'Your order is ready.' };
    case 'ORDER_OUT_FOR_DELIVERY':
      return { title: 'On the Way', message: 'Your order is out for delivery!' };
    case 'ORDER_DELIVERED':
      return { title: 'Delivered', message: 'Your order has been delivered. Enjoy!' };
    case 'ORDER_CANCELLED':
      return { title: 'Cancelled', message: 'Your order was cancelled.' };
    case 'DELIVERY_ASSIGNED':
      return { title: 'Rider Assigned', message: 'A rider has been assigned to your order.' };
    default:
      return { title: 'Notification', message: 'You have a new notification.' };
  }
}
