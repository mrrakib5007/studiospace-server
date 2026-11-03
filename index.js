import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

const app = express();
const PORT = process.env.PORT || 5000;

// Allowed CORS origins
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5000",
  "https://studiospace-pro.vercel.app",
  "https://api-studiospace.vercel.app",
  process.env.CLIENT_URL,
].filter(Boolean);

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("studio_space");
const studiosCollection = db.collection("studios");
const bookingsCollection = db.collection("bookings");

// HTTPOnly Cookie Configuration
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
};

// JWT Verification Middleware for mutations
export const verifyJWT = async (req, res, next) => {
  // Check for JWT token in HTTPOnly cookies or Authorization header
  const token =
    req.cookies?.token ||
    (req.headers?.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.split(" ")[1]
      : null);

  // Check for better auth session cookie if token cookie not present
  const betterAuthToken =
    req.cookies?.["better-auth.session_token"] ||
    req.cookies?.["__Secure-better-auth.session_token"];

  if (!token && !betterAuthToken) {
    return res.status(401).json({
      success: false,
      message: "401 Unauthorized: Access token missing",
    });
  }

  if (token) {
    try {
      const secret =
        process.env.ACCESS_TOKEN_SECRET ||
        process.env.JWT_SECRET;
      const decoded = jwt.verify(token, secret);
      req.user = decoded;
      return next();
    } catch (err) {
      if (!betterAuthToken) {
        return res.status(401).json({
          success: false,
          message: "401 Unauthorized: Invalid or expired access token",
        });
      }
    }
  }

  // Fallback check for Better-Auth session in database
  if (betterAuthToken) {
    try {
      const sessionsCollection = db.collection("session");
      const sessionDoc = await sessionsCollection.findOne({
        token: betterAuthToken,
        expiresAt: { $gt: new Date() },
      });

      if (sessionDoc) {
        const usersCollection = db.collection("user");
        const userDoc = await usersCollection.findOne({
          _id: sessionDoc.userId,
        });
        req.user = {
          id: sessionDoc.userId,
          email: userDoc?.email || sessionDoc.userId,
          name: userDoc?.name,
        };
        return next();
      }
    } catch (sessionErr) {
      console.error("Session verification error:", sessionErr);
    }
  }

  return res.status(401).json({
    success: false,
    message: "401 Unauthorized: Access denied",
  });
};

// Issue JWT and store in HTTPOnly Cookie
app.post("/api/jwt", async (req, res) => {
  try {
    const user = req.body || {};
    if (!user.email) {
      return res.status(400).json({
        success: false,
        message: "User email is required to issue JWT",
      });
    }

    const secret = process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;

    const token = jwt.sign(
      { email: user.email, name: user.name},
      secret,
      { expiresIn: "7d" }
    );

    res
      .cookie("token", token, cookieOptions)
      .status(200)
      .json({
        success: true,
        message: "JWT stored in HTTPOnly cookie successfully",
        token,
      });
  } catch (error) {
    console.error("Error creating JWT:", error);
    res.status(500).json({
      success: false,
      message: "Failed to issue JWT token",
      error: error.message,
    });
  }
});

// Logout endpoint: clears HTTPOnly JWT cookie
app.post("/api/logout", async (req, res) => {
  try {
    res
      .clearCookie("token", cookieOptions)
      .status(200)
      .json({
        success: true,
        message: "Logged out and cleared HTTPOnly cookie successfully",
      });
  } catch (error) {
    console.error("Error clearing cookie on logout:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clear authentication cookie",
      error: error.message,
    });
  }
});

// API check
app.get("/", (req, res) => {
  res.send("Server is online");
});

// Image Upload
app.post("/api/upload", async (req, res) => {
  try {
    const { image, name } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        message: "No image data provided for upload",
      });
    }

    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "IMGBB_API_KEY is not configured on the server",
      });
    }

    // Extract raw base64 string if data URL is provided
    const base64Data = image.includes("base64,")
      ? image.split("base64,")[1]
      : image;

    const buffer = Buffer.from(base64Data, "base64");
    const blob = new Blob([buffer], { type: "image/jpeg" });

    const form = new FormData();
    form.append("image", blob, name || "photo.jpg");

    const imgbbRes = await fetch(
      `https://api.imgbb.com/1/upload?key=${apiKey}`,
      {
        method: "POST",
        body: form,
      },
    );

    const data = await imgbbRes.json();

    if (!data.success) {
      console.error("ImgBB upload failed:", data);
      return res.status(400).json({
        success: false,
        message: data?.error?.message || "Failed to upload image to ImgBB",
      });
    }

    const imageUrl = data?.data?.display_url || data?.data?.url;

    res.status(200).json({
      success: true,
      url: imageUrl,
      data: data.data,
    });
  } catch (error) {
    console.error("Error in /api/upload:", error);
    res.status(500).json({
      success: false,
      message: "Server error while uploading image",
      error: error.message,
    });
  }
});

// Get Studios
app.get("/api/studios", async (req, res) => {
  try {
    const { category, search, sort, limit, page, ownerEmail } = req.query;
    const filter = {};

    // Filter by owner email (e.g. for user's own studio listings)
    if (ownerEmail && ownerEmail.trim() !== "") {
      filter.ownerEmail = ownerEmail.trim();
    }

    // Filter by category
    if (category && category !== "All") {
      let catPattern = category.trim();
      if (/^photo studio/i.test(catPattern)) catPattern = "Photo Studio";
      else if (/^(film stage|sound stage)/i.test(catPattern))
        catPattern = "Film Stage";
      else if (/^podcast (lounge|room)/i.test(catPattern))
        catPattern = "Podcast Lounge";
      else if (/^music suite/i.test(catPattern)) catPattern = "Music Suite";
      else if (/^art workshop/i.test(catPattern)) catPattern = "Art Workshop";

      filter.category = { $regex: new RegExp(`^${catPattern}$`, "i") };
    }

    // Search by title, location or category
    if (search && search.trim() !== "") {
      const searchRegex = { $regex: search.trim(), $options: "i" };
      filter.$or = [
        { title: searchRegex },
        { location: searchRegex },
        { category: searchRegex },
      ];
    }

    // Sorting
    let sortQuery = { createdAt: -1 };
    if (sort === "price-low" || sort === "price-asc") {
      sortQuery = { hourlyRate: 1 };
    } else if (sort === "price-high" || sort === "price-desc") {
      sortQuery = { hourlyRate: -1 };
    } else if (sort === "rating-high" || sort === "rating-desc") {
      sortQuery = { rating: -1 };
    } else if (sort === "newest") {
      sortQuery = { createdAt: -1 };
    }

    // Count total matching documents
    const total = await studiosCollection.countDocuments(filter);

    // Pagination defaults: 12 studios per page
    const parsedLimit = limit ? Math.max(1, parseInt(limit, 10)) : 12;
    const parsedPage = page ? Math.max(1, parseInt(page, 10)) : 1;
    const skip = (parsedPage - 1) * parsedLimit;

    const totalPages = Math.ceil(total / parsedLimit);
    const hasMore = parsedPage < totalPages;

    const studios = await studiosCollection
      .find(filter)
      .sort(sortQuery)
      .skip(skip)
      .limit(parsedLimit)
      .toArray();

    res.status(200).json({
      success: true,
      count: studios.length,
      total,
      page: parsedPage,
      totalPages,
      hasMore,
      studios,
    });
  } catch (error) {
    console.error("Error fetching studios:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch studios",
      error: error.message,
    });
  }
});

// Get studio details by id
app.get("/api/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        message: "Studio workspace not found",
      });
    }

    const studio = await studiosCollection.findOne({ _id: new ObjectId(id) });
    if (!studio) {
      return res.status(404).json({
        success: false,
        message: "Studio workspace not found",
      });
    }

    res.status(200).json({
      success: true,
      studio,
    });
  } catch (error) {
    console.error("Error fetching studio details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch studio details",
      error: error.message,
    });
  }
});

// Create New Studio
app.post("/api/studios", verifyJWT, async (req, res) => {
  try {
    const {
      title,
      category,
      hourlyRate,
      securityDeposit,
      maxCapacity,
      location,
      image,
      amenities,
      overview,
      ownerName,
      ownerEmail,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Studio title is required",
      });
    }

    if (!location || !location.trim()) {
      return res.status(400).json({
        success: false,
        message: "Location is required",
      });
    }

    if (!hourlyRate || isNaN(Number(hourlyRate)) || Number(hourlyRate) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid hourly rate is required",
      });
    }

    // Default creative studio image fallback if empty
    const defaultImage =
      image && image.trim() !== ""
        ? image.trim()
        : "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=1200&auto=format&fit=crop";

    const newStudio = {
      title: title.trim(),
      category: category ? category.trim() : "Photo Studio",
      hourlyRate: Number(hourlyRate),
      securityDeposit:
        securityDeposit && !isNaN(Number(securityDeposit))
          ? Number(securityDeposit)
          : 150,
      maxCapacity:
        maxCapacity && !isNaN(Number(maxCapacity)) ? Number(maxCapacity) : 15,
      location: location.trim(),
      image: defaultImage,
      amenities: Array.isArray(amenities) ? amenities : [],
      overview: overview,
      rating: 5.0,
      reviewCount: 0,
      ownerName: ownerName,
      ownerEmail: ownerEmail,
      createdAt: new Date(),
      images: [],
    };

    const result = await studiosCollection.insertOne(newStudio);

    res.status(201).json({
      success: true,
      message: "Studio workspace listed successfully!",
      insertedId: result.insertedId,
      studio: { ...newStudio, _id: result.insertedId },
    });
  } catch (error) {
    console.error("Error creating studio workspace:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create studio workspace",
      error: error.message,
    });
  }
});

// Update Studio by id
app.put("/api/studios/:id", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        message: "Studio workspace not found",
      });
    }

    const {
      title,
      category,
      hourlyRate,
      securityDeposit,
      maxCapacity,
      location,
      image,
      amenities,
      overview,
    } = req.body;

    const updateDoc = {};

    if (title && title.trim()) updateDoc.title = title.trim();
    if (category && category.trim()) updateDoc.category = category.trim();
    if (hourlyRate !== undefined && !isNaN(Number(hourlyRate))) {
      updateDoc.hourlyRate = Number(hourlyRate);
    }
    if (securityDeposit !== undefined && !isNaN(Number(securityDeposit))) {
      updateDoc.securityDeposit = Number(securityDeposit);
    }
    if (maxCapacity !== undefined && !isNaN(Number(maxCapacity))) {
      updateDoc.maxCapacity = Number(maxCapacity);
    }
    if (location && location.trim()) updateDoc.location = location.trim();
    if (image && image.trim()) updateDoc.image = image.trim();
    if (Array.isArray(amenities)) updateDoc.amenities = amenities;
    if (overview !== undefined) updateDoc.overview = overview.trim();
    updateDoc.updatedAt = new Date();

    const result = await studiosCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateDoc }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Studio workspace not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Studio workspace updated successfully!",
    });
  } catch (error) {
    console.error("Error updating studio workspace:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update studio workspace",
      error: error.message,
    });
  }
});

// Delete Studio by id
app.delete("/api/studios/:id", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        message: "Studio workspace not found",
      });
    }

    const result = await studiosCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Studio workspace not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Studio listing deleted successfully!",
    });
  } catch (error) {
    console.error("Error deleting studio workspace:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete studio workspace",
      error: error.message,
    });
  }
});

// Helper to convert HH:MM string to minutes
function timeToMinutes(timeStr, fallbackMinutes = 0) {
  if (!timeStr || typeof timeStr !== "string") return fallbackMinutes;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallbackMinutes;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return hours * 60 + minutes;
}

// Helper to check if two intervals overlap
function isTimeOverlapping(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

// Create new Booking
app.post("/api/bookings", verifyJWT, async (req, res) => {
  try {
    const {
      studioId,
      studioTitle,
      studioImage,
      studioLocation,
      category,
      hourlyRate,
      userEmail,
      userName,
      bookingDate,
      startTime,
      endTime,
      totalHours,
      totalPrice,
    } = req.body;

    if (!userEmail || !userEmail.trim()) {
      return res.status(400).json({
        success: false,
        message: "User email is required to book a studio",
      });
    }

    if (!bookingDate) {
      return res.status(400).json({
        success: false,
        message: "Booking date is required",
      });
    }

    if (!studioId) {
      return res.status(400).json({
        success: false,
        message: "Studio ID is required to book a studio",
      });
    }

    const studioIdStr = String(studioId).trim();
    const requestedDate = String(bookingDate).trim();
    const reqStartStr = startTime || "10:00";
    const parsedHours = Number(totalHours) > 0 ? Number(totalHours) : 1;

    // Convert requested slot to minutes
    const reqStartMinutes = timeToMinutes(reqStartStr, 600);
    let reqEndMinutes = timeToMinutes(
      endTime,
      reqStartMinutes + parsedHours * 60
    );
    if (reqEndMinutes <= reqStartMinutes) {
      reqEndMinutes = reqStartMinutes + parsedHours * 60;
    }

    // Double Booking Prevention
    const existingConfirmed = await bookingsCollection
      .find({
        studioId: studioIdStr,
        bookingDate: requestedDate,
        status: { $regex: /^confirmed$/i },
      })
      .toArray();

    // Check for collision
    const collision = existingConfirmed.find((confirmedBooking) => {
      const exStartMinutes = timeToMinutes(confirmedBooking.startTime, 600);
      const exHours =
        Number(confirmedBooking.totalHours) > 0
          ? Number(confirmedBooking.totalHours)
          : 1;
      let exEndMinutes = timeToMinutes(
        confirmedBooking.endTime,
        exStartMinutes + exHours * 60
      );
      if (exEndMinutes <= exStartMinutes) {
        exEndMinutes = exStartMinutes + exHours * 60;
      }

      return isTimeOverlapping(
        reqStartMinutes,
        reqEndMinutes,
        exStartMinutes,
        exEndMinutes
      );
    });

    if (collision) {
      const conflictStart = collision.startTime || "start time";
      const conflictEnd = collision.endTime || "end time";
      return res.status(409).json({
        success: false,
        message: `Double-Booking Collision: This studio already has a Confirmed reservation on ${requestedDate} from ${conflictStart} to ${conflictEnd}. Please select an alternative time slot or date.`,
        conflict: {
          studioId: studioIdStr,
          bookingDate: requestedDate,
          startTime: conflictStart,
          endTime: conflictEnd,
        },
      });
    }

    const newBooking = {
      studioId: studioIdStr,
      studioTitle: studioTitle || "Creative Studio Space",
      studioImage:
        studioImage ||
        "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=1200&auto=format&fit=crop",
      studioLocation: studioLocation || "Location on request",
      category: category || "Studio Space",
      hourlyRate: Number(hourlyRate) || 0,
      userEmail: userEmail.trim(),
      userName: userName || "Creator",
      bookingDate: requestedDate,
      startTime: reqStartStr,
      endTime:
        endTime ||
        `${String(Math.floor(reqEndMinutes / 60)).padStart(2, "0")}:${String(
          reqEndMinutes % 60
        ).padStart(2, "0")}`,
      totalHours: parsedHours,
      totalPrice: Number(totalPrice) || 0,
      status: "Pending", // Default status per specification
      createdAt: new Date(),
    };

    const result = await bookingsCollection.insertOne(newBooking);

    res.status(201).json({
      success: true,
      message: "Studio reservation requested successfully!",
      insertedId: result.insertedId,
      booking: { ...newBooking, _id: result.insertedId },
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create booking reservation",
      error: error.message,
    });
  }
});

// Get Bookings
app.get("/api/bookings", async (req, res) => {
  try {
    const { userEmail } = req.query;
    const filter = {};

    if (userEmail && userEmail.trim() !== "") {
      filter.userEmail = userEmail.trim();
    }

    const bookings = await bookingsCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error.message,
    });
  }
});

// Cancel a Booking
app.patch("/api/bookings/:id/cancel", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        message: "Booking reservation not found",
      });
    }

    const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking reservation not found",
      });
    }

    if (booking.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: `Only pending reservations can be cancelled. Current status is ${booking.status}.`,
      });
    }

    await bookingsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: "Cancelled",
          cancelledAt: new Date(),
        },
      }
    );

    res.status(200).json({
      success: true,
      message: "Booking reservation cancelled successfully!",
    });
  } catch (error) {
    console.error("Error cancelling booking:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel booking reservation",
      error: error.message,
    });
  }
});

// double booking protection when confirming
app.patch("/api/bookings/:id/status", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        message: "Booking reservation not found",
      });
    }

    const validStatuses = ["Pending", "Confirmed", "Completed", "Cancelled"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const targetBooking = await bookingsCollection.findOne({
      _id: new ObjectId(id),
    });
    if (!targetBooking) {
      return res.status(404).json({
        success: false,
        message: "Booking reservation not found",
      });
    }

    // If changing to "Confirmed", verify no overlap with other Confirmed bookings
    if (status === "Confirmed") {
      const studioIdStr = String(targetBooking.studioId || "").trim();
      const requestedDate = String(targetBooking.bookingDate || "").trim();

      const existingConfirmed = await bookingsCollection
        .find({
          _id: { $ne: new ObjectId(id) },
          studioId: studioIdStr,
          bookingDate: requestedDate,
          status: { $regex: /^confirmed$/i },
        })
        .toArray();

      const reqStartMinutes = timeToMinutes(targetBooking.startTime, 600);
      let reqEndMinutes = timeToMinutes(
        targetBooking.endTime,
        reqStartMinutes + (Number(targetBooking.totalHours) || 1) * 60
      );
      if (reqEndMinutes <= reqStartMinutes) {
        reqEndMinutes =
          reqStartMinutes + (Number(targetBooking.totalHours) || 1) * 60;
      }

      const collision = existingConfirmed.find((ex) => {
        const exStart = timeToMinutes(ex.startTime, 600);
        let exEnd = timeToMinutes(
          ex.endTime,
          exStart + (Number(ex.totalHours) || 1) * 60
        );
        if (exEnd <= exStart) {
          exEnd = exStart + (Number(ex.totalHours) || 1) * 60;
        }
        return isTimeOverlapping(reqStartMinutes, reqEndMinutes, exStart, exEnd);
      });

      if (collision) {
        return res.status(409).json({
          success: false,
          message: `Double-Booking Collision: Studio already has a Confirmed reservation on ${requestedDate} from ${collision.startTime} to ${collision.endTime}. Cannot confirm this reservation.`,
          conflict: {
            bookingDate: collision.bookingDate,
            startTime: collision.startTime,
            endTime: collision.endTime,
          },
        });
      }
    }

    await bookingsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      }
    );

    res.status(200).json({
      success: true,
      message: `Booking status updated to ${status} successfully!`,
    });
  } catch (error) {
    console.error("Error updating booking status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update booking status",
      error: error.message,
    });
  }
});

// Statistics for Profile
app.get("/api/user-stats", async (req, res) => {
  try {
    const email = (req.query.email || req.query.userEmail || "").trim();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "User email parameter is required",
      });
    }

    // 1. Count user-owned studios
    const myStudiosCount = await studiosCollection.countDocuments({
      ownerEmail: email,
    });

    // 2. Fetch all user bookings
    const userBookings = await bookingsCollection
      .find({ userEmail: email })
      .toArray();

    const totalBookings = userBookings.length;
    const pendingBookings = userBookings.filter(
      (b) => b.status === "Pending"
    ).length;
    const confirmedBookings = userBookings.filter(
      (b) => b.status === "Confirmed"
    ).length;
    const completedBookings = userBookings.filter(
      (b) => b.status === "Completed"
    ).length;
    const cancelledBookings = userBookings.filter(
      (b) => b.status === "Cancelled"
    ).length;

    // Upcoming shoots (Pending or Confirmed bookings)
    const upcomingShoots = pendingBookings + confirmedBookings;

    // Total spent across non-cancelled bookings
    const totalSpent = userBookings
      .filter((b) => b.status !== "Cancelled")
      .reduce((sum, b) => sum + (Number(b.totalPrice) || 0), 0);

    res.status(200).json({
      success: true,
      stats: {
        totalBookings,
        myStudios: myStudiosCount,
        upcomingShoots,
        totalSpent,
        pendingBookings,
        confirmedBookings,
        completedBookings,
        cancelledBookings,
      },
    });
  } catch (error) {
    console.error("Error calculating user studio statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to calculate user studio statistics",
      error: error.message,
    });
  }
});

// Start server
if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;
