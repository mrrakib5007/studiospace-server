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
app.post("/api/studios", async (req, res) => {
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
app.put("/api/studios/:id", async (req, res) => {
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
app.delete("/api/studios/:id", async (req, res) => {
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

// Start server
if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;
