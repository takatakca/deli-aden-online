"use strict";
// Deployment is a read-only preview until the explicit commercial launch gate.
require("dotenv").config();
if (process.env.DELI_LIVE_ORDERING === "true") {
  if (process.env.NODE_ENV === "production" &&
      (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 16 ||
       !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 ||
       (!process.env.DB_HOST && !process.env.DB_PATH))) {
    console.error("[FATAL] Live launch requires strong admin/JWT credentials and explicit persistent database configuration.");
    process.exit(1);
  }
  require("./server.cjs");
} else {
  require("./server-preview.cjs").startPreview();
}
