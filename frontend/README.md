# NexusGate - Frontend

## Getting Started

This project uses [Bun](https://bun.sh/) as the package manager. Make sure you have it installed before proceeding.

To develop and run this application:

```bash
bun install
bun run start
```

## Building For Production

To build this application for production:

```bash
bun run build
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

## Shadcn

Add components using the canary version of [Shadcn](https://ui.shadcn.com/).

```bash
bunx --bun shadcn@canary add button
```

## Environment Variables

Create a `.env.local` file in the root of the project and add your environment variables there. You can use the `.env.example` file as a template.

More information on environment variables can be found in the [Vite documentation](https://vite.dev/guide/env-and-mode.html).

## Routing

This project uses [TanStack Router](https://tanstack.com/router). The initial setup is a file based router. Which means that the routes are managed as fiels in `src/routes`.

### Adding A Route

To add a new route to your application just add another a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from '@tanstack/react-router'
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you use the `<Outlet />` component.

Here is an example layout that includes a header:

```tsx
import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

export const Route = createRootRoute({
  component: () => (
    <>
      <header>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/about">About</Link>
        </nav>
      </header>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
})
```

The `<TanStackRouterDevtools />` component is not required so you can remove it if you don't want it in your layout.

More information on layouts can be found in the [Layouts documentation](hthttps://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Data Fetching

You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

Our backend is built on Elysia.js, allowing you to utilize the [Eden Treaty](https://elysiajs.com/eden/treaty/overview.html) for type-safe and easy-to-use data fetching from the server.

For example:

```tsx
const postsQueryOptions = queryOptions({
  queryKey: ['posts'],
  queryFn: () => api.posts.get(),
})

export const Route = createFileRoute('/posts')({
  // Use the `loader` option to ensure that the data is loaded
  loader: () => queryClient.ensureQueryData(postsQueryOptions),
  component: () => {
    const {
      data: { posts },
    } = useSuspenseQuery(postsQueryOptions)

    return (
      <div>
        {posts.map((post) => (
          <Post key={post.id} post={post} />
        ))}
      </div>
    )
  },
})
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading) and [React-Query documentation](https://tanstack.com/query/latest/docs/framework/react/overview).
