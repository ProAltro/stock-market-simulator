import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import archiver from "archiver";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || "/data";
const MARKET_SIM_URL = process.env.MARKET_SIM_URL || "http://localhost:8080";

export async function register(fastify, opts) {
  fastify.get("/info", async (request, reply) => {
    const fullExists = fs.existsSync(path.join(DATA_DIR, "full_1m.json"));
    const devExists = fs.existsSync(path.join(DATA_DIR, "dev_100k.json"));
    const csvExists = fs.existsSync(path.join(DATA_DIR, "csv"));

    let tickCount = 0;
    if (fullExists) {
      try {
        const stats = fs.statSync(path.join(DATA_DIR, "full_1m.json"));
        tickCount = Math.floor(stats.size / 100);
      } catch (e) {}
    }

    return {
      commodities: [
        { symbol: "OIL", name: "Crude Oil", category: "Energy" },
        { symbol: "STEEL", name: "Steel", category: "Construction" },
        { symbol: "WOOD", name: "Lumber", category: "Construction" },
        { symbol: "BRICK", name: "Brick", category: "Construction" },
        { symbol: "GRAIN", name: "Grain", category: "Agriculture" },
      ],
      totalTicks: 1000000,
      downloadSize: 100000,
      description:
        "Commodity trading simulation data. Download the 100K development dataset or run your algorithm on the full 1M tick dataset.",
      initialCash: 100000,
      priceRange: {
        OIL: { min: 60, max: 100 },
        STEEL: { min: 100, max: 150 },
        WOOD: { min: 30, max: 60 },
        BRICK: { min: 15, max: 35 },
        GRAIN: { min: 5, max: 12 },
      },
      dataAvailable: {
        full: fullExists,
        dev: devExists,
        csv: csvExists,
      },
    };
  });

  fastify.get("/download", async (request, reply) => {
    const csvDir = path.join(DATA_DIR, "csv");
    
    if (!fs.existsSync(csvDir)) {
      const devPath = path.join(DATA_DIR, "dev_100k.json");
      if (!fs.existsSync(devPath)) {
        return reply.code(404).send({
          error: "Dataset not found. Please generate it first using POST /api/data/generate",
        });
      }
      
      const stats = fs.statSync(devPath);
      reply.header("Content-Type", "application/json");
      reply.header("Content-Disposition", 'attachment; filename="commodity_data_100k.json"');
      reply.header("Content-Length", stats.size);
      return reply.send(fs.createReadStream(devPath));
    }

    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", 'attachment; filename="commodity_data_100k.zip"');

    const archive = archiver("zip", { zlib: { level: 9 } });
    
    archive.on("error", (err) => {
      fastify.log.error(err, "Archive error");
      reply.code(500).send({ error: "Failed to create archive" });
    });

    const files = fs.readdirSync(csvDir).filter(f => f.endsWith(".csv"));
    
    for (const file of files) {
      const filePath = path.join(csvDir, file);
      archive.file(filePath, { name: file });
    }

    archive.pipe(reply.raw);
    archive.finalize();
    return reply;
  });

  fastify.get("/download/full", async (request, reply) => {
    const filePath = path.join(DATA_DIR, "full_1m.json");

    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({
        error: "Full dataset not found. Generate it first.",
      });
    }

    const stats = fs.statSync(filePath);

    reply.header("Content-Type", "application/json");
    reply.header("Content-Disposition", 'attachment; filename="commodity_data_1m.json"');
    reply.header("Content-Length", stats.size);

    return reply.send(fs.createReadStream(filePath));
  });

  fastify.post("/generate", async (request, reply) => {
    const { ticks = 1000000 } = request.body || {};

    try {
      const stateRes = await axios.get(`${MARKET_SIM_URL}/state`, { timeout: 5000 });
      
      if (stateRes.data.populating) {
        return reply.code(400).send({
          error: "Generation already in progress",
          progress: stateRes.data,
        });
      }

      const response = await axios.post(`${MARKET_SIM_URL}/control`, {
        action: "reset",
      }, { timeout: 10000 });

      fastify.log.info(`Starting population of ${ticks} ticks...`);

      setImmediate(async () => {
        try {
          await axios.post(`${MARKET_SIM_URL}/control`, {
            action: "step",
            count: ticks,
          }, { timeout: 600000 });
          
          fastify.log.info("Population complete, exporting data...");
          
          await axios.post(`${MARKET_SIM_URL}/export`, {
            format: "json",
            dataDir: DATA_DIR,
          }, { timeout: 300000 });
          
          await axios.post(`${MARKET_SIM_URL}/export`, {
            format: "json",
            dataDir: DATA_DIR,
            maxTicks: 100000,
          }, { timeout: 300000 });
          
          await axios.post(`${MARKET_SIM_URL}/export`, {
            format: "csv",
            dataDir: DATA_DIR,
          }, { timeout: 300000 });
          
          fastify.log.info("Data export complete");
        } catch (err) {
          fastify.log.error(err, "Background generation failed");
        }
      });

      return {
        status: "started",
        message: "Generation started. Poll /api/data/status for progress.",
        targetTicks: ticks,
      };
    } catch (error) {
      fastify.log.error(error, "Generation failed");
      return reply.code(503).send({
        error: "Market simulator not available",
        message: error.message,
      });
    }
  });

  fastify.get("/status", async (request, reply) => {
    try {
      const [stateRes, exportRes] = await Promise.all([
        axios.get(`${MARKET_SIM_URL}/state`, { timeout: 5000 }),
        axios.get(`${MARKET_SIM_URL}/export/status`, { timeout: 5000 }),
      ]);

      const fullExists = fs.existsSync(path.join(DATA_DIR, "full_1m.json"));
      const devExists = fs.existsSync(path.join(DATA_DIR, "dev_100k.json"));
      const csvExists = fs.existsSync(path.join(DATA_DIR, "csv"));

      return {
        simState: stateRes.data,
        exportStatus: exportRes.data,
        dataFiles: {
          full: fullExists,
          dev: devExists,
          csv: csvExists,
        },
      };
    } catch (error) {
      return reply.code(503).send({
        error: "Market simulator not available",
        message: error.message,
      });
    }
  });

  fastify.get("/sample", async (request, reply) => {
    const filePath = path.join(DATA_DIR, "dev_100k.json");

    if (!fs.existsSync(filePath)) {
      return {
        ticks: [],
        message: "Sample data not available. Generate data first.",
      };
    }

    try {
      const fd = fs.openSync(filePath, "r");
      const buffer = Buffer.alloc(50000);
      fs.readSync(fd, buffer, 0, 50000, 0);
      fs.closeSync(fd);
      
      let jsonStr = buffer.toString("utf-8");
      const lastComplete = jsonStr.lastIndexOf("},");
      if (lastComplete > 0) {
        jsonStr = jsonStr.substring(0, lastComplete + 1) + "]}]}";
      }
      
      const data = JSON.parse(jsonStr);
      return data;
    } catch (e) {
      return {
        ticks: [],
        message: "Could not read sample data",
      };
    }
  });
}

export default register;
