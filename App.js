require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { initMongoDB } = require("./Utils/Config");
const logger = require("./Utils/Logger");
const { apiLimiter, authLimiter } = require("./Middlewares/RateLimit");

const env = process.env;
const PORT = Number(env.PORT) || 8080;

const app = express();
app.set("trust proxy", 1);

initMongoDB();

const allowList = env.CORS_ORIGIN
  ? env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

const LAN_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/;

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowList.length === 0) return cb(null, true);
    if (allowList.includes(origin)) return cb(null, true);
    if (LAN_ORIGIN.test(origin)) return cb(null, true);
    return cb(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  })
);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false, limit: "5mb" }));
app.disable("x-powered-by");

if (env.LOGS_TYPE === "ALL") {
  app.use(morgan("dev"));
} else if ((env.LOGS_TYPE || "").includes("RSP-GTE")) {
  const rspTime = Number((env.LOGS_TYPE || "").split("-").pop() || 0);
  app.use(
    morgan((tokens, req, res) => {
      if (Number(tokens["response-time"](req, res)) < rspTime) return;
      return [
        tokens["response-time"](req, res),
        tokens.method(req, res),
        tokens.url(req, res),
        "-",
        tokens.status(req, res),
      ].join(" ");
    })
  );
}

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "doctor-backend",
    uptime: process.uptime(),
    env: env.NODE_ENV || "development",
  });
});

app.get("/", (req, res) => {
  res.json({ message: "Doctor backend is running." });
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api", apiLimiter);
app.use("/api/admin/auth", authLimiter, require("./Routes/AdminAuthRoute"));
app.use("/api/doctor/auth", authLimiter, require("./Routes/DoctorAuthRoute"));
app.use("/api/staff/auth", authLimiter, require("./Routes/StaffAuthRoute"));

app.use("/api/admin/doctors", require("./Routes/AdminDoctorRoute"));
app.use("/api/admin/control", require("./Routes/AdminControlRoute"));
app.use("/api/organization", require("./Routes/OrganizationRoute"));

app.use("/api/me", require("./Routes/MeRoute"));
app.use("/api/patients", require("./Routes/PatientRoute"));
app.use("/api/followups", require("./Routes/AppointmentLeadRoute"));
app.use("/api/consultations", require("./Routes/ConsultationRoute"));
app.use("/api/queue", require("./Routes/QueueRoute"));
app.use("/api/prescriptions", require("./Routes/PrescriptionRoute"));
app.use("/api/medicines", require("./Routes/MedicineRoute"));
app.use("/api/templates", require("./Routes/TemplateRoute"));
app.use("/api/uploads", require("./Routes/UploadRoute"));
app.use("/api/dashboard", require("./Routes/DashboardRoute"));

app.use((req, res) => {
  res.status(404).json({ message: "Route not found.", path: req.originalUrl });
});

app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message =
    err.message || (status >= 500 ? "Internal server error." : `Request failed (${status}).`);
  if (status >= 500) {
    logger.error(
      `${req.method} ${req.originalUrl} [${status}]`,
      JSON.stringify({ message }),
      err.stack || ""
    );
  }
  res.status(status).json({
    status,
    message: status >= 500 && env.NODE_ENV === "production" ? "Internal server error." : message,
  });
});

process.on("unhandledRejection", (reason) => logger.error("UnhandledRejection:", reason));
process.on("uncaughtException", (err) => logger.error("UncaughtException:", err));

const server = app.listen(PORT, () => {
  logger.info("--------------------------------------------");
  if (env.DEBUG === "OFF") console.log = function () {};
  logger.info(`DEBUG mode => ${env.DEBUG || "OFF"}`);
  logger.info(`LOGS type => ${env.LOGS_TYPE || "off"}`);
  logger.info(`Server listening at port ${PORT}.`);
  logger.info("--------------------------------------------");
});

const shutdown = (signal) => {
  logger.warn(`${signal} received. Shutting down.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
