const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");

function joinUrl(baseUrl, urlPath) {
  if (!baseUrl) return urlPath;
  const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const trimmedPath = urlPath.startsWith("/") ? urlPath : `/${urlPath}`;
  return `${trimmedBase}${trimmedPath}`;
}

function probeHealth(baseUrl, timeoutMs = 800) {
  return new Promise((resolve) => {
    try {
      const healthUrl = joinUrl(baseUrl, "/api/health");
      const client = healthUrl.startsWith("https:") ? https : http;
      const req = client.get(
        healthUrl,
        {
          timeout: timeoutMs,
          headers: {
            Accept: "application/json",
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode >= 200 && res.statusCode < 500);
        },
      );
      req.on("timeout", () => {
        req.destroy(new Error("timeout"));
      });
      req.on("error", () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  const allAddresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        allAddresses.push({ name, address: iface.address });
      }
    }
  }

  const en0 = allAddresses.find((entry) => entry.name === "en0");
  if (en0) return en0.address;

  const zeroSubnet = allAddresses.find((entry) =>
    entry.address.startsWith("192.168.0."),
  );
  if (zeroSubnet) return zeroSubnet.address;

  if (allAddresses.length > 0) return allAddresses[0].address;
  return "localhost";
}

async function main() {
  const envPath = path.resolve(__dirname, "../.env");
  const localIp = getLocalIpAddress();
  const preferredPort = process.env.EXPO_PUBLIC_BACKEND_PORT || "8001";
  const explicitBackendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || "";

  console.log(`Detected Local IP: ${localIp}`);

  try {
    let envContent = fs.readFileSync(envPath, "utf8");

    const candidatePorts = [
      preferredPort,
      "8001",
      "8002",
      "8003",
      "8085",
    ];

    const candidateUrls = [
      explicitBackendUrl,
      ...candidatePorts.flatMap((port) => [
        `http://${localIp}:${port}`,
        `http://localhost:${port}`,
        `http://127.0.0.1:${port}`,
      ]),
    ].filter(Boolean);

    const uniqueCandidates = [...new Set(candidateUrls)];
    let computedBackendUrl =
      uniqueCandidates[0] || `http://${localIp}:${preferredPort}`;

    for (const candidate of uniqueCandidates) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await probeHealth(candidate);
      if (!ok) continue;
      computedBackendUrl = candidate;
      break;
    }

    const frontendUrlRegex = /^EXPO_PUBLIC_BACKEND_URL=.*$/m;
    const newFrontendUrlLine = `EXPO_PUBLIC_BACKEND_URL=${computedBackendUrl}`;

    if (frontendUrlRegex.test(envContent)) {
      envContent = envContent.replace(frontendUrlRegex, newFrontendUrlLine);
      console.log(`Updated EXPO_PUBLIC_BACKEND_URL to ${newFrontendUrlLine}`);
    } else {
      envContent += `\n${newFrontendUrlLine}`;
      console.log(`Added EXPO_PUBLIC_BACKEND_URL: ${newFrontendUrlLine}`);
    }

    fs.writeFileSync(envPath, envContent);
    console.log("Successfully updated .env file");
  } catch (error) {
    console.error("Error updating .env file:", error);
    process.exit(1);
  }
}

main();
