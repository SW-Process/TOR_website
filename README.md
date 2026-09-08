# TOR Project

### for Collaborative Software Process and Project Management 

## Run with Docker

From the project root:

```sh
docker compose up --build
```

Then open:

```text
http://localhost:3000        # frontend
http://localhost:8000/api/health   # backend
```

This starts:

- `frontend`: the Next.js development server (hot reload)
- `backend`: the Express API (tsx watch, hot reload)
- `mongo`: a local MongoDB database

Inside Docker the services talk to each other by name:

```text
MONGODB_URI=mongodb://mongo:27017/tor_website
```

`JWT_SECRET` defaults to an insecure dev value. To override it, create a `.env`
file in the project root:

```text
JWT_SECRET=your-own-secret
```

Stop the containers with:

```sh
docker compose down
```

To also delete the local MongoDB data and cached volumes:

```sh
docker compose down -v
```

### Production images

Each app's `Dockerfile` has a `runner` stage that builds a minimal production
image (`node dist/server.js` for the backend, Next.js standalone output for the
frontend):

```sh
docker build --target runner -t tor-backend ./backend
docker build --target runner -t tor-frontend ./frontend
```
