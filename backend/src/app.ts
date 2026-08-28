import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import "./types/http";
import healthRoutes from "./routes/healthRoutes";
import authRoutes from "./routes/authRoutes";
import ingestionRoutes from "./routes/ingestionRoutes";
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
app.use("/api/ingestion", ingestionRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
