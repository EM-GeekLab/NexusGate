build:
	bun run build

dist: build
	mkdir -p dist
	cp -r backend/out/index.js dist/
	cp -r backend/drizzle dist/
	cp -r frontend/dist/ dist/
