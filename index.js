import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

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

// API check
app.get("/", (req, res) => {
  res.send("Server is online");
});

app.get("/api/studios", async (req, res) => {
  try {
    const { category, search, sort, limit } = req.query;
    const filter = {};

    // Filter by category
    if (category && category !== "All") {
      let catPattern = category.trim();
      if (/^photo studio/i.test(catPattern)) catPattern = "Photo Studio";
      else if (/^(film stage|sound stage)/i.test(catPattern)) catPattern = "Film Stage";
      else if (/^podcast (lounge|room)/i.test(catPattern)) catPattern = "Podcast Lounge";
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

    let cursor = studiosCollection.find(filter).sort(sortQuery);
    if (limit) {
      cursor = cursor.limit(parseInt(limit, 10));
    }

    const studios = await cursor.toArray();

    res.status(200).json({
      success: true,
      count: studios.length,
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

app.get("/api/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid studio ID format",
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

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
