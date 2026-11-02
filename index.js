import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
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

    const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: "POST",
      body: form,
    });

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

// Start server
if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}


export default app;