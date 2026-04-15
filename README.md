**Sayzo** is a personal English coach, tuned to how you actually speak. It turns the conversations from a user's real workday—meetings, demos, client calls, interviews—into short, personalized speaking drills. No generic flashcards. No streaks. Just targeted practice for the words, rooms, and people that actually show up in their week.

The product is a loop between two surfaces: a quiet desktop companion that keeps Sayzo in sync with a user's real speaking, and a webapp where they practice drills built from what it picks up. Heavy processing happens locally—only moments worth coaching on ever leave the user's machine.

This repo is the Sayzo webapp (Next.js). Drill UI, coaching analysis, onboarding, and the APIs the desktop companion talks to live here.

This repo is a [Next.js](https://nextjs.org) app bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Firebase Google Auth Setup

1. Copy `env.example` to `.env.local`.
2. Fill the Firebase web app keys in `.env.local`.
3. In Firebase Console, enable Google provider under Authentication > Sign-in method.
4. Add your local host (for example `localhost`) to authorized domains.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
