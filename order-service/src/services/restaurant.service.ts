import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const RESTAURANT_SERVICE_URL = process.env.RESTAURANT_SERVICE_URL!;

export async function getRestaurantWithMenu(restaurantId: string, token: string) {
  try {
    const response = await axios.get(
      `${RESTAURANT_SERVICE_URL}/restaurants/${restaurantId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  } catch (error) {
    return null;
  }
}
