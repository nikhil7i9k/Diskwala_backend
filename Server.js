const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");

const app = express();
app.use(cors());

const cache = new Map();

app.get("/api/resolve", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url" });
  if (cache.has(url)) return res.json(cache.get(url));

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    let videoUrl = null;
    let videoTitle = null;

    page.on("response", async (response) => {
      const rUrl = response.url();
      if (rUrl.includes("/api/") ) {
        try {
          const json = await response.json();
          if (json?.data?.stream_url) videoUrl = json.data.stream_url;
          if (json?.data?.url) videoUrl = json.data.url;
          if (json?.stream_url) videoUrl = json.stream_url;
          if (json?.data?.name) videoTitle = json.data.name;
        } catch (_) {}
      }
      if (!videoUrl && (rUrl.includes(".mp4") || rUrl.includes(".m3u8"))) {
        videoUrl = rUrl.split("?")[0];
      }
    });

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 3000));

    if (!videoUrl) {
      videoUrl = await page.evaluate(() => {
        const v = document.querySelector("video");
        return v?.src || document.querySelector("video source")?.src || null;
      });
    }

    if (!videoTitle) {
      videoTitle = await page.evaluate(() =>
        document.querySelector("h1")?.innerText || document.title || "Diskwala Video"
      );
    }

    await browser.close();

    if (!videoUrl) return res.status(404).json({ error: "Video URL not found" });

    const result = {
      streamUrl: videoUrl,
      title: videoTitle?.trim() || "Diskwala Video",
      size: "—",
      format: videoUrl.includes(".m3u8") ? "HLS" : "MP4",
    };

    cache.set(url, result);
    setTimeout(() => cache.delete(url), 30 * 60 * 1000);
    res.json(result);

  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (req, res) => res.json({ status: "DiskwalaPlay backend running ✅" }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Running on port ${PORT}`));
