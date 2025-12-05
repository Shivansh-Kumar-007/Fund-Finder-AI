import "dotenv/config";
import express from "express";
import fundingRoutes from "./routes/funding.routes";
import costsRoutes from "./routes/costs.routes";
import suppliersRoutes from "./routes/suppliers.routes";
import alternativesRoutes from "./routes/alternatives.routes";

const app = express();

// Middleware
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "Fund-Finder API" });
});

// Routes
app.use("/funding", fundingRoutes);
app.use("/costs", costsRoutes);
app.use("/suppliers", suppliersRoutes);
app.use("/alternatives", alternativesRoutes);

// Start server
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(port, () => {
  console.log(`🚀 Fund-Finder API listening on http://localhost:${port}`);
  console.log(
    `Environment: EXA_API_KEY=${
      process.env.EXA_API_KEY ? "✓" : "✗"
    } | OPENAI_API_KEY=${process.env.OPENAI_API_KEY ? "✓" : "✗"}`
  );
});
