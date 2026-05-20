
venv:
	uv venv
	uv pip install -r ./backend/requirements.txt
	source .venv/bin/activate

run:
	. .venv/bin/activate && uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 &
	cd frontend && npm run dev -- --host 127.0.0.1 --port 5173 &


stop:
	pkill -f uvicorn
	pkill -f npm
