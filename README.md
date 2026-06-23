# QuickBite - Food Delivery Platform

A microservices-based food delivery application built with Node.js, TypeScript, PostgreSQL, Docker, and React.

## Services

| Service | Port | Description |
|---|---|---|
| api-gateway | 3000 | Routes all incoming requests to the right service |
| auth-service | 3001 | Handles register, login, JWT tokens |
| restaurant-service | 3002 | Restaurants and menu items |
| order-service | 3003 | Placing and tracking orders |
| delivery-service | 3004 | Assigning riders, tracking deliveries |
| notification-service | 3005 | Emails and status notifications |

## Tech Stack

- **Backend:** Node.js + TypeScript + Express
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** JWT (JSON Web Tokens)
- **Containerization:** Docker + docker-compose
- **CI/CD:** GitHub Actions
- **Frontend:** React + TypeScript
