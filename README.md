# TOR Project

### for Collaborative Software Process and Project Management 

## Run with Docker

From the project root:

```sh
docker compose up --build
```

Then open:

```text
http://localhost:3000
```

This starts:

- `frontend`: the Next.js development server
- `mongo`: a local MongoDB database

Inside Docker, the app uses:

```text
MONGODB_URI=mongodb://mongo:27017/tor_website
```

Stop the containers with:

```sh
docker compose down
```

To also delete the local MongoDB Docker data:

```sh
docker compose down -v
```
