build:
	docker compose build
build-nocache:
	docker compose build --no-cache

run:
	docker compose up --remove-orphans
up:
	docker compose up -d
down:
	docker compose down
restart:
	make down && make up
logs:
	docker compose logs -f
bash:
	docker exec -it doctor-backend sh

prod:
	MODE=PRODUCTION docker compose up -d --build

deploy:
	make build
	make down
	make up
