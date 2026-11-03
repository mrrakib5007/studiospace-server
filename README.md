# StudioSpace - Backend API Server

StudioSpace Server is a RESTful API built with Node.js, Express.js, and MongoDB. It handles authentication, studio listings, image uploads, booking management, user statistics, and double booking prevention with secure JWT based authorization.

---

## Live URL
- **Live Client Application:** [https://studiospace-pro.vercel.app](https://studiospace-pro.vercel.app)
- **Live Server API:** [https://api-studiospace.vercel.app](https://api-studiospace.vercel.app)

---

## Key Features

- **Secure Authentication** - JWT & HTTPOnly Cookie-based authentication.
- **Multiple Auth Support** - JWT and Better Auth session verification.
- **Studio Listings** - Create, update, delete and manage studio spaces.
- **Studio Discovery** - Browse studios by category, location and keyword.
- **Advanced Filtering** - Sort by price, rating and latest listings.
- **Pagination** - Load studio listings page by page.
- **Studio Booking** - Book studios with date and time selection.
- **Double Booking Protection** - Prevent overlapping confirmed reservations.
- **Booking Management** - Track, confirm, cancel and complete bookings.
- **Image Upload** - Upload and host images using ImgBB API.
- **User Dashboard Stats** - View bookings, owned studios and total spending.
- **MongoDB Integration** - Store and manage studio and booking data.
- **RESTful API** - Organized endpoints with JSON responses.
- **Error Handling** - Consistent API error and status responses.
- **CORS Support** - Configure cross-origin frontend access.
---

## Server Tech Stack

- **Runtime Environment:** Node.js (ES Modules)
- **Web Framework:** Express.js
- **Database:** MongoDB Atlas
- **Authentication & Security:**
  - JSON Web Token (JWT) for token generation and verification
  - Cookie-Parser for reading signed and unsigned HTTP cookies
  - CORS
  

## API Endpoints Reference

### Studio Listings
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/studios` | Get studios (supports `search`, `category`, `sort`, `limit`, `skip`, `userEmail`) | No |
| `GET` | `/api/studios/:id` | Get single studio details by MongoDB `_id` | No |
| `POST` | `/api/studios` | Create a new studio listing | **Yes (verifyJWT)** |
| `PUT` | `/api/studios/:id` | Update an existing studio listing | **Yes (verifyJWT)** |
| `DELETE` | `/api/studios/:id` | Delete a studio listing by `_id` | **Yes (verifyJWT)** |

### Bookings & Reservations
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/bookings` | Retrieve user bookings (query by `userEmail`) | No |
| `POST` | `/api/bookings` | Book studio slot (with double-booking check) | **Yes (verifyJWT)** |
| `PATCH` | `/api/bookings/:id/cancel` | Cancel a booking (only allowed if `Pending`) | **Yes (verifyJWT)** |
| `PATCH` | `/api/bookings/:id/status` | Update booking status (`Confirmed`, `Completed`, etc.) | **Yes (verifyJWT)** |

### Analytics & Utilities
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/user-stats` | Aggregated user stats (`totalBookings`, `totalSpent`, etc.) | No (query: `email`) |
| `POST` | `/api/upload` | Secure image upload gateway to ImgBB | No |
| `GET` | `/` | Health check endpoint | No |

---

## Environment Variables Setup

Create a `.env` file in the `server/` directory:

```env
# Server Port
PORT=5000

# MongoDB Connection String (MongoDB Atlas)
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/studio_space?retryWrites=true&w=majority

# JWT Token Secret Keys
JWT_SECRET=your_jwt_secret_key_here
ACCESS_TOKEN_SECRET=your_access_token_secret_here

# ImgBB API Key for Image Uploads
IMGBB_API_KEY=your_imgbb_api_key_here

# Allowed Client Origin (for CORS)
CLIENT_URL=http://localhost:3000
```

---

## Local Setup & Installation

Follow these steps to run the backend server locally:

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- A free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster database

### 2. Navigate to the Server Directory
```bash
cd server
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables
Create a `.env` file in `server/` with the required keys described above:
```bash
cp .env.example .env # or create .env directly
```

### 5. Start the Server

**Development Mode (with auto-reload):**
```bash
npm run dev
```

**Production Mode:**
```bash
npm start
```

The API server will start on:
```
http://localhost:5000
```

To verify the server is running, visit `http://localhost:5000` in your browser. You should receive:
```json
"Studio Space Server is Running"
```
