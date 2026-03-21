# Makefile for STOCK_VERIFY CI and Development Tasks
# Usage: make <target>

.PHONY: help ci test lint format typecheck pre-commit install clean eval security secrets agent-ci agent-python agent-node

PYTHON := ./scripts/python.sh

help:
	@echo "📦 Stock Verify Application - Available Commands"
	@echo ""
	@echo "🚀 Main Targets:"
	@echo "  make start       - Start Full Application (Backend + Frontend + DB)"
	@echo "  make backend     - Start Backend only"
	@echo "  make frontend    - Start Frontend only (LAN mode)"
	@echo "  make fix-expo    - Fix Expo issues (Tunnel mode)"
	@echo "  make stop        - Stop all running services"
	@echo ""
	@echo "✅ Quality Assurance:"
	@echo "  make ci          - Run all CI checks (Python + Node.js)"
	@echo "  make agent-ci    - Run compact agent-friendly CI checks"
	@echo "  make test        - Run all tests"
	@echo "  make lint        - Run all linters"
	@echo "  make format      - Format all code"
	@echo "  make node-e2e-recount-smoke - Run recount assignment smoke (requires backend on 8001)"
	@echo ""
	@echo "🛠️  Development:"
	@echo "  make install     - Install dependencies"
	@echo "  make clean       - Clean build artifacts"
	@echo ""

# =============================================================================
# 🚀 STARTUP COMMANDS
# =============================================================================
.PHONY: start backend frontend fix-expo stop

start:
	@echo "🚀 Starting Full Application..."
	./scripts/start_all.sh

backend:
	@echo "🚀 Starting Backend..."
	./scripts/start_backend.sh

frontend:
	@echo "🚀 Starting Frontend (LAN Mode)..."
	./scripts/restart_expo_lan.sh

fix-expo:
	@echo "🛠️  Fixing Expo (Tunnel Mode)..."
	./scripts/fix_expo.sh

stop:
	@echo "🛑 Stopping Services..."
	./scripts/stop_all.sh

# =============================================================================
# 🐍 PYTHON BACKEND
# =============================================================================
.PHONY: python-ci python-test python-lint python-format python-typecheck python-typecheck-strict

python-ci: python-format python-lint python-typecheck python-test

python-test:
	@echo "Running Python tests..."
	$(PYTHON) -m pytest backend/tests/ -v --tb=short

python-load-test:
	@echo "Running Locust load test..."
	cd backend && ../scripts/python.sh -m locust -f locustfile.py --headless -u 10 -r 2 -t 30s --host http://localhost:8001

python-lint:
	@echo "Running Python linters..."
	cd backend && ../scripts/python.sh -m ruff check . && ../scripts/python.sh -m ruff format --check .

python-format:
	@echo "Formatting Python code..."
	cd backend && ../scripts/python.sh -m black --line-length=100 api auth services middleware utils db scripts \
		config.py server.py api/mapping_api.py db_mapping_config.py sql_server_connector.py exceptions.py error_messages.py && ../scripts/python.sh -m ruff format .

python-typecheck:
	@echo "Running Python type checker (non-blocking)..."
	@$(PYTHON) -m mypy backend --ignore-missing-imports --python-version=3.11 || \
		( echo "⚠️  mypy found type issues (non-blocking). Run \`make python-typecheck-strict\` to fail the build."; exit 0 )

python-typecheck-strict:
	@echo "Running Python type checker (strict)..."
	$(PYTHON) -m mypy backend --ignore-missing-imports --python-version=3.11

# =============================================================================
# 📦 NODE.JS FRONTEND
# =============================================================================
.PHONY: node-ci node-test node-lint node-typecheck node-e2e-recount-smoke

node-ci: node-lint node-typecheck node-test

node-test:
	@echo "Running Node.js tests..."
	cd frontend && npm test

node-test-watch:
	@echo "Running Node.js tests in watch mode..."
	cd frontend && npm run test:watch

node-test-coverage:
	@echo "Running Node.js tests with coverage..."
	cd frontend && npm run test:coverage

node-lint:
	@echo "Running Node.js linter..."
	cd frontend && npm run lint

node-lint-fix:
	@echo "Fixing Node.js lint issues..."
	cd frontend && npm run lint:fix

node-typecheck:
	@echo "Running TypeScript type checker..."
	cd frontend && npm run typecheck

node-typecheck-watch:
	@echo "Running TypeScript type checker in watch mode..."
	cd frontend && npm run typecheck:watch

node-clean:
	@echo "Cleaning Node.js cache and build artifacts..."
	cd frontend && npm run clean

node-e2e-recount-smoke:
	@echo "Running recount assignment smoke against backend on http://127.0.0.1:8001..."
	cd frontend && E2E_BACKEND_URL=http://127.0.0.1:8001 npm run e2e:recount-smoke

# =============================================================================
# 🔄 COMBINED TARGETS
# =============================================================================
ci: python-ci node-ci
	@echo "✅ All CI checks passed!"

agent-ci:
	@./scripts/agent_ci.sh ci

agent-python:
	@./scripts/agent_ci.sh python

agent-node:
	@./scripts/agent_ci.sh node

test: python-test node-test

lint: python-lint node-lint

format: python-format
	@echo "✅ Code formatted!"

typecheck: python-typecheck node-typecheck

pre-commit:
	@echo "Running pre-commit hooks..."
	pre-commit run -a

# =============================================================================
# 🛠️  INSTALLATION & CLEANUP
# =============================================================================
install:
	@echo "Installing Python dependencies..."
	$(PYTHON) -m pip install -r backend/requirements.dev.txt
	$(PYTHON) -m pip install pre-commit black ruff mypy pytest pytest-cov
	@echo "Installing Node.js dependencies..."
	cd frontend && npm ci
	@echo "Installing pre-commit hooks..."
	pre-commit install

clean:
	@echo "Cleaning build artifacts..."
	bash ./scripts/clean.sh

# =============================================================================
# 🔒 SECURITY
# =============================================================================
.PHONY: security secrets validate-env

security:
	@echo "🔒 Running security checks..."
	@echo "Checking for tracked env files (no secrets in git)..."
	@tracked_env_files="$$(git ls-files | grep -E '(^|/)\\.env($|\\.)' || true)"; \
	bad_env_files="$$(printf '%s\n' "$$tracked_env_files" | grep -Ev '\\.env\\.(example|sample|template)$$|\\.env\\.production\\.example$$' || true)"; \
	if [ -n "$$bad_env_files" ]; then \
		echo "❌ ERROR: tracked env files detected (remove from git and use *.example templates):"; \
		printf '%s\n' "$$bad_env_files"; \
		exit 1; \
	fi
	@echo "✅ No tracked env files detected"
	@echo "Running pre-commit security hooks..."
	@if [ -f .pre-commit-config.yaml ]; then \
		pre-commit run detect-secrets --all-files || true; \
	else \
		echo "⚠️  Skipping pre-commit hooks: .pre-commit-config.yaml not found"; \
	fi
	@echo "✅ Security check complete!"

secrets:
	@echo "🔐 Generating new JWT secrets..."
	cd backend && ../scripts/python.sh scripts/generate_secrets.py

validate-env:
	@echo "🔍 Validating environment configuration..."
	cd backend && ../scripts/python.sh scripts/validate_env.py

# =============================================================================
# 📊 EVALUATION
# =============================================================================
.PHONY: eval eval-report eval-performance eval-security

eval:
	@echo "Running evaluation framework..."
	$(PYTHON) -m backend.tests.evaluation.run_evaluation --all

eval-report:
	@echo "Running evaluation with markdown report..."
	$(PYTHON) -m backend.tests.evaluation.run_evaluation --all --format md --verbose

eval-performance:
	@echo "Running performance evaluation..."
	$(PYTHON) -m backend.tests.evaluation.run_evaluation --performance --verbose

eval-security:
	@echo "Running security evaluation..."
	$(PYTHON) -m pytest backend/tests/evaluation/test_security_evaluation.py -v

# =============================================================================
# 🚀 DEPLOYMENT
# =============================================================================
.PHONY: deploy deploy-check deploy-certs

PROD_COMPOSE_FILE := docker-compose.production.yml
PROD_ENV_FILE := .env.prod

deploy-check:
	@echo "🔍 Checking deployment prerequisites..."
	@if [ ! -f $(PROD_ENV_FILE) ]; then \
		echo "❌ Error: $(PROD_ENV_FILE) file not found!"; \
		echo "   Please copy .env.production.example to .env.prod and configure it."; \
		exit 1; \
	fi
	@docker compose --env-file $(PROD_ENV_FILE) -f $(PROD_COMPOSE_FILE) config >/dev/null
	@if [ ! -f nginx/ssl/fullchain.pem ] || [ ! -f nginx/ssl/privkey.pem ]; then \
		echo "⚠️  Warning: SSL certificates not found in nginx/ssl/. Nginx might fail to start."; \
		echo "   To provision Let's Encrypt certificates, run: ./scripts/init_letsencrypt.sh"; \
	fi

deploy: deploy-check
	@echo "🚀 Deploying canonical Docker Compose stack..."
	docker compose --env-file $(PROD_ENV_FILE) -f $(PROD_COMPOSE_FILE) pull
	docker compose --env-file $(PROD_ENV_FILE) -f $(PROD_COMPOSE_FILE) up -d --remove-orphans
	@echo "✅ Deployment complete. Verify the stack at your configured DOMAIN."

deploy-certs: deploy-check
	@echo "🔐 Provisioning TLS certificates..."
	./scripts/init_letsencrypt.sh
