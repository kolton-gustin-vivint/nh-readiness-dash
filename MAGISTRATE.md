# Wiring up Magistrate

Everything here is verified against `@FO-Enablement-Vivint/magistrate@1.0.6` as
installed in `shx-lead-tracker`, and against the package README and its
`bin/setup.mjs`.

---

## Your part

Four steps. I cannot do any of them: the first needs your GitHub PAT, the third
is interactive, and the fourth is an email.

### 1. Create `.env`

```bash
cd ~/Desktop/Github/nh-readiness-portal
cp .env.example .env
```

Then fill in two values:

- `AIRTABLE_API_KEY` — the New Hire Readiness PAT. (I have been injecting this
  from the local secret store, so the file does not exist yet.)
- `NPM_AUTH_TOKEN` — a **GitHub Personal Access Token with `read:packages`
  scope**. Your GitHub account needs read access to the `FO-Enablement-Vivint`
  org.

### 2. Bootstrap `.npmrc`, then install

The README is explicit that a first-time install needs `preinstall` run on its
own first, because `.npmrc` has to exist before npm resolves the scoped
registry:

```bash
npm run preinstall
npm install @FO-Enablement-Vivint/magistrate
```

### 3. Register the app

```bash
npx magistrate
```

It asks **"What is the name of your App?"** — answer **`New Hire Readiness Dash`**.
It then POSTs to `https://fpm.vivint.com/_functions/magistrate/client` and
**appends** three variables to `.env`:

```
MAGISTRATE_CLIENT_SECRET
MAGISTRATE_CLIENT_ID
MAGISTRATE_SESSION_KEY
```

Two things worth knowing: it appends without checking for existing values, so
running it twice leaves two conflicting sets in `.env`. And it writes nothing
to production — those three have to be set on Vercel by hand later.

### 4. Authorize the client on FPM

The package README is explicit that nothing works until this happens:

> Once that command is completed, your app will need to be authorized on FPM to
> access Magistrate Services. **The package is not properly set up until this
> step is complete!**

Kolton can self-approve this using the `MAGISTRATE_CLIENT_ID` that step 3
writes into `.env`, so there is no external dependency and no lead time.

Note that `shx-lead-tracker` already being authorized does not carry over —
authorization is per client id, and step 3 mints a new one.

**Tell me when steps 1-3 are done** and I will apply the code changes below.
Step 4 can land in parallel; the code compiles and runs locally without it.

---

## My part

Applied once the package is installed. All of it is prepared — the seam in
`server/lib/session.ts` exists precisely so this is small.

### `app/magistrate-auth/page.tsx` (new)

```tsx
import AuthenticationPage from '@FO-Enablement-Vivint/magistrate/next';

export default function Page() {
  return <AuthenticationPage />;
}
```

### `app/page.tsx` — wrap in `SessionProvider`

**Not the root layout, despite what the README says.** See the trap below.

### `server/lib/session.ts` — swap the seam's internals

Magistrate's `getSession()` becomes the source of truth. The dev overrides stay
but are hard-gated to non-production, so local preview of a specific pro keeps
working after auth is live.

### `src/lib/api.ts` — 401 redirects to `/magistrate-auth`

Today it surfaces a 401 as text, which is right for the dev stand-in and wrong
once a sign-in page exists.

---

## The root-layout trap

**Do not put `SessionProvider` in `app/layout.tsx`.** The README says to, and it
causes an infinite redirect loop.

From `dist/next/SessionProvider/provider.js`, when there is no session the
provider returns `RedirectClient` **instead of** its children. And
`RedirectClient` is unconditional:

```js
useEffect(() => {
  const authPath = "/magistrate-auth";
  const newUrl = new URL(window.location.origin + authPath);
  newUrl.searchParams.append("next_page", window.location.origin + window.location.pathname);
  window.location.href = newUrl.toString();
}, []);
```

It never checks whether the current path is already `/magistrate-auth`. So with
the provider in the root layout, an unauthenticated visitor to
`/magistrate-auth` gets the layout's provider → no session → `RedirectClient` →
navigate to `/magistrate-auth` → repeat. `AuthenticationPage` never renders and
nobody can sign in.

The README itself hints at this a few lines earlier — "Don't wrap it in
`SessionProvider`, it runs outside that context" — which contradicts its own
root-layout example. `shx-lead-tracker` resolves it by putting the provider in
`app/page.tsx` and leaving the root-layout import unused, which looks like dead
code but is deliberate.

This app has one page, so page-level placement covers everything the root
layout would have.

---

## Why the API route keeps the seam instead of `withSession()`

The package offers `withSession()` for route handlers, which rejects with
`401 { error: "Unauthorized" }` before the handler runs and passes a typed
`session` on the context. It is the documented approach and it is good.

This app keeps its own `getSession()` seam anyway, because `withSession()` would
bypass the `DEV_USER_EMAIL` / `DEV_USER_RECORD_ID` overrides and make local
development impossible without a live FPM session — including previewing Ivan
Cervantes, the only pro with complete field-experience data and no usable work
email. The seam calls Magistrate's `getSession()` internally, so production
behaviour is identical.

---

## Session shape

More than the README documents (`dist/types/session-data.d.ts`):

```ts
interface SessionData {
  email: string;
  firstName: string;
  lastName: string;
  audience: string;
  techOrganization: string;
  clearance: number;
}
```

Only `email`, `firstName` and `lastName` are used here. Two notes:

- **`clearance`** is a numeric authorization level, and `SessionProvider` takes
  `clearance?: number` plus `forbiddenRedirect?: string` to gate a page on it.
  **Deliberately unused.** Every new hire must reach this page, and the real
  authorization is the EML record match in `server/lib/eml.ts` — §9 of the
  governance doc grants the NH role "Own", which is a per-record rule that a
  global clearance level cannot express.
- If `clearance` gating is ever added, it needs a `forbidden.tsx` with
  `authInterrupts` enabled, or the provider throws a confusing error rather
  than redirecting.
