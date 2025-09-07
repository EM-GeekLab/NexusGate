deps:
	bun install

[working-directory: 'frontend']
build-frontend: deps
	bun run build

[working-directory: 'backend']
build-backend: deps
	bun run build

build-all: build-frontend build-backend

dist: build-all
	mkdir -p dist
	cp -r backend/out/index.js dist/
	cp -r backend/drizzle dist/
	cp -r frontend/dist/ dist/
