SHELL := /bin/bash
VENV := .venv
PIP := $(VENV)/bin/pip
UVICORN := $(VENV)/bin/uvicorn
RUN_DIR := .run
BACKEND_PID := $(RUN_DIR)/backend.pid
FRONTEND_PID := $(RUN_DIR)/frontend.pid
BACKEND_LOG := $(RUN_DIR)/backend.log
FRONTEND_LOG := $(RUN_DIR)/frontend.log
BACKEND_PORT := 8000
FRONTEND_PORT := 5173

.PHONY: venv run stop

venv:
	@test -d $(VENV) || python3 -m venv $(VENV)
	@$(PIP) install --upgrade pip
	@$(PIP) install -r backend/requirements.txt
	@echo "venv ready at $(VENV)"

run:
	@if [ -f $(BACKEND_PID) ] && kill -0 $$(cat $(BACKEND_PID)) 2>/dev/null; then \
		echo "backend already running (pid $$(cat $(BACKEND_PID))). run 'make stop' first."; exit 1; \
	fi
	@if [ -f $(FRONTEND_PID) ] && kill -0 $$(cat $(FRONTEND_PID)) 2>/dev/null; then \
		echo "frontend already running (pid $$(cat $(FRONTEND_PID))). run 'make stop' first."; exit 1; \
	fi
	@if lsof -iTCP:$(BACKEND_PORT) -sTCP:LISTEN -n -P >/dev/null 2>&1; then \
		echo "port $(BACKEND_PORT) is already in use. free it before 'make run'."; exit 1; \
	fi
	@if lsof -iTCP:$(FRONTEND_PORT) -sTCP:LISTEN -n -P >/dev/null 2>&1; then \
		echo "port $(FRONTEND_PORT) is already in use. free it before 'make run'."; exit 1; \
	fi
	@test -x $(UVICORN) || { echo "uvicorn not found in $(VENV). run 'make venv' first."; exit 1; }
	@mkdir -p $(RUN_DIR)
	@test -d frontend/node_modules || (cd frontend && npm install)
	@nohup $(UVICORN) backend.app.main:app --host 127.0.0.1 --port $(BACKEND_PORT) \
		> $(BACKEND_LOG) 2>&1 & echo $$! > $(BACKEND_PID)
	@nohup bash -c 'cd frontend && npm run dev -- --port $(FRONTEND_PORT)' \
		> $(FRONTEND_LOG) 2>&1 & echo $$! > $(FRONTEND_PID)
	@echo "backend  pid $$(cat $(BACKEND_PID)) -> http://127.0.0.1:$(BACKEND_PORT) (log: $(BACKEND_LOG))"
	@echo "frontend pid $$(cat $(FRONTEND_PID)) -> http://127.0.0.1:$(FRONTEND_PORT) (log: $(FRONTEND_LOG))"

stop:
	@if [ -f $(BACKEND_PID) ]; then kill $$(cat $(BACKEND_PID)) 2>/dev/null || true; rm -f $(BACKEND_PID); fi
	@if [ -f $(FRONTEND_PID) ]; then kill $$(cat $(FRONTEND_PID)) 2>/dev/null || true; rm -f $(FRONTEND_PID); fi
	@pkill -f "[u]vicorn backend.app.main:app" 2>/dev/null || true
	@pkill -f "[v]ite" 2>/dev/null || true
	@pkill -f "[n]pm run dev" 2>/dev/null || true
	@echo "stopped"
