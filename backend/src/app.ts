import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import "./types/http";
import healthRoutes from "./routes/healthRoutes";
import authRoutes from "./routes/authRoutes";
import vendorRoutes from "./routes/vendorRoutes";
import ingestionRoutes from "./routes/ingestionRoutes";
import torRoutes from "./routes/torRoutes";
import { notFound, errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/vendor", vendorRoutes);
app.use("/api/ingestion", ingestionRoutes);
app.use("/api/tors", torRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
