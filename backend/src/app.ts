import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import "./types/http";
import healthRoutes from "./routes/healthRoutes";
import authRoutes from "./routes/authRoutes";
import vendorRoutes from "./routes/vendorRoutes";
import ingestionRoutes from "./routes/ingestionRoutes";
import torRoutes from "./routes/torRoutes";
import adminRoutes from "./routes/adminRoutes";
import chatRoutes from "./routes/chatRoutes";
import helpRoutes from "./routes/helpRoutes";
import { notFound, errorHandler } from "./middleware/errorHandler";
import { parseTrustProxy } from "./utils/trustProxy";

const app = express();

// Real client IPs behind a load balancer (session list); see utils/trustProxy.
const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
if (trustProxy !== undefined) app.set("trust proxy", trustProxy);

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
app.use("/api/admin", adminRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/help", helpRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
