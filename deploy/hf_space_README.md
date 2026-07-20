---
title: GovBot Backend
emoji: 🏛️
colorFrom: green
colorTo: blue
sdk: docker
app_port: 8080
pinned: false
short_description: WhatsApp-first public-service assistant API (FastAPI)
---

# GovBot Backend

FastAPI backend for GovBot — a WhatsApp-first public-service assistant for India.

This Space runs the container defined by the root `Dockerfile` (Playwright + tesseract-ocr + FastAPI).
It serves the API only. The web frontend is deployed separately on Vercel.

- Health check: `/govbot/health`
- WhatsApp webhook: `/govbot/webhook` (and `/webhook`)

All credentials (WhatsApp, Supabase, Gemini, and the rest) are provided through
this Space's **Settings → Secrets**, not committed to the repository.
