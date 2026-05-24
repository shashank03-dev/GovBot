PYTHON ?= python3
PIP ?= $(PYTHON) -m pip
NPM ?= npm
BACKEND_BIND_HOST ?= 0.0.0.0
BACKEND_PUBLIC_HOST ?= 127.0.0.1
BACKEND_PORT ?= 8000
FRONTEND_PORT ?= 3000
FRONTEND_BACKEND_URL ?= http://$(BACKEND_PUBLIC_HOST):$(BACKEND_PORT)

.PHONY: setup setup-backend setup-frontend bootstrap dev dev-backend dev-frontend test test-backend test-frontend lint typecheck build check

setup: setup-backend setup-frontend

setup-backend:
	$(PYTHON) -m pip install --upgrade pip
	$(PIP) install -r requirements.txt

setup-frontend:
	cd frontend && $(NPM) ci

bootstrap:
	$(PYTHON) scripts/bootstrap_backend.py

dev:
	@trap 'kill 0' INT TERM EXIT; \
	$(MAKE) dev-backend & \
	$(MAKE) dev-frontend & \
	wait

dev-backend:
	uvicorn gov_agent.main:app --host $(BACKEND_BIND_HOST) --port $(BACKEND_PORT) --reload

dev-frontend:
	cd frontend && BACKEND_URL=$(FRONTEND_BACKEND_URL) NEXT_PUBLIC_API_URL=$(FRONTEND_BACKEND_URL) $(NPM) run dev -- --port $(FRONTEND_PORT)

test: test-backend test-frontend

test-backend:
	pytest -q

test-frontend:
	cd frontend && $(NPM) run test

lint:
	cd frontend && $(NPM) run lint

typecheck:
	cd frontend && $(NPM) run typecheck

build:
	cd frontend && $(NPM) run build

check: test lint typecheck build
